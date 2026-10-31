// Höj versionen när filerna ändras så att nya versionen hämtas.
const CACHE = 'golftraining-v10';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png',
  './fonts/BigShouldersDisplay.woff2', './fonts/AtkinsonHyperlegibleNext.woff2', './fonts/AtkinsonHyperlegibleMono.woff2',
  // Firebase SDK (synk med Golfrounds Firestore). Bara de här tre adresserna från en annan domän hanteras här.
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Cache först (snabbt och offline på rangen), uppdatera i bakgrunden när nät finns.
// Nästa gång appen öppnas visas den uppdaterade versionen.
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || (u.origin !== location.origin && !ASSETS.includes(req.url))) return;
  if (u.pathname.includes('/__/')) return;   // Firebase Hostings egna sökvägar (inloggningen) går alltid till nätet
  const key = req.mode === 'navigate' ? new URL('./', self.registration.scope).href : req.url.split('?')[0];
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(key);
    const net = fetch(key, { cache: 'no-cache' }).then(res => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || Response.error();
  }));
});
