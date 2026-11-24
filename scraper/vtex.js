// Consultas al catálogo público de los súper que usan VTEX (el mismo que usa su tienda online).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SUPERS = {
  jumbo: 'https://www.jumbo.com.ar',
  disco: 'https://www.disco.com.ar',
  vea: 'https://www.vea.com.ar',
  carrefour: 'https://www.carrefour.com.ar',
  dia: 'https://diaonline.supermercadosdia.com.ar',
  changomas: 'https://www.masonline.com.ar',
};
let _req;
async function get(url) {
  if (!_req) {
    const { request } = require('playwright');
    const px = process.env.HTTPS_PROXY || process.env.https_proxy;
    _req = await request.newContext({ userAgent: UA, extraHTTPHeaders: { 'accept-language': 'es-AR', accept: 'application/json' }, ...(px ? { proxy: { server: px } } : {}) });
  }
  for (let i = 0; i < 3; i++) {
    try {
      const r = await _req.get(url, { timeout: 30000 });
      if (r.status() === 429) { await new Promise(res => setTimeout(res, 3000 * (i + 1))); continue; }
      if (!r.ok() && r.status() !== 206) return null;
      return await r.json();
    } catch (e) { await new Promise(res => setTimeout(res, 1500)); }
  }
  return null;
}

// Promos por cantidad (2x1, 3x2, "2do al 70%"…). Carrefour las informa por producto en los teasers
// ("PROMO-3x2 … -Reg-3-100-…": 3 unidades, 100% de descuento en una). Cencosud, Día y ChangoMás marcan
// los productos con colecciones cuyo nombre dice la promo ("3x2 en Galletitas", "2do al 70% fijo").
// Se ignoran las colecciones "Hasta …" (no dicen cuánto le toca a cada producto) y las de otra semana.
function semanaActual() { const d = new Date(); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dia = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dia); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); }
const ORD = n => n === 2 ? '2da' : n === 3 ? '3ra' : n + 'ta';
function promoCantidad(p, o, precio, sup) {
  if (!precio) return null;
  const cands = [];
  const add = (n, pagas, t) => { if (n >= 2 && n <= 6 && pagas > 0 && pagas < n) cands.push({ t, n, u: Math.round(precio * pagas / n * 100) / 100 }); };
  for (const te of [...(o.Teasers || []), ...(o.PromotionTeasers || [])]) {
    const nom = te['<Name>k__BackingField'] || te.Name || '';
    if (/tarjeta|banco|visa|master|cuenta|mi crf\b.*%/i.test(nom) && !/reg-\d/i.test(nom)) continue;
    const m = nom.match(/reg-(\d+)-(\d+)/i);
    if (m) { const n = +m[1], pct = +m[2]; add(n, n - pct / 100, pct === 100 ? `${n}x${n - 1}` : `${ORD(n)} al ${pct}%`); }
  }
  const sem = semanaActual();
  const nombres = [...Object.values(p.clusterHighlights || {}), ...Object.values(p.productClusters || {})];
  // Carrefour: solo sus teasers (exactos). En sus colecciones mezclan promos ("2do al 80% / 2x1 Plus…").
  if (sup === 'carrefour') nombres.length = 0;
  for (const c of nombres) {
    if (/^\s*(hasta|ver m)/i.test(c)) continue;
    // Colecciones internas (códigos sin espacios) o que exigen un medio de pago o programa: no son para todos.
    if (!/\s/.test(c.trim()) || /_|prime|cpay|cencopay|plus|club|tarjeta|banco|mi crf|modo|mercado ?pago|\//i.test(c)) continue;
    const s = c.match(/\bs\s?(\d{1,2})\b/i); if (s && Math.abs(+s[1] - sem) > 0) continue;
    let m;
    if ((m = c.match(/(\d)\s*x\s*(\d)/i)) && +m[1] > +m[2]) add(+m[1], +m[2], `${m[1]}x${m[2]}`);
    else if ((m = c.match(/(\d)\s*(?:d[oa]|°|º)\s*al\s*(\d{2,3})/i))) add(+m[1], +m[1] - +m[2] / 100, `${ORD(+m[1])} al ${m[2]}%`);
    else if ((m = c.match(/(\d{2,3})\s*%\s*(?:de descuento\s*)?en la segunda/i))) add(2, 2 - +m[1] / 100, `2da al ${m[1]}%`);
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.u - b.u);
  return cands[0].u < precio ? cands[0] : null;
}
function normalizar(sup, p) {
  const it = (p.items || [])[0]; if (!it) return null;
  const sel = (it.sellers || []).find(s => s.sellerDefault) || (it.sellers || [])[0];
  const o = sel && sel.commertialOffer; if (!o) return null;
  const precio = Number(o.Price), lista = Number(o.ListPrice);
  return {
    sup, ean: it.ean || '', nombre: (p.productName || '').trim(), marca: p.brand || '',
    precio: precio > 0 ? precio : null,
    // Algunos súper informan un "precio de lista" sin sentido (100 veces más alto): solo lo usamos si es una rebaja razonable.
    lista: lista > precio && lista < precio * 3 ? lista : null,
    disponible: (o.AvailableQuantity || 0) > 0 && precio > 0,
    url: SUPERS[sup] + '/' + (p.linkText || '') + '/p',
    img: ((it.images || [])[0] || {}).imageUrl || '',
    promo: promoCantidad(p, o, precio > 0 ? precio : 0, sup),
  };
}
async function vtexBuscar(sup, termino, n = 10) {
  const d = await get(`${SUPERS[sup]}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termino)}&_from=0&_to=${n - 1}`);
  return (Array.isArray(d) ? d : []).map(p => normalizar(sup, p)).filter(Boolean);
}
async function vtexPorEan(sup, ean) {
  const d = await get(`${SUPERS[sup]}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${encodeURIComponent(ean)}`);
  const p = Array.isArray(d) && d[0] ? normalizar(sup, d[0]) : null;
  return p && p.precio ? p : null;
}
module.exports = { SUPERS, vtexBuscar, vtexPorEan, getJSON: get, normalizar, promoCantidad };
