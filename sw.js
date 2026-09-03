const CACHE='ki-zeitung-v3-20260903';
const ASSETS=['./','./index.html','./manifest.json','./data/mock.json','./data/sources.json','./assets/js/app.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('fetch',e=>{
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{
    // cache RSS proxy results
    if(e.request.url.includes('/data/')){ const c=res.clone(); caches.open(CACHE).then(cache=>cache.put(e.request,c));}
    return res;
  }).catch(()=> r)));
});
