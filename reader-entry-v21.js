'use strict';
(() => {
  if(!document.getElementById('collectionStage'))return;
  const style=document.createElement('style');
  style.textContent='.pakson-reader-frame{position:fixed;inset:0;z-index:10000;width:100%;height:100%;height:100dvh;border:0;background:#f5f0e5;opacity:0;visibility:hidden;pointer-events:none}.pakson-reader-frame.is-open{opacity:1;visibility:visible;pointer-events:auto}body.pakson-reader-open{overflow:hidden}';
  document.head.appendChild(style);
  let frame=null,bookLink=null,opened=false,entry=null,previousOverflow='',openedAt=0,frameRevision='';
  const artRevisions=new Map();let revisionRequest=null;
  const localURL=value=>{const url=new URL(value,location.href);if(url.origin!==location.origin)throw Error('Only local books may open.');return url;};
  function api(){try{return frame?.contentWindow?.paksonReader;}catch{return null;}}
  function announce(text){const node=document.getElementById('collectionStatus');if(node)node.textContent=text;}
  function safeStart(result){if(result?.catch)result.catch(()=>announce('The narration could not start. Return to the library and open the book again.'));}
  function revisionFor(link){return artRevisions.get(link?.dataset.bookId)||'';}
  function discardIdleFrame(){if(opened||!frame)return;api()?.closeToLibrary();frame.remove();frame=null;frameRevision='';}
  function makeFrame(link){
    const revision=revisionFor(link);
    if(frame&&bookLink?.dataset.bookId===link.dataset.bookId&&frameRevision===revision)return frame;
    if(frame){api()?.closeToLibrary();frame.remove();}
    bookLink=link;frameRevision=revision;
    const url=localURL(link.href);url.searchParams.set('embedded','21');if(revision)url.searchParams.set('art_revision',revision);
    frame=document.createElement('iframe');frame.className='pakson-reader-frame';frame.id='paksonReaderFrame';frame.title=link.getAttribute('aria-label')||'Pakson storybook';frame.allow='autoplay; fullscreen';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
    frame.addEventListener('load',()=>{if(opened)safeStart(api()?.openFromCover());else api()?.closeToLibrary();});
    frame.src=url.href;document.body.appendChild(frame);return frame;
  }
  function warm(){const link=document.querySelector('a.book-link[href]:not([aria-disabled="true"])');if(link&&!opened)makeFrame(link);}
  function open(link){
    if(!link?.matches('a.book-link[href]:not([aria-disabled="true"])'))return;
    makeFrame(link);opened=true;openedAt=performance.now();previousOverflow=document.body.style.overflow;
    document.body.classList.add('pakson-reader-open');frame.classList.add('is-open');frame.setAttribute('aria-hidden','false');
    const reader=api();
    {
      // Play the real cover in this parent document's trusted click. WebKit
      // may reject a child-realm play() even for an already loaded same-origin
      // iframe; passing the actual authorised element is consistent on both
      // hot and cold opens, with no silent unlock or second reading tap.
      const node=document.createElement('audio');node.preload='auto';node.setAttribute('playsinline','');node.style.display='none';
      node.src=localURL(link.dataset.entryAudio).href;
      try{const v=JSON.parse(localStorage.getItem('pakson:volume'));node.volume=Number.isFinite(v)?Math.max(0,Math.min(1,v)):.9;}catch{node.volume=.9;}
      document.body.appendChild(node);
      let promise;try{promise=node.play();}catch(error){promise=Promise.reject(error);}
      entry={node,promise:Promise.resolve(promise),claimed:false,bookId:link.dataset.bookId};safeStart(entry.promise);
      if(reader?.state.audio)safeStart(reader.openFromCover(window.PaksonShelfReader.takeEntry()));
    }
    const hash='#read='+encodeURIComponent(link.dataset.bookId);
    if(location.hash!==hash)history.pushState({paksonReader:true},'',hash);
    frame.contentWindow?.focus();
    announce('正在由封面開始朗讀。');
  }
  function hide(){
    if(!opened)return;opened=false;api()?.closeToLibrary();
    if(entry){entry.node.pause();entry.node.removeAttribute('src');entry.node.load();entry.node.remove();entry=null;}
    // WebKit could still route the next touch to the hidden document. Remove
    // the closed frame after stopping its media and before restoring shelf input.
    const closedFrame=frame;frame=null;frameRevision='';closedFrame?.remove();
    document.body.classList.remove('pakson-reader-open');document.body.style.overflow=previousOverflow;
    bookLink?.focus({preventScroll:true});announce('選一本書，由封面開始閱讀。');
  }
  function close(){hide();if(location.hash.startsWith('#read='))history.back();}
  function acceptArtRevisions(values){
    if(!values||typeof values!=='object'||Array.isArray(values))return;
    let changed=false;
    for(const [id,revision]of Object.entries(values)){
      if(!/^[a-z0-9-]+$/.test(id)||!/^[a-f0-9]{16,64}$/.test(revision))continue;
      if(artRevisions.get(id)!==revision){artRevisions.set(id,revision);changed=true;}
      const link=[...document.querySelectorAll('.book-link')].find(n=>n.dataset.bookId===id),image=link?.querySelector('img');
      if(image){const url=localURL(image.src);if(url.searchParams.get('art_revision')!==revision){url.searchParams.set('art_revision',revision);image.src=url.href;}}
    }
    if(changed&&!opened){discardIdleFrame();warm();}
  }
  function refreshArtRevision(){
    if(revisionRequest)return revisionRequest;
    const worker=navigator.serviceWorker?.controller;if(!worker)return Promise.resolve();
    revisionRequest=new Promise(resolve=>{
      const channel=new MessageChannel();let finished=false;
      const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);channel.port1.close();resolve();};
      const timer=setTimeout(finish,1800);
      channel.port1.onmessage=event=>{if(navigator.serviceWorker.controller===worker)acceptArtRevisions(event.data?.bookArtRevisions);finish();};
      channel.port1.onmessageerror=finish;
      try{worker.postMessage({type:'UPGRADE_STATUS'},[channel.port2]);}catch{finish();}
    }).finally(()=>{revisionRequest=null;if(navigator.serviceWorker.controller!==worker)void refreshArtRevision();});return revisionRequest;
  }
  window.PaksonShelfReader={open,close,get frame(){return frame;},get opened(){return opened;},get openedAt(){return openedAt;},get frameArtRevision(){return frameRevision;},get expectedArtRevision(){return revisionFor(bookLink);},refreshArtRevision,takeEntry(){if(!opened||!entry||entry.claimed)return null;entry.claimed=true;return entry;}};
  document.addEventListener('click',event=>{const link=event.target.closest('a.book-link[href]:not([aria-disabled="true"])');if(!link||event.button>0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;event.preventDefault();event.stopImmediatePropagation();open(link);},true);
  window.addEventListener('popstate',()=>{if(!location.hash.startsWith('#read='))hide();});
  window.addEventListener('pagehide',()=>{hide();});
  window.addEventListener('pakson:shelf-ready',()=>{warm();void refreshArtRevision();});
  // A completed install can remain waiting during overlapping browser update
  // jobs. Nudge that exact installed worker once, through its own reverified
  // core gate. Active frames and authorised media are retained on activation.
  const watchedRegistrations=new WeakSet(),watchedInstallingWorkers=new WeakSet(),nudgedWorkers=new WeakSet();
  function nudgeWaiting(registration){
    const worker=registration?.waiting;if(!worker||worker.state!=='installed'||nudgedWorkers.has(worker))return;
    nudgedWorkers.add(worker);const channel=new MessageChannel(),timer=setTimeout(()=>channel.port1.close(),4000);
    channel.port1.onmessage=()=>{clearTimeout(timer);channel.port1.close();};
    try{worker.postMessage({type:'ACTIVATE_VERIFIED_SHELL'},[channel.port2]);}catch{clearTimeout(timer);channel.port1.close();}
  }
  function watchInstalling(registration){
    const worker=registration?.installing;if(!worker||watchedInstallingWorkers.has(worker))return;
    watchedInstallingWorkers.add(worker);
    const changed=()=>{if(worker.state==='installed'){nudgeWaiting(registration);setTimeout(()=>nudgeWaiting(registration),100);}};
    worker.addEventListener('statechange',changed);changed();
  }
  function watchRegistration(registration){
    if(!registration)return;
    if(!watchedRegistrations.has(registration)){
      watchedRegistrations.add(registration);
      registration.addEventListener('updatefound',()=>watchInstalling(registration));
    }
    // HOME may have started this install before the shelf handler arrived.
    watchInstalling(registration);nudgeWaiting(registration);
  }
  void navigator.serviceWorker?.getRegistration().then(watchRegistration).catch(()=>{});
  void navigator.serviceWorker?.ready.then(watchRegistration).catch(()=>{});
  navigator.serviceWorker?.addEventListener('controllerchange',()=>void refreshArtRevision());
  for(const name of ['pageshow','online','focus'])window.addEventListener(name,()=>void refreshArtRevision());
  void refreshArtRevision();
  document.addEventListener('pakson:shelf-ready',warm);new MutationObserver(warm).observe(document.getElementById('shelves'),{childList:true,subtree:true});warm();
})();
