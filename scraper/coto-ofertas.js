// Ofertas de Coto (2x1, "Llevando 2 70% 2da", "25%Dto", rebajas) con EAN.
// (scraper/coto-precios.js trae todo el catálogo con sus ofertas; este trae solo la sección de ofertas.)
//
// Usa el mismo JSON que pide la página www.coto.com.ar/productos/ofertas/todas-las-ofertas
// a su buscador (api.coto.com.ar, Constructor.io). La clave pública del buscador se lee
// del JavaScript de la página en cada corrida, así que no hay nada guardado acá.
// Solo funciona desde Argentina (afuera Coto redirige a /404).
//
// Uso (desde la raíz del repo):  node scraper/coto-ofertas.js
//   --sucursal 200   sucursal de Coto cuyos precios se leen (200 es la que muestra la web por defecto)
//
// Escribe data/coto-ofertas.json:
//   {"actualizado":"AAAA-MM-DD","ofertas":[{"ean","nombre","precio","precioOferta","texto","unidades"?, ...}]}
//   precio = precio regular por unidad; precioOferta = precio por unidad con la oferta
//   (en "2x1" o "70% 2da" es el promedio por unidad llevando las `unidades` que pide la oferta).

const fs = require('fs');
const path = require('path');

const WEB = 'https://www.coto.com.ar';
const API = 'https://api.coto.com.ar/api/v1/ms-digital-sitio-bff-web/api/v1/products/offers/todas-las-ofertas';
const OUT = path.join(__dirname, '..', 'data', 'coto-ofertas.json');
const POR_PAGINA = 200;
const SALTEAR = ['Hogar', 'Textil', 'Aire Libre']; // no son de súper

const args = process.argv.slice(2);
const SUCURSAL = args.includes('--sucursal') ? args[args.indexOf('--sucursal') + 1] : '200';

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'accept-language': 'es-AR,es;q=0.9',
  origin: WEB,
  referer: WEB + '/productos/ofertas/todas-las-ofertas',
};
const pausa = () => new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const plata = s => { const m = String(s || '').match(/\$\s?([\d.,]+)/); return m ? Math.round(Number(m[1].replace(/,/g, '')) * 100) / 100 : null; };
const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });

async function get(url, json) {
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (/\/404/.test(r.url)) throw new Error('Coto redirigió a /404 (¿fuera de Argentina?)');
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${url.toString().replace(/key=[^&]+/, 'key=…')}`);
      return json ? r.json() : r.text();
    } catch (e) {
      if (intento >= 3 || /404/.test(e.message)) throw e;
      console.log(`  reintento: ${e.message}`);
      await pausa(); await pausa();
    }
  }
}

// La clave pública del buscador está en el main.*.js de la página.
async function claveBuscador() {
  const html = await get(WEB + '/');
  const main = (html.match(/main\.[0-9a-f]+\.js/) || [])[0];
  if (!main) throw new Error('No encontré main.*.js en la página de Coto');
  const key = ((await get(`${WEB}/${main}`)).match(/key_[A-Za-z0-9]{16}/) || [])[0];
  if (!key) throw new Error(`No encontré la clave del buscador en ${main}`);
  return key;
}

function pagina(key, p, grupo) {
  const u = new URL(API);
  const q = { key, page: p, num_results_per_page: POR_PAGINA, pre_filter_expression: JSON.stringify({ name: 'store_availability', value: SUCURSAL }), us: SUCURSAL };
  if (grupo) q['filters[group_id]'] = grupo;
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return get(u, true);
}

// Un resultado del buscador -> oferta de deelo
function oferta(r, categoria) {
  const d = r.data || {};
  const [desc, ...extras] = d.discounts || [];
  if (!desc) return null;
  const precio = plata(desc.regularPriceText) ?? plata(desc.regularPrice) ?? (d.price || []).find(p => p.store === SUCURSAL)?.listPrice ?? d.product_list_price ?? null;
  const precioOferta = plata(desc.discountPrice);
  if (precio != null && precioOferta != null && precioOferta >= precio) return null; // marcado "oferta" pero sin rebaja
  const llevando = clean(desc.takingText);
  const descuento = clean(desc.discountText);
  const texto = [llevando, descuento].filter(Boolean).join(' ') || 'Oferta';
  let unidades = Number((llevando.match(/llevando\s+(\d+)/i) || [])[1]) || null;
  const nxm = descuento.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (nxm) unidades = Math.max(unidades || 0, Number(nxm[1]));
  const nda = descuento.match(/(\d+)\s*da\b/i); // "70% 2da"
  if (nda) unidades = Math.max(unidades || 0, Number(nda[1]));

  const o = {
    ean: d.product_main_ean ? String(d.product_main_ean) : null,
    nombre: clean(d.sku_display_name || r.value),
    precio,
    precioOferta,
    texto,
  };
  if (unidades > 1) o.unidades = unidades;
  const extra = extras.filter(x => x.discountText).map(x => ({ texto: clean(x.discountText), precio: plata(x.discountPrice) }));
  if (extra.length) o.extra = extra; // p. ej. "+10%" adicional
  if (desc.comments) o.condiciones = clean(desc.comments);
  o.marca = d.product_brand || null;
  o.pesable = !!d.product_weighable;
  o.plu = String(d.sku_plu || '');
  o.categoria = categoria;
  o.url = `${WEB}/productos/${d.url || ''}`;
  return o;
}

(async () => {
  const key = await claveBuscador();
  console.log(`Clave del buscador: ${key.slice(0, 8)}… · sucursal ${SUCURSAL}`);

  const primera = await pagina(key, 1);
  const raiz = (primera.response.groups || []).find(g => g.group_id === 'categoria');
  const categorias = (raiz ? raiz.children : []).map(g => ({ id: g.group_id, nombre: g.display_name, n: g.count })).filter(c => !SALTEAR.includes(c.nombre));
  if (!categorias.length) throw new Error('El buscador no devolvió categorías');
  console.log('Categorías:', categorias.map(c => `${c.nombre} ${c.n}`).join(', '));

  const ofertas = new Map(); // plu -> oferta
  let sinDescuento = 0;
  for (const c of categorias) {
    const paginas = Math.ceil(c.n / POR_PAGINA);
    for (let p = 1; p <= paginas; p++) {
      await pausa();
      const j = await pagina(key, p, c.id);
      for (const r of j.response.results || []) {
        const o = oferta(r, c.nombre);
        if (!o) { sinDescuento++; continue; }
        if (!ofertas.has(o.plu)) ofertas.set(o.plu, o);
      }
      console.log(`${c.nombre}: página ${p}/${paginas} · ${ofertas.size} ofertas`);
    }
  }

  const lista = [...ofertas.values()].sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
  fs.writeFileSync(OUT, JSON.stringify({ actualizado: hoy(), fuente: WEB + '/productos/ofertas/todas-las-ofertas', sucursal: SUCURSAL, ofertas: lista }, null, 1) + '\n');
  console.log(`Listo: ${lista.length} ofertas, ${lista.filter(o => o.ean).length} con EAN${sinDescuento ? ` (${sinDescuento} resultados sin rebaja, salteados)` : ''} -> ${path.relative(process.cwd(), OUT)}`);
})().catch(e => { console.error(e.message || e); process.exit(1); });
