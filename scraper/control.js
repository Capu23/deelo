// Control de calidad: compara una muestra de precios de deelo (data/precios.json) con el precio que muestra
// hoy la web de cada súper. Sirve para saber si los precios quedaron viejos (ofertas de mitad de semana) o si
// algo se rompió. No cambia ningún dato: escribe un resumen y, en GitHub Actions, se marca en rojo si hay
// demasiadas diferencias.
// Uso: node scraper/control.js [productos por súper]   (por defecto 40)
const fs = require('fs');
const path = require('path');
const { SUPERS, vtexPorEan } = require('./vtex');

const ROOT = path.join(__dirname, '..');
const N = Number(process.argv[2]) || 40;
const TOL = 0.02;        // diferencias de hasta 2% se consideran iguales (redondeos)
const ALERTA = 0.25;     // si más del 25% de la muestra cambió, se avisa
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = n => '$' + Math.round(n).toLocaleString('es-AR');

const px = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/precios.json'), 'utf8'));
// Muestra reproducible por día: mezcla con una semilla de la fecha.
let seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

(async () => {
  const filas = [], porSuper = {};
  await Promise.all(Object.keys(SUPERS).map(async s => {
    const cand = px.productos.filter(p => p.p[s] && p.p[s][2]).sort(() => rnd() - 0.5).slice(0, N);
    const r = porSuper[s] = { revisados: 0, iguales: 0, bajaron: 0, subieron: 0, sinDato: 0 };
    for (const p of cand) {
      const hoy = await vtexPorEan(s, p.e).catch(() => null);
      await sleep(150);
      if (!hoy || !hoy.precio) { r.sinDato++; continue; }
      r.revisados++;
      const antes = p.p[s][0], dif = (hoy.precio - antes) / antes;
      if (Math.abs(dif) <= TOL) r.iguales++;
      else { dif < 0 ? r.bajaron++ : r.subieron++; filas.push({ s, n: p.n, antes, hoy: hoy.precio, dif, oferta: hoy.lista ? Math.round((1 - hoy.precio / hoy.lista) * 100) : 0 }); }
    }
  }));
  const tot = Object.values(porSuper).reduce((a, r) => ({ rev: a.rev + r.revisados, ok: a.ok + r.iguales }), { rev: 0, ok: 0 });
  const cambio = tot.rev ? 1 - tot.ok / tot.rev : 0;
  const lineas = [
    `Control de precios · datos de deelo del ${px.actualizado} contra la web hoy (${new Date().toISOString().slice(0, 10)})`,
    `Coinciden ${tot.ok} de ${tot.rev} (${Math.round((1 - cambio) * 100)}%). Tolerancia ±${TOL * 100}%.`,
    ...Object.entries(porSuper).map(([s, r]) => `  ${s.padEnd(10)} revisados ${r.revisados} · iguales ${r.iguales} · bajaron ${r.bajaron} · subieron ${r.subieron} · sin dato ${r.sinDato}`),
    'Mayores diferencias:',
    ...filas.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 12).map(f => `  ${f.s.padEnd(10)} ${f.n.slice(0, 48).padEnd(48)} ${fmt(f.antes)} → ${fmt(f.hoy)} (${f.dif > 0 ? '+' : ''}${Math.round(f.dif * 100)}%)${f.oferta ? ` · oferta −${f.oferta}%` : ''}`),
  ];
  console.log(lineas.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Control de precios\n```\n' + lineas.join('\n') + '\n```\n');
  if (cambio > ALERTA) { console.log(`\nALERTA: cambió el ${Math.round(cambio * 100)}% de la muestra (umbral ${ALERTA * 100}%). Conviene actualizar los precios.`); process.exitCode = 1; }
})();
