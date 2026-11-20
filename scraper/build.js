// Convierte las promos oficiales (data/oficial.json, salida de scrape.js) al formato de la página,
// les suma las promos cargadas a mano (data/extras.json) y escribe:
//   - data/promos.json          (lo que usa la página)
//   - src/app.html e index.html (con los datos embebidos, para que la página funcione sin pedir nada)
// Si una fuente falló en esta corrida, se conservan sus promos de la corrida anterior.
// Uso: node descuentos/scraper/build.js

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const cat = read('data/catalogo.json');
const extras = read('data/extras.json').promos;
const raw = read('data/oficial.json');
let prev = null;
try { prev = read('data/promos.json'); } catch (e) { /* primera corrida */ }

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const norm = s => clean(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const hoy = raw.generado.slice(0, 10);

// Bancos que entran por MODO / Visa sin contacto (los súper no siempre publican la lista completa).
const MODO = ['nacion', 'galicia', 'santander', 'bbva', 'macro', 'icbc', 'ciudad', 'patagonia', 'supervielle', 'comafi', 'credicoop', 'hipotecario', 'provincia', 'columbia'];
const VISA_NFC = ['galicia', 'macro', 'santander', 'supervielle', 'comafi', 'patagonia', 'naranjax', 'provincia'];

// Reconocimiento de la entidad a partir del texto de cada fuente. El primer patrón que coincide gana.
const REGLAS = [
  [/club la nacion|club_lanacion|club ?lanacion/, 'clubln'], [/\bmodo\b|logo_modo/, 'modo'], [/mercado ?pago|mercadopago|dinero en cuenta/, 'mercadopago'], [/naranja/, 'naranjax'],
  [/personal ?pay/, 'personalpay'], [/cuenta ?dni|provincia/, 'provincia'], [/\bbna\b|nacion/, 'nacion'],
  [/galicia/, 'galicia'], [/santander/, 'santander'], [/bbva/, 'bbva'], [/macro/, 'macro'],
  [/supervielle/, 'supervielle'], [/icbc/, 'icbc'], [/ciudad(?!ania)/, 'ciudad'], [/patagonia/, 'patagonia'],
  [/comafi/, 'comafi'], [/credicoop/, 'credicoop'], [/hipotecario/, 'hipotecario'], [/columbia/, 'columbia'],
  [/cuenta digital|carrefour banco|carrefour-credito|credito\.png/, 'carrefourbanco'],
  [/cenco ?pay/, 'cencopay'], [/comunidad/, 'comunidadcoto'], [/visa.*nfc|nfc.*visa|logo_visa/, 'visanfc'], [/personal_pay/, 'personalpay'],
  [/jubilad|anses|mayores de 60/, 'anses'], [/tarjetascredito|con tarjetas de credito\.?$/, 'credito'],
];
const IGNORAR = /empleado|ciudadania|tarjeta ba|sidecreer|banco del sol|corrientes|prex|\btci\b|logo_tci|^10% off todos los medios|club (la voz|la capital|la gaceta|rio negro)|andes pass/;
function entidad(txt) {
  const t = norm(txt);
  if (IGNORAR.test(t)) return null;
  for (const [re, k] of REGLAS) if (re.test(t)) return k;
  return null;
}

const TOPE_OK = t => t === null || (t && typeof t === 'object' && t.m > 0);
function tope(t) {
  if (t === null) return null;
  if (!t || t === 'desconocido' || !t.m) return 'app';
  return { m: t.m, p: t.p || null }; // período desconocido: se muestra solo el monto
}
const FUENTE = { 'coto-vigentes': 'of-coto-dia', coto: 'of-coto', cencosud: 'of-cenco', carrefour: 'of-carrefour', dia: 'of-dia' };

// fechas puntuales tipo "Miércoles 18 y 25 de Noviembre"
function fechasDeTexto(txt, anioMes) {
  const m = norm(txt).match(/^(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)s? ((?:\d{1,2}(?:, | y )?)+) de/);
  if (!m) return null;
  return m[1].split(/, | y /).filter(Boolean).map(d => `${anioMes}-${String(d).padStart(2, '0')}`);
}

const out = [];
const skipped = [];
const SELECCION = /productos seleccionados|secciones? (galletitas|bebidas)/i;
const SOLO_CUOTAS = t => /cuotas (sin|cero) inter/i.test(t) && !/\d+ ?% ?(de )?(descuento|ahorro|reintegro|cashback)/i.test(t);
const sinTope = t => /sin tope/i.test(t);
function medioDefault(ent, txt) {
  const t = clean(txt);
  return t.length >= 14 && !/^\d+ ?%/.test(t) ? t : 'Pagando con ' + (cat.entidades[ent] ? cat.entidades[ent].n : 'el medio indicado');
}
function add(p, src) {
  if (!p.ent) { skipped.push(`${src.fuente}: ${clean(src.titulo).slice(0, 60)}`); return; }
  if (!p.dias.length && !(p.fechas && p.fechas.length)) { skipped.push(`${src.fuente} (sin días): ${clean(src.titulo).slice(0, 60)}`); return; }
  p.conf = 'oficial';
  p.fu = [FUENTE[src.fuente]];
  p.origen = src.fuente;
  if (src.vigencia && src.vigencia.hasta) p.vig = { desde: src.vigencia.desde || hoy, hasta: src.vigencia.hasta };
  out.push(p);
}

for (const x of raw.promos) {
  if (!x.pct || x.pct >= 100) continue;
  const canal = x.online === 'solo-online' ? 'online' : x.online === 'solo-presencial' ? 'presencial' : undefined;
  if (x.fuente === 'coto-vigentes') {
    const ent = entidad(x.icono) || entidad(x.descripcion);
    if (SELECCION.test(x.descripcion + x.observacion)) continue;
    const p = { ent, sup: ['coto'], dias: x.dias, pct: x.pct, tope: sinTope(x.observacion) ? null : tope(x.tope), medio: clean(x.descripcion.replace(/^(PLAN SUELDO|SGTO \S+)\s*/i, '').replace(/Exclusivo en sucursales\.?\s*/i, '')) || 'Ver condiciones', tj: [], canal, nota: clean(x.observacion.replace(/Aplican (exclusiones|excluidos)[^.]*\.?/gi, '').replace(/Ver legal(es)?\.?/gi, '')) };
    if (/plan sueldo/i.test(x.descripcion)) p.req = 'Plan sueldo';
    if (/identit/i.test(x.descripcion)) p.req = 'Supervielle Identité';
    if (/plan (epico|turbo|inicial)/i.test(norm(x.observacion))) p.plan = x.observacion;
    if (ent === 'anses') p.req = 'jubilado';
    if (ent === 'modo') p.bancos = ['nacion', 'santander', 'bbva', 'galicia', 'hipotecario', 'credicoop', 'supervielle', 'comafi', 'columbia', 'icbc', 'macro', 'ciudad'];
    if (ent === 'visanfc') { p.bancos = VISA_NFC; p.tjb = ['debito']; }
    add(p, x);
  } else if (x.fuente === 'coto') {
    // Legales de Coto: solo aportan promos con fechas puntuales que todavía no pasaron.
    const fechas = (x.fechas || []).filter(f => f >= hoy);
    if (!fechas.length) continue;
    const ent = entidad(x.titulo);
    if (!ent || ent === 'mercadopago') continue; // los legales de MP no actualizan la fecha
    const dows = fechas.map(f => ((new Date(f + 'T12:00:00').getDay() + 6) % 7) + 1);
    if (raw.promos.some(v => v.fuente === 'coto-vigentes' && entidad(v.icono) === ent && v.pct === x.pct && dows.every(d => v.dias.includes(d)))) continue;
    add({ ent, sup: ['coto'], dias: [], fechas, pct: x.pct, tope: sinTope(x.texto.slice(0, 900)) ? null : tope(x.tope), medio: clean(x.titulo.replace(/–.*$/, '')), tj: [], canal }, x);
  } else if (x.fuente === 'cencosud') {
    if (SOLO_CUOTAS(x.texto.slice(0, 600)) || SELECCION.test(x.texto.slice(0, 600))) continue;
    if (/c[oó]rdoba|mendoza|tucum[aá]n|salta|neuqu[eé]n/i.test(x.texto.slice(0, 400)) && !/buenos aires/i.test(x.texto.slice(0, 400))) continue; // solo interior
    const generico = x.bancos.every(b => /medios de pago/i.test(b));
    const ent = generico ? (/jubilad|mayores de 60/i.test(x.texto.slice(0, 300)) ? 'anses' : entidad(x.texto.slice(0, 300))) : entidad(x.bancos.join(' '));
    const p = { ent, sup: x.super, dias: x.dias.length >= 6 ? [1, 2, 3, 4, 5, 6, 7] : x.dias, pct: x.pct, tope: tope(x.tope), min: x.min || undefined, medio: medioDefault(ent, ''), tj: [], canal };
    if (ent === 'hipotecario') p.medio = 'Débito desde App Hipotecario o MODO';
    if (ent === 'cencopay') p.medio = /cuenta/i.test(x.bancos.join(' ')) ? 'Cenco Pay Cuenta' : 'Tarjeta de crédito Cenco Pay';
    if (ent === 'anses') p.medio = 'Jubilados y mayores de 60, presentando la tarjeta del súper (cualquier medio)';
    if (ent === 'naranjax') p.medio = 'Crédito Naranja X o Visa débito Naranja X';
    if (ent === 'modo') p.medio = 'Pagando con MODO, débito o crédito en un pago';
    if (ent === 'supervielle' && /jubilad/i.test(x.texto.slice(0, 200))) p.medio = 'Débito de jubilados Supervielle';
    if (/presencial/i.test(x.texto.slice(0, 300)) && !canal) p.canal = 'presencial';
    if (ent === 'anses' || /jubilad/i.test(x.texto.slice(0, 200))) p.req = 'jubilado';
    if (ent === 'modo') p.bancos = MODO;
    if (/plan (inicial|turbo|epico)/.test(norm(x.texto))) p.plan = 'naranja';
    add(p, x);
  } else if (x.fuente === 'carrefour') {
    if (/cuotas sin inter/i.test(x.titulo)) continue;
    const ent = entidad(x.img + ' ' + x.titulo) || entidad(x.subtitulo);
    const anioMes = (x.vigencia && x.vigencia.desde || hoy).slice(0, 7);
    const fechas = fechasDeTexto(x.validText, hoy.slice(0, 7)) || fechasDeTexto(x.validText, anioMes);
    const p = { ent, sup: ['carrefour'], dias: fechas ? [] : x.dias, pct: x.pct, tope: sinTope(x.titulo + ' ' + x.subtitulo) && !/tope de \$/i.test(x.subtitulo) ? null : tope(x.tope), min: x.min || undefined, medio: medioDefault(ent, clean(x.titulo.replace(/^\d+ ?% de (descuento|ahorro)( en (un|1) pago)?( con| en tu compra( con)?)?/i, '').replace(/¡sin tope!\.?|\. y si sos jubilado.*$/gi, ''))), tj: [], canal, nota: clean(x.subtitulo.replace(/ver exclu[a-z]+ en el legal\.?/gi, '')) };
    if (ent === 'provincia') p.tope = null;
    if (ent === 'mercadopago' && /dinero en cuenta/i.test(x.subtitulo)) p.medio = 'QR Mercado Pago con dinero en cuenta';
    p.medio = p.medio.replace(/^(tu compra )?(del super )?pagando con /i, '').replace(/\s*y si sos jubilado.*$/i, '');
    if (fechas) p.fechas = fechas;
    if (/plan sueld/i.test(x.subtitulo)) p.req = 'Plan sueldo';
    if (/anses|mayor de 60/i.test(x.titulo)) p.req = 'jubilado';
    if (ent === 'modo') { p.bancos = MODO; if (p.tope !== 'app' && /por banco/i.test(x.subtitulo)) p.tope.porBanco = true; }
    if (/jubilado/i.test(x.titulo) && ent === 'provincia') p.nota = x.subtitulo + ' Jubilados: 5% extra.';
    add(p, x);
  } else if (x.fuente === 'dia') {
    const ent = entidad((x.bancos || []).join(' ') + ' ' + x.titulo);
    if (/productos seleccionados/i.test(x.texto) && ent === 'mercadopago') continue;
    const p = { ent, sup: ['dia'], dias: x.dias, pct: x.pct, tope: tope(x.tope), min: x.min || undefined, medio: medioDefault(ent, /^\d+ ?%|^(naranja|modo|personal pay|mercado pago|cuenta dni)/i.test(x.titulo) ? '' : x.titulo), tj: [], canal };
    if (ent === 'provincia') p.medio = 'Saldo o QR de Cuenta DNI';
    if (ent === 'naranjax') p.medio = 'Crédito Naranja X o Visa débito Naranja X';
    if (/^cuenta dni 5%/i.test(x.titulo)) p.req = 'jubilado';
    if (ent === 'anses') p.req = 'jubilado';
    if (/nfc/i.test(x.texto) && ent === 'provincia' && x.pct >= 20) { p.tj = ['visa']; p.medio = 'Visa crédito por NFC desde Cuenta DNI'; }
    if (ent === 'modo') p.bancos = MODO;
    if (/plan (inicial|turbo|epico)/.test(norm(x.texto))) p.plan = 'naranja';
    // Personal Pay: el "tope" que aparece en el legal es la compra mínima.
    if (ent === 'personalpay' && /sin tope/i.test(x.texto)) p.tope = null;
    add(p, x);
  }
}

const NX = { 20: { m: 3000, p: 'semana' }, 25: { m: 9500, p: 'semana' }, 30: { m: 12000, p: 'semana' } };
for (const p of out) {
  if (p.ent === 'naranjax' && NX[p.pct]) p.tope = { ...NX[p.pct] };
  p.medio = p.medio.charAt(0).toUpperCase() + p.medio.slice(1);
}
// Unifica promos repetidas o por plan/segmento (ej. Naranja X 20/25/30%): una por entidad+súper+días+canal+req.
const grupos = new Map();
for (const p of out) {
  const k = [p.ent, [...p.sup].sort().join(','), (p.fechas || p.dias).join(','), p.canal || '', p.req || '', (p.tj || []).join(',')].join('|');
  const g = grupos.get(k);
  if (!g) { grupos.set(k, { ...p, pcts: [p.pct], topes: [p.tope] }); continue; }
  g.pcts.push(p.pct); g.topes.push(p.tope);
  if (p.pct > g.pct) Object.assign(g, { pct: p.pct, tope: p.tope, medio: p.medio, nota: p.nota });
  g.sup = [...new Set([...g.sup, ...p.sup])];
}
// Junta la misma promo publicada por varios súper (ej. Naranja X martes en Coto, Día y Cencosud).
const final = [];
for (const g of grupos.values()) {
  const pcts = [...new Set(g.pcts)].sort((a, b) => a - b);
  if (pcts.length > 1) {
    g.hasta = true;
    const fm = t => t === null ? 'sin tope' : t === 'app' ? 'tope en app' : 'tope $' + t.m.toLocaleString('es-AR');
    g.nota = 'Según tu plan o segmento: ' + pcts.map(v => `${v}% (${fm(g.topes[g.pcts.indexOf(v)])})`).join(', ') + '.';
  }
  delete g.pcts; delete g.topes; delete g.plan;
  final.push(g);
}
for (const p of final) {
  const twin = final.find(q => q !== p && !q._merged && !p._merged && q.ent === p.ent && q.pct === p.pct && JSON.stringify(q.dias) === JSON.stringify(p.dias) && !q.fechas && !p.fechas && (q.canal || '') === (p.canal || '') && (q.req || '') === (p.req || '') && JSON.stringify(q.tope) === JSON.stringify(p.tope));
  if (twin && ['naranjax', 'modo', 'mercadopago', 'personalpay'].includes(p.ent) && p.ent === 'naranjax') {
    p.sup = [...new Set([...p.sup, ...twin.sup])]; p.fu = [...new Set([...p.fu, ...twin.fu])]; twin._merged = true;
  }
}
let promos = final.filter(p => !p._merged);

// Fuentes que fallaron: se conservan sus promos de la corrida anterior.
const fallidas = Object.entries(raw.fuentes).filter(([, v]) => !v.ok).map(([k]) => k);
if (prev && fallidas.length) {
  for (const f of fallidas) promos.push(...prev.promos.filter(p => p.origen === f).map(p => ({ ...p, viejo: true })));
}

// Ids estables y orden
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const seen = new Set();
promos = promos.map(p => {
  let id = slug([p.ent, p.sup.join('-'), (p.fechas || p.dias).join(''), p.canal || '', p.req || ''].join('-'));
  while (seen.has(id)) id += 'x';
  seen.add(id);
  const o = { id, ...p };
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === '') delete o[k];
  return o;
});

// Extras manuales vigentes
const extrasVig = extras.filter(p => !p.vig || p.vig.hasta >= hoy);
promos.push(...extrasVig);

const fechasVig = promos.map(p => p.vig).filter(Boolean);
const vigencia = {
  desde: fechasVig.reduce((a, v) => (v.desde < a ? v.desde : a), hoy).slice(0, 7) + '-01',
  hasta: fechasVig.reduce((a, v) => (v.hasta > a ? v.hasta : a), hoy),
};
const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const data = {
  actualizado: hoy,
  periodo: meses[Number(hoy.slice(5, 7)) - 1].replace(/^./, c => c.toUpperCase()) + ' ' + hoy.slice(0, 4),
  vigencia,
  estado: Object.fromEntries(Object.entries(raw.fuentes).map(([k, v]) => [k, v.ok ? 'ok' : 'error'])),
  ...cat,
  promos,
};

fs.writeFileSync(path.join(ROOT, 'data/promos.json'), JSON.stringify(data, null, 1));

// Embebe los datos en la página y regenera index.html
const appPath = path.join(ROOT, 'src/app.html');
let app = fs.readFileSync(appPath, 'utf8');
app = app.replace(/(<script id="promo-data" type="application\/json">\n)[\s\S]*?(\n<\/script>)/, (_, a, b) => a + JSON.stringify(data, null, 1) + b);
fs.writeFileSync(appPath, app);
const cut = app.indexOf('</style>') + '</style>'.length;
const head = fs.readFileSync(path.join(ROOT, 'src/head.html'), 'utf8'); // metadatos para Google y vista previa al compartir
fs.writeFileSync(path.join(ROOT, 'index.html'), head + app.slice(0, cut).replace(/<title>[^<]*<\/title>/, '<title>deelo · Pagá menos. Siempre.</title>') + '\n</head>\n<body>\n' + app.slice(cut) + '\n</body>\n</html>\n');

console.log(`promos: ${promos.length} (${promos.length - extrasVig.length} oficiales, ${extrasVig.length} manuales)`);
console.log('fuentes:', JSON.stringify(data.estado));
if (skipped.length) console.log('sin mapear (' + skipped.length + '):\n  ' + skipped.join('\n  '));
