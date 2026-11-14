'use strict';
(() => {
 const button=document.getElementById('paksonBag'),home=document.querySelector('.home-svg'),layer=document.getElementById('bagSparkles');
 if(!button||!home||!layer)return;
 const live=new Map(),motion=matchMedia('(prefers-reduced-motion:reduce)'),MAX_STARS=72;
 const colours=['#ffd25b','#ffe494','#fff4c5','#f9bd3b'];
 const star='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 1.5 3.2 6.65 7.3 1.05-5.25 5.15 1.24 7.25L12 18.2l-6.49 3.4 1.24-7.25L1.5 9.2l7.3-1.05Z" fill="currentColor" stroke="#fff9db" stroke-width=".7" stroke-linejoin="round"/></svg>';
 function dispose(node){
  const item=live.get(node);if(!item)return;live.delete(node);clearTimeout(item.timer);item.animation?.cancel();node.remove();layer.dataset.activeStars=String(live.size);
 }
 function clear(){for(const node of [...live.keys()])dispose(node);}
 function burst(){
  if(document.hidden)return;
  const matrix=home.getScreenCTM();if(!matrix)return;
  const origin=new DOMPoint(724,748).matrixTransform(matrix),reduced=motion.matches,count=reduced?7:24;
  while(live.size+count>MAX_STARS)dispose(live.keys().next().value);
  layer.dataset.burstCount=String(Number(layer.dataset.burstCount||0)+1);
  layer.dataset.originX=String(origin.x);layer.dataset.originY=String(origin.y);
  layer.dataset.motion=reduced?'reduced':'full';
  for(let i=0;i<count;i++){
   const node=document.createElement('span');node.className='bag-star';node.innerHTML=star;
   const size=reduced?12+Math.random()*7:(i===0?30:12+Math.random()*13);
   node.style.width=size+'px';node.style.height=size+'px';node.style.left=(origin.x-size/2)+'px';node.style.top=(origin.y-size/2)+'px';node.style.color=colours[i%colours.length];
   const item={animation:null,timer:null};live.set(node,item);layer.appendChild(node);
   const dx=(Math.random()-.5)*(reduced?50:220),dy=reduced?-(6+Math.random()*15):-(90+Math.random()*115),rotation=(Math.random()-.5)*150;
   const duration=reduced?350:1050+Math.random()*450,delay=reduced?0:Math.random()*100;
   const frames=reduced?[
    {transform:`translate3d(${dx}px,${dy}px,0) scale(.8)`,opacity:0},
    {transform:`translate3d(${dx}px,${dy}px,0) scale(1)`,opacity:1,offset:.25},
    {transform:`translate3d(${dx}px,${dy}px,0) scale(1)`,opacity:0}
   ]:[
    {transform:'translate3d(0,6px,0) scale(.2) rotate(0deg)',opacity:0},
    {transform:`translate3d(${dx*.15}px,${dy*.12}px,0) scale(1.12) rotate(${rotation*.2}deg)`,opacity:1,offset:.14},
    {transform:`translate3d(${dx*.76}px,${dy*.72}px,0) scale(.9) rotate(${rotation*.7}deg)`,opacity:.95,offset:.72},
    {transform:`translate3d(${dx}px,${dy}px,0) scale(.3) rotate(${rotation}deg)`,opacity:0}
   ];
   if(node.animate){item.animation=node.animate(frames,{duration,delay,easing:'cubic-bezier(.18,.65,.3,1)',fill:'both'});item.animation.finished.then(()=>dispose(node),()=>dispose(node));}
   else{node.style.opacity='1';node.style.transform=`translate(${dx}px,${dy*.3}px)`;}
   item.timer=setTimeout(()=>dispose(node),duration+delay+120);
  }
  layer.dataset.activeStars=String(live.size);
 }
 button.addEventListener('click',event=>{event.preventDefault();burst();});
 button.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!event.repeat){event.preventDefault();burst();}});
 window.addEventListener('pagehide',clear);window.addEventListener('resize',clear);window.visualViewport?.addEventListener('resize',clear);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});motion.addEventListener?.('change',clear);
})();
