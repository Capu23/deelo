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
  if ((m = s.match(new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*${U}\\.?\\s*x\\s*(\\d{1,2})\\b(?!\\s*${U})`, 'i')))) { const t = medida(m[1], m[2]); if (t && +m[3] > 1) return [Math.round(t[0] * +m[3] * 100) / 100, t[1]]; }
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
