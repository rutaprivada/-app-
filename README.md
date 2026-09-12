# RutaPrivada | Traslados Privados & Chofer Ejecutivo

Plataforma web de alta conversión y cálculo de tarifas en tiempo real diseñada para servicios de traslados privados y chofer ejecutivo en Argentina.

---

## 🚀 Características Principales

1. **Cotizador Inteligente en Tiempo Real:**
   - Mapa interactivo con **Leaflet** y OpenStreetMap centrado en Buenos Aires / Argentina.
   - Enrutamiento vehicular real mediante **OSRM** (distancia por calles/autopistas y duración estimada).
   - Posibilidad de buscar direcciones con autocompletado predictivo o marcar origen y destino con clics directos en el mapa.
   - Botón de geolocalización para usar la ubicación actual.

2. **Estructura Tarifaria Oficial (Argentina):**
   - **Tarifa Base / Despacho:** `$3.500 ARS`
   - **Precio por Kilómetro:** `$950 ARS`
   - **Precio por Minuto de Tránsito:** `$120 ARS`
   - **Detección Automática de Peajes:** Agrega costo de peaje si el recorrido utiliza autopistas o distancias mayores a 14 km.
   - **Opciones Adicionales:**
     - 🔄 *Viaje Ida y Vuelta:* Aplica un **15% de descuento** en el tramo de regreso.
     - 🛑 *Parada Intermedia:* Breve escala en camino de hasta 5 minutos ($2.500).
     - 🐾 *Pet Friendly:* Traslado seguro con mascota ($2.000).
     - 👶 *Asiento de Seguridad Infantil:* Booster o silla para niños incluida.
   - **Ajustes de Horario Automáticos:**
     - Horario Nocturno (22:00 a 06:00): +20%.
     - Horario Pico (07:30 a 09:30 y 17:30 a 20:00): +15%.

3. **Cierre de Ventas Directo por WhatsApp:**
   - **Número Oficial Configurado:** `+54 9 11 2255-8226` (Formato internacional: `5491122558226`).
   - El cliente presiona **"Confirmar y Reservar por WhatsApp"** y se abre automáticamente WhatsApp con los datos completos del viaje ya redactados: origen, destino, horario, km, vehículo y tarifa estimada.
   - Diagnóstico de formato para probar con 9, sin 9 o con otro número para pruebas.

4. **Panel de Administrador Protegido (PIN):**
   - Acceso desde el botón superior **🔒 Admin**.
   - **PIN predeterminado:** `1234`.
   - Permite al chofer o administrador actualizar tarifas, recargos y número de WhatsApp desde el navegador sin tocar código. Los cambios se guardan en el almacenamiento local (`localStorage`).

5. **Herramientas Adicionales:**
   - **Copiar Resumen:** Copia la cotización al portapapeles.
   - **Comprobante en PDF:** Imprime o guarda un comprobante limpio para el cliente o pasajero corporativo.

---

## 📂 Estructura del Proyecto

```text
rutaprivada/
├── index.html       # Estructura principal y maquetado semántico
├── styles.css       # Hoja de estilos con tema ejecutivo Titanium & Gold
├── app.js           # Lógica interactiva (Mapas, OSRM, Tarifas, WhatsApp)
└── README.md        # Documentación oficial del proyecto
```

---

## 🖥️ Cómo Ejecutar la Aplicación

1. **Directamente en el navegador:**
   - Haz doble clic sobre [index.html](file:///c:/Users/daniel/.gemini/rutaprivada/index.html) para abrirlo en Chrome, Edge, Firefox o Safari.
2. **Con un servidor local (Opcional):**
   - Si utilizas Visual Studio Code, puedes hacer clic derecho en `index.html` y seleccionar **Open with Live Server**.

---

## 🌐 Publicar en Internet (Gratis)

Puedes poner esta web online de forma gratuita para tus clientes usando:
- **GitHub Pages:** Sube los archivos a un repositorio de GitHub y activa Pages en la pestaña *Settings > Pages*.
- **Vercel o Netlify:** Arrastra la carpeta `rutaprivada` y en 30 segundos tendrás un enlace público tipo `rutaprivada.vercel.app`.