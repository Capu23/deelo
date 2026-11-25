// Trae el precio de cada producto de data/canasta.json en los súper VTEX y escribe data/precios.json.
// Uso: node scraper/precios.js   (corre en la actualización semanal)
const fs = require('fs');
const path = require('path');
const { SUPERS, vtexPorEan } = require('./vtex');

const ROOT = path.join(__dirname, '..');
const canasta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/canasta.json'), 'utf8')).productos;
const sups = Object.keys(SUPERS);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Coto no es VTEX: sus precios salen de SEPA (scraper/sepa.js, corre en una compu en Argentina).
// Solo se usan si tienen menos de 15 días.
const COTO_URL = 'https://www.cotodigital.com.ar/sitios/cdigi/categoria?Ntt=';
let coto = null;
try {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/precios-coto.json'), 'utf8'));
  if ((Date.now() - new Date(c.actualizado)) / 864e5 < 15) coto = c;
  else console.log('precios-coto.json tiene más de 15 días: no se usa.');
} catch { console.log('Sin data/precios-coto.json: Coto queda afuera.'); }

// Ofertas de Coto de su web (data/coto-ofertas.json, se arma desde Argentina). Pisan el precio de SEPA del
// producto: "25%Dto"/"Oferta" son rebajas directas; "Llevando 2 2x1", "Llevando 2 70% 2da" y
// "Llevando 3 25%Dto" son promos por cantidad. Se ignoran las de cuotas ("1 Pago 20%", electro).
let cotoOf = {};
try {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/coto-ofertas.json'), 'utf8'));
  if ((Date.now() - new Date(c.actualizado)) / 864e5 < 15) {
    for (const o of c.ofertas) {
      if (!o.ean || !(o.precio > 0) || !(o.precioOferta > 0) || o.precioOferta >= o.precio || /pago/i.test(o.texto)) continue;
      let promo = null, m;
      const n = o.unidades || ((m = o.texto.match(/llevando\s*(\d+)/i)) ? +m[1] : 0);
      if (n > 1) {
        let t;
        if ((m = o.texto.match(/(\d)\s*x\s*(\d)/i))) t = `${m[1]}x${m[2]}`;
        else if ((m = o.texto.match(/(\d{2,3})\s*%\s*(\d)\s*d/i))) t = `${m[2] === '2' ? '2da' : m[2] + 'ra'} al ${m[1]}%`;
        else if ((m = o.texto.match(/(\d{1,3})\s*%/))) t = `−${m[1]}% llevando ${n}`;
        else t = `Llevando ${n}`;
        promo = { t, n, u: Math.round(o.precioOferta * 100) / 100 };
      }
      cotoOf[o.ean] = promo ? [o.precio, 0, 1, o.url, promo] : [o.precioOferta, o.precio, 1, o.url];
    }
    console.log('ofertas de Coto (web):', Object.keys(cotoOf).length);
  } else console.log('coto-ofertas.json tiene más de 15 días: no se usa.');
} catch {}

(async () => {
  const out = [];
  let descartados = 0;
  const errores = Object.fromEntries(sups.map(s => [s, 0]));
  // Un "carril" por súper en paralelo; dentro de cada súper, de a una consulta con una pausa corta.
  const res = Object.fromEntries(canasta.map(p => [p.ean, {}]));
  // Si está el catálogo completo recién recorrido (catalogo.js), los precios salen de ahí: es mucho más rápido
  // que consultar producto por producto. Si no, se consulta cada código de barras.
  let crudo = null;
  try {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalogo-crudo.json'), 'utf8'));
    if ((Date.now() - new Date(c.actualizado)) / 864e5 < 3) crudo = c.supers;
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
      precios[s] = [r.precio, r.lista || 0, r.disponible ? 1 : 0, slug, ...(r.promo ? [r.promo] : [])];
      if (!img && r.img) img = r.img.replace(/-\d+-\d+\//, '-200-200/');
    }
    if (cotoOf[p.ean]) precios.coto = cotoOf[p.ean];
    else if (coto && coto.p[p.ean]) {
      const [pc, lc, m] = coto.p[p.ean];
      precios.coto = [pc, lc, 1, COTO_URL + p.ean, ...(m ? [m] : [])];
    }
    // Validación: si un súper tiene un precio absurdo frente a los demás (menos de un tercio o más del triple
    // de la mediana), suele ser un error de carga (otra presentación, precio por unidad, etc.): se descarta.
    const vals = Object.values(precios).map(v => v[0]).sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)];
    for (const [s, v] of Object.entries(precios)) if (vals.length >= 3 && (v[0] < med / 3 || v[0] > med * 3)) { delete precios[s]; descartados++; }
    if (Object.keys(precios).length >= 2) out.push({ e: p.ean, n: p.nombre, c: p.categoria, i: img, p: precios });
  }
  const data = {
    actualizado: new Date().toISOString().slice(0, 10),
    supers: { ...Object.fromEntries(sups.map(s => [s, SUPERS[s]])), ...(coto || Object.keys(cotoOf).length ? { coto: 'https://www.cotodigital.com.ar' } : {}) },
    ...(coto ? { coto: { actualizado: coto.actualizado, sucursal: coto.sucursal, sucursales: coto.sucursales } } : {}),
    nota: 'Precios online de cada súper (pueden variar por sucursal). Formato de p: [precio, precio de lista si hay rebaja, disponible, slug].',
    sinPrecio: errores,
    productos: out,
  };
  fs.writeFileSync(path.join(ROOT, 'data/precios.json'), JSON.stringify(data));
  console.log('productos con precio en 2+ súper:', out.length, '/', canasta.length);
  console.log('precios absurdos descartados:', descartados);
  console.log('sin precio por súper:', JSON.stringify(errores));
})();
