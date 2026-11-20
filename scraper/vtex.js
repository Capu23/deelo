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
module.exports = { SUPERS, vtexBuscar, vtexPorEan };
