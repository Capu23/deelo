// Suma las frutas y verduras (data/frutas-verduras.json, de frutas-verduras.js) a la lista de productos de
// data/precios.json, como una categoría más de Precios: "Frutas y verduras". El precio es por kilo (o por unidad
// en ananá, palta y choclo), así que en el carrito 1 = 1 kg. Reemplaza las que hubiera de antes.
// precios.js lo usa al armar la lista; también se puede correr solo: node scraper/sumar-fv.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function sumarFV(px) {
  let fv;
  try { fv = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/frutas-verduras.json'), 'utf8')); } catch (e) { return 0; }
  // Si los datos tienen más de 15 días, no se muestran (mejor nada que precios viejos).
  if ((Date.now() - Date.parse(fv.actualizado)) / 864e5 > 15) return 0;
  px.productos = px.productos.filter(p => !String(p.e).startsWith('fv-'));
  let n = 0;
  for (const it of fv.items) {
    const p = {};
    for (const [s, v] of Object.entries(it.p)) if (px.supers[s] || s === 'coto') p[s] = [v.precio, 0, 1, v.url];
    if (Object.keys(p).length < 2) continue;
    px.productos.push({ e: 'fv-' + it.id, n: `${it.n} (${it.u === 'kg' ? 'por kg' : 'por unidad'})`, c: 'Frutas y verduras', i: '', p });
    n++;
  }
  return n;
}
module.exports = { sumarFV };

if (require.main === module) {
  const file = path.join(ROOT, 'data/precios.json');
  const px = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = sumarFV(px);
  fs.writeFileSync(file, JSON.stringify(px));
  console.log(`Frutas y verduras sumadas: ${n}`);
}
