'use strict';
const HOME=new URL('../',self.registration.scope);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const response=await fetch(new URL('index.html',HOME),{cache:'reload'});
  if(!response.ok||!(await response.text()).includes('data-pakson-edition="web-v18-root"'))throw Error('The stable reader is not ready.');
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await self.clients.claim();
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){
    if(client.url.startsWith(self.registration.scope))void client.navigate(HOME.href).catch(()=>{});
  }
})()));
self.addEventListener('fetch',event=>{
  if(event.request.mode==='navigate'&&event.request.url.startsWith(self.registration.scope))event.respondWith(Response.redirect(HOME.href,302));
});
