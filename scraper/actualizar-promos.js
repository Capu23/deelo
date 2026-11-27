// Actualización liviana de las promos de Jumbo, Disco y Vea en data/precios.json, sin volver a recorrer
// los catálogos. Se corre después de cencosud-promos.js (viernes, cuando arrancan las de fin de semana).
// Uso: node scraper/actualizar-promos.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { promosCencosud, aplicarPromo } = require('./promos-lee')(ROOT);
const file = path.join(ROOT, 'data/precios.json');
const px = JSON.parse(fs.readFileSync(file, 'utf8'));
const cuenta = {};
for (const p of px.productos) {
  for (const s of ['jumbo', 'disco', 'vea']) {
    const v = p.p[s]; if (!v) continue;
    v.length = Math.min(v.length, 4); // se reemplaza la promo anterior
    const pc = promosCencosud[s] && promosCencosud[s][p.e];
    if (pc) { v[4] = aplicarPromo(pc, v[0]); cuenta[s] = (cuenta[s] || 0) + 1; }
  }
}
fs.writeFileSync(file, JSON.stringify(px));
console.log('Promos de Jumbo, Disco y Vea aplicadas:', JSON.stringify(cuenta));
