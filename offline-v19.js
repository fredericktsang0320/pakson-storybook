'use strict';
(() => {
  document.addEventListener('click',event=>{
    if(event.target.closest('#libraryLink')){
      window.paksonReader?.state.audio?.navigation();
      window.PaksonPractice?.suspend();window.PaksonFeedback?.cancel('library');
    }
  });
  if(!('serviceWorker' in navigator))return;
  const label=()=>document.getElementById('offlineStatus');
  const status=text=>{if(label())label().textContent=text;};
  function query(worker,type){
    return new Promise((resolve,reject)=>{
      if(!worker)return reject(new Error('No active offline reader.'));
      const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(new Error('Offline check timed out.'));},30000);
      channel.port1.onmessage=event=>{if(event.data.type==='PROGRESS')return;clearTimeout(timer);channel.port1.close();event.data.error?reject(new Error(event.data.error)):resolve(event.data);};
      worker.postMessage({type},[channel.port2]);
    });
  }
  let checking=false;
  async function check(registration){
    if(checking)return;checking=true;
    try{
      const result=await query(registration.active,'CHECK_BOOK');
      status(result.complete?'Saved for offline reading.':'Saving your book for offline reading…');
    }catch{status('You can read online. Offline saving will retry when you reopen the book.');}
    finally{checking=false;}
  }
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(registration=>{
    if(registration.active)void check(registration);
    const observe=()=>{
      const worker=registration.installing||registration.waiting;
      worker?.addEventListener('statechange',()=>{
        if(worker.state==='activated')void check(registration);
        if(worker.state==='redundant')status('Offline saving will retry when you reopen the book.');
      });
    };
    registration.addEventListener('updatefound',observe);observe();
    navigator.serviceWorker.addEventListener('controllerchange',()=>{void check(registration);});
    void registration.update().catch(()=>{});
  }).catch(()=>{status('You are reading online. Open the book again to save it for offline use.');});
})();
