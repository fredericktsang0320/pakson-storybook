'use strict';
// A unique import URL avoids an old registration's updateViaCache=imports entry.
importScripts('./asset-manifest.js?reader-build=20261114-cachefix-v20-fd014306ce8ea9c6');
const SCOPE=new URL(self.registration.scope), BOOK=new URL('book.json',SCOPE).href;
const WORKER_BUILD='20261114-cachefix-v20-fd014306ce8ea9c6';
const INDEX=new URL('index.html',SCOPE).href;
const LEGACY_SPEECH={"assets/speech/page_00.m4a":"0f58c4264f936e757f3200fbfad48267daf18837f22db35d20fdd1ef494060cb","assets/speech/page_01.m4a":"74fedc2ce1443dc71d61d275eaec8fcf0a8bc65ca3b72906e245fd0d859ae9d7","assets/speech/page_02.m4a":"97b22b30a5115fbdbb8ddcb5616cb6eb52d7dd00e8e6d40992bd185176e1ab9b","assets/speech/page_03.m4a":"f0c8b355871df93b220e144dac9f53f8d23c93f800c79115289ae4fa65b35940","assets/speech/page_04.m4a":"87f1fd2ea7b96fae7a5f0999ca9bf43190c31d777973cf4cb89ea2bb59700f21","assets/speech/page_05.m4a":"d4474dfd4510d44a9349fe067c1cec43d1ea884ae99e919f7659892c12bf1897","assets/speech/page_06.m4a":"c29e8d7f5aa1552c57ecedd670d0de64a614e4ffdd53b1650740c0bff41b96d9","assets/speech/page_07.m4a":"e01af98dd6332f6595434dfbe654a9382a02f0ae18533d4a3801dd08a8a6349d","assets/speech/page_08.m4a":"4e4ffc3f97553c4fee95c8e0132dc7af2290172a949dae900e02e2ca607aeff4","assets/speech/page_09.m4a":"74534692b394310c5f99025a16aab946955f3959395c489022305fab4971375b","assets/speech/page_10.m4a":"31a5840b4413798ab6f45a7e8b714fd494dc6bef3bd347f5d92c84445f5ee7f2","assets/speech/page_11.m4a":"04f932349aa55278a1be8b6df0ada92d4b5819b87832997e58bb36af15fb8a61","assets/speech/page_12.m4a":"bb7c0514b3a98c9bd45408653841c2cf38c2485a29058bde7dc9bbb61faadc79","assets/speech/v2/page_00.m4a":"320f7e9061c90a7d974bdc27ef3071583d91dd4145bcaec6f8cf52171bb15de0","assets/speech/v2/page_01.m4a":"083fc6369b4a8299a5505aa42aaba644c9541db5285fb62262004af0754acf10","assets/speech/v2/page_02.m4a":"c26ecb9d75b806ba0e7d1ffd81bb7b5ddde433bc223a1c9faca5e672655b8857","assets/speech/v2/page_03.m4a":"bdaebe9796ffde5c66b3419161ff18f5c284f1ed9f631b7de63bf74abd9328d5","assets/speech/v2/page_04.m4a":"9e29cd6269d3d5a71f931197a8afd861cc3b70e1a55bf7d304de5f33d7e8bb40","assets/speech/v2/page_05.m4a":"cb962e58b81d1f635b5dc70549dd1e123dce7a0ea3a784baf265e0872e874d5d","assets/speech/v2/page_06.m4a":"40b2f4de708dd861e66def0b9da2e5599b500726a3d6b44e06eb41597fdc6285","assets/speech/v2/page_07.m4a":"3b7099def71dabe851e9bb0ef1a13ed02625f4aaba98880634151962343eaf99","assets/speech/v2/page_08.m4a":"70650c64a61d775dd91af5b1606b64fd1f0b6005c9e92058d640e92676faccb8","assets/speech/v2/page_09.m4a":"8ed48e0ef7c9c7c6dec0bd664f46845bae7fffa41bb70223e3b1bcf6c2c4f09a","assets/speech/v2/page_10.m4a":"d08e8798b71b41c8f4098fd26f51df8ae9890bc37ea755a90d6268ca54aea7ee","assets/speech/v2/page_11.m4a":"8886036e9e346108c9f5ef9546b1ff9da723b43989dde3dc4c4bf5a1de653c8e","assets/speech/v2/page_12.m4a":"e55c9f4b4b6edfb26368817463a162f81f22b85de929a96c018a976b030e1e76"};
const legacySpeech=new Map(Object.entries(LEGACY_SPEECH).map(([url,sha])=>[new URL(url,SCOPE).href,sha]));
const runtime=new Map(ASSET_MANIFEST.files.map(file=>[new URL(file.url,SCOPE).href,file]));
// Exact immutable shell aliases keep already-open v2/v3 DOMs paired with their
// original scripts/styles while this worker claims and reloads scope clients.
// Current v4 documents use a distinct query; no other query is normalised.
const SHELL_EDITION_QUERY='?edition=20261112-fingertip-v4';
const PRIOR_SHELL_EDITIONS={'20261112-fullpage-v3':'v3','20261112-curl-v2':'v2'};
const shellFiles=['styles.css','vendor/page-flip.browser.js','audio.js','app.js'];
const shellAliases=new Map();
for(const file of shellFiles){
 shellAliases.set(new URL(file+SHELL_EDITION_QUERY,SCOPE).href,new URL(file,SCOPE).href);
 for(const [edition,version] of Object.entries(PRIOR_SHELL_EDITIONS)){
  const target=['styles.css','app.js'].includes(file)?'compat/shell/'+version+'/'+file:file;
  shellAliases.set(new URL(file+'?edition='+edition,SCOPE).href,new URL(target,SCOPE).href);
 }
}
function runtimeURL(url){return shellAliases.get(url)||url;}
async function digest(buffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),x=>x.toString(16).padStart(2,'0')).join('');}
const environment=(async()=>{
 const tag=await digest(new TextEncoder().encode(SCOPE.href));
 // Completely outside the v1 cleanup prefix: pakson-audiobook-.
 const prefix='pakson-storybook-scope-'+tag+'-';
 return {prefix,cache:prefix+ASSET_MANIFEST.version,control:'pakson-storybook-control-'+tag,
   record:new URL('.reader-control/'+ASSET_MANIFEST.version+'-'+WORKER_BUILD+'.json',SCOPE).href};
})();
function inScope(url){const u=new URL(url);return u.origin===SCOPE.origin&&u.pathname.startsWith(SCOPE.pathname);}
function readerEntry(url){const u=new URL(url);return u.pathname===SCOPE.pathname||u.pathname===new URL(INDEX).pathname;}
async function readState(){const e=await environment,r=await(await caches.open(e.control)).match(e.record);return r?await r.json():null;}
async function saveState(value){const e=await environment;await(await caches.open(e.control)).put(e.record,new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));}
async function validResponse(response,file){if(!response||!response.ok)return false;const bytes=await response.clone().arrayBuffer();return bytes.byteLength===file.bytes&&await digest(bytes)===file.sha256;}
async function checkedResponse(file){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const r=await fetch(new URL(file.url,SCOPE),{cache:'reload',signal:controller.signal});if(!await validResponse(r,file))throw Error('A story file failed its complete SHA/bytes check.');return r;}finally{clearTimeout(timer);}
}
async function check(cache,files=ASSET_MANIFEST.files){
 let done=0;for(const file of files){if(!await validResponse(await cache.match(new URL(file.url,SCOPE)),file))return {complete:false,done,total:files.length,version:ASSET_MANIFEST.version};done++;}
 return {complete:true,done,total:files.length,version:ASSET_MANIFEST.version};
}
async function olderOwnedCaches(){
 const e=await environment,result=[];
 for(const key of await caches.keys()){
  if(key===e.cache)continue;
  const scoped=key.startsWith(e.prefix)&&/^[a-f0-9]{16}$/.test(key.slice(e.prefix.length));
  const legacy=/^pakson-audiobook-[a-f0-9]{16}$/.test(key);
  // A legacy cache name is origin-wide; only exact scoped book.json proves ownership.
  if((scoped||legacy)&&await(await caches.open(key)).match(BOOK))result.push(key);
 }
 return result;
}
async function reusable(file,names){
 for(const name of names){const r=await(await caches.open(name)).match(new URL(file.url,SCOPE));if(await validResponse(r,file))return r;}
 return null;
}
self.addEventListener('install',event=>{event.waitUntil((async()=>{
 const e=await environment;
 if(!ASSET_MANIFEST.files.length||runtime.size!==ASSET_MANIFEST.files.length||[...runtime.keys()].some(url=>!inScope(url)))throw Error('Invalid scoped runtime manifest.');
 const hadOldActive=!!self.registration.active,older=await olderOwnedCaches(),upgrade=hadOldActive||older.length>0;
 const required=ASSET_MANIFEST.files.filter(file=>file.core);
 const existed=(await caches.keys()).includes(e.cache),stageName=e.cache+'-stage-'+Date.now()+'-'+Math.random().toString(16).slice(2);
 try{
  const stage=await caches.open(stageName);
  for(const file of required)await stage.put(new URL(file.url,SCOPE),await reusable(file,existed?[e.cache,...older]:older)||await checkedResponse(file));
  if(!(await check(stage,required)).complete)throw Error('Staged cache is incomplete.');
  const target=await caches.open(e.cache);
  for(const file of required)await target.put(new URL(file.url,SCOPE),(await stage.match(new URL(file.url,SCOPE))).clone());
  if(!(await check(target,required)).complete)throw Error('Committed cache is incomplete.');
  // All fallible full verification and commit metadata precede skipWaiting.
  await saveState({scope:SCOPE.href,version:ASSET_MANIFEST.version,workerBuild:WORKER_BUILD,upgrade,hadOldActive,
    shellComplete:true,cachePolicy:20,uiEdition:21,homeRevision:22,complete:required.length===ASSET_MANIFEST.files.length,legacyCaches:older,reloads:{},createdAt:new Date().toISOString()});
  await caches.delete(stageName);
  if(upgrade)await self.skipWaiting();
 }catch(error){
  await caches.delete(stageName);
  if(!existed){await caches.delete(e.cache);await(await caches.open(e.control)).delete(e.record);}
  throw error; // The previously active worker/cache is not replaced on install failure.
 }
})());});
async function currentShellClient(client){
 return new Promise(resolve=>{
  const channel=new MessageChannel();let settled=false;
  const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);channel.port1.close();resolve(value);};
  const timer=setTimeout(()=>finish(false),650);
  channel.port1.onmessage=event=>{
   const url=new URL(client.url),home=url.pathname===SCOPE.pathname||url.pathname===new URL('index.html',SCOPE).pathname||url.pathname===new URL('library.html',SCOPE).pathname;
   finish(event.data?.uiEdition===21&&event.data?.preserveEntry===true&&(!home||event.data?.homeRevision===22));
  };
  try{client.postMessage({type:'PAKSON_CLIENT_EDITION'},[channel.port2]);}catch{finish(false);}
 });
}
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
 const e=await environment,state=await readState();
 if(!state)throw Error('Missing verified install record.');
 if(!state.upgrade){await self.clients.claim();return;}
 // Do not claim or navigate if browser storage was lost after the install commit.
 if(!state.shellComplete||!(await check(await caches.open(e.cache),ASSET_MANIFEST.files.filter(file=>file.core))).complete)return;
 const candidates=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>inScope(client.url)&&!new URL(client.url).pathname.startsWith(new URL('preview-v18/',SCOPE).pathname));
 // The current edition is already a coherent document; retain its real tap
 // and live audio. Older documents do not answer and receive one real reload.
 const retained=await Promise.all(candidates.map(currentShellClient));
 const targets=candidates.filter((client,index)=>!retained[index]);
 for(const client of targets)if(!state.reloads[client.id])state.reloads[client.id]={url:client.url,attempted:false};
 await saveState(state);
 await self.clients.claim();
 for(const target of targets){
  const record=state.reloads[target.id];if(record.attempted)continue;
  // Persist before navigate: each version/client is attempted at most once, never a loop.
  const reloadURL=new URL(record.url);reloadURL.hash='';
  record.attempted=true;record.reloadURL=reloadURL.href;record.restoreFragment=reloadURL.href!==record.url;await saveState(state);
  const client=await self.clients.get(target.id);
  if(!client||!inScope(client.url)||client.url!==record.url)continue;
  // Navigation fetch waits for activation. Do not await it inside activate.waitUntil.
  void client.navigate(reloadURL.href).then(reloaded=>{
   // A same nonempty fragment is otherwise a same-document no-op. Restore it only
   // after the one real reload; this second navigation is fragment-only.
   if(record.restoreFragment&&reloaded&&inScope(reloaded.url))return reloaded.navigate(record.url);
  }).then(()=>{record.completed=true;void saveState(state).catch(()=>{});})
   .catch(error=>{record.error=String(error);void saveState(state).catch(()=>{});});
 }
})());});
async function ranged(request,response){
 const range=request.headers.get('range');if(!range)return response;
 const bytes=await response.arrayBuffer(),match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match)return new Response(bytes,{headers:response.headers});
 const start=match[1]?Number(match[1]):Math.max(0,bytes.byteLength-Number(match[2]));
 const end=match[1]&&match[2]?Math.min(Number(match[2]),bytes.byteLength-1):bytes.byteLength-1;
 if(start>=bytes.byteLength||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.byteLength}`}});
 const headers=new Headers(response.headers);headers.set('Content-Range',`bytes ${start}-${end}/${bytes.byteLength}`);headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');
 return new Response(bytes.slice(start,end+1),{status:206,headers});
}
async function legacyResponse(request){
 const expected=legacySpeech.get(request.url);if(!expected)return null;
 const state=await readState();
 for(const name of state?.legacyCaches||[]){
  const cached=await(await caches.open(name)).match(request);
  if(cached&&await digest(await cached.clone().arrayBuffer())===expected)return cached;
 }
 // Legitimate v1 cache misses use immutable retained v1 URLs, never /v2/ audio.
 const response=await fetch(request);if(!response.ok||await digest(await response.clone().arrayBuffer())!==expected)throw Error('Legacy speech SHA differs.');
 return response;
}
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||!inScope(event.request.url))return;
 event.respondWith((async()=>{
  const e=await environment,cache=await caches.open(e.cache),requestURL=new URL(event.request.url),key=runtimeURL(event.request.mode==='navigate'?requestURL.origin+requestURL.pathname:event.request.url),file=runtime.get(key);
  if(event.request.mode==='navigate'&&readerEntry(event.request.url)){
   const shell=await cache.match(INDEX);if(shell)return shell;
  }
  if(file){const response=await obtain(file,false);return ranged(event.request,response);}
  if(legacySpeech.has(event.request.url))return await legacyResponse(event.request);
  return await fetch(event.request);
 })());
});
// Full-book saving is a resumable message task, never an install/activate gate.
const pendingFiles=new Map();
// Keep a bounded copy of already verified foreground responses. Reading the
// same page or an AAC Range again must not hash its full body on every gesture.
// Background/offline audits still inspect the real persistent cache in full.
const verifiedResponses=new Map();let verifiedResponseBytes=0;
function recentResponse(file){
 const entry=verifiedResponses.get(file.url);if(!entry)return null;
 verifiedResponses.delete(file.url);verifiedResponses.set(file.url,entry);
 return entry.response.clone();
}
function rememberResponse(file,response){
 if(file.bytes>16*1024*1024)return;
 const prior=verifiedResponses.get(file.url);if(prior)verifiedResponseBytes-=prior.bytes;
 verifiedResponses.delete(file.url);verifiedResponses.set(file.url,{bytes:file.bytes,response:response.clone()});verifiedResponseBytes+=file.bytes;
 while(verifiedResponses.size>8||verifiedResponseBytes>16*1024*1024){const key=verifiedResponses.keys().next().value;verifiedResponseBytes-=verifiedResponses.get(key).bytes;verifiedResponses.delete(key);}
}
async function obtain(file,mustStore){
 if(!mustStore){const recent=recentResponse(file);if(recent)return recent;}
 const e=await environment,cache=await caches.open(e.cache),url=new URL(file.url,SCOPE);
 const saved=await cache.match(url);if(await validResponse(saved,file)){if(!mustStore)rememberResponse(file,saved);return saved;}
 let task=pendingFiles.get(url.href);
 if(!task){
  task=(async()=>{
   const state=await readState();
   const response=await reusable(file,state?.legacyCaches||[])||await checkedResponse(file);
   let storageError=null;
   try{await cache.put(url,response.clone());}catch(error){storageError=error;}
   return {response,storageError};
  })();
  pendingFiles.set(url.href,task);
  task.finally(()=>{if(pendingFiles.get(url.href)===task)pendingFiles.delete(url.href);}).catch(()=>{});
 }
 const result=await task;
 if(result.storageError&&mustStore)throw result.storageError;
 // A full storage area must not prevent online reading of a valid response.
 if(!mustStore)rememberResponse(file,result.response);
 return result.response.clone();
}
let bookJob=null,bookProgress={done:0,total:ASSET_MANIFEST.files.length};
const progressListeners=new Set();
function announceProgress(){for(const listener of progressListeners){try{listener({...bookProgress,type:'PROGRESS'});}catch{}}}
async function saveBook(listener){
 progressListeners.add(listener);listener({...bookProgress,type:'PROGRESS'});
 try{
  if(!bookJob){
   bookJob=(async()=>{
    let failure=null;bookProgress={done:0,total:ASSET_MANIFEST.files.length};announceProgress();
    for(const file of ASSET_MANIFEST.files){
     try{await obtain(file,true);}
     catch(error){failure={name:error.name||'Error',message:error.message||String(error),url:file.url};break;}
     ++bookProgress.done;announceProgress();
    }
    const e=await environment,result=await check(await caches.open(e.cache));
    const state=await readState();
    if(state){
     state.complete=result.complete;state.lastDownloadError=failure;state.downloadedAt=new Date().toISOString();
     try{await saveState(state);}catch(error){if(error.name!=='QuotaExceededError')throw error;}
    }
    return {...result,shellComplete:true,cache:e.cache,scope:SCOPE.href,downloadError:failure};
   })().finally(()=>{bookJob=null;});
  }
  return await bookJob;
 }finally{progressListeners.delete(listener);}
}
self.addEventListener('message',event=>{
 const port=event.ports?.[0];if(!port)return;
 const post=value=>{try{port.postMessage(value);}catch{}};
 event.waitUntil((async()=>{try{
  const e=await environment,cache=await caches.open(e.cache);
  if(event.data.type==='CHECK_BOOK'){post({...await check(cache),cache:e.cache,scope:SCOPE.href,shellComplete:!!(await readState())?.shellComplete});return;}
  if(event.data.type==='UPGRADE_STATUS'){post({version:ASSET_MANIFEST.version,cache:e.cache,scope:SCOPE.href,state:await readState()});return;}
  if(event.data.type==='CACHE_BOOK'){post(await saveBook(post));return;}
 }catch(error){post({error:error.message||'The download is incomplete.',errorName:error.name||'Error'});}})());
});
