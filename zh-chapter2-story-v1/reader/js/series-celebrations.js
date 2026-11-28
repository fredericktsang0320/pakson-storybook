'use strict';
(() => {
  const TAU = Math.PI * 2;
  const kinds = ['flying-swans','dolphin-tide','street-lights','travel-stamps','unrolling-scrolls'];

  function create(canvas, aboutLogo) {
    const ink = canvas.getContext('2d');
    const quiet = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, timeZero = 0;
    const clip = (n,min=0,max=1) => Math.min(max,Math.max(n,min));
    const ease = t => 1-(1-clip(t))**3;
    function clear() {
      cancelAnimationFrame(frame);
      frame=0;
      timeZero=0;
      ink.setTransform(1,0,0,1,0,0);
      ink.clearRect(0,0,canvas.width,canvas.height);
      canvas.hidden=true;
    }

    function swan(x,y,side,flap) {
      ink.save(); ink.translate(x,y); ink.scale(side,1);
      ink.fillStyle='#fff5d4'; ink.strokeStyle='#a3430b'; ink.lineWidth=2.4;
      ink.beginPath();
      ink.moveTo(-21,13); ink.quadraticCurveTo(-8,2,9,4);
      ink.quadraticCurveTo(18,1,18,-11); ink.quadraticCurveTo(19,-23,29,-20);
      ink.quadraticCurveTo(23,-17,23,-11); ink.quadraticCurveTo(34,18,7,22);
      ink.quadraticCurveTo(-11,23,-21,13); ink.fill(); ink.stroke();
      ink.beginPath(); ink.moveTo(10,15); ink.quadraticCurveTo(-8,8,-27,-22+flap);
      ink.quadraticCurveTo(-10,-20+flap,5,1); ink.fill(); ink.stroke();
      ink.fillStyle='#ee641b'; ink.fillRect(27,-18,6,3); ink.restore();
    }

    function flyingSwans(t) {
      for(const side of [-1,1]) {
        const x=side*(.09+.47*ease(t)), y=.34-.70*ease(t);
        for(let i=0;i<5;i++) {
          ink.strokeStyle=i%2?'#ffb21c':'#d44a16';
          ink.lineWidth=i%2?.014:.009;
          ink.beginPath();ink.moveTo(side*.10,.29+i*.029);
          ink.quadraticCurveTo(x*.68,.34+i*.025,x,y+i*.047);ink.stroke();
        }
        ink.save();ink.scale(.006,.006);swan(x/.006,y/.006,side,5*Math.sin(t*TAU*5));ink.restore();
      }
    }

    function dolphinTide(t) {
      for(let i=0;i<3;i++){
        ink.beginPath();
        ink.ellipse(0,.36,.44+.09*i,.07+.04*ease(t),0,0,TAU);
        ink.strokeStyle=['#116fa8','#159bba','#27c5c4'][i];ink.lineWidth=.027;ink.stroke();
      }
      const jump = (side,shift) => {
        const phase=clip(t+shift);
        const x=side*(.48-.17*Math.sin(phase*Math.PI)), y=.32-.69*Math.sin(phase*Math.PI);
        ink.save();ink.translate(x,y);ink.rotate(-side*(phase-.5)*2.1);ink.scale(side,1);
        ink.beginPath();ink.moveTo(-.165,.036);
        ink.quadraticCurveTo(-.10,-.05,-.05,-.085);
        ink.lineTo(-.065,-.148);ink.quadraticCurveTo(.01,-.12,.02,-.087);
        ink.quadraticCurveTo(.12,-.08,.153,-.014);
        ink.lineTo(.176,.026);ink.lineTo(.128,.036);
        ink.quadraticCurveTo(.012,-.028,-.12,.072);ink.lineTo(-.172,.13);
        ink.lineTo(-.159,.071);ink.lineTo(-.208,.064);ink.closePath();
        ink.fillStyle='#0873a3';ink.fill();
        ink.fillStyle='#effcfc';ink.beginPath();ink.arc(.11,.009,.014,0,TAU);ink.fill();
        ink.restore();
        for(let j=0;j<6;j++){
          ink.beginPath();ink.arc(side*(.26+.062*j),.35-ease(t)*(.22+.054*j),.022+(j%3)*.005,0,TAU);
          ink.strokeStyle='#007a9c';ink.lineWidth=.011;ink.stroke();
        }
      };
      jump(1,0);jump(-1,-.13);
    }

    function streetLights(t) {
      const palette=['#bf371f','#175e62','#a24b26','#63558b'];
      for(const side of [-1,1]){
        for(let i=0;i<4;i++){
          const shown=ease((t-.10*i)*6);
          if(!shown) continue;
          const x=side*(.33+i*.086), y=.36-.103*i;
          ink.save();ink.translate(x,y);ink.scale(shown,shown);
          ink.fillStyle=palette[i];ink.fillRect(-.041,-.10,.082,.14);
          ink.beginPath();ink.moveTo(-.055,-.10);ink.lineTo(0,-.156);ink.lineTo(.055,-.10);ink.fill();
          ink.fillStyle='#ffc041';ink.fillRect(-.021,-.082,.042,.046);
          ink.fillStyle='#ffee9a';ink.fillRect(-.021,-.008,.042,.032);ink.restore();
        }
        ink.beginPath();ink.moveTo(side*.57,-.30);ink.quadraticCurveTo(side*.42,-.40,side*.17,-.34);
        ink.strokeStyle='#712d1d';ink.lineWidth=.012;ink.stroke();
        for(let i=0;i<4;i++) {
          if(t<i*.09) continue;
          const x=side*(.20+i*.095),y=-.36-.03*Math.sin(i);
          ink.beginPath();ink.moveTo(x,y);ink.lineTo(x+.07,y);ink.lineTo(x+.032,y+.077);ink.closePath();
          ink.fillStyle=palette[(i+1)%4];ink.fill();
        }
      }
    }

    function travelStamps(t) {
      const colors=['#b20d36','#075f8f','#a34601','#3b6816','#803388','#c33025','#136e59','#126ab0'];
      for(let i=0;i<8;i++){
        const phase=ease((t-.075*i)*8);
        if(!phase)continue;
        const angle=(i/8)*TAU;
        ink.save();ink.translate(.50*Math.cos(angle),.39*Math.sin(angle));
        ink.rotate((i%2?1:-1)*.16);ink.scale(phase,phase);
        ink.fillStyle='#fff1c4';ink.fillRect(-.075,-.057,.15,.114);
        ink.strokeStyle=colors[i];ink.lineWidth=.015;ink.setLineDash([.021,.010]);
        ink.strokeRect(-.067,-.049,.134,.098);ink.setLineDash([]);ink.fillStyle=colors[i];
        ink.beginPath();
        for(let j=0;j<12;j++){
          const a=(j/12)*TAU,rad=j%2?.018:.035;
          ink[j?'lineTo':'moveTo'](Math.cos(a)*rad,Math.sin(a)*rad);
        }
        ink.closePath();ink.fill();ink.restore();
      }
    }

    function unrollingScrolls(t) {
      for(const side of [-1,1]){
        const length=.55*ease(t), x=side*.45, bottom=.30;
        ink.fillStyle='#f4d687';ink.strokeStyle='#97351c';ink.lineWidth=.016;
        ink.fillRect(x-.071,bottom-length,.142,length);
        ink.strokeRect(x-.071,bottom-length,.142,length);
        ink.fillStyle='#843624';ink.fillRect(x-.086,bottom-length-.02,.172,.046);
        ink.fillRect(x-.086,bottom-.014,.172,.037);
        for(let i=0;i<4;i++){
          const y=bottom-.11-i*.108;
          if(y<bottom-length+.045)continue;
          ink.strokeStyle=i%2?'#9c2720':'#b54c30';
          ink.strokeRect(x-.026,y-.028,.052,.052);
          ink.beginPath();ink.moveTo(x-.015,y);ink.lineTo(x+.016,y);ink.moveTo(x,y-.018);ink.lineTo(x,y+.015);ink.stroke();
        }
      }
    }

    const draws = [flyingSwans,dolphinTide,streetLights,travelStamps,unrollingScrolls];
    function burst(kind) {
      const draw = draws[kinds.indexOf(kind)];
      if(!draw) throw new Error('尾頁動效未設定');
      clear();
      canvas.hidden=false;
      const scale=Math.min(devicePixelRatio||1,2), box=aboutLogo();
      canvas.width=Math.round(innerWidth*scale);
      canvas.height=Math.round(innerHeight*scale);
      const unit=Math.min(box.width*.72,box.height*.87);
      const duration=quiet.matches?600:1650;
      function tick(now) {
        if(!timeZero)timeZero=now;
        const q=(now-timeZero)/duration;
        if(q>=1){clear();return;}
        ink.setTransform(1,0,0,1,0,0);ink.clearRect(0,0,canvas.width,canvas.height);
        ink.setTransform(unit*scale,0,0,unit*scale,(box.left+box.width/2)*scale,(box.top+box.height/2)*scale);
        ink.globalAlpha=clip((1-q)*6);
        draw(quiet.matches ? .64 : Math.min(q*1.28,.98));
        frame=requestAnimationFrame(tick);
      }
      frame=requestAnimationFrame(tick);
    }
    return {burst,clear};
  }
  window.PaksonZhCelebrations={create};
})();
