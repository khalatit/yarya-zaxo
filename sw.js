// YARYA ZAXO PWA V48 - CACHE static, NETWORK for /api (timer sync)
const CACHE = 'yarya-v49-icon';
const STATIC = ['/', '/index.html', '/manifest.json', '/icons/icon-96x96.png', '/icons/icon-192x192.png', '/icons/icon-512x512.png'];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  // Never cache API - timer, leaderboard, winner must be fresh
  if(url.pathname.startsWith('/api/')){
    e.respondWith(fetch(e.request, {cache:'no-store'}));
    return;
  }
  // Cache-first for static, network fallback
  e.respondWith(caches.match(e.request).then(cached=>{
    if(cached) return cached;
    return fetch(e.request).then(res=>{
      if(res.ok && e.request.method==='GET' && url.origin===self.location.origin){
        const copy = res.clone();
        caches.open(CACHE).then(c=>c.put(e.request, copy));
      }
      return res;
    }).catch(()=> cached);
  }));
});
