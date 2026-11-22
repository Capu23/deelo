// Trae el precio de cada producto de data/canasta.json en los súper VTEX y escribe data/precios.json.
// Uso: node scraper/precios.js   (corre en la actualización semanal)
const fs = require('fs');
const path = require('path');
const { SUPERS, vtexPorEan } = require('./vtex');

const ROOT = path.join(__dirname, '..');
const canasta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/canasta.json'), 'utf8')).productos;
const sups = Object.keys(SUPERS);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Coto no es VTEX: sus precios salen de SEPA (scraper/sepa.js, corre en una compu en Argentina).
// Solo se usan si tienen menos de 15 días.
const COTO_URL = 'https://www.cotodigital.com.ar/sitios/cdigi/categoria?Ntt=';
let coto = null;
try {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/precios-coto.json'), 'utf8'));
  if ((Date.now() - new Date(c.actualizado)) / 864e5 < 15) coto = c;
  else console.log('precios-coto.json tiene más de 15 días: no se usa.');
} catch { console.log('Sin data/precios-coto.json: Coto queda afuera.'); }

(async () => {
  const out = [];
  const errores = Object.fromEntries(sups.map(s => [s, 0]));
  // Un "carril" por súper en paralelo; dentro de cada súper, de a una consulta con una pausa corta.
  const res = Object.fromEntries(canasta.map(p => [p.ean, {}]));
  await Promise.all(sups.map(async s => {
    for (const p of canasta) {
      const r = await vtexPorEan(s, p.ean).catch(() => null);
      if (r === null) errores[s]++;
      else res[p.ean][s] = r;
      await sleep(120);
    }
  }));
  for (const p of canasta) {
    const precios = {};
    let img = '';
    for (const [s, r] of Object.entries(res[p.ean])) {
      if (!r.precio) continue;
      const slug = r.url.slice(SUPERS[s].length + 1, -2);
      precios[s] = [r.precio, r.lista || 0, r.disponible ? 1 : 0, slug];
      if (!img && r.img) img = r.img.replace(/-\d+-\d+\//, '-200-200/');
    }
    if (coto && coto.p[p.ean]) precios.coto = [coto.p[p.ean][0], coto.p[p.ean][1], 1, COTO_URL + p.ean];
    if (Object.keys(precios).length >= 2) out.push({ e: p.ean, n: p.nombre, c: p.categoria, i: img, p: precios });
  }
  const data = {
    actualizado: new Date().toISOString().slice(0, 10),
    supers: { ...Object.fromEntries(sups.map(s => [s, SUPERS[s]])), ...(coto ? { coto: 'https://www.cotodigital.com.ar' } : {}) },
    ...(coto ? { coto: { actualizado: coto.actualizado, sucursal: coto.sucursal } } : {}),
    nota: 'Precios online de cada súper (pueden variar por sucursal). Formato de p: [precio, precio de lista si hay rebaja, disponible, slug].',
    sinPrecio: errores,
    productos: out,
  };
  fs.writeFileSync(path.join(ROOT, 'data/precios.json'), JSON.stringify(data));
  console.log('productos con precio en 2+ súper:', out.length, '/', canasta.length);
  console.log('sin precio por súper:', JSON.stringify(errores));
})();
