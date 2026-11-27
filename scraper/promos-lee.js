// Lee data/promos-cencosud.json (ver cencosud-promos.js) y la convierte al formato de precios.json:
// 5º elemento del súper = {t, n, u, d, h}: texto, unidades, precio por unidad con la promo y vigencia.
// n = 1 es una rebaja directa ("−25%") que vale solo entre d y h. Se usa si el archivo tiene menos de 8 días.
const fs = require('fs');
const path = require('path');
module.exports = function leerPromos(ROOT) {
  let promosCencosud = {};
  try {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/promos-cencosud.json'), 'utf8'));
    const hoy = new Date().toISOString().slice(0, 10);
    if ((Date.now() - new Date(c.actualizado)) / 864e5 < 8) {
      for (const [s, m] of Object.entries(c.sup || {})) {
        promosCencosud[s] = {};
        for (const [ean, p] of Object.entries(m)) if (!p.h || p.h >= hoy) promosCencosud[s][ean] = p; // sin las vencidas
      }
    }
  } catch {}
  const aplicarPromo = (p, precio) => ({ t: p.t, n: p.n, u: Math.round(precio * p.f * 100) / 100, d: p.d, h: p.h });
  return { promosCencosud, aplicarPromo };
};
