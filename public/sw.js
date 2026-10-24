/* Network-only: game/API responses and private hands are never cached. */
const OFFLINE_CACHE='rummikub-offline-v2';
self.addEventListener('install',event=>event.waitUntil((async()=>{await caches.open(OFFLINE_CACHE).then(cache=>cache.add('/offline.html'));await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('rummikub-offline-')&&key!==OFFLINE_CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{};}catch{}
  const room=/^[A-Z]{4}$/.test(data.room||'')?data.room:'';
  const target=room?'/?r='+room:'/';
  const stale=Number(data.expiresAt)>0 && Date.now()>Number(data.expiresAt);
  const title=stale?'루미큐브 · Rummikub':String(data.title||'루미큐브').slice(0,100);
  event.waitUntil(self.registration.showNotification(title,{
    body:stale?(room+' · 테이블의 현재 상태를 확인해 주세요.'):String(data.body||'테이블로 돌아와 주세요.').slice(0,180),
    icon:'/app-icon-192.png',badge:'/app-icon-192.png',tag:room?'rummikub-'+room:'rummikub-turn',
    silent:data.silent===true,renotify:true,data:{url:target,room},
    ...(data.silent===true?{}:{vibrate:[120,70,120]}),
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const room=event.notification.data?.room;
  const target=new URL(/^[A-Z]{4}$/.test(room||'')?'/?r='+room:'/',self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    // Prefer an existing window for this room; never navigate a different active room.
    const same=windows.find(client=>{try{return new URL(client.url).searchParams.get('r')===room;}catch{return false;}});
    if(same){await same.focus();same.postMessage({type:'push-return',room});return;}
    await self.clients.openWindow(target);
  })());
});
