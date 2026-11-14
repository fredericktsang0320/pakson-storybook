'use strict';
// The new shell can already be reading from a real book tap while a previous
// worker finishes updating. Identify this exact shell so activation can retain
// its live media element instead of navigating the current document again.
window.PAKSON_CLIENT_EDITION=21;
if('serviceWorker' in navigator){navigator.serviceWorker.addEventListener('message',event=>{
 if(event.data?.type==='PAKSON_CLIENT_EDITION'&&event.ports?.[0])event.ports[0].postMessage({uiEdition:21,preserveEntry:true,homeRevision:24,entryRevision:23});
});}
