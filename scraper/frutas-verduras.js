// Frutas y verduras: una canasta fija comparada por precio por kilo (o por unidad) en cada súper.
// No tienen código de barras común (cada súper usa uno propio), así que se buscan por nombre: para cada producto
// de la canasta se toma, en cada súper, el más barato que coincide con el nombre y no es una variante
// (orgánico, deshidratado, "comercial en malla", cherry…). Jumbo, Disco, Vea, Carrefour y Día salen de su
// buscador; Coto, del catálogo que arma coto-precios.js (sección Frescos).
// Escribe data/frutas-verduras.json: {actualizado, items: [{id, n, u: 'kg'|'un', p: {sup: {precio, nombre, url}}}]}
// Uso: node scraper/frutas-verduras.js        (después precios.js los suma a la lista de productos)
const fs = require('fs');
const path = require('path');
const { SUPERS } = require('./vtex');

const ROOT = path.join(__dirname, '..');
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Variantes que no son el producto común (se excluyen siempre).
const NO = /organic|deshidrat|chips?\b|disecad|seca?s?\b|pulpa|jugo|pure|congel|lata|conserva|mermelada|dulce|snack|helad|semilla|harina|aceite|salsa|sopa|baby|mini\b|cherry|huella natural|comercial|segunda|en almibar|confitad|rallad|cortad|lavad[ao] y|listo|mix|ensalada|bandeja de \d+ ?(g|gr) de|hidroponic|hoja verde|grill|bastones|noisette|en cubos|precocid|baston|crema|polvo|\bte\b|infusion|esencia|mitades|trozos|light|cremoso|en grano|desgranad|rie\b/;
// Canasta: id, nombre en deelo, unidad de comparación, qué tiene que decir el nombre y qué no.
const CANASTA = [
  // Frutas
  ['banana', 'Banana', 'kg', /^banana/],
  ['manzana-roja', 'Manzana roja', 'kg', /^manzana (roja|red\b)/],
  ['manzana-verde', 'Manzana verde', 'kg', /^manzana[ .]*(verde|granny|g\.? ?smith)/],
  ['naranja', 'Naranja', 'kg', /^naranja/, /sanguin/],
  ['mandarina', 'Mandarina', 'kg', /^mandarina/],
  ['limon', 'Limón', 'kg', /^limon/],
  ['pera', 'Pera', 'kg', /^pera\b/],
  ['pomelo', 'Pomelo', 'kg', /^pomelo/],
  ['kiwi', 'Kiwi', 'kg', /^kiwi/],
  ['uva', 'Uva', 'kg', /^uva/, /pasa/],
  ['durazno', 'Durazno', 'kg', /^durazno/],
  ['ciruela', 'Ciruela', 'kg', /^ciruela/, /pasa|disecad/],
  ['frutilla', 'Frutilla', 'kg', /^frutilla/, null, true],
  ['melon', 'Melón', 'kg', /^melon/],
  ['sandia', 'Sandía', 'kg', /^sandia/],
  ['anana', 'Ananá', 'un', /^anana/],
  ['palta', 'Palta', 'un', /^palta/, /\d ?u(d|n)?\.?$|vivi|bowl|bandeja/],
  // Verduras
  ['tomate-redondo', 'Tomate redondo', 'kg', /^tomate( (redondo|red))?( grande)?( \.)?( (x|por) ?kg|xkg|$| \d)/, /perit|raf|cherry|cherri|pera\b|racimo|glaceado|rocky/],
  ['tomate-perita', 'Tomate perita', 'kg', /^tomate perit/],
  ['papa', 'Papa', 'kg', /^papa (negra|cepillada|comun|blanca)?/, /colorada|andina|malla|bolsa|fraccionad|mini|noisette|pay|frita/],
  ['batata', 'Batata', 'kg', /^batata/],
  ['cebolla', 'Cebolla', 'kg', /^cebolla( (comun|blanca|superior|fraccionada|a granel))?( (x|por) ?(1 )?kg|xkg|$)/, /morada|colorada|verdeo|deverdeo|echalote|perla|de verdeo/],
  ['cebolla-morada', 'Cebolla morada', 'kg', /^cebolla (morada|colorada|roja)/],
  ['zanahoria', 'Zanahoria', 'kg', /^zanahoria/],
  ['lechuga', 'Lechuga', 'kg', /^lechuga/],
  ['zapallito', 'Zapallito', 'kg', /^zapallito/, /italiano|zucchini/],
  ['zapallo', 'Zapallo anco', 'kg', /^(zapallo|calabaza)( (anco|anquito|butternut|cabutia))?/, /zapallito/],
  ['berenjena', 'Berenjena', 'kg', /^berenjena/],
  ['morron-rojo', 'Morrón rojo', 'kg', /^(morron|aji morron|pimiento) rojo/],
  ['morron-verde', 'Morrón verde', 'kg', /^(morron|aji morron|pimiento) verde/],
  ['pepino', 'Pepino', 'kg', /^pepino/],
  ['choclo', 'Choclo', 'un', /^choclo/, /desgranad|grano|crema|lata|bandeja|\d+ ?(g|gr|grs|grm|kg)\b/],
  ['brocoli', 'Brócoli', 'kg', /^brocoli/],
  ['coliflor', 'Coliflor', 'kg', /^coliflor/],
  ['repollo', 'Repollo', 'kg', /^repollo/, /colorado|morado|bruselas/],
  ['remolacha', 'Remolacha', 'kg', /^remolacha/],
];

// Precio por kilo o por unidad según cómo lo vende el súper.
function porUnidadBase(nombre, precio, medida, base) {
  const n = norm(nombre);
  if (base === 'un') { if (medida === 'kg' || /(x|por) ?kg/.test(n)) return null; return precio; }
  if (medida === 'kg' || /(x|por) ?(1 )?kg\b|xkg|x ?k\b/.test(n)) return precio; // precio por kilo
  let m;
  if ((m = n.match(/(\d+(?:[.,]\d+)?) ?(kg|kilo)/))) { const k = parseFloat(m[1].replace(',', '.')); return k > 0 ? precio / k : null; }
  if ((m = n.match(/(\d+) ?(g|gr|grs|grm)\b/))) { const g = +m[1]; return g >= 100 ? precio / (g / 1000) : null; }
  return null; // por unidad o atado sin peso: no se puede comparar por kilo
}
function elegir(cands, it) {
  const [, , base, si, no2, bandeja] = it;
  const ok = cands.filter(c => si.test(norm(c.nombre)) && !NO.test(norm(c.nombre)) && !(no2 && no2.test(norm(c.nombre))))
    .map(c => ({ ...c, pu: porUnidadBase(c.nombre, c.precio, c.medida, base) })).filter(c => c.pu > 0 && c.disponible !== false);
  // Primero el suelto (vendido por kilo); el envasado (bandeja de 250 g…) solo si no hay suelto.
  const suelto = c => c.medida === 'kg' || /(x|por) ?(1 )?kg\b|xkg/.test(norm(c.nombre)) || base === 'un';
  // Envasado de menos de 500 g: no se compara por kilo (sale carísimo y confunde), salvo la frutilla (siempre en bandeja).
  const gramos = c => { const m = norm(c.nombre).match(/(\d+) ?(g|gr|grs|grm)\b/); return m ? +m[1] : null; };
  const ok2 = ok.filter(c => suelto(c) || bandeja || (gramos(c) || 1000) >= 500);
  ok.length = 0; ok.push(...ok2);
  ok.sort((a, b) => (suelto(b) - suelto(a)) || (a.pu - b.pu));
  return { elegido: ok[0] || null, otros: ok.slice(1, 4) };
}

(async () => {
  const { request } = require('playwright');
  const px = process.env.HTTPS_PROXY || process.env.https_proxy;
  const req = await request.newContext({ ...(px ? { proxy: { server: px } } : {}), extraHTTPHeaders: { accept: 'application/json' } });
  const get = async u => { for (let k = 0; k < 3; k++) { try { const r = await req.get(u, { timeout: 30000 }); if (r.ok()) return await r.json(); } catch (e) {} await new Promise(r => setTimeout(r, 1500 * (k + 1))); } return null; };
  // Coto: sección Frescos del catálogo de coto-precios.js
  let coto = [];
  try { coto = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/coto-catalogo.json'), 'utf8')).productos.filter(p => p.categoria === 'Frescos'); } catch (e) {}
  const items = [], revision = [];
  for (const it of CANASTA) {
    const [id, n, base] = it;
    const fila = { id, n, u: base, p: {} };
    const termino = norm(n).split(' ')[0]; // "tomate", "manzana", "morron"…
    for (const s of Object.keys(SUPERS)) {
      const d = [...(await get(`${SUPERS[s]}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termino)}&_from=0&_to=49`) || []),
        ...(await get(`${SUPERS[s]}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termino)}&_from=50&_to=99`) || [])];
      const cands = d.filter(p => /frut|verdu|hortaliz/i.test((p.categories || []).join(' '))).map(p => {
        const i = (p.items || [])[0] || {}, o = ((i.sellers || [])[0] || {}).commertialOffer || {};
        return { nombre: p.productName, precio: Number(o.Price) || 0, medida: i.measurementUnit, disponible: (o.AvailableQuantity || 0) > 0, url: `${SUPERS[s]}/${p.linkText}/p` };
      }).filter(c => c.precio > 0);
      const { elegido, otros } = elegir(cands, it);
      if (elegido) fila.p[s] = { precio: Math.round(elegido.pu * 100) / 100, nombre: elegido.nombre, url: elegido.url };
      revision.push({ id, s, elegido: elegido && `${elegido.nombre} · $${Math.round(elegido.pu)}`, otros: otros.map(o => `${o.nombre} · $${Math.round(o.pu)}`) });
      await new Promise(r => setTimeout(r, 150));
    }
    if (coto.length) {
      const cands = coto.map(p => ({ nombre: p.nombre, precio: p.precioOferta || p.precio, medida: p.pesable || /x ?kg|xkg/i.test(p.nombre) ? 'kg' : 'un', url: p.url }));
      const { elegido, otros } = elegir(cands, it);
      if (elegido) fila.p.coto = { precio: Math.round(elegido.pu * 100) / 100, nombre: elegido.nombre, url: elegido.url };
      revision.push({ id, s: 'coto', elegido: elegido && `${elegido.nombre} · $${Math.round(elegido.pu)}`, otros: otros.map(o => `${o.nombre} · $${Math.round(o.pu)}`) });
    }
    items.push(fila);
    console.log(`${n.padEnd(18)} ${Object.entries(fila.p).map(([s, v]) => `${s} $${Math.round(v.precio)}`).join(' · ') || '— sin datos'}`);
  }
  await req.dispose();
  fs.writeFileSync(path.join(ROOT, 'data/frutas-verduras.json'), JSON.stringify({ actualizado: new Date().toISOString().slice(0, 10), items }, null, 1));
  fs.writeFileSync(path.join(ROOT, 'data/frutas-verduras-revision.json'), JSON.stringify(revision, null, 1));
  const conDos = items.filter(i => Object.keys(i.p).length >= 2).length;
  console.log(`\n${items.length} productos · ${conDos} con precio en 2 o más súper`);
})();
