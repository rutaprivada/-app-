# RutaPrivada | Traslados Privados & Chofer Ejecutivo

Plataforma web de alta conversión y cálculo de tarifas en tiempo real diseñada para servicios de traslados privados y chofer ejecutivo en Argentina.

---

## 🚀 Características Principales

1. **Cotizador Inteligente con Tráfico en Tiempo Real:**
   - Mapa interactivo con **Leaflet** y OpenStreetMap centrado en Buenos Aires / Argentina.
   - Enrutamiento vehicular en tiempo real con **Mapbox Directions (`mapbox/driving-traffic`)** para cálculo de demoras por congestión en vivo, con fallback automático a **OSRM** y estimación por franja horaria.
   - Indicador visual de estado de tráfico en vivo (fluido, moderado, pesado) en el mapa.
   - Búsqueda de direcciones con autocompletado predictivo para Punto de Partida, Parada Intermedia (opcional) y Punto de Destino.
   - Botón de geolocalización para usar la ubicación actual en el origen.

2. **Estructura Tarifaria Oficial (Argentina):**
   - **Tarifa Base / Despacho:** 
     - `$2.000 ARS` (viajes directos ≤10 km).
     - `$3.500 ARS` (viajes directos >10 km).
     - **`$2.500 ARS` (Especial):** Para viajes que agreguen **parada intermedia** y no superen los **15 kilómetros** de distancia total.
     - *Bonificada $0 en viajes a Ezeiza >36 km.*
   - **Precio por Kilómetro:** `$950 ARS` (≤10 km) / `$900 ARS` (10 a 35 km) / `$800 ARS` (>35 km).
   - **Precio por Minuto de Tránsito:** `$100 ARS` (≤15 min) / `$150 ARS` (15 a 30 min) / `$70 ARS` (>30 min).
   - **Detección Inteligente de Peajes:** Detecta autopistas oficiales (Autopistas del Sol Panamericana / Acceso Norte - Ramal Pilar / Campana, AUSA 25 de Mayo/Illia, Riccheri, Acceso Oeste, La Plata, Buen Ayre) y aplica tarifas pico/valle obligatorias vigentes sin duplicaciones.
   - **Opciones Adicionales & Parada:**
     - 🛑 *Parada Intermedia en Itinerario:* Permite cargar una parada previa al destino. Tarifa inteligente según desvío:
       - **$1.000 ARS:** Si se encuentra en camino o el desvío es menor a 5 km.
       - **$2.000 ARS:** Si genera un desvío considerable (entre 5 km y 10 km).
       - **$3.000 ARS:** Si el desvío de la parada supera los 10 km respecto al trayecto directo.
     - 🔄 *Viaje Ida y Vuelta:* Aplica un **15% de descuento** en el tramo de regreso (o un **20% de descuento** en viajes cuya tarifa total supere los $20.000).
     - 🐾 *Pet Friendly:* Traslado seguro con mascota ($4.000).
   - **Ajustes de Horario Automáticos:**
     - Horario Nocturno (20:00 a 22:00): +20%.
     - Horario Nocturno (22:00 a 06:00): +20% en viajes de >30 km / +25% en viajes de ≤30 km.
     - Alta Demanda (06:00 a 10:00 y 16:00 a 20:00): +10%.
     - Horario Valle (11:00 a 14:00): 0% (Sin recargo).

3. **Búsqueda Avanzada de Direcciones y Esquinas:**
   - Detecta esquinas en lenguaje coloquial argentino (ej: *"Thames y Charcas"*, *"Av Santa Fe y Callao"*, *"Thames esquina Charcas"*, *"Panamericana y 197"*).
   - Conversión inteligente de sintaxis para OpenStreetMap/Nominatim y fallback de alta velocidad con Photon.
   - Navegación con flechas del teclado y selección inmediata con la tecla `Enter`.

4. **Cierre de Ventas Directo por WhatsApp:**
   - **Número Oficial Configurado:** `+54 9 11 7373-8790` (Formato internacional: `5491173738790`).
   - El cliente presiona **"Confirmar y Reservar por WhatsApp"** y se abre automáticamente WhatsApp con los datos completos del viaje ya redactados: origen, parada intermedia (si existe), destino, día con fecha amigable, horario, km, vehículo y tarifa estimada.
   - Modal de experiencia post-reserva con aviso cordial de atención y sistema de calificación de 5 estrellas.

5. **Panel de Administrador Protegido (PIN):**
   - Acceso desde el botón superior **🔒 Admin**.
   - **PIN definitivo:** `4824`.
   - Permite al chofer o administrador actualizar tarifas, recargos y número de WhatsApp desde el navegador sin tocar código. Los cambios se guardan en el almacenamiento local (`localStorage`).

6. **Herramientas Adicionales:**
   - **Copiar Resumen:** Copia la cotización al portapapeles con detalle y fecha con día de la semana.
   - **Comprobante en PDF:** Imprime o guarda un comprobante limpio para el cliente o pasajero corporativo.

---

## 📂 Estructura del Proyecto

```text
rutaprivada/
├── favicon.svg      # Logo ejecutivo y favicon oficial vectorizado
├── index.html       # Estructura principal con Schema.org y metadatos SEO para Google
├── styles.css       # Hoja de estilos ejecutiva Titanium & Gold
├── app.js           # Lógica interactiva (Mapas, Esquinas, OSRM, Tarifas, WhatsApp)
├── sitemap.xml      # Mapa del sitio para Google Search Console
├── robots.txt       # Directivas de indexación para motores de búsqueda
└── README.md        # Documentación oficial del proyecto
```

---

## 🌐 Cómo Publicar 100% Gratis y Posicionar en Google (Sin Vercel)

### Paso 1: Publicar el Sitio Gratis con GitHub Pages
1. Crea una cuenta gratuita en [GitHub.com](https://github.com).
2. Crea un repositorio público nuevo llamado `rutaprivada`.
3. Sube todos los archivos de esta carpeta (`index.html`, `styles.css`, `app.js`, `favicon.svg`, `sitemap.xml`, `robots.txt`).
4. Ve a la pestaña **Settings > Pages**.
5. En *Branch*, selecciona `main` (o `master`) y la carpeta `/ (root)`, luego pulsa **Save**.
6. En 1 minuto tendrás tu página publicada gratis con HTTPS seguro en: `https://[tu-usuario].github.io/rutaprivada/`.

### Paso 2: Aparecer en Google Search (Gratis)
1. Entra a [Google Search Console](https://search.google.com/search-console).
2. Agrega la URL de tu página.
3. En la sección **Sitemaps**, envía `https://[tu-usuario].github.io/rutaprivada/sitemap.xml`.
4. En **Inspección de URLs**, pega tu enlace y pulsa **"Solicitar indexación"**. Esto alerta a Google para indexar tu sitio web.

### Paso 3: Salir en Google Maps y Búsquedas Locales (Google Perfil de Negocio)
1. Ingresa a [Google Mi Negocio](https://www.google.com/business/) (100% gratuito).
2. Crea la ficha de negocio: *"RutaPrivada - Traslados Ejecutivos & Chofer Privado"*.
3. Agrega tu número de WhatsApp (`+54 9 11 7373-8790`), tu zona de cobertura (Buenos Aires, Ezeiza, Aeroparque, Pilar) y el enlace a tu página web.
4. Con esto, cualquier usuario que busque remises o traslados en tu zona verá tu negocio destacado en los mapas y en el buscador de Google.