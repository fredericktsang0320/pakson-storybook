'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const shell=document.querySelector('#bookShell');
 const activity=document.querySelector('#zhActivity');
 const status=document.querySelector('#bookStatus');
 let current='',video=null,videoEvents=null;
 function update(){
  const reader=window.paksonReader;
  if(!reader?.state.ready||reader.state.turning){
   video?.pause();
   return;
  }
  const page=reader.state.book.pages[reader.state.index];
  if(!page)return;
  if(page.page_id===current){
   if(video?.paused&&!video.ended&&reader.state.audio.state!=='paused'){
    video.play().catch(()=>{});
   }
   return;
  }
  current=page.page_id;
  videoEvents?.abort();
  activity.replaceChildren();
  video=null;
  if(page.video){
   video=document.createElement('video');
   video.muted=true;
   video.playsInline=true;
   video.src=page.video;
   video.setAttribute('aria-label','自動示範筆順');
   activity.append(video);
   const voice=reader.state.audio.node;
   const clip=video;
   videoEvents=new AbortController();
   const syncVideo=()=>{
    if(reader.state.turning||voice.getAttribute('src')!==page.audio)return;
    if(clip.readyState&&(Math.abs(clip.currentTime-voice.currentTime)>.3||voice.ended)){
     clip.currentTime=Math.min(voice.currentTime,clip.duration);
    }
    if(voice.paused||voice.ended)clip.pause();
    else if(clip.paused&&!clip.ended)clip.play().catch(()=>{});
   };
   for(const event of ['playing','timeupdate','pause','ended']){
    voice.addEventListener(event,syncVideo,{signal:videoEvents.signal});
   }
   clip.addEventListener('loadedmetadata',syncVideo,{signal:videoEvents.signal});
   video.play().catch(()=>{});
  }
  for(const target of page.targets??[]){
   const button=document.createElement('button');
   button.className='practice-option';
   button.type='button';
   button.setAttribute('aria-label',target.label);
   const [x,y,w,h]=target.rect;
   Object.assign(button.style,{left:x+'%',top:y+'%',width:w+'%',height:h+'%'});
   button.addEventListener('click',()=>{
    if(target.open){reader.turnTo(1,{autoplay:true});return;}
    if(target.correct)button.setAttribute('aria-pressed','true');
    status.textContent=target.correct?'啱喇。':'再試吓。';
    window.PaksonFeedback?.request(target.correct?'correct':'incorrect',{
     valid:()=>current===page.page_id&&!reader.state.turning,
     ready:()=>!document.querySelector('#bookDialog').open
    });
   });
   activity.append(button);
  }
 }
 new MutationObserver(update).observe(shell,{attributes:true,attributeFilter:['class','data-reader-page','aria-busy']});
 update();
});
