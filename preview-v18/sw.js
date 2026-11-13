'use strict';
const CACHE='pakson-preview-v18-485f7e4ae9b9fb15';
const FILES=["CREDITS.txt", "assets/audio/feedback/correct.m4a", "assets/audio/feedback/incorrect.m4a", "assets/audio/feedback/logo_reward.m4a", "assets/audio/page_00.m4a", "assets/audio/page_01.m4a", "assets/audio/page_02.m4a", "assets/audio/page_03.m4a", "assets/audio/page_04.m4a", "assets/audio/page_05.m4a", "assets/audio/page_06.m4a", "assets/audio/page_07.m4a", "assets/audio/page_08.m4a", "assets/audio/page_09.m4a", "assets/audio/page_10.m4a", "assets/audio/page_11.m4a", "assets/audio/page_12.m4a", "assets/audio/practice/review_01_intro.m4a", "assets/audio/practice/review_01_q01.m4a", "assets/audio/practice/review_01_q02.m4a", "assets/audio/practice/review_01_q03.m4a", "assets/audio/practice/review_02_intro.m4a", "assets/audio/practice/review_02_q01.m4a", "assets/audio/practice/review_02_q02.m4a", "assets/audio/practice/review_03_intro.m4a", "assets/audio/practice/review_03_q01.m4a", "assets/audio/practice/review_04_intro.m4a", "assets/audio/practice/review_04_q01.m4a", "assets/audio/practice/review_05_intro.m4a", "assets/audio/practice/review_05_q01.m4a", "assets/pages/ending_logo_L04.svg", "assets/pages/ending_logo_L04_original.png", "assets/pages/page_00.png", "assets/pages/page_01.png", "assets/pages/page_02.png", "assets/pages/page_03.png", "assets/pages/page_04.png", "assets/pages/page_05.png", "assets/pages/page_06.png", "assets/pages/page_07.png", "assets/pages/page_08.png", "assets/pages/page_09.png", "assets/pages/page_10.png", "assets/pages/page_11.png", "assets/pages/page_12.png", "assets/pages/review_group_01.png", "assets/pages/review_group_02.png", "assets/pages/review_group_03.png", "assets/pages/review_group_04.png", "assets/pages/review_group_05.png", "icon.svg", "index.html", "js/app.js", "js/audio.js", "js/book-data.js", "js/feedback.js", "js/interaction-guard.js", "js/practice-state.js", "js/practice.js", "manifest.webmanifest", "practice.css", "styles.css", "vendor/page-flip.LICENSE.txt", "vendor/page-flip.browser.js", "web.css", "web.js"];
const root=new URL('./',self.location.href);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  try{await cache.addAll(FILES.map(file=>new Request(new URL(file,root),{cache:'reload'})));await self.skipWaiting();}
  catch(error){await caches.delete(CACHE);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('pakson-preview-v18-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==root.origin||!url.pathname.startsWith(root.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const key=new URL(url);key.search='';if(key.pathname===root.pathname)key.pathname+='index.html';
    const saved=await cache.match(key.href);
    if(!saved)return fetch(request);
    const range=request.headers.get('range');
    if(!range)return saved;
    // Safari requests byte ranges even for a fully cached AAC resource.
    const bytes=await saved.arrayBuffer(),match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match)return saved;
    const start=match[1]?Number(match[1]):Math.max(0,bytes.byteLength-Number(match[2]));
    const end=match[1]&&match[2]?Math.min(Number(match[2]),bytes.byteLength-1):bytes.byteLength-1;
    if(start>=bytes.byteLength||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.byteLength}`}});
    const headers=new Headers(saved.headers);headers.set('Content-Range',`bytes ${start}-${end}/${bytes.byteLength}`);headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');
    return new Response(bytes.slice(start,end+1),{status:206,statusText:'Partial Content',headers});
  })());
});
