// Actualización liviana: pone los precios de Coto del catálogo nuevo en data/precios.json, sin volver a recorrer
// los catálogos de los otros súper. La usa el workflow "deelo: catálogo de Coto" cuando llega un catálogo
// a mitad de semana. La lista de productos no cambia (eso se hace los lunes).
// Uso: node scraper/actualizar-coto.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { cotoOf, cotoInfo } = require('./coto-lee')(ROOT);
if (!cotoInfo) { console.log('Sin catálogo de Coto vigente: no se cambia nada.'); process.exit(0); }

const file = path.join(ROOT, 'data/precios.json');
const px = JSON.parse(fs.readFileSync(file, 'utf8'));
let con = 0, cambiaron = 0, descartados = 0;
for (const p of px.productos) {
  const antes = p.p.coto ? p.p.coto[0] : null;
  delete p.p.coto;
  const nuevo = cotoOf[p.e]; if (!nuevo) continue;
  // Misma validación que precios.js: se descarta si es menos de un tercio o más del triple de la mediana.
  const vals = Object.values(p.p).map(v => v[0]).sort((a, b) => a - b);
  const med = vals[Math.floor(vals.length / 2)];
  if (vals.length >= 2 && (nuevo[0] < med / 3 || nuevo[0] > med * 3)) { descartados++; continue; }
  p.p.coto = nuevo; con++;
  if (antes !== null && antes !== nuevo[0]) cambiaron++;
}
px.supers.coto = 'https://www.coto.com.ar';
px.coto = cotoInfo;
fs.writeFileSync(file, JSON.stringify(px));
console.log(`Coto actualizado (${cotoInfo.actualizado}): ${con} productos con precio de Coto · ${cambiaron} cambiaron de precio · ${descartados} descartados por absurdos`);
