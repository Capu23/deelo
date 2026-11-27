// Promos del súper de Jumbo, Disco y Vea (2x1, 3x2, "2do al 50%", "25%", "Llevando 4"…) con sus fechas.
// Las lee del mismo servicio público que usa la página de cada producto para mostrar el cartel de la promo
// (POST /_v/search-promotions con la sucursal de referencia y los SKU). No usa claves.
// Se ignoran las promos de Prime y las que piden un medio de pago ("providers"): esas son descuentos de pago.
//
// Lee data/skus-cencosud.json (lo arma precios.js: EAN → SKU por súper) y escribe data/promos-cencosud.json:
//   {actualizado, sup: {jumbo: {ean: {t, n, f, d, h}}}}  t = texto ("3x2"), n = unidades que hay que llevar,
//   f = factor sobre el precio por unidad llevando n (0,67 en un 3x2), d/h = vigencia (AAAA-MM-DD).
// Uso: node scraper/cencosud-promos.js            (y después node scraper/precios.js o actualizar-promos)
const fs = require('fs');
const path = require('path');
const { SUPERS } = require('./vtex');

const ROOT = path.join(__dirname, '..');
const SUCURSAL = { jumbo: 'jumboargentinaj5202martinez', disco: 'jumboargentinad061', vea: 'jumboargentinav700cordoba700' };
const LOTE = 200;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function aPromo(x) {
  if (!x || (x.providers && x.providers.length)) return null;
  const eff = Number(x.effectiveDiscount);
  if (!(eff > 0 && eff < 0.9)) return null;
  const code = String(x.code || x.name || '').trim();
  let n = 1, m;
  if (x.categoryType === 'nxm' && (m = code.match(/(\d+)\s*x\s*(\d+)/i))) n = +m[1];
  else if (x.categoryType === 'segundo_al') n = 2;
  else if ((m = String(x.categoryType).match(/llevando_(\d+)/)) || (m = code.match(/llevando\s*(\d+)/i))) n = +m[1];
  else if (x.categoryType !== 'percentual') return null;
  const t = n === 1 ? (code.match(/\d+\s*%/) ? '−' + code.match(/\d+/)[0] + '%' : code) : code.replace(/^2do/i, '2do');
  return { t, n, f: Math.round((1 - eff) * 1000) / 1000, d: String(x.start).slice(0, 10), h: String(x.end).slice(0, 10) };
}

(async () => {
  const skus = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/skus-cencosud.json'), 'utf8'));
  const { request } = require('playwright');
  const px = process.env.HTTPS_PROXY || process.env.https_proxy;
  const req = await request.newContext({ ...(px ? { proxy: { server: px } } : {}), extraHTTPHeaders: { accept: 'application/json' } });
  const out = { actualizado: new Date().toISOString().slice(0, 10), sup: {} };
  for (const s of Object.keys(SUCURSAL)) {
    const mapa = skus[s] || {}, porSku = {};
    for (const [ean, sku] of Object.entries(mapa)) porSku[sku] = ean;
    const lista = Object.keys(porSku), res = out.sup[s] = {};
    let fallos = 0;
    for (let i = 0; i < lista.length; i += LOTE) {
      let j = null;
      for (let k = 0; k < 3 && !j; k++) {
        try {
          const r = await req.post(`${SUPERS[s]}/_v/search-promotions`, { data: { seller: SUCURSAL[s], skus: lista.slice(i, i + LOTE) }, headers: { 'content-type': 'application/json' }, timeout: 30000 });
          if (r.ok()) j = await r.json();
        } catch (e) {}
        if (!j) await sleep(2000 * (k + 1));
      }
      if (!j) { fallos++; continue; }
      for (const [sku, x] of Object.entries(((j.promotions || {}).generic || {}).promotions || {})) {
        const p = aPromo(x); if (p && porSku[sku]) res[porSku[sku]] = p;
      }
      await sleep(300);
    }
    const tipos = {}; Object.values(res).forEach(p => tipos[p.t] = (tipos[p.t] || 0) + 1);
    console.log(`${s}: ${Object.keys(res).length} productos con promo de ${lista.length}${fallos ? ` · ${fallos} lotes fallaron` : ''} · ${Object.entries(tipos).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, c]) => `${t}: ${c}`).join(', ')}`);
  }
  await req.dispose();
  fs.writeFileSync(path.join(ROOT, 'data/promos-cencosud.json'), JSON.stringify(out));
})();
