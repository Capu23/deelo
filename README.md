# deelo · Pagá menos. Siempre.

Descuentos del súper en CABA según tus bancos, tarjetas y billeteras. **https://deelo.ar**

## Cómo está armado
| Archivo | Qué es |
|---|---|
| `index.html` | La página publicada (se genera, no editar a mano). |
| `src/app.html` | Código de la página (estilos, estructura y lógica). |
| `src/head.html` | Metadatos: título, descripción, vista previa al compartir. |
| `acerca.html` | Cómo funciona, aviso legal y privacidad. |
| `data/catalogo.json` | Súper, bancos, billeteras, colores y fuentes. |
| `data/extras.json` | Promos cargadas a mano (no salen de un sitio oficial). Vencen solas en `vig.hasta`. |
| `data/oficial.json` | Lo último que leyó el scraper de cada súper. |
| `data/promos.json` | Las promos que muestra la página. |
| `scraper/scrape.js` | Lee las listas oficiales de Coto, Jumbo/Disco/Vea, Carrefour y Día. |
| `scraper/vtex.js` | Consultas al catálogo público de los súper VTEX (Jumbo, Disco, Vea, Carrefour, Día, ChangoMás). |
| `scraper/canasta.js` | Arma `data/canasta.json`: los productos que compara deelo, por código de barras. Se corre a mano para renovar o ampliar la canasta. |
| `scraper/precios.js` | Trae el precio de cada producto de la canasta en cada súper → `data/precios.json` (corre todos los lunes). |
| `scraper/build.js` | Convierte eso al formato de la página, suma los extras y regenera `index.html`. |
| `CNAME` | Dominio de GitHub Pages (`deelo.ar`). |

## Actualización automática
`.github/workflows/promos.yml` corre todos los lunes a las 8:07 (Argentina): scraper → build → commit en `main` si algo cambió. También se puede correr a mano desde **Actions → "deelo: actualizar promos" → Run workflow**.

Si una fuente falla, se conservan sus promos anteriores (marcadas "Sin actualizar") y la página muestra un aviso.

## Correrlo a mano
```sh
npm install --no-save playwright && npx playwright install chromium
node scraper/scrape.js data/oficial.json
node scraper/build.js
```
Después de cambiar `src/app.html` o `data/extras.json`, correr `node scraper/build.js` para regenerar `index.html`.
