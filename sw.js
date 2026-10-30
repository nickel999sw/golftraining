// Golftraining har flyttat till https://golftraining-nl.web.app. Den här workern ersätter den gamla appens worker:
// den tömmer cachen, avregistrerar sig och laddar om sidan, så att länksidan visas. localStorage rörs inte.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
