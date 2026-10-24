// V57 SIMPLE - SW disabled - no cache
self.addEventListener('install', e=>{self.skipWaiting();});
self.addEventListener('activate', e=>{clients.claim();});
self.addEventListener('fetch', e=>{return;});
