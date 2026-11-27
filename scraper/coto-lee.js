const fs = require('fs');
const path = require('path');
// Lee los precios de Coto que arma la compu en Argentina y los deja en el formato de precios.json.
// Coto no es VTEX: sus precios salen de su web, con un archivo que se arma desde Argentina.
// - data/coto-catalogo.json: catálogo completo ({productos:[{ean, precio, precioOferta?, texto?, unidades?, url}]}).
// - data/coto-ofertas.json: solo lo que está en oferta ({ofertas:[…]}, mismo formato). Se usa si no hay catálogo.
// Ofertas: "25%Dto"/"Oferta" son rebajas directas; "Llevando 2 2x1", "Llevando 2 70% 2da" y "Llevando 3 25%Dto"
// son promos por cantidad. Se ignoran las de cuotas ("1 Pago 20%", electro). Solo se usan con menos de 15 días.
module.exports = function leerCoto(ROOT) {
let cotoOf = {}, cotoInfo = null;
for (const [archivo, campo] of [['coto-catalogo.json', 'productos'], ['coto-ofertas.json', 'ofertas']]) {
  let c; try { c = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', archivo), 'utf8')); } catch { continue; }
  if ((Date.now() - new Date(c.actualizado)) / 864e5 >= 15) { console.log(archivo, 'tiene más de 15 días: no se usa.'); continue; }
  for (const o of c[campo] || []) {
    if (!o.ean || !(o.precio > 0)) continue;
    const oferta = o.precioOferta > 0 && o.precioOferta < o.precio && o.texto && !/pago/i.test(o.texto);
    let promo = null, m;
    const n = oferta ? (o.unidades || ((m = o.texto.match(/llevando\s*(\d+)/i)) ? +m[1] : 0)) : 0;
    if (n > 1) {
      let t;
      if ((m = o.texto.match(/(\d)\s*x\s*(\d)/i))) t = `${m[1]}x${m[2]}`;
      else if ((m = o.texto.match(/(\d{2,3})\s*%\s*(\d)\s*d/i))) t = `${m[2] === '2' ? '2da' : m[2] + 'ra'} al ${m[1]}%`;
      else if ((m = o.texto.match(/(\d{1,3})\s*%/))) t = `−${m[1]}% llevando ${n}`;
      else t = `Llevando ${n}`;
      promo = { t, n, u: Math.round(o.precioOferta * 100) / 100 };
    }
    cotoOf[o.ean] = promo ? [o.precio, 0, 1, o.url, promo] : oferta ? [o.precioOferta, o.precio, 1, o.url] : [o.precio, 0, 1, o.url];
  }
  cotoInfo = { archivo, actualizado: c.actualizado, sucursal: c.sucursal };
  console.log(`Coto desde ${archivo}:`, Object.keys(cotoOf).length, 'productos');
  break;
}
return { cotoOf, cotoInfo };
};
