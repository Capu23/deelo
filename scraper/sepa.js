// Precios de Coto desde SEPA (Precios Claros, Secretaría de Comercio) → data/precios-coto.json
//
// SEPA solo se descarga desde una conexión en Argentina, por eso este script corre en tu compu
// y no en la actualización automática. Usa solo Node (18 o más nuevo) y el comando `tar`
// (viene con Windows 10/11 y macOS; en Linux usa `unzip`). No hace falta instalar nada más.
//
// Uso (desde la carpeta del repo):
//   node scraper/sepa.js                 descarga el último archivo de SEPA y lo procesa
//   node scraper/sepa.js ruta/sepa.zip   usa un .zip que ya bajaste a mano
// Después: git add data/precios-coto.json && git commit -m "Precios Coto" && git push
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const API = 'https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios';
const COTO_CUIT = '30548083156';
const canasta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/canasta.json'), 'utf8')).productos;
const norm = e => String(e || '').replace(/\D/g, '').replace(/^0+/, '');
const QUIERO = new Map(canasta.map(p => [norm(p.ean), p.ean]));
// Promos que exigen llevar más de una unidad: no se muestran como precio del producto.
const MULTI = /\d\s*x\s*\d|2d[oa]|segund|llev|unid|comb|pack/i;

const run = (cmd, a) => execFileSync(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }).toString();
// `tar` abre .zip en Windows y macOS; en Linux (GNU tar) no, así que ahí se usa `unzip`.
let usaUnzip = false;
const listar = zip => {
  if (!usaUnzip) try { return run('tar', ['-tf', zip]); } catch { usaUnzip = true; }
  return run('unzip', ['-Z1', zip]);
};
const extraer = (zip, dir, ...nombres) => usaUnzip ? run('unzip', ['-o', '-q', zip, ...nombres, '-d', dir]) : run('tar', ['-xf', zip, '-C', dir, ...nombres]);
const num = s => { const n = parseFloat(String(s || '').replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };

async function* filas(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let cols = null;
  for await (let l of rl) {
    l = l.replace(/^﻿/, '');
    if (!l.includes('|')) continue;
    const v = l.split('|');
    if (!cols) { cols = v.map(c => c.trim().toLowerCase()); continue; }
    yield Object.fromEntries(cols.map((c, i) => [c, (v[i] || '').trim()]));
  }
}

async function descargar(dir) {
  console.log('Buscando el último archivo de SEPA…');
  const r = await fetch(API);
  if (!r.ok) throw new Error(`SEPA respondió ${r.status}. ¿Estás conectado desde Argentina?`);
  const recursos = (await r.json()).result.resources.filter(x => /\.zip$/i.test(x.url));
  recursos.sort((a, b) => String(b.last_modified || b.created).localeCompare(String(a.last_modified || a.created)));
  const url = recursos[0].url;
  console.log('Descargando', url, '(puede pesar varios cientos de MB)…');
  const z = await fetch(url);
  if (!z.ok) throw new Error(`Descarga falló: ${z.status}`);
  const file = path.join(dir, 'sepa.zip');
  fs.writeFileSync(file, Buffer.from(await z.arrayBuffer()));
  return file;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sepa-'));
  try {
    const zip = process.argv[2] ? path.resolve(process.argv[2]) : await descargar(tmp);
    // El archivo grande trae un .zip por comercio. Buscamos el de Coto leyendo su comercio.csv.
    const internos = listar(zip).split(/\r?\n/).filter(n => /\.zip$/i.test(n));
    if (!internos.length) throw new Error('El .zip no tiene el formato esperado de SEPA.');
    let dirCoto = null;
    for (const n of internos) {
      const d = path.join(tmp, 'c' + internos.indexOf(n));
      fs.mkdirSync(d);
      extraer(zip, d, n);
      const inner = path.join(d, n);
      const lista = listar(inner).split(/\r?\n/);
      const com = lista.find(x => /comercio\.csv$/i.test(x));
      if (!com) { fs.rmSync(d, { recursive: true }); continue; }
      extraer(inner, d, com);
      const txt = fs.readFileSync(path.join(d, com), 'utf8');
      if (txt.replace(/\D/g, '').includes(COTO_CUIT) || /\bcoto\b/i.test(txt)) {
        extraer(inner, d);
        dirCoto = path.dirname(path.join(d, com));
        break;
      }
      fs.rmSync(d, { recursive: true });
    }
    if (!dirCoto) throw new Error('No encontré a Coto en este archivo de SEPA.');

    // Sucursales de CABA (si no hay, todas).
    const sucs = {};
    for await (const s of filas(path.join(dirCoto, 'sucursales.csv'))) {
      sucs[s.id_sucursal] = { n: s.sucursales_nombre, caba: /AR-C|capital|c\.?a\.?b\.?a|ciudad aut/i.test(s.sucursales_provincia + ' ' + s.sucursales_localidad) };
    }
    const hayCaba = Object.values(sucs).some(s => s.caba);
    const porSuc = {};
    for await (const f of filas(path.join(dirCoto, 'productos.csv'))) {
      const ean = QUIERO.get(norm(f.id_producto)) || QUIERO.get(norm(f.productos_ean));
      if (!ean) continue;
      const s = sucs[f.id_sucursal];
      if (hayCaba && !(s && s.caba)) continue;
      const lista = num(f.productos_precio_lista);
      if (!lista) continue;
      const promo = num(f.productos_precio_unitario_promo1);
      const vale = promo && promo < lista && !MULTI.test(f.productos_leyenda_promo1 || '');
      (porSuc[f.id_sucursal] ||= {})[ean] = vale ? [promo, lista] : [lista, 0];
    }
    // Usamos una sola sucursal (la que tiene más productos de la canasta) para que los precios sean coherentes.
    const [idSuc, precios] = Object.entries(porSuc).sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)[0] || [];
    if (!idSuc) throw new Error('No encontré precios de la canasta en Coto.');
    const data = {
      actualizado: new Date().toISOString().slice(0, 10),
      fuente: 'SEPA · Precios Claros (Secretaría de Comercio)',
      sucursal: (sucs[idSuc] && sucs[idSuc].n) || idSuc,
      nota: 'Precio en góndola de una sucursal de Coto en CABA. Formato de p: [precio, precio de lista si hay rebaja].',
      p: precios,
    };
    fs.writeFileSync(path.join(ROOT, 'data/precios-coto.json'), JSON.stringify(data));
    console.log(`Listo: ${Object.keys(precios).length} de ${canasta.length} productos con precio en Coto (${data.sucursal}).`);
    console.log('Ahora: git add data/precios-coto.json && git commit -m "Precios Coto" && git push');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
