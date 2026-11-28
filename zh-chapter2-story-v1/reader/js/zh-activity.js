'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const shell=document.querySelector('#bookShell');
 const activity=document.querySelector('#zhActivity');
 const status=document.querySelector('#bookStatus');
 let current='',video=null,videoEvents=null,syncVideo=null,clearWordCue=null,clearExercise=null;
 const sparkles=document.createElement('div');
 sparkles.className='logo-sparkles';
 sparkles.setAttribute('aria-hidden','true');
 document.body.append(sparkles);
 const celebration=document.createElement('canvas');
 celebration.hidden=true;
 celebration.className='logo-sparkles';
 Object.assign(celebration.style,{width:'100%',height:'100%'});
 celebration.setAttribute('aria-hidden','true');
 document.body.append(celebration);
 const chapterEnding=window.PaksonZhCelebrations.create(celebration,()=>shell.getBoundingClientRect());
 window.addEventListener('pagehide',chapterEnding.clear);
 window.addEventListener('resize',chapterEnding.clear);
 const stars=window.PaksonStarBurst?.create(sparkles,()=>{
  const rect=shell.getBoundingClientRect();
  return {x:rect.left+rect.width*.50,y:rect.top+rect.height*.155};
 });
 function bindWordCue(reader,page){
  const drawSeconds=.34,holdSeconds=1.45;
  const media=reader.state.audio.node;
  const source=new URL(page.audio,document.baseURI).href;
  const cues=page.word_cues.map((cue,index)=>({
   ...cue,until:Math.min(cue.end+holdSeconds,page.word_cues[index+1]?.start??Infinity)
  }));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const ring=document.createElement('canvas');
  ring.className='read-word-ring';
  ring.hidden=true;
  ring.setAttribute('aria-hidden','true');
  activity.append(ring);
  const ink=ring.getContext('2d');
  if(!ink){ring.remove();return null;}

  const listeners=new AbortController();
  let frame=0,active=null,endedAt=null,stroke=null,painted=-1;
  // A single pen stroke with sharp ends and a gradually varying pressure.
  const outline=[
   [[.88,.09],[.72,-.015],[.26,.023],[.11,.143]],
   [[.11,.143],[.015,.245],[.015,.60],[.047,.755]],
   [[.047,.755],[.071,.950],[.30,.967],[.55,.949]],
   [[.55,.949],[.79,.953],[.93,.872],[.961,.662]],
   [[.961,.662],[.991,.464],[.976,.282],[.921,.147]]
  ];
  function buildStroke(){
   stroke=null;
   const {width,height}=ring.getBoundingClientRect();
   if(!width||!height)return;
   const ratio=Math.min(devicePixelRatio||1,2);
   ring.width=Math.max(1,Math.ceil(width*ratio));
   ring.height=Math.max(1,Math.ceil(height*ratio));
   ink.setTransform(ring.width/width,0,0,ring.height/height,0,0);
   ink.lineJoin='round';
   const brush=Math.max(4.8,Math.min(width*.061,height*.14,19));
   ink.lineWidth=Math.min(5,brush*.35);
   ink.strokeStyle='#ffeed6';
   const gradient=ink.createLinearGradient(0,0,width*.80,height);
   gradient.addColorStop(0,'#d12424');
   gradient.addColorStop(.48,'#ab101b');
   gradient.addColorStop(1,'#e13324');
   ink.fillStyle=gradient;
   const spine=[];
   let travelled=0;
   for(const [start,c1,c2,end] of outline){
    for(let step=spine.length?1:0;step<=24;step++){
     const t=step/24,u=1-t;
     const a=u*u*u,b=3*u*u*t,c=3*u*t*t,d=t*t*t;
     const x=(a*start[0]+b*c1[0]+c*c2[0]+d*end[0])*width;
     const y=(a*start[1]+b*c1[1]+c*c2[1]+d*end[1])*height;
     const prev=spine.at(-1);
     if(prev)travelled+=Math.hypot(x-prev.x,y-prev.y);
     spine.push({x,y,distance:travelled});
    }
   }
   const edges=spine.map((p,i)=>{
    const t=p.distance/travelled;
    const a=spine[Math.max(0,i-1)],b=spine[Math.min(spine.length-1,i+1)];
    const length=Math.hypot(b.x-a.x,b.y-a.y)||1;
    const nx=(a.y-b.y)/length,ny=(b.x-a.x)/length;
    const weight=brush*Math.min(1,.11+13*t,.06+11*(1-t))*(.79+.2*Math.sin(13*t-.8)+.07*Math.sin(41*t));
    const left=weight*(.56+.055*Math.sin(i*2.4));
    const right=weight*(.54+.062*Math.cos(i*2.9));
    return {t,outer:[p.x+nx*left,p.y+ny*left],inner:[p.x-nx*right,p.y-ny*right]};
   });
   stroke={width,height,edges};
   painted=-1;
  }
  function draw(progress){
   if(!stroke||progress===painted)return;
   painted=progress;
   const {edges,width,height}=stroke;
   const finished=edges.findIndex(point=>point.t>progress);
   const visible=finished<0?edges:edges.slice(0,finished);
   ink.clearRect(0,0,width,height);
   if(visible.length>1){
    ink.beginPath();
    ink.moveTo(...visible[0].outer);
    for(const point of visible.slice(1))ink.lineTo(...point.outer);
    for(let i=visible.length-1;i>=0;i--)ink.lineTo(...visible[i].inner);
    ink.closePath();
    ink.stroke();
    ink.fill();
   }
  }
  function paint(now=performance.now()){
   cancelAnimationFrame(frame);
   frame=0;
   const audio=reader.state.audio;
   const matched=audio.page?.page_id===page.page_id&&media.src===source&&!reader.state.turning;
   const tracking=matched&&!media.seeking&&(!media.paused||media.ended);
   if(tracking&&media.ended)endedAt??=now;
   else endedAt=null;
   const time=media.currentTime+(endedAt===null?0:(now-endedAt)/1000*media.playbackRate);
   const next=tracking?cues.find(item=>item.start<=time&&time<item.until):null;
   if((next||null)!==active){
    active=next||null;
    ring.hidden=!active;
    if(active){
     const [x,y,w,h]=active.rect;
     const padX=Math.min(2.9,w*.14),padY=Math.min(2.75,h*.19);
     const left=Math.max(0,x-padX),top=Math.max(0,y-padY);
     const width=Math.min(100,x+w+padX)-left,height=Math.min(100,y+h+padY)-top;
     Object.assign(ring.style,{left:left+'%',top:top+'%',width:width+'%',height:height+'%'});
     ring.dataset.word=active.word;
     buildStroke();
    }else delete ring.dataset.word;
   }
   if(active)draw(reduced.matches?1:Math.min(1,(time-active.start)/drawSeconds));
   if(tracking&&(!media.ended||active)&&!document.hidden)frame=requestAnimationFrame(paint);
  }
  const resize=new ResizeObserver(([entry])=>{
   const {width,height}=entry.contentRect;
   if(active&&(!stroke||Math.abs(stroke.width-width)>.1||Math.abs(stroke.height-height)>.1)){
    buildStroke();
    paint();
   }
  });
  resize.observe(ring);
  for(const event of ['play','playing','pause','seeking','seeked','timeupdate','ended','emptied']){
   media.addEventListener(event,()=>paint(),{signal:listeners.signal});
  }
  document.addEventListener('visibilitychange',()=>paint(),{signal:listeners.signal});
  window.addEventListener('pageshow',()=>paint(),{signal:listeners.signal});
  paint();
  return ()=>{listeners.abort();resize.disconnect();cancelAnimationFrame(frame);ring.remove();};
 }
 function update(){
  const reader=window.paksonReader;
  if(!reader?.state.ready||reader.state.turning){
   video?.pause();
   chapterEnding.clear();
   stars?.clear();
   return;
  }
  const page=reader.state.book.pages[reader.state.index];
  if(!page)return;
  if(page.page_id===current){
   syncVideo?.();
   return;
  }
  current=page.page_id;
  videoEvents?.abort();
  if(video){video.removeAttribute('src');video.load();}
  syncVideo=null;
  clearWordCue?.();
  clearWordCue=null;
  stars?.clear();
  chapterEnding.clear();
  clearExercise?.();
  clearExercise=null;
  activity.replaceChildren();
  video=null;
  if(page.word_cues?.length)clearWordCue=bindWordCue(reader,page);
  if(page.page_type==='closing_logo'&&stars){
   const logo=document.createElement('button');
   logo.type='button';
   logo.className='zh-activity-target logo-star-button';
   logo.setAttribute('aria-label','撳柏宸頭像睇尾頁動效');
   logo.addEventListener('click',()=>{
    if(page.closing_effect)chapterEnding.burst(page.closing_effect);
    else stars.burst();
   });
   activity.append(logo);
  }
  if(page.video){
   video=document.createElement('video');
   video.muted=true;
   video.playsInline=true;
   video.preload='auto';
   video.hidden=true;
   video.poster=page.image;
   video.src=page.video;
   video.setAttribute('aria-label','自動示範筆順');
   activity.append(video);
   const voice=reader.state.audio.node;
   const clip=video;
   videoEvents=new AbortController();
   clip.addEventListener('loadeddata',()=>{clip.hidden=false;},{signal:videoEvents.signal,once:true});
   syncVideo=()=>{
    if(reader.state.turning||voice.getAttribute('src')!==page.audio){clip.pause();return;}
    if(clip.playbackRate!==voice.playbackRate)clip.playbackRate=voice.playbackRate;
    if(clip.readyState&&Number.isFinite(clip.duration)){
     const at=Math.min(voice.currentTime,clip.duration);
     if(Math.abs(clip.currentTime-at)>.35)clip.currentTime=at;
    }
    if(voice.paused||voice.ended)clip.pause();
    else if(clip.paused&&!clip.ended)void clip.play().catch(()=>{});
   };
   for(const event of ['playing','timeupdate','pause','ended','ratechange','seeked']){
    voice.addEventListener(event,syncVideo,{signal:videoEvents.signal});
   }
   clip.addEventListener('loadedmetadata',syncVideo,{signal:videoEvents.signal});
   syncVideo();
  }
  if(page.exercise){
   clearExercise=window.PaksonZhExercise.mount(activity,page.exercise,{
    feedback(correct){
     status.textContent=correct?'啱喇。':'再試吓。';
     window.PaksonFeedback?.request(correct?'correct':'incorrect',{
      valid:()=>current===page.page_id&&!reader.state.turning,
      ready:()=>!document.querySelector('#bookDialog').open
     });
    },
    complete(){window.PaksonProgress?.mark(reader.state.book,page,'quiz');}
   });
  }
  for(const target of page.targets??[]){
   const button=document.createElement('button');
   button.className='zh-activity-target';
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
