'use strict';
(() => {
  const circle = Math.PI * 2;
  const shapes = new Set(['paw','ring','drop','lantern','tick','petal','planet','page','burst']);
  const radial = (angle,rx,ry) => [Math.cos(angle)*rx,Math.sin(angle)*ry];
  // Positions are fractions of the spread measured from the centre of the logo.
  const themes = {
    1: {name:'floating-hearts', marks:['♥','♡'], colours:['#bf2756','#ed6180','#ffe0d9'],
      travel:(i,t)=>{const side=i%2?1:-1;return [[side*(.23+t*.07),.24],[side*(.31+t*.08),-.06],[side*(.36+t*.09),-.18-t*.25]];},
      pace:49, spin:35},
    2: {name:'dim-sum-steam', marks:['~','○','~'], colours:['#fff9ec','#fff1ce','#c99152'],
      travel:(i,t)=>[[(t-.5)*.46,.34],[(t-.5)*.54+.045,.00],[(t-.5)*.72-.035,-.32]],
      pace:36, spin:25},
    3: {name:'finish-line', marks:['▰','➜','▱'], colours:['#236bd0','#f2c43e','#f46952','#f7fff5'],
      travel:(i,t)=>[[-.46,(t-.5)*.63],[-.13,(t-.5)*.72-.035],[.46,(t-.5)*.8]],
      pace:16, spin:4, duration:720},
    4: {name:'paw-trail', marks:['paw'], colours:['#ac6a39','#e4a555','#6a4b34'],
      travel:(i,t)=>{const spot=[(i%2?1:-1)*(.30+t*.12),.38-t*.78];return [spot,spot,spot];},
      count:12, pace:70, spin:22, duration:650},
    5: {name:'lantern-glow', marks:['lantern','✧'], colours:['#e84b36','#ffad43','#ffd870'],
      travel:(i,t,a)=>[[(t-.5)*.76,.45],[(t-.5)*.82+Math.sin(a)*.04,.06],[(t-.5)*.84,-.27-t*.14]],
      pace:27, spin:15, duration:1480},
    6: {name:'fair-confetti', marks:['▰','▰','◆','●'], colours:['#dc4a69','#27847d','#f7ba30','#5a70cf'],
      travel:(i,t,a)=>[[(t-.5)*.83,-.38],[(t-.5)*.86+.05*Math.cos(a),-.10],[(t-.5)*.90-.09*Math.cos(a),.45]],
      pace:14, spin:510, duration:1550},
    7: {name:'rainbow-parade', marks:['◆','●','▲'], colours:['#dd4252','#efa24f','#e7c230','#4ba76b','#3989d0','#9d55bf'],
      travel:(i,t,a)=>[[ (t-.5)*.55,.34],radial(Math.PI+t*Math.PI,.34,.40),radial(Math.PI+t*Math.PI,.44,.47)],
      pace:19, spin:85},
    8: {name:'clock-ticks', marks:['tick','●'], colours:['#1f777e','#efb544','#edf0cb'],
      travel:(i,t,a)=>{const p=radial(a-Math.PI/2,.34,.42);return [p,p,radial(a-Math.PI/2,.37,.46)];},
      count:24, pace:28, spin:0, duration:720},
    9: {name:'comet-launch', marks:['✦','▰','●'], colours:['#fcf7ac','#ffc544','#76d9ff','#734ad9'],
      travel:(i,t)=>[[.04+(t-.5)*.26,.42],[.12+(t-.5)*.23,-.02],[.42+(t-.5)*.20,-.44]],
      pace:17, spin:80, duration:940},
    10: {name:'raindrop-ripples', marks:['drop','ring','drop','ring'], colours:['#2c9ace','#2467b5','#86e0ee','#e3f9fa'],
      travel:(i,t)=>{const x=(t-.5)*.81+i%2*.009;return i%2?[[x,.34],[x,.37],[x,.40]]:[[x,-.41],[x+.026,.04],[x+.048,.38]];},
      pace:34, spin:0, duration:900},
    11: {name:'invitation-clues', marks:['✉︎','◇','✉︎'], colours:['#762651','#cf7e2b','#f4cf77','#8c605c'],
      travel:(i,t,a)=>[[i%2?.44:-.44,.16],[i%2?.28:-.28,Math.sin(a)*.23],[i%2?.44:-.44,-.40+t*.33]],
      pace:39, spin:120},
    12: {name:'moonlit-petals', marks:['petal','petal','☾'], colours:['#fb98c7','#ba63c9','#fff3b9','#f7d1f0'],
      travel:(i,t,a)=>[radial(a,.18,.19),radial(a+1.7,.32,.32),radial(a+3.6,.46,.48)],
      pace:22, spin:265, duration:1400},
    13: {name:'invention-sparks', marks:['⚡︎','✧','⬡'], colours:['#f5c22a','#e07824','#3aa889','#328ac5'],
      travel:(i,t,a)=>[[0,.26],[Math.cos(a)*.28,Math.sin(a)*.26],[Math.cos(a+.3)*.41,Math.sin(a+.3)*.45]],
      pace:48, spin:85, duration:740},
    14: {name:'planet-orbits', marks:['planet','●','✦'], colours:['#e68957','#75b7f8','#ab72e2','#f8d65e'],
      travel:(i,t,a)=>[radial(a,.32,.29),radial(a+1.0,.36,.36),radial(a+2.6,.40,.35)],
      pace:20, spin:125, duration:1480},
    15: {name:'turning-pages', marks:['page','▱','page'], colours:['#fff6de','#e8c790','#ab7049','#4c876a'],
      travel:(i,t)=>{const side=i%2===0?1:-1;return [[side*.07,.31],[side*.22,-.21+t*.20],[side*.43,-.23+t*.54]];},
      pace:19, spin:160, duration:1140},
    16: {name:'comic-burst', marks:['burst','ring','✦','●'], colours:['#ffc73b','#f07241','#fff3bc','#ed4662'],
      travel:(i,t,a)=>i<2?[[0,.03],[0,.03],[0,.03]]:[[0,.03],radial(a,.24,.24),radial(a,.46,.44)],
      pace:8, spin:90, duration:835}
  };

  document.addEventListener('DOMContentLoaded', () => {
    const shell=document.getElementById('bookShell');
    if(!shell)return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const trigger=document.createElement('button');
    trigger.type='button';
    trigger.className='logo-effect-trigger';
    trigger.setAttribute('aria-label','Play the Pakson logo celebration');
    const layer=document.createElement('div');
    layer.className='closing-effect';
    layer.setAttribute('aria-hidden','true');
    const running=new Map();
    let theme;

    function clear(){
      for(const [particle,animation] of running){animation.cancel();particle.remove();}
      running.clear();
    }

    function play(){
      if(!theme||document.hidden||window.paksonReader.state.turning)return;
      clear();
      const {clientWidth:width,clientHeight:height}=shell;
      layer.dataset.bursts=String(Number(layer.dataset.bursts||0)+1);
      const count=reduced.matches?6:(theme.count||20);
      for(let i=0;i<count;i++){
        const fraction=(i+.5)/count,angle=i/count*circle;
        const shape=theme.marks[i%theme.marks.length];
        const particle=document.createElement('span');
        const drawn=shapes.has(shape);
        particle.className='closing-particle'+(drawn?' closing-'+shape:'');
        if(!drawn)particle.textContent=shape;
        const mainBurst=theme.name==='comic-burst'&&i<2;
        const clockAngle=theme.name==='clock-ticks'?angle*180/Math.PI:0;
        const rainRing=theme.name==='raindrop-ripples'&&shape==='ring';
        const size=Math.max(12,height*(mainBurst?.18:.022+((i*7)%11)*.0021));
        const [start,mid,end]=theme.travel(i,fraction,angle);
        const spin=theme.spin*(i%2===0?1:-1);
        const style=particle.style;
        style.setProperty('--particle-size',size+'px');
        style.color=theme.colours[i%theme.colours.length];
        layer.append(particle);
        const transform=([x,y],scale,rotation)=>
          `translate3d(${x*width-size/2}px,${y*height-size/2}px,0) rotate(${clockAngle+rotation}deg) scale(${scale})`;
        const frames=reduced.matches?
          [{transform:transform(mid,.88,0),opacity:0},{transform:transform(mid,.88,0),opacity:1,offset:.28},{transform:transform(mid,.88,0),opacity:0}]:
          [{transform:transform(start,.32,0),opacity:0},
           {transform:transform(start,.85,spin*.06),opacity:.96,offset:.16},
           {transform:transform(mid,mainBurst?1.45:1,spin*.42),opacity:.91,offset:.62},
           {transform:transform(end,mainBurst?2.85:rainRing?2.8:.66,spin),opacity:0}];
        const animation=particle.animate(frames,{duration:reduced.matches?380:(theme.duration||1160)+(i%4)*65,
          delay:reduced.matches?0:i*theme.pace+(rainRing?390:0),easing:'cubic-bezier(.17,.64,.34,1)',fill:'both'});
        running.set(particle,animation);
        const remove=()=>{particle.remove();running.delete(particle);};
        animation.finished.then(remove,remove);
      }
    }

    trigger.addEventListener('click',play);
    function sync(){
      const state=window.paksonReader?.state;
      const active=state?.ready&&!state.turning&&state.book.pages[state.index]?.page_type==='closing_logo';
      const next=active?themes[state.book.chapter_number]:null;
      if(next===theme)return;
      clear();
      theme=next;
      if(theme){
        layer.dataset.effect=theme.name;
        shell.append(layer,trigger);
      }else{
        layer.remove();
        trigger.remove();
      }
    }
    new MutationObserver(sync).observe(shell,{attributes:true,attributeFilter:['class','data-reader-page','aria-busy']});
    window.addEventListener('resize',clear);
    window.addEventListener('pagehide',clear);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
    reduced.addEventListener?.('change',clear);
    sync();
  });
})();
