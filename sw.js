/**
 * RutaPrivada - Service Worker para Progressive Web App (PWA)
 * Soporta instalación en Android, iOS y PC con carga instantánea y caché local
 */

const CACHE_NAME = 'rutaprivada-pwa-v91';

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './conductor.html',
  './conductor.css',
  './conductor.js',
  './sync.js',
  './admin.html',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './logo_rutaprivada.svg',
  './logo_chofer.svg',
  './logo_tarjeta.svg',
  './manifest.json',
  './manifest-driver.json',
  './robots.txt',
  './sitemap.xml',
  './privacidad.html'
];

// Instalación: Precargar recursos estáticos fundamentales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpiar todos los cachés anteriores de inmediato
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

// Intercepción de peticiones con estrategia Network-First (siempre datos frescos)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // APIs dinámicas, sync y Firestore en tiempo real (siempre en vivo sin caché)
  if (
    url.hostname.includes('project-osrm.org') ||
    url.hostname.includes('openstreetmap.org') ||
    url.hostname.includes('komoot.io') ||
    url.hostname.includes('buenosaires.gob.ar') ||
    url.hostname.includes('open-meteo.com') ||
    url.hostname.includes('cartocdn.com') ||
    url.hostname.includes('mapbox.com') ||
    url.hostname.includes('ntfy.sh') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.pathname.includes('/api/sync') ||
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

  // Recursos estáticos locales: Network First (Red primero, respaldo en caché si no hay conexión)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Soporte Integral para Notificaciones Push en Pantalla Bloqueada y Background
self.addEventListener('push', (event) => {
  let data = {
    title: '🔔 Nueva Alerta - RutaPrivada',
    body: 'Tienes una actualización importante de viaje.',
    icon: './icon-192.png',
    badge: './favicon.svg',
    tag: 'rutaprivada-notification',
    data: { url: './index.html' }
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const isDriverAlert = data.tag && data.tag.includes('conductor');
  const targetUrl = data.data?.url || (isDriverAlert ? './conductor.html' : './index.html');

  const options = {
    body: data.body,
    icon: data.icon || (isDriverAlert ? './icon_chofer.png' : './icon_pasajero.png'),
    badge: data.badge || './favicon.svg',
    tag: data.tag || 'rutaprivada-trip',
    renotify: true,
    requireInteraction: true, // Se mantiene visible en la pantalla bloqueada hasta interacción
    vibrate: [400, 150, 400, 150, 600, 200, 800], // Patrón de vibración de alta alerta
    actions: data.actions || [
      { action: 'open', title: '🚗 Abrir Solicitud' },
      { action: 'dismiss', title: 'Cerrar' }
    ],
    data: {
      url: targetUrl,
      tripId: data.tripId || data.data?.tripId || null,
      timestamp: Date.now()
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Soporte para Clic en Notificaciones del Sistema y Pantalla de Bloqueo en Celulares
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || './conductor.html';

  if (event.action === 'dismiss') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ((client.url.includes('conductor.html') && targetUrl.includes('conductor')) ||
            (client.url.includes('index.html') && targetUrl.includes('index')) ||
            (client.url.includes('agenda.html') && targetUrl.includes('agenda'))) {
          if ('focus' in client) {
            client.postMessage({ type: 'NOTIFICATION_CLICKED', data: notifData });
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
