'use strict';
(() => {
 const home=document.querySelector('.home-svg');if(!home)return;
 const scene=home.closest('.home-scene');
 const source={width:1448,height:1086,focusY:710};
 function frameHome(){
  const box=home.getBoundingClientRect();if(!box.width||!box.height)return;
  const compactLandscape=box.width>box.height&&box.height<=600&&box.width/box.height>=1.5;
  if(compactLandscape){
   // One uniform enlargement of the original image. Frame the language plaques
   // and bag together, rather than fitting a small full image between sidebars.
   const height=source.width*box.height/box.width;
   const y=Math.max(0,Math.min(source.height-height,source.focusY-height/2));
   home.setAttribute('viewBox',`0 ${y} ${source.width} ${height}`);
   home.setAttribute('preserveAspectRatio','xMidYMid meet');
   scene.dataset.layout='landscape-focus';
  }else{
   home.setAttribute('viewBox',`0 0 ${source.width} ${source.height}`);
   home.setAttribute('preserveAspectRatio',box.height>box.width?'xMidYMid slice':'xMidYMid meet');
   scene.dataset.layout=box.height>box.width?'portrait':'wide';
  }
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
})();
