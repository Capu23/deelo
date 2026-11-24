// Precios de Coto desde SEPA (Precios Claros, Secretaría de Comercio) → data/precios-coto.json
//
// SEPA solo se descarga desde una conexión en Argentina, por eso este script corre en tu compu
// y no en la actualización automática. Usa solo Node (18 o más nuevo) y el comando `tar`
// (viene con Windows 10/11 y macOS; en Linux usa `unzip`). No hace falta instalar nada más.
//
// Uso (desde la carpeta del repo):
//   node scraper/sepa.js                 descarga el último archivo de SEPA y lo procesa
//   node scraper/sepa.js ruta/sepa.zip   usa un .zip que ya bajaste a mano
//   node scraper/sepa.js ruta/carpeta    usa la carpeta donde lo descomprimiste
//   node scraper/sepa.js ruta/productos.csv   usa directo el CSV de Coto (columnas separadas por |)
// Después: git add data/precios-coto.json && git commit -m "Precios Coto" && git push
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const API = 'https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios';
const COTO_CUIT = '30548083156';
// En SEPA, Coto es el comercio 12 (archivo sepa_1_comercio-sepa-12_<fecha>.zip). Se prueba primero;
// si cambia de número, igual lo encuentra leyendo el comercio.csv de cada uno.
const COTO_ID = /comercio-sepa-12[_.]/i;
const cotoPrimero = (a, b) => COTO_ID.test(String(b.n || b)) - COTO_ID.test(String(a.n || a));
const canasta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/canasta.json'), 'utf8')).productos;
const norm = e => String(e || '').replace(/\D/g, '').replace(/^0+/, '');
const QUIERO = new Map(canasta.map(p => [norm(p.ean), p.ean]));
// Promos que exigen llevar más de una unidad (2x1, 2da al 80%, llevando 3…): no son el precio del producto,
// se guardan aparte con la cantidad mínima para que el carrito las aplique cuando corresponde.
const MULTI = /\d\s*x\s*\d|\d\s*(d[oa]|°|º|ra|er)\b|segund|tercer|llev|unid|comb|pack/i;
const cantidad = t => {
  let m;
  if ((m = t.match(/(\d+)\s*x\s*\d/i))) return +m[1];
  if ((m = t.match(/llev\w*\s*(\d+)/i))) return +m[1];
  if ((m = t.match(/(\d+)\s*(d[oa]|°|º|ra|er)\b/i))) return +m[1];
  if (/tercer/i.test(t)) return 3;
  return 2;
};

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
    const arg = process.argv[2] ? path.resolve(process.argv[2].replace(/^["']|["']$/g, '')) : await descargar(tmp);
    if (!fs.existsSync(arg)) throw new Error(`No existe: ${arg}`);
    // SEPA trae un .zip por comercio (dentro de un .zip grande, o ya descomprimidos en una carpeta).
    // Buscamos el de Coto leyendo su comercio.csv.
    const esCoto = file => { const t = fs.readFileSync(file, 'utf8'); return t.replace(/\D/g, '').includes(COTO_CUIT) || /\bcoto\b/i.test(t); };
    const buscar = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const f = path.join(dir, e.name);
      return e.isDirectory() ? buscar(f, ext) : ext.test(e.name) ? [f] : [];
    });
    let internos;
    if (/\.csv$/i.test(arg)) {
      // Le pasaron directo el productos.csv de Coto: usamos su carpeta.
      internos = [];
      var dirCoto = path.dirname(arg);
    } else if (fs.statSync(arg).isDirectory()) {
      // ¿Ya están descomprimidos los de cada comercio?
      const csv = buscar(arg, /^comercio\.csv$/i).find(esCoto);
      if (csv) internos = [];
      dirCoto = csv ? path.dirname(csv) : null;
      // Carpeta con productos.csv pero sin comercio.csv: la tomamos como la de Coto.
      if (!dirCoto) { const pc = buscar(arg, /^productos\.csv$/i); if (pc.length === 1) dirCoto = path.dirname(pc[0]); }
      if (!dirCoto) internos = buscar(arg, /\.zip$/i).sort(cotoPrimero);
    } else {
      internos = listar(arg).split(/\r?\n/).filter(n => /\.zip$/i.test(n)).map(n => ({ outer: arg, n })).sort(cotoPrimero);
    }
    if (!dirCoto && !internos.length) throw new Error('No encontré los .zip de SEPA ahí.');
    for (const [i, it] of (dirCoto ? [] : internos).entries()) {
      const d = path.join(tmp, 'c' + i);
      fs.mkdirSync(d);
      let inner = it;
      if (typeof it === 'object') { extraer(it.outer, d, it.n); inner = path.join(d, it.n); }
      const com = listar(inner).split(/\r?\n/).find(x => /comercio\.csv$/i.test(x));
      if (!com) { fs.rmSync(d, { recursive: true }); continue; }
      extraer(inner, d, com);
      if (esCoto(path.join(d, com))) {
        console.log('Coto está en', path.basename(typeof it === 'object' ? it.n : it));
        extraer(inner, d);
        dirCoto = path.dirname(path.join(d, com));
        break;
      }
      fs.rmSync(d, { recursive: true });
    }
    if (!dirCoto) throw new Error('No encontré a Coto en este archivo de SEPA.');

    // Sucursales de CABA (si no hay, todas).
    const sucs = {};
    const fSuc = path.join(dirCoto, 'sucursales.csv');
    if (!fs.existsSync(fSuc)) console.log('No está sucursales.csv al lado: uso todas las sucursales.');
    if (fs.existsSync(fSuc)) for await (const s of filas(fSuc)) {
      sucs[s.id_sucursal] = { n: s.sucursales_nombre, caba: /AR-C|capital|c\.?a\.?b\.?a|ciudad aut/i.test(s.sucursales_provincia + ' ' + s.sucursales_localidad) };
    }
    const hayCaba = Object.values(sucs).some(s => s.caba);
    const porSuc = {};
    for await (const f of filas(path.join(dirCoto, 'productos.csv'))) {
      // Guardamos todos los productos de Coto con código de barras válido (no solo los de la lista actual),
      // así Coto cuenta como cadena al armar la lista y no hay que volver a correr esto si la lista cambia.
      const crudo = norm(f.id_producto) || norm(f.productos_ean);
      const ean = QUIERO.get(norm(f.id_producto)) || QUIERO.get(norm(f.productos_ean)) || (/^\d{8,14}$/.test(crudo) ? crudo : null);
      if (!ean) continue;
      const s = sucs[f.id_sucursal];
      if (hayCaba && !(s && s.caba)) continue;
      const lista = num(f.productos_precio_lista);
      if (!lista) continue;
      const promo = num(f.productos_precio_unitario_promo1);
      const ley = (f.productos_leyenda_promo1 || '').trim();
      const multi = promo && promo < lista && MULTI.test(ley);
      const simple = promo && promo < lista && !multi;
      (porSuc[f.id_sucursal] ||= {})[ean] = simple ? [promo, lista]
        : multi ? [lista, 0, { t: ley.slice(0, 40), u: promo, n: Math.min(cantidad(ley), 12) }]
        : [lista, 0];
    }
    // Todas las sucursales de CABA: por producto, el precio que más se repite entre las que lo tienen
    // (si empatan, el más bajo). Así se cubren más productos que con una sola sucursal.
    const nSuc = Object.keys(porSuc).length;
    if (!nSuc) throw new Error('No encontré precios de la canasta en Coto.');
    const porEan = {};
    for (const prods of Object.values(porSuc)) for (const [ean, v] of Object.entries(prods)) (porEan[ean] ||= []).push(v);
    const precios = {};
    for (const [ean, vs] of Object.entries(porEan)) {
      const cuenta = new Map();
      for (const v of vs) { const k = JSON.stringify(v); cuenta.set(k, (cuenta.get(k) || 0) + 1); }
      const [k] = [...cuenta].sort((x, y) => (y[1] - x[1]) || (JSON.parse(x[0])[0] - JSON.parse(y[0])[0]))[0];
      precios[ean] = JSON.parse(k);
    }
    const data = {
      actualizado: new Date().toISOString().slice(0, 10),
      fuente: 'SEPA · Precios Claros (Secretaría de Comercio)',
      sucursales: nSuc,
      sucursal: hayCaba ? `${nSuc} sucursales de CABA` : `${nSuc} sucursales`,
      nota: 'Precio en góndola más común entre las sucursales de Coto en CABA. Formato de p: [precio, precio de lista si hay rebaja, promo por cantidad {t: leyenda, u: precio c/u, n: unidades}].',
      p: precios,
    };
    fs.writeFileSync(path.join(ROOT, 'data/precios-coto.json'), JSON.stringify(data));
    console.log(`Listo: ${Object.keys(precios).length} productos de Coto con precio (${Object.keys(precios).filter(e => QUIERO.has(norm(e))).length} de los ${canasta.length} de la lista actual) · ${data.sucursal}.`);
    console.log('Archivo generado:', path.join(ROOT, 'data', 'precios-coto.json'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
