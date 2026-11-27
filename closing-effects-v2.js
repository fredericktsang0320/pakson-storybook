'use strict';
(() => {
  const TAU=Math.PI*2;
  const polar=(angle,x,y)=>[Math.cos(angle)*x,Math.sin(angle)*y];
  const sheet=(a,b,c)=>[a,b,c];
  const themes=[
    ['floating-hearts',['#ef155c','#a11858','#ff477e','#b90045'],show=>{
      for(const side of [-1,1]){
        show('heart',.215,sheet([side*.25,.27],[side*.35,-.20],[side*.39,-.40]),{turn:side*22});
        show('heart',.145,sheet([side*.35,.43],[side*.40,.12],[side*.45,-.14]),{delay:140,turn:-side*28});
        show('heart',.105,sheet([side*.26,.31],[side*.27,-.33],[side*.24,-.48]),{delay:265});
      }
      show.scatter('gem',16,(a,i)=>sheet([Math.sign(Math.cos(a))*.28,.20],polar(a,.42,.36),polar(a,.49,.48)));
    }],
    ['dim-sum-steam',['#d26300','#9b3f1a','#09a39b','#e88d24'],show=>{
      show('basket',.30,sheet([-.33,.52],[-.35,.17],[-.37,.06]),{turn:-10});
      show('bun',.19,sheet([.33,.52],[.35,.19],[.34,.01]),{delay:90,turn:9});
      for(let i=0;i<8;i++){const x=i%2?.34:-.35, y=.28-i*.039;
        show('steam',.115,sheet([x,y],[x+.055,y-.23],[x-.06,y-.38]),{delay:135+i*62,turn:i%2?35:-35});
      }
    }],
    ['finish-line',['#1a56cc','#ffba15','#ed273b','#056f47'],show=>{
      show('flag',.221,sheet([-.52,.28],[-.35,-.10],[-.31,-.27]),{turn:-16});
      show('trophy',.22,sheet([.48,.43],[.35,-.05],[.35,-.20]),{delay:110,turn:12});
      for(let i=0;i<14;i++){
        const sign=i%2?1:-1,y=-.34+(.063*i);
        show('speed',.105,sheet([-.53*sign,y],[.21*sign,y-.055],[.54*sign,y-.08]),{delay:i*23,turn:sign*8,duration:770});
      }
    }],
    ['paw-trail',['#9f381b','#b85d14','#c76d0e','#7c3625'],show=>{
      for(let i=0;i<12;i++){
        const side=i%2?1:-1,x=side*(.37+Math.sin(i)*.033),y=.41-i*.073;
        show('paw',i<4?.173:.128,sheet([x,y+.08],[x,y],[x,y-.033]),{delay:54*i,turn:side*26,duration:920});
      }
      show.scatter('leaf',10,(a)=>sheet(polar(a,.25,.3),polar(a,.43,.39),polar(a,.51,.47)));
    }],
    ['lantern-glow',['#c41932','#f34f27','#eb9a09','#ae123b'],show=>{
      for(const side of [-1,1]){
        show('lantern',.255,sheet([side*.34,.50],[side*.36,-.16],[side*.40,-.41]),{turn:side*11,duration:1420});
        show('lantern',.142,sheet([side*.44,.47],[side*.43,.03],[side*.47,-.23]),{delay:125,turn:-side*16,duration:1420});
      }
      show.scatter('coin',17,(a,i)=>{const x=Math.cos(a)*.42;return sheet([x,.41],[x+.03,.025],[x-.04,-.37-i%4*.029]);});
    }],
    ['fair-confetti',['#ec1661','#154ad7','#038759','#f29500','#7c28ba'],show=>{
      for(let i=0;i<9;i++){
        const x=(i-4)*.108,y=-.32+(.09*(1-Math.abs(i-4)/4));
        show('pennant',.177,sheet([x,-.51],[x,y],[x,y+.08]),{delay:i*38,turn:(i-4)*9,duration:1660});
      }
      show.scatter('paper',35,(a,i)=>{const x=(i/34-.5)*.94;return sheet([x,-.40],[x+Math.cos(a)*.056,-.04],[x-Math.cos(a)*.072,.46]);},{duration:1290,spin:510});
    }],
    ['rainbow-parade',['#e9204d','#ed7100','#f4b300','#219842','#2767cb','#922ac5'],show=>{
      show('rainbow',.92,sheet([0,.33],[0,-.01],[0,-.15]),{duration:1560});
      show.scatter('ribbon',24,(a,i)=>{const theta=Math.PI+i/23*Math.PI;return sheet([Math.sign(Math.cos(theta))*.29,.29],polar(theta,.40,.34),polar(theta,.49,.46));},{spin:140});
    }],
    ['clock-ticks',['#12418a','#f59d06','#00777b','#994212'],show=>{
      show('clock',.264,sheet([.48,.35],[.35,-.02],[.36,-.17]),{turn:370,duration:1550});
      for(let i=0;i<12;i++){
        const a=i/12*TAU-Math.PI/2, pt=polar(a,.103,.136);
        const [x,y]=[pt[0]-.34,pt[1]-.036];
        show('tick',.115,sheet([x,y],[x,y],[x,y-.02]),{delay:i*59,turn:(a+Math.PI/2)*180/Math.PI,duration:1100});
      }
    }],
    ['comet-launch',['#ee6800','#0057cf','#8135c2','#ffa715'],show=>{
      show('comet',.30,sheet([-.44,.48],[-.06,-.06],[.50,-.48]),{duration:1420,turn:12,front:true});
      show('flare',.233,sheet([.32,-.23],[.36,-.30],[.38,-.34]),{delay:535,turn:102,duration:830});
      show.scatter('spark',24,(a,i)=>{const t=i/23;return sheet([-.44+t*.6,.44-t*.51],[-.26+t*.68,.13-t*.43],[-.38+t*.82,.25-t*.64]);},{spin:150});
    }],
    ['raindrop-ripples',['#055ca5','#087cbb','#006d83','#2383dd'],show=>{
      show('umbrella',.265,sheet([.47,-.45],[.34,-.18],[.34,-.09]),{turn:15,duration:1450});
      for(let i=0;i<16;i++){
        const x=(i/15-.5)*.87,y=.37+i%3*.038;
        show('drop',.088,sheet([x-.07,-.5],[x-.03,-.08],[x,y]),{delay:i*27,duration:665,turn:20});
        show('ring',.158,sheet([x,y],[x,y],[x,y]),{delay:430+i*27,duration:840,expand:true});
      }
    }],
    ['invitation-clues',['#a2194d','#7d3271','#cc5424','#98342b'],show=>{
      show('lens',.26,sheet([-.52,.26],[-.35,-.09],[-.35,-.24]),{turn:-28,duration:1410});
      show('envelope',.23,sheet([.49,.39],[.36,.04],[.38,-.17]),{turn:19,duration:1320,delay:80});
      show.scatter('seal',14,(a,i)=>sheet(polar(a,.24,.18),polar(a,.40,.36),polar(a,.49,.49)),{spin:240});
    }],
    ['moonlit-petals',['#d32b93','#782bc5','#2373b4','#a82d84','#dd3362'],show=>{
      show('moon',.265,sheet([.47,.32],[.33,-.20],[.37,-.36]),{turn:-36,duration:1620});
      show('flower',.245,sheet([-.45,.45],[-.33,.13],[-.35,-.01]),{turn:110,duration:1550});
      show.scatter('petal',26,(a)=>sheet(polar(a,.22,.23),polar(a+1.42,.37,.36),polar(a+3.23,.50,.48)),{spin:285});
    }],
    ['invention-sparks',['#b44000','#1247bd','#036e61','#8b2899','#dc3c09'],show=>{
      show('gear',.254,sheet([-.48,.43],[-.35,-.02],[-.35,-.22]),{turn:215,duration:1490});
      show('bolt',.28,sheet([.49,-.37],[.36,-.13],[.39,.13]),{turn:21,duration:1260,delay:90});
      show.scatter('bolt',15,(a)=>sheet(polar(a,.13,.22),polar(a+.25,.32,.30),polar(a-.15,.50,.47)),{spin:125,duration:830});
    }],
    ['planet-orbits',['#7728bb','#1d62d0','#d84a10','#e69206','#0d839e'],show=>{
      show('orbit',.86,sheet([0,.22],[0,.03],[0,-.08]),{turn:-24,duration:1510});
      for(let i=0;i<4;i++){
        const a=i/4*TAU;
        show('planet',i===0?.26:.159,sheet(polar(a,.37,.27),polar(a+.77,.38,.35),polar(a+2.10,.40,.35)),{delay:i*75,turn:-90,duration:1540});
      }
      show.scatter('flare',17,a=>sheet(polar(a,.25,.17),polar(a+1.23,.39,.30),polar(a+2.05,.51,.44)),{spin:150});
    }],
    ['turning-pages',['#ad5220','#246865','#b44837','#b56d08','#2269a1'],show=>{
      show('book',.32,sheet([0,.53],[0,.28],[0,.19]),{turn:8,duration:1410,front:true});
      for(let i=0;i<16;i++){
        const side=i%2?1:-1,y=.44-i*.048;
        show('page',i<4?.158:.118,sheet([side*.07,.38],[side*.30,y-.13],[side*.47,y-.21]),{delay:80+i*33,turn:side*215,duration:1140});
      }
    }],
    ['comic-burst',['#eb2c1a','#ff8a0b','#a61038','#ed4b14','#0283ac'],show=>{
      show('burst',.69,sheet([0,.03],[0,.03],[0,.03]),{duration:1070,turn:22,expand:true,front:true});
      show('shockwave',.56,sheet([0,.03],[0,.03],[0,.03]),{delay:120,turn:-24,duration:1190,expand:true});
      show.scatter('flare',30,(a)=>sheet(polar(a,.065,.07),polar(a,.31,.30),polar(a,.53,.55)),{spin:155,duration:875});
    }],
  ];
  function createMark(kind){
    const mark=document.createElement('span');
    mark.className='closing-particle closing-'+kind;
    if(kind==='clock'||kind==='lens'||kind==='umbrella'||kind==='book')mark.append(document.createElement('b'));
    return mark;
  }
  document.addEventListener('DOMContentLoaded',()=>{
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
    const animations=new Map();
    let theme=null;

    function clear(){
      for(const [mark,animation] of animations){animation.cancel();mark.remove();}
      animations.clear();
    }
    function play(){
      if(!theme||document.hidden||window.paksonReader.state.turning)return;
      clear();
      const [,palette,create]=theme;
      const width=shell.clientWidth,height=shell.clientHeight,quiet=reduced.matches;
      layer.dataset.bursts=String(Number(layer.dataset.bursts||0)+1);
      let count=0;
      function show(kind,factor,motion,{delay=0,turn=0,duration=1200,expand=false,front=false}={}){
        if(quiet&&count>=6)return;
        const size=Math.max(20,factor*height);
        const mark=createMark(kind);
        mark.style.setProperty('--mark',size+'px');
        mark.style.setProperty('--ink',palette[count%palette.length]);
        if(front)mark.classList.add('closing-front');
        ++count;
        layer.append(mark);
        const place=([x,y],scale,angle)=>
          `translate3d(${x*width}px,${y*height}px,0) translate(-50%,-50%) rotate(${angle}deg) scale(${scale})`;
        const [start,peak,end]=motion;
        const frames=quiet?
          [{transform:place(peak,1,0),opacity:0},{transform:place(peak,1,0),opacity:1,offset:.3},{transform:place(peak,1,0),opacity:0}]:
          [{transform:place(start,.22,turn*-.21),opacity:0},
           {transform:place(start,.79,0),opacity:1,offset:.11,easing:'cubic-bezier(.18,.68,.28,1)'},
           {transform:place(peak,expand?1.22:1,turn*.64),opacity:1,offset:.57},
           {transform:place(end,expand?1.55:.98,turn*.91),opacity:.91,offset:.80},
           {transform:place(end,expand?1.65:.92,turn),opacity:0}];
        const animation=mark.animate(frames,{delay:quiet?0:delay,duration:quiet?420:duration,
          fill:'both'});
        animations.set(mark,animation);
        const finish=()=>{mark.remove();animations.delete(mark);};
        animation.finished.then(finish,finish);
      }
      show.scatter=(kind,n,route,{duration=1160,spin=120}={})=>{
        for(let i=0;i<n;i++)show(kind,.052+i%5*.009,route(i/n*TAU,i),{delay:45+i*23,turn:i%2?spin:-spin,duration});
      };
      create(show);
    }
    trigger.addEventListener('click',play);
    function sync(){
      const state=window.paksonReader?.state;
      const atEnd=state?.ready&&!state.turning&&state.book.pages[state.index]?.page_type==='closing_logo';
      const next=atEnd?(themes[state.book.chapter_number-1]||null):null;
      if(next===theme)return;
      clear();
      theme=next;
      if(theme){
        layer.dataset.effect=theme[0];
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
