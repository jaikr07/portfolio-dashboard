const CACHE='portfolio-command-v4';
const SHELL=['./','./index.html','./offline.html','./manifest.webmanifest','./assets/css/styles.css?v=4.0','./assets/js/config.js','./assets/js/utils.js','./assets/js/pwa.js?v=4.0','./assets/js/auth-gate.js?v=4.0','./assets/icons/icon-192.png','./assets/icons/icon-512.png'];
const scoped=path=>new URL(path,self.registration.scope).href;
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(scoped))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));return response;}).catch(async()=>await caches.match(request)||await caches.match(scoped('./offline.html'))));
    return;
  }
  if(url.pathname.includes('/data/')){
    event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));return response;}).catch(()=>caches.match(request)));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>{const network=fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;}).catch(()=>cached);return cached||network;}));
});
