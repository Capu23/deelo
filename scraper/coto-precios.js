// Precios de TODOS los productos de Coto desde su web (www.coto.com.ar), con EAN.
// Recorre todas las categorías menos Hogar, Textil y Aire Libre, y deja afuera la marca propia de Coto.
//
// Usa el mismo JSON que pide la página www.coto.com.ar/productos/categorias/... a su buscador
// (api.coto.com.ar, Constructor.io). La clave pública del buscador se lee del JavaScript de la
// página en cada corrida, así que no hay nada guardado acá. Tarda unos minutos.
// Solo funciona desde Argentina (afuera Coto redirige a /404).
//
// Uso (desde la raíz del repo):  node scraper/coto-precios.js
//   --sucursal 200   sucursal de Coto cuyos precios se leen (200 es la que muestra la web por defecto)
//
// Escribe data/coto-precios.json:
//   {"actualizado":"AAAA-MM-DD","productos":[{"ean","nombre","marca","categoria","precio","precioOferta"?,"texto"?,"unidades"?, ...}]}
//   precio = precio regular por unidad. Si hay oferta: precioOferta = precio por unidad con la oferta
//   (en "2x1" o "70% 2da" es el promedio por unidad llevando las `unidades` que pide la oferta) y texto = cómo la muestra Coto.

const fs = require('fs');
const path = require('path');

const WEB = 'https://www.coto.com.ar';
const API = 'https://api.coto.com.ar/api/v1/ms-digital-sitio-bff-web/api/v1/products/categories/';
const OUT = path.join(__dirname, '..', 'data', 'coto-precios.json');
const POR_PAGINA = 200;
const SALTEAR = ['Hogar', 'Textil', 'Aire Libre']; // no son de súper
// Marca propia de Coto: "COTO", "ESTANCIAS COTO" y sus líneas de elaboración propia (no "COTONETES").
const MARCA_COTO = /\bCOTO\b|^NUESTRA COCINA$|^NUESTRA PESCADERIA$|ELABORACION PROPIA/i;
// También lo que dice "Coto" en el nombre aunque venga sin marca, p. ej. "Batatas Fritas Coto X Kg".
const esDeCoto = d => MARCA_COTO.test(clean(d.product_brand)) || /\bcoto\b/i.test(d.sku_display_name || '');

const args = process.argv.slice(2);
const SUCURSAL = args.includes('--sucursal') ? args[args.indexOf('--sucursal') + 1] : '200';

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'accept-language': 'es-AR,es;q=0.9',
  origin: WEB,
  referer: WEB + '/',
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

function pagina(key, grupo, p) {
  const u = new URL(API + encodeURIComponent(grupo));
  const q = { key, page: p, num_results_per_page: POR_PAGINA, pre_filter_expression: JSON.stringify({ name: 'store_availability', value: SUCURSAL }), us: SUCURSAL };
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return get(u, true);
}

// Un resultado del buscador -> producto de deelo (null si no sirve)
function producto(r, categoria) {
  const d = r.data || {};
  const ean = d.product_main_ean ? String(d.product_main_ean) : null;
  const marca = clean(d.product_brand) || null;
  const nombre = clean(d.sku_display_name || r.value);
  const precioSuc = (d.price || []).find(p => p.store === SUCURSAL);
  const [desc, ...extras] = d.discounts || [];
  const precio = (desc && (plata(desc.regularPriceText) ?? plata(desc.regularPrice))) ?? precioSuc?.listPrice ?? d.product_list_price ?? null;
  if (!ean || !precio) return null;

  const o = { ean, nombre, marca, categoria, precio };
  const precioOferta = desc ? plata(desc.discountPrice) : null;
  if (precioOferta != null && precioOferta < precio) {
    const llevando = clean(desc.takingText);
    const descuento = clean(desc.discountText);
    let unidades = Number((llevando.match(/llevando\s+(\d+)/i) || [])[1]) || null;
    const nxm = descuento.match(/^(\d+)\s*x\s*(\d+)$/i);
    if (nxm) unidades = Math.max(unidades || 0, Number(nxm[1]));
    const nda = descuento.match(/(\d+)\s*da\b/i); // "70% 2da"
    if (nda) unidades = Math.max(unidades || 0, Number(nda[1]));
    o.precioOferta = precioOferta;
    o.texto = [llevando, descuento].filter(Boolean).join(' ') || 'Oferta';
    if (unidades > 1) o.unidades = unidades;
    const extra = extras.filter(x => x.discountText).map(x => ({ texto: clean(x.discountText), precio: plata(x.discountPrice) }));
    if (extra.length) o.extra = extra; // p. ej. "+10%" adicional
    if (desc.comments) o.condiciones = clean(desc.comments);
  }
  o.pesable = !!d.product_weighable;
  o.plu = String(d.sku_plu || '');
  o.url = `${WEB}/productos/${d.url || ''}`;
  return o;
}

(async () => {
  const key = await claveBuscador();
  console.log(`Clave del buscador: ${key.slice(0, 8)}… · sucursal ${SUCURSAL}`);

  const raiz = await pagina(key, 'categoria', 1);
  const grupo = (raiz.response.groups || [])[0];
  const categorias = (grupo ? grupo.children : []).map(g => ({ id: g.group_id, nombre: g.display_name, n: g.count })).filter(c => !SALTEAR.includes(c.nombre));
  if (!categorias.length) throw new Error('El buscador no devolvió categorías');
  console.log('Categorías:', categorias.map(c => `${c.nombre} ${c.n}`).join(', '));

  const productos = new Map(); // ean -> producto
  const salteados = { marcaCoto: 0, sinEanOPrecio: 0 };
  for (const c of categorias) {
    const paginas = Math.ceil(c.n / POR_PAGINA);
    for (let p = 1; p <= paginas; p++) {
      await pausa();
      const j = await pagina(key, c.id, p);
      for (const r of j.response.results || []) {
        if (esDeCoto(r.data || {})) { salteados.marcaCoto++; continue; }
        const o = producto(r, c.nombre);
        if (!o) { salteados.sinEanOPrecio++; continue; }
        if (!productos.has(o.ean)) productos.set(o.ean, o);
      }
      console.log(`${c.nombre}: página ${p}/${paginas} · ${productos.size} productos`);
    }
  }

  const lista = [...productos.values()].sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
  fs.writeFileSync(OUT, JSON.stringify({
    actualizado: hoy(),
    fuente: WEB,
    sucursal: SUCURSAL,
    nota: 'Todos los productos de Coto menos Hogar, Textil, Aire Libre y la marca propia Coto. Se arma con scraper/coto-precios.js.',
    productos: lista,
  }, null, 1) + '\n');
  const ofertas = lista.filter(o => o.precioOferta != null).length;
  console.log(`Listo: ${lista.length} productos con EAN y precio (${ofertas} con oferta) · salteados: ${salteados.marcaCoto} marca Coto, ${salteados.sinEanOPrecio} sin EAN o precio -> ${path.relative(process.cwd(), OUT)}`);
})().catch(e => { console.error(e.message || e); process.exit(1); });
