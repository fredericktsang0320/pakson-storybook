'use strict';
importScripts('./asset-manifest.js');
const CACHE_PREFIX='pakson-audiobook-';
const CACHE=CACHE_PREFIX+ASSET_MANIFEST.version;
const core=ASSET_MANIFEST.files.filter(file=>file.core);
async function digest(buffer){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',buffer));return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');}
async function checkedResponse(file){
 const response=await fetch(new URL(file.url,self.registration.scope),{cache:'reload'});
 if(!response.ok)throw new Error('A story file could not download. Stay connected and try again.');
 const bytes=await response.clone().arrayBuffer();
 if(bytes.byteLength!==file.bytes||await digest(bytes)!==file.sha256)throw new Error('A story file is incomplete. Please try again.');
 return response;
}
self.addEventListener('install',event=>{event.waitUntil((async()=>{
 const cache=await caches.open(CACHE), older=(await caches.keys()).filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE);
 // Keep an older offline edition working until its complete replacement is ready.
 const required=older.length?ASSET_MANIFEST.files:core;
 for(const file of required){
  const url=new URL(file.url,self.registration.scope);let reused=null;
  for(const name of older){const prior=await(await caches.open(name)).match(url);if(!prior)continue;const bytes=await prior.clone().arrayBuffer();if(bytes.byteLength===file.bytes&&await digest(bytes)===file.sha256){reused=prior;break;}}
  await cache.put(url,reused||await checkedResponse(file));
 }
})());});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);const cached=await cache.match(event.request);if(cached)return cached;
  try{return await fetch(event.request);}catch(error){if(event.request.mode==='navigate'){const shell=await cache.match(new URL('./index.html',self.registration.scope));if(shell)return shell;}throw error;}
 })());
});
async function check(cache){
 let done=0;for(const file of ASSET_MANIFEST.files){const response=await cache.match(new URL(file.url,self.registration.scope));if(!response)return{complete:false,done,total:ASSET_MANIFEST.files.length};const bytes=await response.arrayBuffer();if(bytes.byteLength!==file.bytes||await digest(bytes)!==file.sha256)return{complete:false,done,total:ASSET_MANIFEST.files.length};done++;}return{complete:true,done,total:ASSET_MANIFEST.files.length,version:ASSET_MANIFEST.version};
}
self.addEventListener('message',event=>{
 const port=event.ports?.[0];if(!port)return;
 event.waitUntil((async()=>{try{
  const cache=await caches.open(CACHE);
  if(event.data.type==='CHECK_BOOK'){port.postMessage(await check(cache));return;}
  if(event.data.type==='CACHE_BOOK'){
   let done=0;const total=ASSET_MANIFEST.files.length;
   for(const file of ASSET_MANIFEST.files){
    const url=new URL(file.url,self.registration.scope);let response=await cache.match(url);let valid=false;
    if(response){const bytes=await response.arrayBuffer();valid=bytes.byteLength===file.bytes&&await digest(bytes)===file.sha256;}
    if(!valid)await cache.put(url,await checkedResponse(file));
    done++;port.postMessage({type:'PROGRESS',done,total});
   }
   const result=await check(cache);port.postMessage(result);
   if(result.complete){for(const key of await caches.keys())if(key.startsWith(CACHE_PREFIX)&&key!==CACHE)await caches.delete(key);}
  }
 }catch(error){port.postMessage({error:error.message||'The download is incomplete. Stay connected and try again.'});}})());
});
