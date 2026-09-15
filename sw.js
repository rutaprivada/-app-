/**
 * RutaPrivada - Service Worker para Progressive Web App (PWA)
 * Soporta instalación en Android, iOS y PC con carga instantánea y caché local
 */

const CACHE_NAME = 'rutaprivada-pwa-v16';

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './favicon.svg',
  './logo_rutaprivada.svg',
  './logo_tarjeta.svg',
  './manifest.json',
  './robots.txt',
  './sitemap.xml'
];

// Instalación: Precargar recursos estáticos fundamentales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpiar cachés anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de peticiones:
// - Peticiones a APIs externas (OSRM, USIG, Photon, Open-Meteo, Carto Tiles): Network First con bypass de caché para datos en vivo.
// - Recursos locales de la app: Stale-While-Revalidate para máxima velocidad de arranque.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // APIs dinámicas y mapas en tiempo real (siempre en vivo)
  if (
    url.hostname.includes('project-osrm.org') ||
    url.hostname.includes('openstreetmap.org') ||
    url.hostname.includes('komoot.io') ||
    url.hostname.includes('buenosaires.gob.ar') ||
    url.hostname.includes('open-meteo.com') ||
    url.hostname.includes('cartocdn.com') ||
    url.hostname.includes('mapbox.com') ||
    url.hostname.includes('wa.me') ||
    event.request.method !== 'GET'
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Recursos estáticos locales
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
