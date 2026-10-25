// V58 PWA - YARYA ZAXO
const CACHE = 'yarya-zaxo-v58';
const CORE = ['/', '/index.html', '/manifest.json', '/firebase-shim.js', '/icons/icon-192x192.png', '/icons/icon-512x512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k!==CACHE).map(k => caches.delete(k)))).then(()=>clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(url.pathname.startsWith('/api/')) return;
  if(e.request.method!=='GET') return;
  e.respondWith(caches.match(e.request).then(cached => {
    if(cached) return cached;
    return fetch(e.request).then(res => {
      if(res.ok && url.origin===location.origin){ const clone=res.clone(); caches.open(CACHE).then(c=>c.put(e.request, clone)); }
      return res;
    }).catch(()=> caches.match('/index.html'));
  }));
});
