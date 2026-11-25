'use strict';
(() => {
 const stage=document.getElementById('collectionStage');if(!stage)return;
 const room=stage.querySelector('.collection-room'),art=document.getElementById('shelfArt'),shelves=document.getElementById('shelves'),status=document.getElementById('collectionStatus'),heading=document.getElementById('collectionHeading'),home=document.getElementById('homeLink');
 const previous=document.getElementById('shelfPrevious');
 const next=document.getElementById('shelfNext');
 let catalogue=[],layout=null,currentPage=0;
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
 function pageCount(){
  return Math.max(1,Math.ceil(catalogue.length/layout.slots.length));
 }

 function pageFromLocation(){
  const raw=new URL(location.href).searchParams.get('page');
  if(!raw||!/^\d+$/.test(raw))return 1;
  return Math.min(pageCount(),Math.max(1,Number(raw)));
 }

 function render(){
  currentPage=pageFromLocation();
  stage.dataset.shelfPage=String(currentPage);
  const pageSize=layout.slots.length;
  const offset=(currentPage-1)*pageSize;
  const books=catalogue.slice(offset,offset+pageSize);
  shelves.replaceChildren();
  books.forEach((book,index)=>{
   const a=bookLink(book,index);
   place(a,layout.slots[index]);
   shelves.append(a);
  });
  if(!books.length){
   const message=document.createElement('p');
   message.className='empty-message';
   message.textContent='新故事準備中';
   const first=layout.slots[0],second=layout.slots[1]||first;
   place(message,{x:first.x,y:first.y,width:second.x+second.width-first.x,height:first.height});
   shelves.append(message);
  }
  previous.hidden=currentPage<=1;
  next.hidden=currentPage>=pageCount();
  shelves.setAttribute('aria-busy','false');
  status.textContent=books.length?'第 '+currentPage+' 頁，共 '+pageCount()+' 頁，'+catalogue.length+' 本圖書。':'新故事準備中。';
  window.dispatchEvent(new CustomEvent('pakson:shelf-ready',{detail:{subject,count:books.length,slots:pageSize,page:currentPage}}));
 }

 function goToPage(target,button){
  if(!layout||target<1||target>pageCount()||target===currentPage)return;
  const url=new URL(location.href);
  if(target===1)url.searchParams.delete('page');
  else url.searchParams.set('page',String(target));
  history.pushState(null,'',url);
  render();
  window.scrollTo(0,0);
  if(button.hidden){
   const remaining=button===previous?next:previous;
   if(!remaining.hidden)remaining.focus({preventScroll:true});
  }
 }
 previous.addEventListener('click',()=>goToPage(currentPage-1,previous));
 next.addEventListener('click',()=>goToPage(currentPage+1,next));
 window.addEventListener('popstate',()=>{
  if(layout&&pageFromLocation()!==currentPage)render();
 });
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 Promise.all([fetch('./catalogue.json',{signal:controller.signal}),fetch('./scene-layout-en-v25.json',{signal:controller.signal})]).then(async responses=>{
  if(responses.some(response=>!response.ok))throw Error('The collection could not open.');
  const [data,scene]=await Promise.all(responses.map(response=>response.json()));
  if(data.schema_version!==1||!Array.isArray(data.books)||scene.schema_version!==2||!scene.width||!scene.height||!Array.isArray(scene.slots)||!scene.slots.length)throw Error('Invalid shelf catalogue.');
  for(const book of data.books){if(!book.id||!book.title||!Number.isInteger(book.page_count))throw Error('Invalid book.');localPath(book.href);localPath(book.cover);}
  layout=scene;
  catalogue=data.books.filter(book=>book.subject===subject);
  room.style.setProperty('--shelf-width',layout.width);
  room.style.setProperty('--shelf-height',layout.height);
  art.src=localPath(layout.image);
  art.width=layout.width;
  art.height=layout.height;
  place(heading,layout.title);
  place(home,layout.home);
  render();
 }).catch(error=>{shelves.replaceChildren();const message=document.createElement('p');message.className='shelf-error';message.textContent='暫時未能打開書架，請稍後再試。';shelves.append(message);shelves.setAttribute('aria-busy','false');status.textContent='書架未能載入。';console.error(error);}).finally(()=>clearTimeout(timer));
})();
