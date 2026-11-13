'use strict';
(() => {
 const home=document.querySelector('.home-svg');
 function frameHome(){
  if(!home)return;
  const box=home.getBoundingClientRect();
  home.setAttribute('preserveAspectRatio',box.height>box.width?'xMidYMid slice':'xMidYMid meet');
  const matrix=home.getScreenCTM();if(!matrix)return;
  const scaleX=Math.hypot(matrix.a,matrix.b),scaleY=Math.hypot(matrix.c,matrix.d);
  if(!scaleX||!scaleY)return;
  for(const rect of home.querySelectorAll('.home-hit')){
   const x=Number(rect.dataset.baseX),y=Number(rect.dataset.baseY),width=Number(rect.dataset.baseWidth),height=Number(rect.dataset.baseHeight);
   const hitWidth=Math.max(width,44/scaleX),hitHeight=Math.max(height,44/scaleY);
   rect.setAttribute('x',String(x+(width-hitWidth)/2));rect.setAttribute('y',String(y+(height-hitHeight)/2));
   rect.setAttribute('width',String(hitWidth));rect.setAttribute('height',String(hitHeight));
  }
 }
 frameHome();window.addEventListener('resize',frameHome);window.visualViewport?.addEventListener('resize',frameHome);
 const stage=document.getElementById('collectionStage');if(!stage)return;
 const shelves=document.getElementById('shelves'),status=document.getElementById('collectionStatus');
 const portrait=matchMedia('(orientation:portrait)');
 let books=[],scene=null;
 function localPath(path){
  if(typeof path!=='string'||!path.trim())throw Error('Missing book path.');
  const url=new URL(path,location.href),root=new URL('./',location.href);
  if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw Error('Only local books are supported.');
  return url.href;
 }
 function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
 function alignShelfArt(){
  if(!scene)return;
  for(const section of shelves.querySelectorAll('.bookshelf-row')){
   const box=section.getBoundingClientRect(),image=section.querySelector('.shelf-art img');
   if(!box.height||!image)continue;
   const covers=[...section.querySelectorAll('.book-link img')];
   const ground=covers.length?Math.max(...covers.map(cover=>cover.getBoundingClientRect().bottom-box.top)):box.height*.78;
   const board=scene.board_top??scene.shelf_top+scene.shelf_height*.75;
   const scale=ground/(board-scene.shelf_top);
   image.style.top=String(-scene.shelf_top*scale)+'px';image.style.height=String(scene.image_height*scale)+'px';
  }
 }
 function createRow(row,perRow){
  const section=element('section','bookshelf-row');section.dataset.shelfRow=String(row+1);
  const art=element('div','shelf-art');art.setAttribute('aria-hidden','true');
  const image=element('img');image.src='assets/library-v19/'+scene.image;image.alt='';image.draggable=false;
  image.style.top=String(-scene.shelf_top/scene.shelf_height*100)+'%';image.style.height=String(scene.image_height/scene.shelf_height*100)+'%';art.append(image);
  const grid=element('div','shelf-books');
  for(const book of books.slice(row*perRow,(row+1)*perRow)){
   const link=element('a','book-link');link.href=localPath(book.href);link.dataset.bookId=book.id;link.setAttribute('aria-label','閱讀 '+book.title+'，'+book.page_count+' 頁');
   const cover=element('img');cover.src=localPath(book.cover);cover.alt=book.cover_alt||book.title;cover.width=1448;cover.height=1086;cover.loading=row<2?'eager':'lazy';cover.decoding='async';
   link.append(cover,element('span','book-title',book.title));grid.append(link);
  }
  if(books.length===0&&row===0)grid.append(element('p','empty-message','新故事準備中'));
  section.append(art,grid);return section;
 }
 let fillFrame=null;
 function fillViewport(){
  fillFrame=null;if(!scene)return;
  const style=getComputedStyle(stage),header=stage.querySelector('.collection-header').getBoundingClientRect().height;
  const available=stage.clientHeight-header-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
  let guard=0;
  while(shelves.getBoundingClientRect().height<available-.5&&guard++<100){
   shelves.append(createRow(shelves.children.length,portrait.matches?2:3));
  }
  alignShelfArt();
 }
 function scheduleFill(){if(fillFrame===null)fillFrame=requestAnimationFrame(fillViewport);}
 function render(){
  if(!scene)return;
  const firstVisible=[...shelves.querySelectorAll('.book-link')].find(node=>node.getBoundingClientRect().bottom>0)?.dataset.bookId;
  const perRow=portrait.matches?2:3,count=Math.max(2,Math.ceil(books.length/perRow));
  shelves.replaceChildren();
  for(let row=0;row<count;row++)shelves.append(createRow(row,perRow));
  shelves.setAttribute('aria-busy','false');status.textContent=books.length?books.length+' 本圖書。':'新故事準備中。';
  fillViewport();
  if(firstVisible)requestAnimationFrame(()=>{const node=[...shelves.querySelectorAll('.book-link')].find(item=>item.dataset.bookId===firstVisible);node?.scrollIntoView({block:'nearest'});});
 }
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 Promise.all([fetch('./library.json',{signal:controller.signal}),fetch('./scene-layout.json',{signal:controller.signal})]).then(async responses=>{
  if(responses.some(response=>!response.ok))throw Error('The collection could not open.');
  const [catalogue,layout]=await Promise.all(responses.map(response=>response.json()));
  if(catalogue.schema_version!==1||!Array.isArray(catalogue.books))throw Error('Invalid catalogue.');
  scene=layout[stage.dataset.subject];if(!scene)throw Error('Missing shelf artwork.');
  books=catalogue.books.filter(book=>book.subject===stage.dataset.subject);
  for(const book of books){if(!book.id||!book.title||!Number.isInteger(book.page_count))throw Error('Invalid book.');localPath(book.href);localPath(book.cover);}
  render();
 }).catch(()=>{shelves.replaceChildren(element('p','shelf-loading','暫時未能打開典藏，請稍後再試。'));shelves.setAttribute('aria-busy','false');status.textContent='典藏未能載入。';}).finally(()=>clearTimeout(timer));
 portrait.addEventListener('change',render);
 new ResizeObserver(scheduleFill).observe(stage);
})();
