'use strict';
(() => {
  // Rasterise each changing reading activity as a finished illustrated leaf.
  // Layout boxes provide hit targets and accessible names for the painted words.
  const sprite=new Image();
  sprite.src='assets/pages/inventions.webp';

  function writtenLines(node){
    const range=document.createRange();
    const lines=[];
    let start=0;
    for(const segment of node.data){
      const index=start;
      start+=segment.length;
      range.setStart(node,index);
      range.setEnd(node,index+segment.length);
      const box=range.getBoundingClientRect();
      if(!box.height||!box.width)continue;
      const last=lines.at(-1);
      if(last&&Math.abs(last.top-box.top)<1&&box.left>=last.right-1){
        last.text+=segment;
        last.right=box.right;
      }else lines.push({text:segment,left:box.left,right:box.right,top:box.top,height:box.height});
    }
    return lines;
  }

  function draw(ctx,layout,art,image,canvas){
    if(!image.complete||!image.naturalWidth)return;
    const frame=art.getBoundingClientRect();
    if(!frame.width||!frame.height)return;
    const scaleX=canvas.width/frame.width;
    const scaleY=canvas.height/frame.height;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalCompositeOperation='source-over';
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    ctx.setTransform(scaleX,0,0,scaleY,-frame.left*scaleX,-frame.top*scaleY);

    for(const area of layout.querySelectorAll('.ink-surface')){
      if(area.hidden)continue;
      const bounds=area.getBoundingClientRect();
      ctx.save();
      ctx.beginPath();
      ctx.rect(bounds.left,bounds.top,bounds.width,bounds.height);
      ctx.clip();
      ctx.globalCompositeOperation='multiply';
      leaves(ctx,area);
      const walker=document.createTreeWalker(area,NodeFilter.SHOW_TEXT);
      for(let node=walker.nextNode();node;node=walker.nextNode()){
        if(!node.data.trim()||node.parentElement.closest('.sr-only,[aria-hidden="true"],svg'))continue;
        const style=getComputedStyle(node.parentElement);
        if(style.visibility!=='visible')continue;
        ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        ctx.fillStyle=style.color;
        ctx.strokeStyle=style.color;
        ctx.textBaseline='middle';
        const paintedSign=node.parentElement.closest('.painted-sign');
        ctx.globalCompositeOperation=paintedSign?'source-over':'multiply';
        ctx.globalAlpha=paintedSign ? .9 : .96;
        for(const line of writtenLines(node)){
          const width=line.right-line.left;
          const y=line.top+line.height*.53;
          ctx.fillText(line.text,line.left+.5,y,width+.5);
          if(node.parentElement.closest('button:not(.painted-sign):not(.card-choice)')){
            ctx.lineWidth=.8;
            ctx.beginPath();
            ctx.moveTo(line.left-1,y+line.height*.44);
            ctx.quadraticCurveTo(line.left+width*.53,y+line.height*.51,line.right+1,y+line.height*.43);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
    canvas.hidden=false;
  }

  function leaves(ctx,area){
    if(area.querySelector('.flower-board')){
      for(const petal of area.querySelectorAll('.flower-board .word,.flower-heart')){
        const r=petal.getBoundingClientRect();
        const flower=petal.classList.contains('flower-heart');
        ctx.fillStyle=flower?'#daa94e88':petal.classList.contains('correct')?'#cc805a83':'#e2a88e44';
        ctx.strokeStyle='#9f5e4b57';
        ctx.beginPath();
        ctx.ellipse(r.x+r.width*.5,r.y+r.height*.5,r.width*.48,r.height*.48,0,0,Math.PI*2);
        ctx.fill();
        ctx.stroke();
      }
    }
    if(!sprite.complete||!sprite.naturalWidth)return;
    const w=sprite.naturalWidth/4,h=sprite.naturalHeight/2;
    for(const [i,object] of [...area.querySelectorAll('.card-choice .object')].entries()){
      const {x,y,width,height}=object.getBoundingClientRect();
      ctx.drawImage(sprite,i%4*w,Math.floor(i/4)*h,w,h,x,y,width,height);
      if(object.parentElement.classList.contains('correct')){
        ctx.save();
        ctx.translate(x+width-5,y+5);
        ctx.rotate(-.22);
        ctx.strokeStyle='#913521';
        ctx.lineWidth=1.5;
        ctx.beginPath();
        ctx.arc(0,0,8,0,Math.PI*2);
        ctx.moveTo(-4,0);
        ctx.lineTo(-1,3);
        ctx.lineTo(4,-4);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  window.illustrateInk=function(layout,art,image){
    const canvas=document.createElement('canvas');
    canvas.className='page-paint';
    canvas.width=1448;
    canvas.height=1086;
    canvas.hidden=true;
    canvas.setAttribute('aria-hidden','true');
    art.append(canvas);
    const ctx=canvas.getContext('2d');
    if(!ctx)return ()=>{};
    let frame=0;
    const update=()=>{
      if(frame)return;
      frame=requestAnimationFrame(()=>{
        frame=0;
        if(layout.isConnected)draw(ctx,layout,art,image,canvas);
      });
    };
    const changes=new MutationObserver(update);
    changes.observe(layout,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden']});
    const sizes=new ResizeObserver(update);
    sizes.observe(art);
    layout.addEventListener('scroll',update,true);
    image.addEventListener('load',update);
    sprite.addEventListener('load',update);
    document.fonts.ready.then(update);
    update();
    return ()=>{
      cancelAnimationFrame(frame);
      changes.disconnect();
      sizes.disconnect();
      layout.removeEventListener('scroll',update,true);
      image.removeEventListener('load',update);
      sprite.removeEventListener('load',update);
    };
  };
})();
