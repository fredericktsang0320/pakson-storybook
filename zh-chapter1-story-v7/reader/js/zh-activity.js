'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const shell=document.querySelector('#bookShell');
 const activity=document.querySelector('#zhActivity');
 const status=document.querySelector('#bookStatus');
 let current='',video=null,videoEvents=null,clearWordCue=null;
 const sparkles=document.createElement('div');
 sparkles.className='logo-sparkles';
 sparkles.setAttribute('aria-hidden','true');
 document.body.append(sparkles);
 const stars=window.PaksonStarBurst?.create(sparkles,()=>{
  const rect=shell.getBoundingClientRect();
  return {x:rect.left+rect.width*.50,y:rect.top+rect.height*.155};
 });
 function bindWordCue(reader,page){
  const node=reader.state.audio.node;
  const ring=document.createElement('span');
  ring.className='read-word-ring';
  ring.hidden=true;
  ring.setAttribute('aria-hidden','true');
  ring.innerHTML='<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M87 21C75 2 36 0 16 22 1 38 0 71 19 87 39 103 79 96 91 75 102 55 97 29 84 16"/></svg>';
  activity.append(ring);
  const listeners=new AbortController();
  let frame=0,active=null;
  function paint(){
   if(frame)cancelAnimationFrame(frame);
   frame=0;
   const reading=node.getAttribute('src')===page.audio&&!node.paused&&!node.ended&&!reader.state.turning&&!document.hidden;
   const index=reading?page.word_cues.findIndex(cue=>node.currentTime>=cue.start&&node.currentTime<cue.end):-1;
   const cue=page.word_cues[index];
   if(cue!==active){
    active=cue;
    ring.hidden=!cue;
    if(cue){
     const [x,y,w,h]=cue.rect;
     Object.assign(ring.style,{left:x+'%',top:y+'%',width:w+'%',height:h+'%'});
     ring.dataset.word=cue.word;
    }else delete ring.dataset.word;
   }
   if(reading)frame=requestAnimationFrame(paint);
  }
  for(const event of ['playing','pause','seeking','seeked','timeupdate','ended','emptied']){
   node.addEventListener(event,paint,{signal:listeners.signal});
  }
  document.addEventListener('visibilitychange',paint,{signal:listeners.signal});
  paint();
  return ()=>{listeners.abort();cancelAnimationFrame(frame);ring.remove();};
 }
 function update(){
  const reader=window.paksonReader;
  if(!reader?.state.ready||reader.state.turning){
   video?.pause();
   stars?.clear();
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
  shell.toggleAttribute('data-zh-quiz',page.targets?.some(target=>!target.open)??false);
  videoEvents?.abort();
  clearWordCue?.();
  clearWordCue=null;
  stars?.clear();
  activity.replaceChildren();
  video=null;
  if(page.word_cues?.length)clearWordCue=bindWordCue(reader,page);
  if(page.page_type==='closing_logo'&&stars){
   const logo=document.createElement('button');
   logo.type='button';
   logo.className='logo-star-button';
   logo.setAttribute('aria-label','撳柏宸頭像放星星');
   logo.addEventListener('click',()=>stars.burst());
   activity.append(logo);
  }
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
    if(target.correct){
     button.setAttribute('aria-pressed','true');
     const selected=activity.querySelectorAll('[aria-pressed="true"]').length;
     if(selected===page.targets.filter(choice=>choice.correct).length)window.PaksonProgress?.mark(reader.state.book,page,'quiz');
    }
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
