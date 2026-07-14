// EstoquePro — Push notifications service worker
// This SW is DEDICATED to web-push messages. It does not cache the app shell,
// so it never interferes with the app (offline is handled by the app's own queues).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    try { payload = { title: 'EstoquePro', body: event.data ? event.data.text() : '' }; } catch (_) { payload = {}; }
  }

  const title = payload.title || 'EstoquePro';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    tag: payload.tag || undefined,       // agrupa notificações do mesmo item
    renotify: !!payload.tag,
    data: {
      url: payload.url || '/app/estoque',
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app/estoque';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) {
            try { await client.navigate(targetUrl); } catch (_) {}
          }
          return;
        }
      } catch (_) {}
    }
    await self.clients.openWindow(targetUrl);
  })());
});