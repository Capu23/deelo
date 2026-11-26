// Recorre el catálogo público de cada súper VTEX por categorías (solo rubros de supermercado)
// y guarda todo lo que encuentra en data/catalogo-crudo.json (no se publica: lo usan canasta y precios).
// Uso: node scraper/catalogo.js [super ...]
const fs = require('fs');
const path = require('path');
const { SUPERS, getJSON, normalizar } = require('./vtex');

// Rubros de súper (se descartan electro, hogar, ropa, juguetes, automotor, etc.).
const RUBRO = [
  [/almac[eé]n|desayuno|panader[ií]a|pastas frescas/i, 'Almacén'],
  [/l[aá]cteo|quesos|fiambre|frescos/i, 'Lácteos y frescos'],
  [/bebida/i, 'Bebidas'],
  [/congelado/i, 'Congelados'],
  [/limpieza/i, 'Limpieza'],
  [/perfumer[ií]a|farmacia/i, 'Perfumería'],
  [/beb[eé]/i, 'Bebés'],
  [/mascota/i, 'Mascotas'],
];
const rubro = n => (RUBRO.find(([re]) => re.test(n)) || [])[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MAX = 2500; // VTEX no deja paginar más allá de este número por búsqueda

async function paginar(sup, fq, out, rub) {
  for (let from = 0; from < MAX; from += 50) {
    const d = await getJSON(`${SUPERS[sup]}/api/catalog_system/pub/products/search?fq=${encodeURIComponent(fq)}&_from=${from}&_to=${from + 49}`);
    if (!Array.isArray(d) || !d.length) break;
    for (const p of d) {
      const n = normalizar(sup, p);
      if (n && n.ean && !out[n.ean]) out[n.ean] = { ...n, rubro: rub, cats: p.categories || [] };
    }
    if (d.length < 50) break;
    await sleep(150);
  }
}

async function recorrer(sup) {
  const t0 = Date.now(), out = {};
  const tree = await getJSON(`${SUPERS[sup]}/api/catalog_system/pub/category/tree/3`) || [];
  for (const top of tree) {
    const rub = rubro(top.name); if (!rub) continue;
    // Por subcategoría (y sub-subcategoría) para no chocar con el límite de 2500 por búsqueda.
    const hojas = (top.children || []).flatMap(c => (c.children && c.children.length) ? c.children.map(h => `C:/${top.id}/${c.id}/${h.id}/`) : [`C:/${top.id}/${c.id}/`]);
    for (const fq of (hojas.length ? hojas : [`C:/${top.id}/`])) await paginar(sup, fq, out, rub);
    console.log(`${sup} · ${top.name}: ${Object.keys(out).length} acumulados`);
  }
  console.log(`${sup}: ${Object.keys(out).length} productos en ${Math.round((Date.now() - t0) / 1000)} s`);
  return out;
}

(async () => {
  const sups = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SUPERS);
  const file = path.join(__dirname, '..', 'data', 'catalogo-crudo.json');
  let prev = {}; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')).supers || {}; } catch {}
  const res = await Promise.all(sups.map(s => recorrer(s).catch(e => { console.log(s, 'falló:', e.message); return null; })));
  sups.forEach((s, i) => { if (res[i] && Object.keys(res[i]).length) prev[s] = res[i]; });
  for (const s of Object.keys(prev)) if (!SUPERS[s]) delete prev[s]; // súper que ya no se usan
  fs.writeFileSync(file, JSON.stringify({ actualizado: new Date().toISOString().slice(0, 10), supers: prev }));
  console.log('guardado', file);
})();
