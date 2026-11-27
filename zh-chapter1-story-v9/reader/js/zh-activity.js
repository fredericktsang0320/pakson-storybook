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
  const drawSeconds=.34, holdSeconds=1.45;
  const media=reader.state.audio.node;
  const cues=page.word_cues.map((cue,index)=>({
   ...cue, until:Math.min(cue.end+holdSeconds,page.word_cues[index+1]?.start??Infinity)
  }));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const ring=document.createElement('span');
  ring.className='read-word-ring';
  ring.hidden=true;
  ring.setAttribute('aria-hidden','true');
  ring.innerHTML=`<svg>
   <defs>
    <linearGradient id="zh-brush-ink" x2="80%" y2="100%">
     <stop stop-color="#ba2a22"/><stop offset=".48" stop-color="#9e171c"/><stop offset="1" stop-color="#c2392b"/>
    </linearGradient>
    <mask id="zh-brush-reveal" x="0" y="0" width="100%" height="100%">
     <path fill="none" stroke="white"/>
    </mask>
   </defs>
   <path fill="url(#zh-brush-ink)" mask="url(#zh-brush-reveal)"/>
  </svg>`;
  activity.append(ring);
  const svg=ring.firstElementChild;
  const reveal=svg.querySelector('mask path'),ink=svg.lastElementChild;
  const listeners=new AbortController();
  let frame=0,active=null,length=0,endedAt=null;

  function shapeStroke(){
   const {width:w,height:h}=ring.getBoundingClientRect();
   if(!w||!h)return;
   const point=(x,y)=>`${x*w} ${y*h}`;
   svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
   reveal.setAttribute('d',`M${point(.88,.09)}
    C${point(.72,-.015)} ${point(.26,.023)} ${point(.11,.143)}
    C${point(.015,.245)} ${point(.015,.60)} ${point(.047,.755)}
    C${point(.071,.950)} ${point(.30,.967)} ${point(.55,.949)}
    C${point(.79,.953)} ${point(.93,.872)} ${point(.961,.662)}
    C${point(.991,.464)} ${point(.976,.282)} ${point(.921,.147)}`);
   length=reveal.getTotalLength();
   if(!length)return;
   const brush=Math.max(2.8,Math.min(w*.032,h*.071,8.7));
   const outer=[],inner=[];
   for(let index=0;index<=104;index++){
    const t=index/104, distance=length*t;
    const p=reveal.getPointAtLength(distance);
    const a=reveal.getPointAtLength(Math.max(0,distance-1));
    const b=reveal.getPointAtLength(Math.min(length,distance+1));
    const chord=Math.hypot(b.x-a.x,b.y-a.y)||1;
    const nx=(a.y-b.y)/chord, ny=(b.x-a.x)/chord;
    const pressure=Math.min(1,.11+13*t,.06+11*(1-t))*(.79+.2*Math.sin(13*t-.8)+.07*Math.sin(41*t));
    const edge=(width,side)=>`${(p.x+nx*width*side).toFixed(2)} ${(p.y+ny*width*side).toFixed(2)}`;
    outer.push(edge(brush*pressure*(.56+.055*Math.sin(index*2.4)),1));
    inner.push(edge(brush*pressure*(.54+.062*Math.cos(index*2.9)),-1));
   }
   ink.setAttribute('d',`M${outer.join('L')}L${inner.reverse().join('L')}Z`);
   // A butt cap reveals the actual taper in the painted outline at both ends.
   reveal.setAttribute('stroke-width',String(brush*1.6));
   reveal.style.strokeDasharray=`${length} ${length}`;
  }
  function paint(now=performance.now()){
   cancelAnimationFrame(frame);
   frame=0;
   const tracking=media.getAttribute('src')===page.audio&&!media.seeking&&!reader.state.turning&&!document.hidden&&(!media.paused||media.ended);
   if(tracking&&media.ended)endedAt??=now;
   else endedAt=null;
   const time=media.currentTime+(endedAt===null?0:(now-endedAt)/1000*media.playbackRate);
   const cue=tracking?cues.find(item=>item.start<=time&&time<item.until):null;
   if((cue||null)!==active){
    active=cue||null;
    ring.hidden=!active;
    if(active){
     const [x,y,w,h]=active.rect;
     // Leave room for the brush outside the inked glyphs, including near page edges.
     const padX=Math.min(2.25,w*.105),padY=Math.min(2.1,h*.15);
     const left=Math.max(0,x-padX),top=Math.max(0,y-padY);
     const width=Math.min(100,x+w+padX)-left,height=Math.min(100,y+h+padY)-top;
     Object.assign(ring.style,{left:left+'%',top:top+'%',width:width+'%',height:height+'%'});
     ring.dataset.word=active.word;
     shapeStroke();
    }else delete ring.dataset.word;
   }
   if(active){
    const progress=reduced.matches?1:Math.min(1,(time-active.start)/drawSeconds);
    reveal.style.strokeDashoffset=String(length*(1-progress));
   }
   if(tracking&&(!media.ended||active))frame=requestAnimationFrame(paint);
  }
  const resize=new ResizeObserver(()=>{if(active){shapeStroke();paint();}});
  resize.observe(ring);
  for(const event of ['playing','pause','seeking','seeked','timeupdate','ended','emptied']){
   media.addEventListener(event,()=>paint(),{signal:listeners.signal});
  }
  document.addEventListener('visibilitychange',()=>paint(),{signal:listeners.signal});
  paint();
  return ()=>{listeners.abort();resize.disconnect();cancelAnimationFrame(frame);ring.remove();};
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
   logo.className='zh-activity-target logo-star-button';
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
