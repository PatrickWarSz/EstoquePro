// EstoquePro — Push notifications
// Este arquivo roda DENTRO do Service Worker do Workbox via `importScripts`
// (configurado em vite.config.ts) — não é mais registrado separadamente.
// Isso evita dois SWs competindo pelo mesmo escopo ("/"), que era o motivo de
// as notificações pararem de chegar mesmo com a inscrição salva com sucesso.
// self.skipWaiting()/clients.claim() já são cuidados pelo SW principal
// (gerado pelo Workbox) — aqui só ficam os handlers exclusivos de push.

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