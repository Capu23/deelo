// Extrae las promos bancarias oficiales publicadas por cada supermercado.
// Uso: node descuentos/scraper/scrape.js [carpeta-salida]
// Requiere Playwright (solo para Coto, que arma sus legales con JavaScript).
// Escribe <salida>/oficial-AAAA-MM-DD.json con una lista de promos normalizadas.

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const DIAS = { lunes: 1, martes: 2, 'miércoles': 3, miercoles: 3, jueves: 4, viernes: 5, 'sábado': 6, sabado: 6, domingo: 7 };
const EN = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const num = s => Number(String(s).replace(/\./g, '').replace(',', '.'));

// "TOPE DE REINTEGRO $15.000 POR SEMANA" -> {m:15000, p:'semana'}; "SIN TOPE" -> null
function parseTope(txt) {
  const t = clean(txt).toUpperCase();
  const m = t.match(/(?:TOPE|REEMBOLSO M[ÁA]XIMO|REINTEGRO M[ÁA]XIMO)([^$]{0,90})\$\s?([\d.]+(?:,\d+)?)([^;]{0,60})/);
  if (m) {
    const tail = m[1] + ' ' + m[3];
    const p = /SEMANA/.test(tail) ? 'semana' : /MES|MENSUAL/.test(tail) ? 'mes' : /TRANSACCI|COMPRA|TICKET/.test(tail) ? 'compra' : /D[ÍI]A\b/.test(tail) ? 'dia' : null;
    return { m: num(m[2]), p };
  }
  if (/SIN TOPE/.test(t)) return null;
  return 'desconocido';
}
function parseMin(txt) {
  const m = clean(txt).toUpperCase().match(/M[ÍI]NIMO DE COMPRA[^$]{0,30}\$\s?([\d.]+)/) || clean(txt).toUpperCase().match(/COMPRAS? (?:A PARTIR|DESDE) DE? ?\$\s?([\d.]+)/);
  return m ? num(m[1]) : null;
}
function parseDiasTexto(txt) {
  const t = clean(txt).toLowerCase();
  const out = new Set();
  for (const [k, v] of Object.entries(DIAS)) if (new RegExp('\\b' + k + '(s|es)?\\b').test(t)) out.add(v);
  return [...out].sort();
}
// fechas puntuales tipo "SÁBADO 21 DE NOVIEMBRE"
function parseFechas(txt, anio) {
  const meses = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
  const t = clean(txt).toLowerCase();
  const res = new Set();
  for (const m of t.matchAll(/(lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo) (\d{1,2})(?: de (\w+))?/g)) {
    let mes = m[3] && meses[m[3]];
    if (!mes) { const f = t.slice(m.index).match(/de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/); mes = f && meses[f[1]]; }
    if (mes) res.add(`${anio}-${String(mes).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`);
  }
  return [...res].sort();
}
function rangoVigencia(txt) {
  const all = [...clean(txt).matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map(m => `${m[3]}-${m[2]}-${m[1]}`);
  return all.length >= 2 ? { desde: all[0], hasta: all[1] } : null;
}

let _req;
async function getText(url) {
  // Cliente HTTP de Playwright: respeta el proxy del entorno (fetch de Node no).
  if (!_req) {
    const { request } = require('playwright');
    const px = process.env.HTTPS_PROXY || process.env.https_proxy;
    _req = await request.newContext({ userAgent: UA, extraHTTPHeaders: { 'accept-language': 'es-AR' }, ...(px ? { proxy: { server: px } } : {}) });
  }
  const r = await _req.get(url, { timeout: 60000 });
  if (!r.ok()) throw new Error(`${url.slice(0, 80)} -> HTTP ${r.status()}`);
  return r.text();
}

// ---------- Jumbo / Disco / Vea (Cencosud) ----------
async function cencosud() {
  const raw = JSON.parse(await getText('https://www.jumbo.com.ar/api/dataentities/JN/documents/bankDiscount?_fields=value,id&an=jumboargentina'));
  const list = JSON.parse(raw.value);
  const now = Date.now() / 1000;
  const out = [];
  for (const x of list) {
    if (!(Number(x.dateStart) <= now + 86400 * 14 && Number(x.dateEnd) >= now)) continue;
    if (Number(x.discount) < 5 || Number(x.discount) >= 100) continue; // cuotas (3/6/12) o montos fijos
    if (x.stores && x.stores.length) continue; // promo de sucursales puntuales (interior)
    const info = clean(x.info), legal = clean(x.legals);
    if (/CUOTAS SIN INTER/i.test(info + legal.slice(0, 400)) && !/\d+ ?% ?(DE )?(DESCUENTO|AHORRO|REINTEGRO)/i.test(legal.slice(0, 800))) continue;
    const bancos = (x.banks || []).map(b => clean(b.name));
    if (bancos.some(b => /club|andes pass|marco/i.test(b))) continue;
    const supers = [...new Set((x.websites || []).map(w => w.replace(/io$/, '').replace('argentina', '').replace('io', '')))]
      .filter(s => ['jumbo', 'disco', 'vea'].includes(s));
    out.push({
      fuente: 'cencosud', super: supers, titulo: bancos.join(', ') + ' ' + x.discount + '%',
      bancos, pct: Number(x.discount), dias: (x.days || []).map(d => (Number(d) === 0 ? 7 : Number(d))),
      medios: Object.keys(x.paymentMethod || {}), tope: parseTope(info + ' ' + legal), min: parseMin(info + ' ' + legal),
      vigencia: { desde: new Date(x.dateStart * 1000).toISOString().slice(0, 10), hasta: new Date(x.dateEnd * 1000).toISOString().slice(0, 10) },
      online: /online|sitio web|\.com\.ar/i.test(info) && !/presencial/i.test(info) ? 'solo-online' : null,
      texto: (info + ' ' + legal).slice(0, 1500),
      url: 'https://www.jumbo.com.ar/descuentos-del-dia',
    });
  }
  return out;
}

// ---------- Carrefour ----------
async function carrefour() {
  const ahora = new Date().toISOString().slice(0, 19);
  const vars = Buffer.from(JSON.stringify({ where: `active=true AND ((active_from < ${ahora}) AND (active_to > ${ahora}))`, account: 'carrefourar' })).toString('base64');
  const ext = { persistedQuery: { version: 1, sha256Hash: 'e3aa1d96402d80dbca5c2c9dbcb7ff859970db0ccfdb64e583fb8a9b1bbff49e', sender: 'valtech.carrefourar-bank-promotions@0.x', provider: 'vtex.store-graphql@2.x' }, variables: vars };
  const url = 'https://www.carrefour.com.ar/_v/public/graphql/v1?workspace=master&maxAge=short&appsEtag=remove&domain=store&locale=es-AR&operationName=GetPromotions&variables=%7B%7D&extensions=' + encodeURIComponent(JSON.stringify(ext));
  const d = JSON.parse(await getText(url));
  const docs = d.data.documents.map(doc => Object.fromEntries(doc.fields.map(f => [f.key, f.value])));
  return docs.filter(x => x.discount_percentage).map(x => {
    const formatos = ['hyper', 'market', 'express', 'maxi', 'ecommerce'].filter(k => x[k] === 'true');
    return {
      fuente: 'carrefour', super: ['carrefour'], id: x.id, titulo: clean(x.title), subtitulo: clean(x.sub_title), validText: clean(x.validText), img: x.img_card || '', pct: Number(x.discount_percentage),
      dias: Object.entries(EN).filter(([k]) => x[k] === 'true').map(([, v]) => v),
      tope: parseTope(x.sub_title + ' ' + x.title + ' ' + (x.legal || '').slice(0, 1500)), min: parseMin(x.sub_title + ' ' + (x.legal || '')),
      vigencia: { desde: (x.active_from || '').slice(0, 10), hasta: (x.active_to || '').slice(0, 10) },
      formatos, online: formatos.length === 1 && formatos[0] === 'ecommerce' ? 'solo-online' : null,
      texto: clean(x.sub_title + ' · ' + x.validText + ' · ' + (x.legal || '')).slice(0, 1500),
      url: 'https://www.carrefour.com.ar/descuentos-bancarios',
    };
  });
}

// ---------- Día ----------
async function dia() {
  const s = await getText('https://diaonline.supermercadosdia.com.ar/medios-de-pago-y-promociones');
  const seen = new Set(), out = [];
  for (const m of s.matchAll(/\{"__editorItemTitle":"[^"]*","displayData"/g)) {
    let o;
    try { o = rawDecode(s, m.index); } catch (e) { continue; }
    const key = JSON.stringify(o); if (seen.has(key)) continue; seen.add(key);
    if (o.active === false) continue;
    const terms = clean(o.terms);
    const vig = rangoVigencia(terms);
    if (vig && vig.hasta < new Date().toISOString().slice(0, 10)) continue;
    const pct = (o.__editorItemTitle.match(/(\d+)\s?%/) || terms.match(/(\d+)\s?% ?\(?[A-Z ]*\)? ?(DE )?(DESCUENTO|REINTEGRO|AHORRO)/i) || [])[1];
    if (!pct) continue; // cuotas sin interés u otros
    const d = o.daysToShow || {};
    out.push({
      fuente: 'dia', super: ['dia'], titulo: clean(o.__editorItemTitle), bancos: (o.associatedBanks || []).map(b => clean(b.__editorItemTitle)).filter(Boolean),
      pct: Number(pct), dias: Object.entries(EN).filter(([k]) => d[k]).map(([, v]) => v),
      tope: parseTope(terms), min: parseMin(terms), vigencia: vig,
      online: o.availableOn && o.availableOn.online && !o.availableOn.store ? 'solo-online' : (o.availableOn && !o.availableOn.online ? 'solo-presencial' : null),
      texto: terms.slice(0, 1500), url: 'https://diaonline.supermercadosdia.com.ar/medios-de-pago-y-promociones',
    });
  }
  return out;
}
function rawDecode(s, i) {
  // JSON.parse de un objeto balanceado que empieza en s[i]
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) return JSON.parse(s.slice(i, j + 1)); }
  }
  throw new Error('objeto sin cerrar');
}

// ---------- Coto ----------
async function coto() {
  const { chromium } = require('playwright');
  const px = process.env.HTTPS_PROXY || process.env.https_proxy;
  const b = await chromium.launch(px ? { proxy: { server: px } } : {});
  const p = await b.newPage({ userAgent: UA, locale: 'es-AR' });
  await p.goto('https://www.coto.com.ar/terminos-descuentos', { waitUntil: 'networkidle', timeout: 90000 });
  const txt = await p.evaluate(() => document.body.innerText);
  await b.close();
  const lines = txt.split('\n').map(clean).filter(Boolean);
  // El índice de legales está antes del primer cuerpo; cada cuerpo arranca repitiendo su título.
  const start = lines.indexOf('-- Mostrar Todos los Legales --');
  const titles = [];
  for (let i = start + 1; i < lines.length && titles.length < 200; i++) {
    if (lines[i] === lines[start + 1] && titles.length) break;
    titles.push(lines[i]);
  }
  const body = txt.slice(txt.indexOf(titles[titles.length - 1]) + titles[titles.length - 1].length);
  const anio = new Date().getFullYear();
  const out = [];
  const relevantes = titles.filter(t => /BANCO|TARJETA|MODO|ANSES|SUPERAPP|VISA|MERCADO PAGO|PERSONAL PAY|CUENTA DNI|DESCUENTOS (VIERNES|S[ÁA]BADO)|COMUNIDAD/i.test(t) && !/CUOTAS|ELECTRO|MAR DEL PLATA|CYBER/i.test(t));
  for (const t of relevantes) {
    const i = body.indexOf(t); if (i < 0) continue;
    const next = titles.map(o => body.indexOf(o, i + t.length)).filter(k => k > i).sort((a, b) => a - b)[0] || i + 4000;
    const seg = clean(body.slice(i + t.length, Math.min(next, i + 6000)));
    const pct = (t.match(/(\d+)%/) || seg.match(/(\d+)% ?(DE )?(DESCUENTO|AHORRO|REINTEGRO)/i) || seg.match(/DESCUENTO DEL (\d+)%/i) || [])[1];
    if (!pct) continue;
    const head = seg.slice(0, 500);
    out.push({
      fuente: 'coto', super: ['coto'], titulo: t, pct: Number(pct),
      dias: parseDiasTexto(head.match(/(LOS D[ÍI]AS|TODOS LOS) [^.]{0,60}/i)?.[0] || ''),
      fechas: /DESDE EL (S[ÁA]BADO|DOMINGO|LUNES|MARTES|MI[ÉE]RCOLES|JUEVES|VIERNES)|LOS D[ÍI]AS (S[ÁA]BADO|JUEVES|MARTES|LUNES|VIERNES|DOMINGO) \d|V[ÁA]LIDO EN LA REP[ÚU]BLICA ARGENTINA EL \d/i.test(head) ? parseFechas(head, anio) : [],
      adicional: /ADICIONAL AL (\d+)%/i.test(seg) ? Number(seg.match(/ADICIONAL AL (\d+)%/i)[1]) : null,
      tope: parseTope(seg), min: parseMin(seg), vigencia: rangoVigencia(head),
      online: /EXCLUSIVO COMPRAS ONLINE|– ONLINE$/i.test(t) ? 'solo-online' : (/PRESENCIAL/i.test(t) && !/ONLINE/i.test(t) ? 'solo-presencial' : null),
      texto: seg.slice(0, 1500), url: 'https://www.coto.com.ar/terminos-descuentos',
    });
  }
  return out;
}

// ---------- Coto: lista de descuentos vigentes (la que muestra coto.com.ar/descuentos) ----------
function rangoDias(txt) {
  const t = clean(txt).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const n = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 };
  const r = t.match(/de (\w+) a (\w+)/);
  if (r && n[r[1]] && n[r[2]]) { const out = []; for (let i = n[r[1]]; i <= n[r[2]]; i++) out.push(i); return out; }
  return Object.keys(n).filter(k => new RegExp('\\b' + k + '\\b').test(t)).map(k => n[k]);
}
async function cotoVigentes() {
  const d = JSON.parse(await getText('https://www.coto.com.ar/rest/model/atg/actors/cProfileActor/getPromocionesMulticanal?enviroment=ag&pushSite=CotoDigital')).result;
  const out = [];
  for (const [lista, canal] of [['promocionesSucursalesFisicas', 'solo-presencial'], ['promocionesDigitales', 'solo-online']]) {
    for (const x of d[lista] || []) {
      const pct = (String(x.textoDescuento).match(/(\d+)% DE (DESCUENTO|AHORRO|REINTEGRO)/i) || [])[1];
      if (!pct) continue; // cuotas sin interés
      const txt = clean(x.descripcion + ' ' + x.observacion);
      out.push({
        fuente: 'coto-vigentes', super: ['coto'], id: x.id, icono: x.icono, descripcion: clean(x.descripcion), observacion: clean(x.observacion), diasTexto: clean(x.diasVigencia), titulo: clean(x.icono.replace(/\.(png|jpg|svg)$/, '').replace(/^logo_/, '')) + ' ' + pct + '%',
        pct: Number(pct), dias: rangoDias(x.diasVigencia || ''), tope: parseTope(txt), min: parseMin(txt),
        online: canal, texto: txt, url: 'https://www.coto.com.ar/descuentos',
      });
    }
  }
  return out;
}

(async () => {
  // Salida: un .json explícito, o una carpeta (se crea oficial-AAAA-MM-DD.json adentro).
  const arg = process.argv[2] || path.join(__dirname, '..', 'data', 'oficial.json');
  const outFile = arg.endsWith('.json') ? arg : null;
  const outDir = outFile ? path.dirname(outFile) : arg;
  fs.mkdirSync(outDir, { recursive: true });
  const res = { generado: new Date().toISOString(), fuentes: {}, promos: [] };
  for (const [name, fn] of Object.entries({ cencosud, carrefour, dia, cotoVigentes, coto })) {
    try { const l = await fn(); res.promos.push(...l); res.fuentes[name] = { ok: true, n: l.length }; }
    catch (e) { res.fuentes[name] = { ok: false, error: e.message }; }
    console.log(name, JSON.stringify(res.fuentes[name]));
  }
  const f = outFile || path.join(outDir, `oficial-${res.generado.slice(0, 10)}.json`);
  fs.writeFileSync(f, JSON.stringify(res, null, 1));
  console.log('->', f, res.promos.length, 'promos');
})();
