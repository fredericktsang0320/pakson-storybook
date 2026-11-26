'use strict';
(() => {
  const chapters=window.storybookPages;
  const $=id=>document.getElementById(id);
  const book=$('book'),leaf=$('leaf'),picture=$('picture'),incoming=$('incoming');
  const strokes=$('strokes'),voice=$('voice'),choices=$('choices'),status=$('status');
  const prev=$('previous'),next=$('next'),replay=$('replay'),home=$('home');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const preloaded=new Map();
  let index=0,turn=null,gesture=null,unlocked=false,settled=[],round=0;
  let queueId=0;
  const normalPage=()=>chapters[index];
  const scene=()=>round===1&&normalPage().second?normalPage().second:normalPage();
  function preload(page) {
    if(!page||preloaded.has(page.art))return;
    const image=new Image();
    image.src=page.art;
    preloaded.set(page.art,image);
  }
  function stopVoice() {
    queueId++;
    voice.onended=null;
    voice.pause();
  }
  function say(list,complete=()=>{}) {
    stopVoice();
    if(!list?.length)return;
    const id=queueId;
    function start(position){
      if(id!==queueId)return;
      const url=list[position];
      if(!url){complete();return;}
      voice.src=url;
      voice.onended=()=>start(position+1);
      voice.play().catch(error=>{
        if(id===queueId&&error.name!=='AbortError'){
          status.textContent='按喇叭重聽呢一頁。';
        }
      });
    }
    start(0);
  }
  function listen() {
    unlocked=true;
    if(normalPage().writing) {
      strokes.currentTime=0;
      strokes.play().catch(()=>{});
    }
    say(scene().audio);
  }
  function addHotspot({label,rect,correct,open}) {
    const button=document.createElement('button');
    button.type='button';
    button.className='hotspot';
    button.setAttribute('aria-label',label);
    const [x,y,width,height]=rect;
    Object.assign(button.style,{left:x+'%',top:y+'%',width:width+'%',height:height+'%'});
    button.addEventListener('click',()=>{
      if(turn)return;
      if(open){unlocked=true;change(1);return;}
      if(!correct){say(['audio/again-0.m4a']);return;}
      if(settled.includes(label))return;
      settled.push(label);
      button.setAttribute('aria-pressed','true');
      if(normalPage().second&&settled.length===2){
        if(round===1){say(['audio/finish-0.m4a']);return;}
        say(['audio/more-0.m4a'],()=>{
          round=1;
          settled=[];
          paint();
          if(unlocked)say(scene().audio);
        });
      }else say(['audio/correct-0.m4a']);
    });
    choices.append(button);
  }
  function paint() {
    const page=scene();
    picture.src=page.art;
    picture.alt=page.label;
    choices.replaceChildren();
    page.targets?.forEach(addHotspot);
    prev.disabled=index===0;
    next.disabled=index===chapters.length-1;
    book.dataset.page=normalPage().id;
    status.textContent=page.label;
    const writing=Boolean(normalPage().writing);
    strokes.hidden=!writing;
    if(writing){
      strokes.currentTime=0;
      strokes.play().catch(()=>{});
    }else strokes.pause();
    preload(chapters[index-1]);
    preload(chapters[index+1]);
    preload(page.second);
  }
  function pose(progress) {
    turn.progress=Math.min(1,Math.max(0,progress));
    const forward=turn.target>index;
    leaf.style.transformOrigin=forward?'0 50%':'100% 50%';
    leaf.style.transform=`rotateY(${(forward?-1:1)*turn.progress*175}deg)`;
    leaf.style.setProperty('--shade',String(Math.sin(turn.progress*Math.PI)*.9));
  }
  function begin(target) {
    if(turn||target<0||target>=chapters.length)return false;
    turn={target,progress:0};
    incoming.src=chapters[target].art;
    book.classList.add('turning');
    pose(0);
    return true;
  }
  function finish(commit) {
    if(commit){
      index=turn.target;
      round=0;
      settled=[];
      paint();
    }
    const earlyAudio=turn.earlyAudio;
    turn=null;
    leaf.style.removeProperty('transform');
    leaf.style.removeProperty('--shade');
    book.classList.remove('turning');
    if(commit&&unlocked&&!earlyAudio)say(scene().audio);
  }
  function settle(commit) {
    const active=turn;
    const duration=reduced.matches?0:(commit?490:240);
    if(commit){
      if(index===0&&!voice.currentSrc){
        unlocked=true;
        active.earlyAudio=true;
        say(chapters[active.target].audio);
      }else stopVoice();
      strokes.pause();
    }
    if(!duration){finish(commit);return;}
    const start=performance.now();
    const from=active.progress;
    function frame(now) {
      if(turn!==active)return;
      const t=Math.min(1,(now-start)/duration);
      const eased=1-Math.pow(1-t,3);
      pose(from+((commit?1:0)-from)*eased);
      if(t<1)requestAnimationFrame(frame);
      else finish(commit);
    }
    requestAnimationFrame(frame);
  }
  function change(amount) {
    if(begin(index+amount))settle(true);
  }
  book.addEventListener('pointerdown',event=>{
    if(turn||event.target.closest('button')||!event.isPrimary||event.button!==0)return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY};
  });
  book.addEventListener('pointermove',event=>{
    if(gesture?.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(!turn&&Math.abs(dx)>18&&Math.abs(dx)>Math.abs(dy)*1.5){
      if(!begin(index+(dx<0?1:-1)))return;
      book.setPointerCapture(event.pointerId);
    }
    if(turn)pose((turn.target>index?-dx:dx)/book.clientWidth);
  });
  function end(event,accepted) {
    if(gesture?.id!==event.pointerId)return;
    gesture=null;
    if(turn)settle(accepted&&turn.progress>=.072);
  }
  book.addEventListener('pointerup',event=>end(event,true));
  book.addEventListener('pointercancel',event=>end(event,false));
  prev.addEventListener('click',()=>change(-1));
  next.addEventListener('click',()=>{unlocked=true;change(1);});
  replay.addEventListener('click',()=>{
    if(turn)return;
    if(!voice.paused)stopVoice();
    else listen();
  });
  window.addEventListener('keydown',event=>{
    if(event.altKey||event.metaKey||event.ctrlKey)return;
    if(event.key==='ArrowRight'){unlocked=true;change(1);}
    if(event.key==='ArrowLeft')change(-1);
  });
  window.addEventListener('pagehide',()=>{stopVoice();strokes.pause();});
  if(location.protocol==='file:'){
    home.href='#';
    home.setAttribute('aria-label','返回封面');
    home.addEventListener('click',event=>{
      event.preventDefault();
      if(turn)return;
      stopVoice();
      index=0;
      round=0;
      settled=[];
      paint();
    });
  }
  paint();
})();
