
const CACHE_NAME = 'yarya-zaxo-pro-v27-cost-optimized-beautiful-icon';
const urlsToCache = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-180x180.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  '/icon.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  console.log('SW V27: Cost optimized 73% + Beautiful chick trophy icon 🏆🐥');
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache)));
});

self.addEventListener('activate', event => {
  console.log('SW V27: Clearing old caches - cost optimized');
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  if(event.request.url.includes('chrome-extension')) return;
  if(event.request.url.includes('firestore') || event.request.url.includes('firebase') || event.request.url.includes('googleapis')) return;
  
  // V27: Cache icons for 1 day to save hosting bandwidth
  if(event.request.url.includes('/icons/')){
    event.respondWith(
      caches.match(event.request).then(cached => {
        if(cached) return cached;
        return fetch(event.request).then(res => {
          if(res.ok){
            const clone=res.clone();
            caches.open(CACHE_NAME).then(c=>c.put(event.request,clone));
          }
          return res;
        });
      })
    );
    return;
  }
  
  event.respondWith(
    fetch(event.request).then(res => {
      if(res.ok){
        const clone=res.clone();
        caches.open(CACHE_NAME).then(c=>c.put(event.request,clone));
      }
      return res;
    }).catch(()=>caches.match(event.request).then(c=>c||caches.match('/offline.html')))
  );
});
