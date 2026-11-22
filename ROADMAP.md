# deelo · Hoja de ruta

Planner del proyecto. Lo revisamos al empezar cada tanda de trabajo: qué se hizo, qué sigue y qué hay que decidir.
Estados: ✅ hecho · 🔨 en curso · ⏭️ próximo · 💭 por definir

_Última revisión: 22/11/2026_

## Ahora

### 1. Precios de Coto 🔨
- ✅ Script `scraper/sepa.js`: baja SEPA (Precios Claros), toma una sucursal de Coto en CABA y escribe `data/precios-coto.json`.
- ✅ El comparador y el carrito suman Coto si el archivo tiene menos de 15 días.
- ✅ Promos por cantidad (2x1, 2da al 80%, llevando 3): se muestran aparte en Precios y el carrito las aplica cuando llevás la cantidad.
- ⏭️ Primera corrida real desde una compu en Argentina (SEPA bloquea conexiones de afuera).
- 💭 Cómo se actualiza cada semana: a mano desde la compu, o automático (ver punto 3).

### 2. Visual solo clara, estilo empresa tecnológica ⏭️
- Sacar el modo oscuro y el botón sol/luna.
- Paleta clara: fondo blanco y grises muy suaves, un color de acento fuerte para las acciones (estilo Cloudflare, Stripe, Mercado Libre), bordes finos, sombras sutiles.
- Mantener el logo y los colores de marca (azul marino y verde) y las insignias de 2 letras.
- Aplicar también en `acerca.html`, la pantalla de bienvenida y el login.
- 💭 Elegir entre 2 o 3 propuestas de paleta antes de implementar.

## Próximo

### 3. Base de precios del Ministerio (SEPA) como fuente principal 💭
- SEPA publica todos los días los precios de todas las cadenas grandes del país, sucursal por sucursal. Sirve para sumar súper nuevos sin armar un scraper por cada uno.
- Paso 1: ampliar `sepa.js` para sacar todas las cadenas, no solo Coto.
- Paso 2: resolver dónde corre, porque solo baja desde Argentina. Opciones: tu compu una vez por semana, un servidor chico en Argentina (unos pocos USD por mes) o una Raspberry Pi en casa.
- Paso 3: elegir la sucursal según el barrio del usuario (SEPA trae la ubicación de cada sucursal).
- 💭 Cuánto historial guardamos (para gráficos de "subió/bajó" o alertas de precio).

### 4. Tipos de usuario y monetización 💭
Borrador para discutir:

| | Gratis | Premium | Full |
|---|---|---|---|
| Descuentos de la semana con mis tarjetas | ✅ | ✅ | ✅ |
| Comparador de precios | Hasta X búsquedas | ✅ | ✅ |
| Carrito: dónde conviene comprar | 1 carrito | Varios carritos guardados | ✅ |
| Avisos (mail o notificación) | — | Descuentos del día | + bajas de precio de mis productos |
| Historial de precios | — | 30 días | Completo |
| Elegir sucursal / barrio | — | ✅ | ✅ |
| Sin publicidad | — | ✅ | ✅ |

- 💭 Precios por mes, prueba gratis, cobro con Mercado Pago (suscripciones) y facturación (monotributo).
- Va antes que la landing, porque la landing muestra los planes.

### 5. Landing page ⏭️ después del 4
- Página de presentación para quien llega por primera vez: qué es deelo, cómo funciona (3 pasos), cuánto se ahorra, los planes y preguntas frecuentes.
- La app queda en otra dirección (por ejemplo `deelo.ar/app`), o la landing se muestra solo a quien no tiene cuenta.
- Optimizada para Google (SEO) y para compartir en redes.

## Más adelante

- **Pruebas automáticas de diseño**: capturas en celular y compu en cada pull request para detectar desacomodos.
- **Migrar a componentes** (React, Svelte o similar) cuando crezcan las pantallas.
- **Catálogo del sistema de diseño**: colores, tipografías, botones, tarjetas. Conviene hacerlo junto con el punto 2.
- **Entorno de pruebas**: Cloudflare Pages con vista previa por pull request y `staging.deelo.ar`; proteger `main`.
- **Web instalable (PWA)**.
- **Firebase de pruebas** separado del real.
- **Ley 25.326**: inscribir la base de usuarios en la AAIP antes de abrir cuentas al público (obligatorio antes de cobrar).

## Ideas sueltas

- Escanear el código de barras con la cámara para ver el precio en cada súper.
- Más ciudades además de CABA.
