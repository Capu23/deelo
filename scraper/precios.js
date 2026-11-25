// Trae el precio de cada producto de data/canasta.json en los súper VTEX y escribe data/precios.json.
// Uso: node scraper/precios.js   (corre en la actualización semanal)
//      node scraper/precios.js --solo-coto   rehace solo los precios de Coto sobre el data/precios.json actual
//      (para después de correr coto-precios.js, sin volver a consultar los súper VTEX)
const fs = require('fs');
const path = require('path');
const { SUPERS, vtexPorEan } = require('./vtex');

const ROOT = path.join(__dirname, '..');
const canasta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/canasta.json'), 'utf8')).productos;
const sups = Object.keys(SUPERS);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SOLO_COTO = process.argv.includes('--solo-coto');

// Coto no es VTEX: sus precios salen de su web (coto-precios.js) o de SEPA (sepa.js), ver scraper/coto.js.
const coto = require('./coto').cargarCoto();
if (coto) console.log(`Coto: ${Object.keys(coto.p).length} precios (${coto.fuente}, ${coto.actualizado})`);

(async () => {
  const out = [];
  let descartados = 0;
  const errores = Object.fromEntries(sups.map(s => [s, 0]));
  // Un "carril" por súper en paralelo; dentro de cada súper, de a una consulta con una pausa corta.
  const res = Object.fromEntries(canasta.map(p => [p.ean, {}]));
  // Si está el catálogo completo recién recorrido (catalogo.js), los precios salen de ahí: es mucho más rápido
  // que consultar producto por producto. Si no, se consulta cada código de barras.
  let crudo = null, previo = null, sinPrecioPrevio = null, fechaPrevia = null;
  if (SOLO_COTO) {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/precios.json'), 'utf8'));
    previo = Object.fromEntries(v.productos.map(p => [p.e, p]));
    sinPrecioPrevio = v.sinPrecio;
    fechaPrevia = v.actualizado;
    console.log('solo Coto: los demás súper quedan como estaban en precios.json del', v.actualizado);
  } else try {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalogo-crudo.json'), 'utf8'));
    if ((Date.now() - new Date(c.actualizado)) / 864e5 < 3) crudo = c.supers;
  } catch {}
  if (previo) {
    // nada que consultar
  } else if (crudo) {
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
    if (previo && previo[p.ean]) {
      Object.assign(precios, previo[p.ean].p);
      delete precios.coto;
      img = previo[p.ean].i || '';
    }
    for (const [s, r] of Object.entries(res[p.ean])) {
      if (!r.precio) continue;
      const slug = r.url.slice(SUPERS[s].length + 1, -2);
      precios[s] = [r.precio, r.lista || 0, r.disponible ? 1 : 0, slug];
      if (!img && r.img) img = r.img.replace(/-\d+-\d+\//, '-200-200/');
    }
    if (coto && coto.p[p.ean]) {
      const [pc, lc, url, m] = coto.p[p.ean];
      precios.coto = [pc, lc, 1, url, ...(m ? [m] : [])];
    }
    // Validación: si un súper tiene un precio absurdo frente a los demás (menos de un tercio o más del triple
    // de la mediana), suele ser un error de carga (otra presentación, precio por unidad, etc.): se descarta.
    const vals = Object.values(precios).map(v => v[0]).sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)];
    for (const [s, v] of Object.entries(precios)) if (vals.length >= 3 && (v[0] < med / 3 || v[0] > med * 3)) { delete precios[s]; descartados++; }
    if (Object.keys(precios).length >= 2) out.push({ e: p.ean, n: p.nombre, c: p.categoria, i: img, p: precios });
  }
  const data = {
    actualizado: fechaPrevia || new Date().toISOString().slice(0, 10), // con --solo-coto, la fecha de los VTEX no cambia
    supers: { ...Object.fromEntries(sups.map(s => [s, SUPERS[s]])), ...(coto ? { coto: 'https://www.cotodigital.com.ar' } : {}) },
    ...(coto ? { coto: { actualizado: coto.actualizado, sucursal: coto.sucursal, sucursales: coto.sucursales, fuente: coto.fuente } } : {}),
    nota: 'Precios online de cada súper (pueden variar por sucursal). Formato de p: [precio, precio de lista si hay rebaja, disponible, slug].',
    sinPrecio: sinPrecioPrevio || errores,
    productos: out,
  };
  fs.writeFileSync(path.join(ROOT, 'data/precios.json'), JSON.stringify(data));
  console.log('productos con precio en 2+ súper:', out.length, '/', canasta.length);
  console.log('precios absurdos descartados:', descartados);
  console.log('sin precio por súper:', JSON.stringify(errores));
})();
