'use strict';
(() => {
 if(window.parent!==window||!('serviceWorker' in navigator)||!window.isSecureContext)return;
 const scope=new URL('./',location.href).href;
 const message=worker=>new Promise(resolve=>{
  if(!worker){resolve(null);return;}const ch=new MessageChannel();let done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(t);ch.port1.close();resolve(value);};
  const t=setTimeout(()=>finish(null),700);ch.port1.onmessage=e=>finish(e.data);
  try{worker.postMessage({type:'UPGRADE_STATUS'},[ch.port2]);}catch{finish(null);}
 });
 async function refreshEntry(){
  try{
   const registration=await navigator.serviceWorker.getRegistration(scope);
   const reports=await Promise.all([message(registration?.active),message(navigator.serviceWorker.controller)]);
   const protectedCaches=reports.map(r=>r?.cache).filter(Boolean);
   try{
    const manifest=await fetch(new URL('asset-manifest-v23.json',scope),{cache:'reload'}).then(r=>r.ok?r.json():null);
    if(manifest?.version&&crypto.subtle){const tag=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope)))].map(x=>x.toString(16).padStart(2,'0')).join('');protectedCaches.push('pakson-storybook-scope-'+tag+'-'+manifest.version);}
   }catch{}
   await window.PaksonCacheRetirement?.retire({scope,protectedCaches,activeKnown:reports.some(r=>r?.cache),maxRetiredToKeep:0,deferLegacyInspection:true});
   // sw.js has never been a cached book asset. Force a real HTTP refresh before
   // serialising update checks, without unregistering or resetting any storage.
   await fetch(new URL('sw.js',scope),{cache:'reload'}).catch(()=>{});
   const r=await navigator.serviceWorker.register(new URL('sw.js',scope),{scope,updateViaCache:'none'});
   await r.update().catch(()=>{});
   const active=await message(r.active);
   if(active?.state?.entryRevision!==23)await r.update().catch(()=>{});
  }catch{} // Current online routes render independently of offline installation.
 }
 void refreshEntry();
 const u=new URL(location.href);if(u.pathname.endsWith('/home.html')&&u.searchParams.has('entry')){u.searchParams.delete('entry');history.replaceState(null,'',u.pathname+u.search+u.hash);}
})();
