# deelo · Hoja de ruta

## Mediano plazo

- **Pruebas automáticas de diseño**: en cada pull request, sacar capturas de la página en celular (360 y 400 px) y compu, en modo claro y oscuro, para detectar desacomodos antes de que lleguen a la web.
- **Migrar a componentes** (React, Svelte o similar): separar la página, que hoy es un solo archivo (`src/app.html`), en piezas reutilizables. Conviene cuando crezcan las pantallas o se sume más gente.
- **Catálogo del sistema de diseño**: documentar colores, tipografías, espaciados y componentes (botones, tarjetas, chips, barras) con ejemplos, sobre los tokens que ya existen en `src/app.html`.
- **Entorno de pruebas**: pasar de GitHub Pages a Cloudflare Pages para tener un link de vista previa por pull request y un `staging.deelo.ar` antes de producción. Proteger `main` para que solo se cambie con pull requests.
- **Web instalable (PWA)**: ícono en el celular, pantalla completa y funcionamiento sin conexión con los últimos datos.
- **Firebase de pruebas**: un proyecto aparte para que las cuentas de prueba no se mezclen con las reales.
- **Ley 25.326**: inscribir la base de datos de usuarios en la AAIP antes de abrir las cuentas al público.

## Ideas sueltas

- Avisos ("mañana hay 30% en Coto con tu tarjeta") por mail o notificación.
- Escanear el código de barras de un producto con la cámara para ver su precio en cada súper.
- Más súper y más ciudades.
