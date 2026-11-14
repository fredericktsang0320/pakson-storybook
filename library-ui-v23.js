'use strict';
(() => {
 const stage=document.getElementById('collectionStage');if(!stage)return;
 const room=stage.querySelector('.collection-room'),art=document.getElementById('shelfArt'),shelves=document.getElementById('shelves'),status=document.getElementById('collectionStatus'),heading=document.getElementById('collectionHeading'),home=document.getElementById('homeLink');
 let catalogue=[],layout=null;
 const subject=stage.dataset.subject;
 function localPath(path){
  if(typeof path!=='string'||!path.trim())throw Error('Missing book path.');
  const url=new URL(path,location.href),root=new URL('./',location.href);
  if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw Error('Only local books are supported.');
  return url.href;
 }
 function place(node,box){
  node.style.left=String(box.x/layout.width*100)+'%';node.style.top=String(box.y/layout.height*100)+'%';
  node.style.width=String(box.width/layout.width*100)+'%';node.style.height=String(box.height/layout.height*100)+'%';
 }
 function bookLink(book,index){
  const a=document.createElement('a');a.className='book-link';a.href=localPath(book.href);a.dataset.bookId=book.id;if(book.entry_audio)a.dataset.entryAudio=localPath(book.entry_audio);a.setAttribute('aria-label','閱讀 '+book.title+'，'+book.page_count+' 頁');
  const image=document.createElement('img');image.src=localPath(book.cover);image.alt=book.cover_alt||book.title;image.width=1448;image.height=1086;image.draggable=false;image.decoding='async';image.loading=index<2?'eager':'lazy';
  const title=document.createElement('span');title.className='book-title';title.textContent=book.title;a.append(image,title);return a;
 }
 function render(){
  const books=catalogue.filter(book=>book.subject===subject);shelves.replaceChildren();stage.querySelector('.collection-overflow')?.remove();
  room.style.setProperty('--shelf-width',layout.width);room.style.setProperty('--shelf-height',layout.height);
  art.src=localPath(layout.image);art.width=layout.width;art.height=layout.height;
  heading.textContent=subject==='english'?'English':'中文';place(heading,layout.title);place(home,layout.home);
  let overflow=null;
  books.forEach((book,index)=>{
   const a=bookLink(book,index);
   if(index<layout.slots.length){place(a,layout.slots[index]);shelves.append(a);}
   else{
    if(!overflow){overflow=document.createElement('div');overflow.className='collection-overflow';overflow.setAttribute('aria-label','更多圖書');stage.append(overflow);}
    overflow.append(a);
   }
  });
  // A published catalogue should receive a longer single illustration before
  // exceeding its mapped slots. Preserve access if an oversized list is supplied.
  if(overflow)console.warn('The catalogue needs an extended whole shelf illustration. Extra titles remain accessible below.');
  if(!books.length){const message=document.createElement('p');message.className='empty-message';message.textContent='新故事準備中';const first=layout.slots[0],second=layout.slots[1]||first;place(message,{x:first.x,y:first.y,width:second.x+second.width-first.x,height:first.height});shelves.append(message);}
  shelves.setAttribute('aria-busy','false');status.textContent=books.length?books.length+' 本圖書。':'新故事準備中。';
  window.dispatchEvent(new CustomEvent('pakson:shelf-ready',{detail:{subject,count:books.length,slots:layout.slots.length}}));
 }
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 Promise.all([fetch('./catalogue.json',{signal:controller.signal}),fetch('./scene-layout-v21.json',{signal:controller.signal})]).then(async responses=>{
  if(responses.some(response=>!response.ok))throw Error('The collection could not open.');
  const [data,scene]=await Promise.all(responses.map(response=>response.json()));
  if(data.schema_version!==1||!Array.isArray(data.books)||scene.schema_version!==2||!scene.width||!scene.height||!Array.isArray(scene.slots)||!scene.slots.length)throw Error('Invalid shelf catalogue.');
  for(const book of data.books){if(!book.id||!book.title||!Number.isInteger(book.page_count))throw Error('Invalid book.');localPath(book.href);localPath(book.cover);}
  localPath(scene.image);catalogue=data.books;layout=scene;render();
 }).catch(error=>{shelves.replaceChildren();const message=document.createElement('p');message.className='shelf-error';message.textContent='暫時未能打開書架，請稍後再試。';shelves.append(message);shelves.setAttribute('aria-busy','false');status.textContent='書架未能載入。';console.error(error);}).finally(()=>clearTimeout(timer));
})();
