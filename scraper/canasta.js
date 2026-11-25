// Arma data/canasta.json a partir del catálogo completo de los súper (data/catalogo-crudo.json, ver catalogo.js):
// productos con código de barras que venden al menos MIN_CADENAS cadenas distintas, sin marcas propias de los súper.
// Uso: node scraper/canasta.js [min_cadenas]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIN_CADENAS = Number(process.argv[2]) || 3;
// Jumbo, Disco y Vea son la misma empresa (Cencosud): cuentan como una sola cadena.
const CADENA = { jumbo: 'cencosud', disco: 'cencosud', vea: 'cencosud', carrefour: 'carrefour', dia: 'dia', changomas: 'changomas', coto: 'coto' };
// Marcas propias o genéricas de los súper: no tienen con qué compararse.
const PROPIA = /^(vea|jumbo|disco|cuisine ?& ?co|carrefour.*|d[ií]a|great value|equate|sin marca\.?|gen[eé]rico|elaboraci[oó]n propia|la panader[ií]a|bell.?s|check|coto)$/i;
const PROPIA_NOMBRE = /cuisine ?& ?co|carrefour|\bd[ií]a\b|\bcoto\b|great value/i;
// Para el nombre y la categoría, preferimos el súper con nombres más prolijos.
const ORDEN = ['carrefour', 'jumbo', 'disco', 'vea', 'changomas', 'dia'];

const crudo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalogo-crudo.json'), 'utf8')).supers;
const por = {};
for (const [s, ps] of Object.entries(crudo)) for (const [e, p] of Object.entries(ps)) {
  if (!p.precio || !/^\d{8,14}$/.test(e)) continue;
  (por[e] ||= {})[s] = p;
}
// Coto (SEPA) también cuenta como cadena si ya tenemos su precio.
let coto = {};
try { coto = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/precios-coto.json'), 'utf8')).p; } catch {}
try { for (const o of JSON.parse(fs.readFileSync(path.join(ROOT, 'data/coto-ofertas.json'), 'utf8')).ofertas) if (o.ean && !/pago/i.test(o.texto)) coto[o.ean] = coto[o.ean] || [o.precio, 0]; } catch {}

const productos = [];
let propias = 0;
for (const [ean, m] of Object.entries(por)) {
  const ps = Object.values(m);
  if (ps.some(p => PROPIA.test((p.marca || '').trim()) || PROPIA_NOMBRE.test(p.nombre))) { propias++; continue; }
  const cadenas = new Set(Object.keys(m).map(s => CADENA[s]));
  if (coto[ean]) cadenas.add('coto');
  if (cadenas.size < MIN_CADENAS) continue;
  const ref = m[ORDEN.find(s => m[s])];
  productos.push({ ean, nombre: ref.nombre, categoria: ref.rubro, marca: ref.marca || undefined, cadenas: cadenas.size });
}
// Primero los que están en más cadenas; después, por categoría y nombre.
productos.sort((a, b) => (b.cadenas - a.cadenas) || a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
productos.forEach(p => delete p.cadenas);
// Si el recorrido vino incompleto (un súper caído), no achicamos la lista de golpe: se mantiene la anterior.
let antes = 0; try { antes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/canasta.json'), 'utf8')).productos.length; } catch {}
if (antes && productos.length < antes * 0.7) { console.log(`canasta nueva (${productos.length}) mucho menor que la anterior (${antes}): se mantiene la anterior.`); process.exit(0); }
fs.writeFileSync(path.join(ROOT, 'data/canasta.json'), JSON.stringify({ nota: `Productos que compara deelo: con código de barras, en ${MIN_CADENAS} o más cadenas, sin marcas propias. Se arma con scraper/canasta.js.`, productos }, null, 1));
const cat = {}; productos.forEach(p => cat[p.categoria] = (cat[p.categoria] || 0) + 1);
console.log('canasta:', productos.length, 'productos ·', propias, 'descartados por marca propia ·', JSON.stringify(cat));
