// Páginas para Google (SEO): una por súper (/descuentos/coto/) y una por banco o billetera (/promos/mercado-pago/),
// más un índice (/descuentos/). Se generan solas con las promos de la semana (data/promos.json) cada vez que se
// corre build.js, y se actualiza sitemap.xml. Son HTML estático, liviano y legible sin JavaScript.
// Uso: node scraper/paginas.js   (build.js la llama al final)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITIO = 'https://deelo.ar';
const GA_ID = 'G-K91SZSCVKH';
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/promos.json'), 'utf8'));

// Direcciones de cada página (fijas: si cambian, se pierde lo que Google ya conoce).
const SLUG_ENT = {
  nacion: 'banco-nacion', provincia: 'banco-provincia-cuenta-dni', galicia: 'galicia', santander: 'santander', bbva: 'bbva', macro: 'macro',
  supervielle: 'supervielle', icbc: 'icbc', ciudad: 'banco-ciudad', patagonia: 'banco-patagonia', comafi: 'comafi', credicoop: 'credicoop',
  hipotecario: 'banco-hipotecario', columbia: 'banco-columbia', carrefourbanco: 'tarjeta-carrefour', mercadopago: 'mercado-pago',
  naranjax: 'naranja-x', personalpay: 'personal-pay', uala: 'uala', cencopay: 'cenco-pay', modo: 'modo', visanfc: 'visa-sin-contacto',
  clubln: 'club-la-nacion', cotoapp: 'coto-superapp', comunidadcoto: 'comunidad-coto', anses: 'jubilados', credito: 'tarjeta-de-credito', prime: 'prime',
};
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => '$' + Math.round(n).toLocaleString('es-AR');
const iso = d => d.toISOString().slice(0, 10);
const ddmm = s => { const [, m, d] = s.split('-'); return `${+d}/${+m}`; };
const dow = d => (d.getUTCDay() + 6) % 7 + 1;

// Semana que se muestra: la de hoy en Argentina (lunes a domingo).
const ahora = new Date(Date.now() - 3 * 3600e3);
const hoy = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
const lunes = new Date(hoy); lunes.setUTCDate(hoy.getUTCDate() - (dow(hoy) - 1));
const semana = [...Array(7)].map((_, i) => { const d = new Date(lunes); d.setUTCDate(lunes.getUTCDate() + i); return d; });
const rango = `del ${ddmm(iso(semana[0]))} al ${ddmm(iso(semana[6]))}`;
const mesTxt = `${MESES[semana[0].getUTCMonth()]} ${semana[0].getUTCFullYear()}`;
const actualizado = ddmm(D.actualizado) + '/' + D.actualizado.slice(0, 4);

const aplica = (pr, d) => { const s = iso(d); return (!pr.vig || (s >= pr.vig.desde && s <= pr.vig.hasta)) && (pr.fechas && pr.fechas.length ? pr.fechas.includes(s) : (pr.dias || []).includes(dow(d))); };
const enSemana = pr => semana.some(d => aplica(pr, d));
const promos = D.promos.filter(enSemana);
const nomEnt = k => (D.entidades[k] && D.entidades[k].n) || k;
const nomSup = s => D.supers[s].n;
const lista = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : (a[0] || '');

function tope(pr) {
  if (pr.tope === null || pr.tope === undefined) return 'Sin tope';
  if (pr.tope === 'app') return 'Tope en la app';
  if (typeof pr.tope === 'object') return `Tope ${fmt(pr.tope.m)}${pr.tope.p === 'mes' ? ' por mes' : pr.tope.p === 'semana' ? ' por semana' : pr.tope.p === 'dia' ? ' por día' : pr.tope.p === 'compra' ? ' por compra' : ''}${pr.tope.extra ? ' ' + pr.tope.extra : ''}`;
  return '';
}
function condiciones(pr) {
  const c = [tope(pr)];
  if (pr.canal === 'online') c.push('Solo online'); else if (pr.canal === 'presencial') c.push('En sucursal');
  if (pr.req === 'jubilado') c.push('Jubilados'); else if (pr.req) c.push(pr.req);
  if (pr.min) c.push('Compra mínima ' + fmt(pr.min));
  return c.filter(Boolean);
}
const fuentes = pr => (pr.fu || []).map(f => D.fuentes[f]).filter(Boolean);
// Para un banco que entra por MODO o Visa sin contacto, se aclara por dónde.
const via = (pr, k) => pr.ent !== k && (pr.bancos || []).includes(k) ? ` (con ${nomEnt(pr.ent)})` : '';

function fila(pr, titulo, k) {
  const fu = fuentes(pr);
  return `<li class="pr"><span class="pct">${pr.hasta ? '<small>hasta</small>' : ''}${pr.pct}%</span><span class="tx"><b>${titulo}</b>${pr.medio ? `<span>${esc(pr.medio)}</span>` : ''}<span class="cd">${condiciones(pr).map(esc).join(' · ')}</span>${pr.nota ? `<span class="nt">${esc(pr.nota)}</span>` : ''}${fu.length ? `<span class="fu">Fuente: ${fu.map(f => `<a href="${esc(f.u)}" rel="nofollow noopener" target="_blank">${esc(f.n)}</a>`).join(' · ')}</span>` : ''}</span></li>`;
}

// Página: semana día por día con las promos que pasan el filtro.
function porDia(filtro, titulo) {
  return semana.map(d => {
    const ps = promos.filter(pr => filtro(pr) && aplica(pr, d)).sort((a, b) => b.pct - a.pct);
    return `<section class="dia" id="${DIAS[dow(d)].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}"><h2>${DIAS[dow(d)]} ${ddmm(iso(d))}${ps.length ? ` <small>${ps.length} ${ps.length === 1 ? 'promo' : 'promos'} · hasta ${ps[0].pct}%</small>` : ''}</h2>${ps.length ? `<ul>${ps.map(pr => fila(pr, titulo(pr), null)).join('')}</ul>` : '<p class="vacio">Sin promos cargadas este día.</p>'}</section>`;
  }).join('\n');
}

const LOGO = '<svg viewBox="0 0 66 48" aria-hidden="true"><rect x="18" y="3" width="40" height="22" rx="3.5" transform="rotate(-7 38 14)" fill="#1b2440"/><rect x="4" y="14" width="32" height="22" rx="3.5" fill="#fff" stroke="#46c48a" stroke-width="3.6"/><rect x="8.5" y="21" width="9" height="5" rx="1" fill="#1b2440"/><rect x="22" y="21" width="32" height="23" rx="3.5" fill="#fff" stroke="#46c48a" stroke-width="3.6"/><path d="M30.5 32.5l5 4.5 9-9" fill="none" stroke="#46c48a" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CSS = `:root{--bg:#fff;--paper:#f6f8fb;--ink:#141a2e;--ink2:#4d566b;--ink3:#7c8499;--rule:#e7e9ee;--green:#0f8f5b;--green-soft:#e6f5ee;--navy:#1b2440}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Poppins',system-ui,sans-serif;font-size:15px;line-height:1.55}
.wrap{max-width:760px;margin:0 auto;padding:20px max(16px,env(safe-area-inset-right,0px)) 64px max(16px,env(safe-area-inset-left,0px))}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.logo{display:inline-flex;align-items:center;gap:8px;text-decoration:none}.logo svg{width:42px;height:31px}
.logo span{font-family:'Fredoka','Poppins',sans-serif;font-weight:600;font-size:29px;color:var(--navy)}
.cta{display:inline-flex;align-items:center;justify-content:center;background:var(--navy);color:#fff;text-decoration:none;font-weight:600;border-radius:999px;padding:10px 18px;font-size:14px;text-align:center}
.miga{font-size:13px;color:var(--ink3);margin:22px 0 0}.miga a{color:var(--ink3)}
h1{font-size:27px;line-height:1.2;margin:6px 0 10px;letter-spacing:-.02em;text-wrap:balance}
.lead{color:var(--ink2);margin:0 0 14px;max-width:62ch}
.res{display:flex;gap:6px;overflow-x:auto;padding:2px 0 6px;margin:0 0 6px}
.res a{flex:none;text-decoration:none;color:var(--ink);background:var(--paper);border:1px solid var(--rule);border-radius:12px;padding:7px 11px;font-size:12.5px;text-align:center;line-height:1.3}
.res a b{display:block;font-size:16px;color:var(--green)}.res a.no b{color:var(--ink3)}
.dia{margin-top:18px}.dia h2{font-size:18px;margin:0 0 8px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.dia h2 small{font-size:13px;font-weight:500;color:var(--ink3)}
.dia ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.pr{display:grid;grid-template-columns:62px 1fr;gap:12px;background:var(--paper);border:1px solid var(--rule);border-radius:14px;padding:12px}
.pct{font-size:22px;font-weight:700;color:var(--green);line-height:1.1;text-align:center;align-self:center}.pct small{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.tx{display:flex;flex-direction:column;gap:2px;min-width:0}.tx b{font-size:15px}.tx b a{color:inherit}
.tx span{color:var(--ink2);font-size:13.5px}.tx .cd{color:var(--ink)}.tx .nt,.tx .fu{font-size:12.5px;color:var(--ink3)}.tx .fu a{color:var(--ink3)}
.vacio{color:var(--ink3);font-size:14px;margin:0}
.box{margin-top:26px;background:var(--green-soft);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.box p{margin:0;color:var(--ink)}
.links{margin-top:26px}.links h2{font-size:17px;margin:0 0 8px}
.links ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.links a{display:inline-block;text-decoration:none;color:var(--ink);border:1px solid var(--rule);border-radius:999px;padding:6px 12px;font-size:13.5px}
.links a[aria-current]{background:var(--navy);color:#fff;border-color:var(--navy)}
.legal{margin-top:30px;font-size:12.5px;color:var(--ink3)}.legal a{color:var(--ink3)}
@media (max-width:480px){h1{font-size:23px}.cta{padding:9px 14px;font-size:13px}}`;

function pagina({ ruta, titulo, desc, h1, lead, miga, cuerpo, ref }) {
  const url = SITIO + ruta;
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: miga.map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: m[0], item: SITIO + m[1] })) };
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#ffffff">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="website"><meta property="og:site_name" content="deelo"><meta property="og:locale" content="es_AR">
<meta property="og:url" content="${url}"><meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITIO}/og.png"><meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Poppins:wght@400;500;600;700&display=swap">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script data-goatcounter="https://deelo.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}',{allow_google_signals:false,allow_ad_personalization_signals:false});</script>
</head>
<body>
<div class="wrap">
  <header class="top"><a class="logo" href="/" aria-label="deelo, inicio">${LOGO}<span>deelo</span></a><a class="cta" href="/?ref=${ref}">Ver con mis tarjetas</a></header>
  <nav class="miga" aria-label="Estás en">${miga.map((m, i) => i < miga.length - 1 ? `<a href="${m[1]}">${esc(m[0])}</a>` : esc(m[0])).join(' › ')}</nav>
  <h1>${esc(h1)}</h1>
  <p class="lead">${lead}</p>
${cuerpo}
  <div class="box"><p><b>¿Cuál te conviene a vos?</b> En deelo elegís tus bancos, tarjetas y billeteras, y cada día te mostramos solo las promos que podés usar, con cuánto ahorrás en pesos. También comparás precios de más de 8.000 productos en 6 súper.</p><a class="cta" href="/?ref=${ref}">Abrir deelo gratis</a></div>
${enlaces()}
  <p class="legal">Promos de la semana ${rango} (${mesTxt}), tomadas de las páginas oficiales de cada súper, banco y billetera. Actualizado el ${actualizado}. Las condiciones pueden cambiar: confirmá en la app de tu banco o billetera antes de pagar. deelo no está afiliado a ningún súper, banco ni billetera. <a href="/acerca.html">Cómo funciona y privacidad</a>.</p>
</div>
</body>
</html>
`;
}

const SUPS = Object.keys(D.supers);
const ENTS = Object.keys(SLUG_ENT).filter(k => D.entidades[k] && promos.some(pr => pr.ent === k || (pr.bancos || []).includes(k)));
let actual = '';
function enlaces() {
  return `  <nav class="links" aria-label="Más descuentos"><h2>Descuentos por súper</h2><ul>${SUPS.map(s => `<li><a href="/descuentos/${s}/"${actual === 'sup:' + s ? ' aria-current="page"' : ''}>${esc(nomSup(s))}</a></li>`).join('')}</ul>
  <h2 style="margin-top:16px">Promos por banco y billetera</h2><ul>${ENTS.map(k => `<li><a href="/promos/${SLUG_ENT[k]}/"${actual === 'ent:' + k ? ' aria-current="page"' : ''}>${esc(nomEnt(k))}</a></li>`).join('')}</ul></nav>`;
}
// Resumen de la semana: el mejor porcentaje de cada día (con link al día).
function resumen(filtro) {
  return `  <div class="res">${semana.map(d => { const ps = promos.filter(pr => filtro(pr) && aplica(pr, d)); const m = ps.length ? Math.max(...ps.map(p => p.pct)) : 0; const id = DIAS[dow(d)].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return `<a href="#${id}"${m ? '' : ' class="no"'}>${DIAS[dow(d)].slice(0, 3)} ${ddmm(iso(d))}<b>${m ? m + '%' : '—'}</b></a>`; }).join('')}</div>`;
}

const escribir = (rel, html) => { const f = path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };
const urls = [];

// --- Súper ---
for (const s of SUPS) {
  actual = 'sup:' + s;
  const filtro = pr => pr.sup.includes(s);
  const ps = promos.filter(filtro), n = nomSup(s);
  const ents = [...new Set(ps.map(p => nomEnt(p.ent)))];
  const max = ps.length ? Math.max(...ps.map(p => p.pct)) : 0;
  const ruta = `/descuentos/${s}/`;
  escribir(`descuentos/${s}/index.html`, pagina({
    ruta, ref: 'seo-' + s,
    titulo: `Descuentos en ${n} esta semana: bancos y billeteras | deelo`,
    desc: `Promos de ${n} ${rango}: ${ps.length} descuentos${max ? ` de hasta ${max}%` : ''} con ${ents.slice(0, 4).join(', ')}${ents.length > 4 ? ' y más' : ''}. Día por día, con tope y condiciones.`,
    h1: `Descuentos en ${n} esta semana`,
    lead: ps.length ? `Esta semana (${rango}) hay <b>${ps.length} promos</b> para pagar menos en ${esc(n)}${max ? `, de hasta <b>${max}%</b>` : ''}, con ${esc(ents.slice(0, 6).join(', '))}${ents.length > 6 ? ' y más' : ''}. Mirá qué día te conviene ir y con qué medio de pago.` : `Esta semana no tenemos promos cargadas para ${esc(n)}.`,
    miga: [['deelo', '/'], ['Descuentos', '/descuentos/'], [n, ruta]],
    cuerpo: (ps.length ? resumen(filtro) + '\n' : '') + porDia(filtro, pr => `<a href="/promos/${SLUG_ENT[pr.ent] || ''}/">${esc(nomEnt(pr.ent))}</a>`),
  }));
  urls.push(ruta);
}

// --- Bancos y billeteras ---
for (const k of ENTS) {
  actual = 'ent:' + k;
  const filtro = pr => pr.ent === k || (pr.bancos || []).includes(k);
  const ps = promos.filter(filtro), n = nomEnt(k);
  const sups = [...new Set(ps.flatMap(p => p.sup))].map(nomSup);
  const max = Math.max(...ps.map(p => p.pct));
  const ruta = `/promos/${SLUG_ENT[k]}/`;
  escribir(`promos/${SLUG_ENT[k]}/index.html`, pagina({
    ruta, ref: 'seo-' + SLUG_ENT[k],
    titulo: `Descuentos con ${n} en el súper esta semana | deelo`,
    desc: `Promos de ${n} en supermercados ${rango}: hasta ${max}% en ${lista(sups)}. Qué día, con qué tope y condiciones.`,
    h1: `Descuentos con ${n} en el súper`,
    lead: `Esta semana (${rango}) ${n === 'Jubilados' ? 'los jubilados tienen' : 'hay'} <b>${ps.length} ${ps.length === 1 ? 'promo' : 'promos'}</b>${k === 'anses' ? '' : ` con ${esc(n)}`} en ${esc(lista(sups))}, de hasta <b>${max}%</b>. Mirá qué día y en qué súper te conviene comprar.`,
    miga: [['deelo', '/'], ['Promos', '/descuentos/'], [n, ruta]],
    cuerpo: resumen(filtro) + '\n' + porDia(filtro, pr => lista(pr.sup.map(s => `<a href="/descuentos/${s}/">${esc(nomSup(s))}</a>`)) + esc(via(pr, k))),
  }));
  urls.push(ruta);
}

// --- Índice ---
actual = '';
escribir('descuentos/index.html', pagina({
  ruta: '/descuentos/', ref: 'seo-indice',
  titulo: 'Descuentos en supermercados esta semana: Coto, Jumbo, Disco, Vea, Carrefour y Día | deelo',
  desc: `${promos.length} promos de bancos y billeteras en supermercados de CABA ${rango}: por súper y por medio de pago, día por día.`,
  h1: 'Descuentos en supermercados esta semana',
  lead: `Esta semana (${rango}) hay <b>${promos.length} promos</b> de bancos, tarjetas y billeteras en Coto, Jumbo, Disco, Vea, Carrefour y Día. Elegí un súper o tu medio de pago para ver qué día te conviene comprar.`,
  miga: [['deelo', '/'], ['Descuentos', '/descuentos/']],
  cuerpo: resumen(() => true) + '\n' + porDia(() => true, pr => `${lista(pr.sup.map(s => `<a href="/descuentos/${s}/">${esc(nomSup(s))}</a>`))} con <a href="/promos/${SLUG_ENT[pr.ent] || ''}/">${esc(nomEnt(pr.ent))}</a>`),
}));
urls.unshift('/descuentos/');

// --- sitemap.xml ---
const lastmod = D.actualizado;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITIO}/</loc><changefreq>weekly</changefreq></url>
${urls.map(u => `  <url><loc>${SITIO}${u}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq></url>`).join('\n')}
  <url><loc>${SITIO}/acerca.html</loc><changefreq>monthly</changefreq></url>
</urlset>
`);
console.log(`páginas SEO: ${SUPS.length} súper, ${ENTS.length} bancos y billeteras, ${promos.length} promos de la semana ${rango}`);
