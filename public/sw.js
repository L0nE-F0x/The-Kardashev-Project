// The web game and its installable app were retired in v0.12 (the game is a desktop app now). Browsers that
// installed the old service worker fetch this file when they check for an update: it takes over at once, deletes
// the old caches, removes itself and reloads any open page, which then comes from the network (the home page).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })(),
  );
});
