'use strict';
(() => {
  // Keep the existing reader's exit behaviour. Downloading never probes audio.
  document.addEventListener('click',event=>{
    if(event.target.closest('#libraryLink')){
      window.paksonReader?.state.audio?.navigation();
      window.PaksonPractice?.suspend();window.PaksonFeedback?.cancel('library');
    }
  });
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;

  const BUILD_PREFIX='20261114-cachefix-v20-';
  const RETRY_GAP_MS=30000;
  const label=()=>document.getElementById('offlineStatus');
  const status=text=>{if(label())label().textContent=text;};
  let registration=null,epoch=0,lastAttemptAt=0,lastUpdateAt=0,cacheTask=null,complete=false;
  let loadedWorkerBuild=null,resumeScheduled=false,lastDownloadError=null;
  const reloads=new Set();
  const probes=new Set(),watchedWorkers=new WeakSet();

  function query(worker,type,{progress,timeout=10000,tracked=true}={}){
    let cancel;
    const promise=new Promise((resolve,reject)=>{
      if(!worker){reject(new Error('No active offline reader.'));return;}
      const channel=new MessageChannel();let timer=null,finished=false;
      const finish=(error,value)=>{
        if(finished)return;finished=true;clearTimeout(timer);channel.port1.close();
        probes.delete(cancel);error?reject(error):resolve(value);
      };
      cancel=()=>{const error=new Error('Superseded offline check.');error.name='AbortError';finish(error);};
      const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(new Error('Offline check timed out.')),timeout);};
      channel.port1.onmessage=event=>{
        const value=event.data||{};
        if(value.type==='PROGRESS'){arm();progress?.(value);return;}
        const error=value.error?new Error(value.error):null;
        if(error&&value.errorName)error.name=value.errorName;
        finish(error,value);
      };
      channel.port1.onmessageerror=()=>finish(new Error('Offline status could not be read.'));
      if(tracked)probes.add(cancel);arm();
      try{worker.postMessage({type},[channel.port2]);}catch(error){finish(error);}
    });
    return {promise,cancel:()=>cancel?.()};
  }

  function canonicaliseHome(){
    const url=new URL(location.href);
    const home=document.body?.dataset.view==='home'||/\/(?:index|library)\.html$/.test(url.pathname)||url.pathname.endsWith('/');
    if(home&&url.searchParams.has('refresh'))history.replaceState(null,'',new URL('./',url).href);
  }
  function partial(error=lastDownloadError){
    if((error?.downloadError?.name||error?.name)==='QuotaExceededError'){
      status('The library is up to date. This browser cannot save the whole book yet; you can read online.');return;
    }
    status(navigator.onLine?
      'You can read online. The rest of the book will save when you reopen it.':
      'You are offline. Saved pages remain available; reconnect to finish saving the book.');
  }
  function valid(token,worker){return token===epoch&&registration?.active===worker;}
  function newerBuildRequiresReload(build){
    if(loadedWorkerBuild===null){loadedWorkerBuild=build;return false;}
    if(loadedWorkerBuild===build)return false;
    loadedWorkerBuild=build;
    const key='pakson:cachefix-v20:reload:'+build+':'+location.pathname;
    if(reloads.has(key))return false;
    reloads.add(key);
    try{if(sessionStorage.getItem(key))return false;sessionStorage.setItem(key,'1');}catch{}
    location.replace(location.href);return true;
  }
  function updateRegistration(){
    if(!registration||Date.now()-lastUpdateAt<RETRY_GAP_MS)return;
    lastUpdateAt=Date.now();
    try{void Promise.resolve(registration.update()).catch(()=>{});}catch{}
  }

  function fillBook(worker,token){
    if(cacheTask?.worker===worker)return cacheTask.promise;
    if(!navigator.onLine){partial();return;}
    if(lastAttemptAt&&Date.now()-lastAttemptAt<RETRY_GAP_MS){partial();return;}
    lastAttemptAt=Date.now();
    const task={worker,token,request:null,promise:null};cacheTask=task;
    status('Saving the rest of the book for offline reading…');
    task.request=query(worker,'CACHE_BOOK',{tracked:false,timeout:20000,progress:value=>{
      if(!valid(token,worker)||cacheTask!==task)return;
      const done=Number(value.done),total=Number(value.total);
      status(Number.isFinite(done)&&Number.isFinite(total)?
        `Saving the book for offline reading: ${done} / ${total}`:
        'Saving the rest of the book for offline reading…');
    }});
    task.promise=task.request.promise.then(result=>{
      if(!valid(token,worker)||cacheTask!==task)return;
      complete=result.complete===true;
      lastDownloadError=result.downloadError||null;
      if(complete)status('Saved for offline reading.');else partial(lastDownloadError);
    }).catch(error=>{
      if(valid(token,worker)&&cacheTask===task&&error.name!=='AbortError'){lastDownloadError=error;partial(error);}
    }).finally(()=>{if(cacheTask===task)cacheTask=null;});
    return task.promise;
  }

  async function inspect(reason,{force=false}={}){
    const worker=registration?.active;if(!worker)return;
    if(!force&&cacheTask?.worker===worker)return;
    if(!force&&Date.now()-lastAttemptAt<RETRY_GAP_MS)return;
    const token=++epoch;
    // A legacy worker's pending MessageChannel must never delay a new controller.
    for(const cancel of [...probes])cancel();
    if(cacheTask){cacheTask.request?.cancel();cacheTask=null;}
    try{
      const upgrade=await query(worker,'UPGRADE_STATUS').promise;
      if(!valid(token,worker))return;
      const state=upgrade.state;
      if(!String(state?.workerBuild||'').startsWith(BUILD_PREFIX)){
        status('Updating the library. You can keep this page open.');return;
      }
      if(state.shellComplete!==true&&state.complete!==true){
        status('Preparing the updated library…');return;
      }
      canonicaliseHome();
      if(newerBuildRequiresReload(state.workerBuild))return;
      const result=await query(worker,'CHECK_BOOK').promise;
      if(!valid(token,worker))return;
      complete=result.complete===true;
      if(complete){status('Saved for offline reading.');return;}
      // UI rendering and shell activation have already finished. This full-book
      // job continues independently and can be rejoined by the next document.
      void fillBook(worker,token);
    }catch(error){
      if(valid(token,worker)&&error.name!=='AbortError')partial();
    }
  }

  function observeWorker(worker){
    if(!worker||watchedWorkers.has(worker))return;watchedWorkers.add(worker);
    worker.addEventListener('statechange',()=>{
      if(worker.state==='activated')void inspect('activated',{force:true});
      if(worker.state==='redundant'&&!registration?.active)partial();
    });
  }
  const resume=()=>{
    if(document.hidden)return;
    updateRegistration();
    if(resumeScheduled)return;resumeScheduled=true;
    Promise.resolve().then(()=>{
      resumeScheduled=false;
      // A BFCache document may keep its old HTML while registration.active has
      // advanced, even without delivering controllerchange to this document.
      void inspect('visible',{force:cacheTask?.worker!==registration?.active});
    });
  };
  navigator.serviceWorker.addEventListener('controllerchange',()=>{complete=false;void inspect('controllerchange',{force:true});});
  window.addEventListener('online',()=>{complete=false;void inspect('online');});
  window.addEventListener('pageshow',resume);
  document.addEventListener('visibilitychange',resume);
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(value=>{
    registration=value;
    const observe=()=>{observeWorker(registration.installing);observeWorker(registration.waiting);};
    registration.addEventListener('updatefound',observe);observe();
    void inspect('registered',{force:true});
    updateRegistration();
  }).catch(partial);
})();
