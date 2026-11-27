// Precio viejo de un producto sin stock: cuando un súper no tiene stock online, su web a veces deja un
// precio de hace meses (p. ej. un pan dulce a $297,89 contra $10.000 en el resto). Ese precio no se muestra si:
//   - es menos de la mitad del precio más bajo entre los súper que sí lo tienen en stock, o
//   - ningún otro súper lo tiene en stock (no hay con qué compararlo).
// p: {sup: [precio, lista, disponible, ...]}. Modifica p y devuelve cuántos precios sacó.
// Uso suelto sobre data/precios.json: node scraper/sin-stock.js
function sacarPreciosViejos(p) {
  const enStock = Object.values(p).filter(v => v[2]).map(v => v[0]);
  const min = enStock.length ? Math.min(...enStock) : 0;
  let n = 0;
  for (const [s, v] of Object.entries(p)) {
    if (v[2]) continue;
    if (!min || v[0] < min / 2) { delete p[s]; n++; }
  }
  return n;
}
module.exports = { sacarPreciosViejos };

if (require.main === module) {
  const fs = require('fs');
  const file = require('path').join(__dirname, '..', 'data/precios.json');
  const px = JSON.parse(fs.readFileSync(file, 'utf8'));
  let sacados = 0, antes = px.productos.length;
  px.productos = px.productos.filter(x => { sacados += sacarPreciosViejos(x.p); return Object.keys(x.p).length >= 2; });
  fs.writeFileSync(file, JSON.stringify(px));
  console.log(`Precios viejos sin stock sacados: ${sacados} · productos que quedaron con menos de 2 súper: ${antes - px.productos.length}`);
}
