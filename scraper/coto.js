// Precios de Coto para precios.js y canasta.js, desde data/coto-catalogo.json (scraper/coto-precios.js,
// la web de Coto). Ese archivo se genera en una compu en Argentina; solo se usa si tiene menos de MAX_DIAS días.
// Devuelve { actualizado, sucursal, p: { ean: [precio, lista, url, promo?] } } o null.
//   lista = precio sin la rebaja (0 si no hay rebaja directa).
//   promo = { t: leyenda, u: precio c/u, n: unidades } para ofertas que piden llevar varias (2x1, 2da al 70%…).
const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, '..', 'data', 'coto-catalogo.json');
const MAX_DIAS = 15;

function cargarCoto() {
  let w;
  try { w = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')); } catch { console.log('Sin data/coto-catalogo.json: Coto queda afuera.'); return null; }
  if ((Date.now() - new Date(w.actualizado)) / 864e5 >= MAX_DIAS) {
    console.log(`coto-catalogo.json es del ${w.actualizado} (más de ${MAX_DIAS} días): Coto queda afuera.`);
    return null;
  }
  const p = {};
  for (const x of w.productos) {
    if (x.precioOferta == null) p[x.ean] = [x.precio, 0, x.url];
    else if (x.unidades > 1) p[x.ean] = [x.precio, 0, x.url, { t: x.texto.slice(0, 40), u: x.precioOferta, n: Math.min(x.unidades, 12) }];
    else p[x.ean] = [x.precioOferta, x.precio, x.url]; // rebaja directa (25%Dto, 1 Pago 20%, Oferta)
  }
  return { actualizado: w.actualizado, sucursal: `sucursal ${w.sucursal}`, p };
}

module.exports = { cargarCoto };
