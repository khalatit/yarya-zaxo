// YARYA ZAXO SW - V27 simple
const CACHE='yarya-v27';
self.addEventListener('install', e=>{ self.skipWaiting(); });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.map(k=>k!==CACHE?caches.delete(k):null)))); self.clients.claim(); });
self.addEventListener('fetch', e=>{ if(e.request.method!=='GET') return; e.respondWith(fetch(e.request).catch(()=>caches.match(e.request))); });
