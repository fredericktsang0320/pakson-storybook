'use strict';
(() => {
  // Leaving the book cancels both narration and any pending practice reward.
  document.addEventListener('click',event=>{
    if(event.target.closest('#libraryLink')){
      window.paksonReader?.state.audio?.navigation();
      window.PaksonPractice?.suspend();window.PaksonFeedback?.cancel('library');
    }
  });
  if(!('serviceWorker' in navigator))return;
  const label=()=>document.getElementById('offlineStatus');
  navigator.serviceWorker.register('sw.js',{scope:'./'}).then(async registration=>{
    if(registration.active&&!registration.installing){if(label())label().textContent='Saved for offline reading.';}
    const worker=registration.installing||registration.waiting;
    worker?.addEventListener('statechange',()=>{
      if(worker.state==='activated'&&label())label().textContent='Saved for offline reading.';
      if(worker.state==='redundant'&&label())label().textContent='Offline saving will retry the next time you open the book.';
    });
  }).catch(()=>{if(label())label().textContent='You are reading online. Open the book again to save it for offline use.';});
})();
