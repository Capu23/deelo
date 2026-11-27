// Valida un catálogo de Coto antes de publicarlo (lo usa el workflow "deelo: catálogo de Coto").
// Uso: node scraper/validar-coto.js ruta/coto-catalogo.json   → sale con error si algo no cierra.
const fs = require('fs');
const f = process.argv[2];
const fallas = [];
let d;
try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error('No es un JSON válido:', e.message); process.exit(1); }
const P = Array.isArray(d.productos) ? d.productos : [];
const dias = (Date.now() - new Date(d.actualizado)) / 864e5;
if (!(dias >= -1 && dias <= 4)) fallas.push(`fecha ${d.actualizado}: tiene que ser de los últimos 4 días`);
if (P.length < 10000) fallas.push(`solo ${P.length} productos (mínimo 10.000)`);
const conEan = P.filter(p => /^\d{8,14}$/.test(String(p.ean || ''))).length;
const conPrecio = P.filter(p => p.precio > 0 && p.precio < 5e6).length;
if (conEan < P.length * 0.95) fallas.push(`solo ${conEan} con código de barras válido`);
if (conPrecio < P.length * 0.95) fallas.push(`solo ${conPrecio} con precio válido`);
const ofertas = P.filter(p => p.precioOferta > 0).length;
const precios = P.map(p => p.precio).filter(x => x > 0).sort((a, b) => a - b), med = precios[precios.length >> 1] || 0;
if (med < 500 || med > 100000) fallas.push(`precio mediano raro: $${med}`);
console.log(`Catálogo de Coto del ${d.actualizado} · sucursal ${d.sucursal} · ${P.length} productos · ${conEan} con EAN · ${ofertas} con oferta · precio mediano $${med}`);
if (fallas.length) { console.error('NO se publica:\n - ' + fallas.join('\n - ')); process.exit(1); }
console.log('OK');
