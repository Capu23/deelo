// Lee el tamaño de un producto desde su nombre: [cantidad, 'g' | 'ml' | 'u'] o null.
// Ejemplos: "Yerba 1 kg" → [1000,'g'] · "Aceite 1,5 lts" → [1500,'ml'] · "Gaseosa 6 x 354 ml" → [2124,'ml']
//           "Caldo Knorr 12 cubos" → [12,'u'] · "Toallitas x 48 un" → [48,'u']
const UNI = [
  [/^(kg|kgs|kilos?)$/i, 1000, 'g'], [/^(g|gr|grs|grm|gramos?)$/i, 1, 'g'],
  [/^(l|lt|lts|ltr|litros?)$/i, 1000, 'ml'], [/^(ml|cc|cm3|mililitros?)$/i, 1, 'ml'],
];
const CONT = /^(u|un|uni|unid|unidades|cubos|saquitos|sobres|rollos|capsulas|cápsulas|pa[ñn]ales|tabletas|pastillas|bolsitas|hojas|paquetes)$/i;
const num = s => parseFloat(String(s).replace(',', '.'));
function medida(n, u) {
  for (const [re, f, t] of UNI) if (re.test(u)) return [Math.round(num(n) * f * 100) / 100, t];
  return null;
}
function tamano(nombre) {
  const s = ' ' + String(nombre).replace(/\s+/g, ' ') + ' ';
  const U = '(kg|kgs|kilos?|g|gr|grs|grm|gramos?|l|lt|lts|ltr|litros?|ml|cc|cm3)';
  let m;
  // Packs: "6 x 354 ml" o "354 ml x 6"
  if ((m = s.match(new RegExp(`\\b(\\d{1,2})\\s*x\\s*(\\d+(?:[.,]\\d+)?)\\s*${U}\\b`, 'i')))) { const t = medida(m[2], m[3]); if (t) return [Math.round(t[0] * +m[1] * 100) / 100, t[1]]; }
  if ((m = s.match(new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*${U}\\.?\\s*x\\s*(\\d{1,2})\\s*(?:u|un|uni|unid|unidades|latas?|botellas?|botellitas?)?\\b(?!\\s*${U})`, 'i')))) { const t = medida(m[1], m[2]); if (t && +m[3] > 1) return [Math.round(t[0] * +m[3] * 100) / 100, t[1]]; }
  // Peso o volumen simple (se toma el último que aparece)
  const todos = [...s.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${U}\\b\\.?`, 'gi'))];
  if (todos.length) { const x = todos[todos.length - 1]; const t = medida(x[1], x[2]); if (t && t[0] > 0) return t; }
  // Unidades: "x 48 un", "12 cubos", "x 20"
  if ((m = s.match(/\b(?:x\s*)?(\d{1,3})\s*([a-záéíóúñ]+)\b/gi))) {
    for (const k of m) { const mm = k.match(/(\d{1,3})\s*([a-záéíóúñ]+)/i); if (mm && CONT.test(mm[2]) && +mm[1] > 0) return [+mm[1], 'u']; }
  }
  if ((m = s.match(/\bx\s*(\d{1,3})\s*$/i))) return [+m[1], 'u'];
  return null;
}
module.exports = { tamano };

// Clave para "VS similares": el tipo de producto (primera palabra del nombre) y las variantes que no se pueden
// mezclar (con o sin alcohol, girasol o maíz, entera o descremada, talle del pañal…). Dos productos son
// comparables solo si tienen la misma clave, además de la misma subcategoría y un tamaño parecido.
const sinTildes = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const FAMILIAS = [
  ['alcohol', [[/sin alcohol|\b0[.,]0\b|\bcero alcohol/, 'sin']]],
  ['azucar', [[/\bzero\b|sin azucar|\bdiet\b|\blight\b|\blite\b|reducid[oa] en azucar|\bligth\b/, 'sin']]],
  ['aceite', [[/girasol/, 'girasol'], [/\bmaiz\b/, 'maiz'], [/oliva/, 'oliva'], [/canola/, 'canola'], [/\bsoja\b/, 'soja'], [/mezcla|\bmezclas\b/, 'mezcla'], [/\bcoco\b/, 'coco'], [/arroz/, 'arroz']]],
  ['leche', [[/parcialmente descremad|semi ?descremad/, 'parcial'], [/descremad/, 'descremada'], [/\bentera\b/, 'entera']]],
  ['lactosa', [[/sin lactosa|deslactosad|lactose free|0% lactosa/, 'sin']]],
  ['tacc', [[/sin tacc|sin gluten|gluten free/, 'sin']]],
  ['gas', [[/sin gas/, 'sin'], [/con gas|gasificad/, 'con']]],
  ['yerba', [[/sin palo|despalad/, 'sinpalo'], [/compuesta|hierbas|\bsaborizada/, 'compuesta']]],
  ['cafe', [[/capsul/, 'capsula'], [/en grano|granos/, 'grano'], [/instantane|soluble/, 'instantaneo'], [/molido/, 'molido']]],
  ['arroz', [[/integral/, 'integral'], [/parboil/, 'parboil'], [/doble carolina|carolina/, 'carolina'], [/largo fino|\bfino\b/, 'fino'], [/yamani/, 'yamani']]],
  ['talle', [[/talle\s*(xxxg|xxg|xg|rn|pp|p|m|g)\b/, m => 't' + m[1]], [/\b(xxxg|xxg|xg)\b/, m => 't' + m[1]]]],
  ['vino', [[/\bmalbec\b/, 'malbec'], [/cabernet/, 'cabernet'], [/\bblanco\b|chardonnay|torrontes|sauvignon blanc/, 'blanco'], [/rosado|\brose\b/, 'rosado'], [/espumante|champa/, 'espumante']]],
  ['sabor', [[/chocolat|cacao/, 'chocolate']]],
  ['agua', [[/saborizad/, 'saborizada']]],
];
function claveSimilar(nombre) {
  const s = ' ' + sinTildes(nombre).replace(/[^a-z0-9.,% ]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const tipo = (s.trim().split(' ')[0] || '').replace(/s$/, '');
  const partes = [tipo];
  for (const [fam, reglas] of FAMILIAS) {
    for (const [re, val] of reglas) { const m = s.match(re); if (m) { partes.push(fam + ':' + (typeof val === 'function' ? val(m) : val)); break; } }
  }
  return partes.join('|');
}
module.exports.claveSimilar = claveSimilar;
