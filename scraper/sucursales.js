// Sucursales de los 6 súper en CABA (y alrededores cercanos), desde OpenStreetMap (datos abiertos, © colaboradores
// de OpenStreetMap, licencia ODbL). Escribe data/sucursales.json: {actualizado, fuente, s: {coto: [[lat, lon, "dirección", "horario"?], …]}}.
// La página calcula en el celular cuál queda más cerca (la ubicación no sale del dispositivo).
// Corre en GitHub (workflow "deelo: sucursales", una vez por mes); desde una red sin acceso a Overpass no anda.
// Uso: node scraper/sucursales.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// CABA y el primer cordón (Vicente López, San Isidro, San Martín, Tres de Febrero, Morón, La Matanza norte, Lanús, Avellaneda).
const BBOX = '-34.75,-58.62,-34.48,-58.30';
const MARCAS = [
  ['coto', /\bcoto\b/i],
  ['jumbo', /\bjumbo\b/i],
  ['disco', /\bdisco\b/i],
  ['vea', /\bvea\b/i],
  ['carrefour', /carrefour/i],
  ['dia', /^(supermercados? )?d[ií]a\b|\bd[ií]a%|\bdia express|\bdia market/i],
];
const QUERY = `[out:json][timeout:120];
(nwr["shop"~"^(supermarket|convenience|department_store)$"](${BBOX}););
out center tags;`;

function direccion(t) {
  const calle = t['addr:street'], num = t['addr:housenumber'];
  if (calle) return num ? `${calle} ${num}` : calle;
  return '';
}

(async () => {
  const servidores = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let d = null;
  for (const u of servidores) {
    for (let k = 0; k < 3 && !d; k++) {
      try {
        const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'deelo (deelo.ar)' }, body: 'data=' + encodeURIComponent(QUERY) });
        if (r.ok) d = await r.json(); else console.log(u, r.status);
      } catch (e) { console.log(u, e.message); }
      if (!d) await new Promise(r => setTimeout(r, 10000 * (k + 1)));
    }
    if (d) break;
  }
  if (!d) { console.log('Overpass no respondió: se mantienen las sucursales anteriores.'); process.exit(1); }
  const s = Object.fromEntries(MARCAS.map(([k]) => [k, []]));
  for (const e of d.elements) {
    const t = e.tags || {}, lat = e.lat ?? (e.center && e.center.lat), lon = e.lon ?? (e.center && e.center.lon);
    if (!lat || !lon) continue;
    const quien = `${t.brand || ''} ${t.name || ''} ${t.operator || ''}`;
    const m = MARCAS.find(([, re]) => re.test(quien)); if (!m) continue;
    // "Carrefour" también es el nombre de las estaciones de servicio y farmacias: solo súper o tiendas de cercanía.
    s[m[0]].push([Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, direccion(t), t.opening_hours || ''].filter((x, i) => i < 3 || x));
  }
  const out = { actualizado: new Date().toISOString().slice(0, 10), fuente: '© colaboradores de OpenStreetMap (ODbL)', s };
  fs.writeFileSync(path.join(ROOT, 'data/sucursales.json'), JSON.stringify(out));
  console.log(Object.entries(s).map(([k, v]) => `${k}: ${v.length} (${v.filter(x => x[2]).length} con dirección)`).join(' · '));
})();
