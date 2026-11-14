'use strict';
(() => {
  if(!document.getElementById('collectionStage'))return;
  const style=document.createElement('style');
  style.textContent='.pakson-reader-frame{position:fixed;inset:0;z-index:10000;width:100%;height:100%;height:100dvh;border:0;background:#f5f0e5;opacity:0;visibility:hidden;pointer-events:none}.pakson-reader-frame.is-open{opacity:1;visibility:visible;pointer-events:auto}body.pakson-reader-open{overflow:hidden}';
  document.head.appendChild(style);
  let frame=null,bookLink=null,opened=false,entry=null,previousOverflow='',openedAt=0;
  const localURL=value=>{const url=new URL(value,location.href);if(url.origin!==location.origin)throw Error('Only local books may open.');return url;};
  function api(){try{return frame?.contentWindow?.paksonReader;}catch{return null;}}
  function announce(text){const node=document.getElementById('collectionStatus');if(node)node.textContent=text;}
  function safeStart(result){if(result?.catch)result.catch(()=>announce('The narration could not start. Return to the library and open the book again.'));}
  function makeFrame(link){
    if(frame&&bookLink?.dataset.bookId===link.dataset.bookId)return frame;
    if(frame){api()?.closeToLibrary();frame.remove();}
    bookLink=link;
    const url=localURL(link.href);url.searchParams.set('embedded','21');
    frame=document.createElement('iframe');frame.className='pakson-reader-frame';frame.id='paksonReaderFrame';frame.title=link.getAttribute('aria-label')||'Pakson storybook';frame.allow='autoplay; fullscreen';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
    frame.addEventListener('load',()=>{if(opened)safeStart(api()?.openFromCover());else api()?.closeToLibrary();});
    frame.src=url.href;document.body.appendChild(frame);return frame;
  }
  function warm(){const link=document.querySelector('.book-link');if(link&&!opened)makeFrame(link);}
  function open(link){
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
    frame?.classList.remove('is-open');frame?.setAttribute('aria-hidden','true');document.body.classList.remove('pakson-reader-open');document.body.style.overflow=previousOverflow;
    bookLink?.focus({preventScroll:true});announce('選一本書，由封面開始閱讀。');
  }
  function close(){hide();if(location.hash.startsWith('#read='))history.back();}
  window.PaksonShelfReader={open,close,get frame(){return frame;},get opened(){return opened;},get openedAt(){return openedAt;},takeEntry(){if(!opened||!entry||entry.claimed)return null;entry.claimed=true;return entry;}};
  document.addEventListener('click',event=>{const link=event.target.closest('.book-link');if(!link||event.button>0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;event.preventDefault();event.stopImmediatePropagation();open(link);},true);
  window.addEventListener('popstate',()=>{if(!location.hash.startsWith('#read='))hide();});
  window.addEventListener('pagehide',()=>{hide();});
  document.addEventListener('pakson:shelf-ready',warm);new MutationObserver(warm).observe(document.getElementById('shelves'),{childList:true,subtree:true});warm();
})();
