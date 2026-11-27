// Trae el precio de cada producto de data/canasta.json en los súper VTEX y escribe data/precios.json.
// Uso: node scraper/precios.js   (corre en la actualización semanal)
const fs = require('fs');
const path = require('path');
const { SUPERS, vtexPorEan } = require('./vtex');
const { tamano, claveSimilar } = require('./tamano');
const { sacarPreciosViejos } = require('./sin-stock');

const ROOT = path.join(__dirname, '..');
const canasta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/canasta.json'), 'utf8')).productos;
const sups = Object.keys(SUPERS);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Coto no es VTEX: sus precios salen de su web (ver scraper/coto-lee.js).
const { cotoOf, cotoInfo } = require('./coto-lee')(ROOT);
const { promosCencosud, aplicarPromo } = require('./promos-lee')(ROOT);
if (!cotoInfo) console.log('Sin datos de Coto vigentes: Coto queda afuera.');

(async () => {
  const out = [];
  // EAN → SKU de Jumbo, Disco y Vea: lo usa cencosud-promos.js para pedir las promos.
  const SKU_CENCOSUD = { jumbo: {}, disco: {}, vea: {} };
  const grupos = [], grupoIdx = new Map(), claves = [], claveIdx = new Map();
  let descartados = 0, viejosSinStock = 0;
  const errores = Object.fromEntries(sups.map(s => [s, 0]));
  // Un "carril" por súper en paralelo; dentro de cada súper, de a una consulta con una pausa corta.
  const res = Object.fromEntries(canasta.map(p => [p.ean, {}]));
  // Si está el catálogo completo recién recorrido (catalogo.js), los precios salen de ahí: es mucho más rápido
  // que consultar producto por producto. Si no, se consulta cada código de barras.
  let crudo = null, fechaCrudo = null;
  try {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalogo-crudo.json'), 'utf8'));
    if ((Date.now() - new Date(c.actualizado)) / 864e5 < 3) { crudo = c.supers; fechaCrudo = c.actualizado; }
  } catch {}
  if (crudo) {
    for (const s of sups) for (const p of canasta) {
      const r = crudo[s] && crudo[s][p.ean];
      if (r && r.precio) res[p.ean][s] = r; else errores[s]++;
    }
    console.log('precios tomados del catálogo completo');
  } else await Promise.all(sups.map(async s => {
    for (const p of canasta) {
      const r = await vtexPorEan(s, p.ean).catch(() => null);
      if (r === null) errores[s]++;
      else res[p.ean][s] = r;
      await sleep(120);
    }
  }));
  for (const p of canasta) {
    const precios = {};
    let img = '';
    for (const [s, r] of Object.entries(res[p.ean])) {
      if (!r.precio) continue;
      const slug = r.url.slice(SUPERS[s].length + 1, -2);
      // 5º elemento: promo por cantidad {t: texto, n: unidades, u: precio c/u} (como en Coto).
      const pc = promosCencosud[s] && promosCencosud[s][p.ean];
      precios[s] = [r.precio, r.lista || 0, r.disponible ? 1 : 0, slug, ...(r.promo ? [r.promo] : pc ? [aplicarPromo(pc, r.precio)] : [])];
      if (r.sku && SKU_CENCOSUD[s]) SKU_CENCOSUD[s][p.ean] = r.sku;
      if (!img && r.img) img = r.img.replace(/-\d+-\d+\//, '-200-200/');
    }
    if (cotoOf[p.ean]) precios.coto = cotoOf[p.ean];
    // Validación: si un súper tiene un precio absurdo frente a los demás (menos de un tercio o más del triple
    // de la mediana), suele ser un error de carga (otra presentación, precio por unidad, etc.): se descarta.
    const vals = Object.values(precios).map(v => v[0]).sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)];
    for (const [s, v] of Object.entries(precios)) if (vals.length >= 3 && (v[0] < med / 3 || v[0] > med * 3)) { delete precios[s]; descartados++; }
    // Sin stock con precio viejo (muy por debajo de los que sí tienen stock, o nadie lo tiene): se saca.
    viejosSinStock += sacarPreciosViejos(precios);
    if (Object.keys(precios).length < 2) continue;
    // Para "VS similares": subcategoría (árbol de Jumbo/Disco/Vea; si no está, el de Carrefour) y tamaño.
    const rr = res[p.ean], ref = rr.jumbo || rr.disco || rr.vea, refC = rr.carrefour;
    const sc = (ref && ref.cats && ref.cats[0]) || (refC && refC.cats && refC.cats[0] && 'c:' + refC.cats[0]) || '';
    let g; if (sc) { g = grupoIdx.get(sc); if (g === undefined) { g = grupos.length; grupos.push(sc); grupoIdx.set(sc, g); } }
    const t = tamano(p.nombre);
    const kk = claveSimilar(p.nombre); let k = claveIdx.get(kk); if (k === undefined) { k = claves.length; claves.push(kk); claveIdx.set(kk, k); }
    out.push({ e: p.ean, n: p.nombre, c: p.categoria, i: img, ...(g !== undefined ? { g } : {}), ...(t ? { t } : {}), v: k, p: precios });
  }
  const data = {
    // Fecha en que se leyeron los precios (la del recorrido del catálogo, si se usó).
    actualizado: fechaCrudo || new Date().toISOString().slice(0, 10),
    supers: { ...Object.fromEntries(sups.map(s => [s, SUPERS[s]])), ...(cotoInfo ? { coto: 'https://www.coto.com.ar' } : {}) },
    ...(cotoInfo ? { coto: cotoInfo } : {}),
    nota: 'Precios online de cada súper (pueden variar por sucursal). Formato de p: [precio, precio de lista si hay rebaja, disponible, slug].',
    sinPrecio: errores,
    // g: índice en grupos (subcategoría) · t: [tamaño, 'g' | 'ml' | 'u'] · v: índice en claves (tipo y variantes)
    claves,
    grupos: grupos.map(x => x.replace(/^c:/, '').split('/').filter(Boolean).pop() || x),
    productos: out,
  };
  fs.writeFileSync(path.join(ROOT, 'data/precios.json'), JSON.stringify(data));
  if (Object.values(SKU_CENCOSUD).some(m => Object.keys(m).length)) fs.writeFileSync(path.join(ROOT, 'data/skus-cencosud.json'), JSON.stringify(SKU_CENCOSUD));

  // Historial: una foto chica por semana en data/historial/AAAA-MM-DD.json, base para "subió/bajó",
  // alertas de precio y el plan Plus. Por producto, el precio de cada súper en el orden de `supers` (0 = sin precio).
  // Se guarda el precio del súper (con su oferta si la hay), sin descuentos de bancos.
  const supsH = Object.keys(data.supers);
  const hist = { fecha: data.actualizado, supers: supsH, p: {} };
  for (const x of out) hist.p[x.e] = supsH.map(s => (x.p[s] ? Math.round(x.p[s][0] * 100) / 100 : 0));
  fs.mkdirSync(path.join(ROOT, 'data/historial'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data/historial', data.actualizado + '.json'), JSON.stringify(hist));
  console.log('historial guardado:', 'data/historial/' + data.actualizado + '.json', Object.keys(hist.p).length, 'productos');
  console.log('productos con precio en 2+ súper:', out.length, '/', canasta.length);
  console.log('precios absurdos descartados:', descartados);
  console.log('precios viejos sin stock sacados:', viejosSinStock);
  console.log('sin precio por súper:', JSON.stringify(errores));
})();
