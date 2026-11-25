// Precios de Coto para precios.js y canasta.js.
// Coto no es VTEX: sus precios salen de archivos que se generan en una compu en Argentina.
//   1. data/coto-precios.json  (scraper/coto-precios.js, web de Coto, todo el catálogo)  ← se prefiere
//   2. data/precios-coto.json  (scraper/sepa.js, Precios Claros)                         ← si no hay el 1
// Solo se usan si tienen menos de MAX_DIAS días.
// Devuelve { actualizado, sucursal, sucursales?, fuente, p: { ean: [precio, lista, url, promo?] } } o null.
//   promo = { t: leyenda, u: precio c/u, n: unidades } para ofertas que piden llevar varias (2x1, 2da al 70%…).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAX_DIAS = 15;
const BUSCAR = 'https://www.cotodigital.com.ar/sitios/cdigi/categoria?Ntt=';
const fresco = f => (Date.now() - new Date(f)) / 864e5 < MAX_DIAS;
const leer = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); } catch { return null; } };

function desdeWeb(w) {
  const p = {};
  for (const x of w.productos) {
    const url = x.url || BUSCAR + x.ean;
    if (x.precioOferta == null) p[x.ean] = [x.precio, 0, url];
    else if (x.unidades > 1) p[x.ean] = [x.precio, 0, url, { t: x.texto.slice(0, 40), u: x.precioOferta, n: Math.min(x.unidades, 12) }];
    else p[x.ean] = [x.precioOferta, x.precio, url]; // rebaja directa (25%Dto, 1 Pago 20%, Oferta)
  }
  return { actualizado: w.actualizado, sucursal: `sucursal ${w.sucursal}`, fuente: 'web', p };
}

function desdeSepa(s) {
  const p = {};
  for (const [ean, [pc, lc, m]] of Object.entries(s.p)) p[ean] = [pc, lc, BUSCAR + ean, ...(m ? [m] : [])];
  return { actualizado: s.actualizado, sucursal: s.sucursal, sucursales: s.sucursales, fuente: 'sepa', p };
}

function cargarCoto({ avisar = true } = {}) {
  const w = leer('coto-precios.json');
  if (w && fresco(w.actualizado)) return desdeWeb(w);
  if (w && avisar) console.log(`coto-precios.json es del ${w.actualizado} (más de ${MAX_DIAS} días): no se usa.`);
  const s = leer('precios-coto.json');
  if (s && fresco(s.actualizado)) return desdeSepa(s);
  if (avisar) console.log('Sin precios de Coto recientes (coto-precios.json ni precios-coto.json): Coto queda afuera.');
  return null;
}

module.exports = { cargarCoto };
