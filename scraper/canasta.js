// Arma (o amplía) data/canasta.json: productos comunes del súper identificados por código de barras (EAN).
// Busca cada término en dos súper de referencia y se queda con los productos que también venden
// al menos otros 2 súper. Se corre a mano cuando se quiere renovar la canasta, no todas las semanas.
// Uso: node scraper/canasta.js
const fs = require('fs');
const path = require('path');
const { vtexBuscar, vtexPorEan, SUPERS } = require('./vtex');

const TERMINOS = {
  'Almacén': ['leche entera', 'leche descremada', 'yerba mate', 'aceite girasol', 'aceite oliva', 'fideos', 'arroz', 'azucar', 'harina', 'cafe', 'te en saquitos', 'mate cocido', 'galletitas', 'galletitas dulces', 'pure de tomate', 'atun', 'mayonesa', 'dulce de leche', 'mermelada', 'leche en polvo', 'polenta', 'lentejas', 'arvejas', 'sal fina', 'cacao', 'cereales', 'pan lactal', 'tostadas'],
  'Lácteos y frescos': ['yogur', 'manteca', 'queso cremoso', 'queso rallado', 'crema de leche', 'queso untable', 'postre'],
  'Bebidas': ['gaseosa cola', 'agua mineral', 'agua saborizada', 'jugo en polvo', 'cerveza', 'vino tinto', 'soda'],
  'Limpieza': ['detergente', 'lavandina', 'jabon en polvo', 'jabon liquido ropa', 'suavizante', 'limpiador piso', 'papel higienico', 'rollo de cocina', 'esponja'],
  'Perfumería': ['shampoo', 'acondicionador', 'jabon tocador', 'pasta dental', 'desodorante', 'panales', 'toallitas humedas', 'protector diario'],
};
const POR_TERMINO = 6;
const MIN_SUPERS = 3;

(async () => {
  const file = path.join(__dirname, '..', 'data', 'canasta.json');
  let canasta = [];
  try { canasta = JSON.parse(fs.readFileSync(file, 'utf8')).productos; } catch (e) {}
  const conocidos = new Set(canasta.map(p => p.ean));
  for (const [cat, terms] of Object.entries(TERMINOS)) {
    for (const t of terms) {
      const cands = new Map();
      for (const ref of ['jumbo', 'carrefour']) {
        for (const p of await vtexBuscar(ref, t, POR_TERMINO)) if (p.ean && !cands.has(p.ean)) cands.set(p.ean, p);
      }
      let n = 0;
      for (const [ean, p] of cands) {
        if (conocidos.has(ean)) continue;
        let en = 0;
        for (const s of Object.keys(SUPERS)) { if (await vtexPorEan(s, ean)) en++; if (en >= MIN_SUPERS) break; }
        if (en >= MIN_SUPERS) { canasta.push({ ean, nombre: p.nombre, categoria: cat, marca: p.marca || undefined }); conocidos.add(ean); n++; }
      }
      console.log(`${cat} / ${t}: +${n}`);
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ nota: 'Productos que compara deelo, por código de barras. Se amplía con scraper/canasta.js.', productos: canasta }, null, 1));
  console.log('canasta:', canasta.length, 'productos');
})();
