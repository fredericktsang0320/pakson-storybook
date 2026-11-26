'use strict';
(() => {
  const book=window.PAKSON_ZH;
  const $=id=>document.getElementById(id);
  const stage=$('stage'), sound=$('sound'), status=$('audioStatus');
  const progressKey=book.id+':progress-v2';
  let progress=new Set();
  try{ progress=new Set(JSON.parse(localStorage.getItem(progressKey)||'[]')); }catch{}
  let pageIndex=0, visibleVerse=0, soundEpoch=0, audio=null, followTimer=null, writer=null, updateVerseLine=null, stopPainting=null;
  function record(key){
    progress.add(key);
    try{localStorage.setItem(progressKey,JSON.stringify([...progress]));}catch{}
  }
  function el(tag,klass,text){
    const node=document.createElement(tag);
    if(klass)node.className=klass;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function btn(label,klass,handler,aria){
    const node=el('button',klass,label);
    node.type='button';
    if(aria)node.setAttribute('aria-label',aria);
    node.addEventListener('click',handler);
    return node;
  }
  function row(...children){const item=el('div','row');item.append(...children);return item;}
  function feedback(result,message,wrong=false){result.textContent=message;result.classList.toggle('bad',wrong);}
  function resultStatus(){const result=el('div','result');result.setAttribute('role','status');return result;}
  function normalSound(){
    sound.classList.remove('busy');
    stage.querySelector('.layout')?.classList.remove('is-speaking');
    $('soundLabel').textContent=book.pages[pageIndex].lines?'聽全首':pageIndex>=7&&pageIndex<=10?'聽玩法':'聽故事';
    sound.setAttribute('aria-label',pageIndex===1?'聽故事':'播放本頁');
  }
  function cancelAudio(){
    soundEpoch++;
    clearInterval(followTimer);
    followTimer=null;
    if(audio){
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.remove();
      audio=null;
    }
    normalSound();
  }
  function play(sources,done=()=>{},onClip=()=>{}){
    cancelAudio();
    if(!sources.length)return;
    const token=soundEpoch;
    sound.classList.add('busy');
    stage.querySelector('.layout')?.classList.add('is-speaking');
    $('soundLabel').textContent='停止';
    sound.setAttribute('aria-label','停止播放');
    const clip=el('audio');
    clip.preload='auto';
    clip.playsInline=true;
    clip.hidden=true;
    document.body.append(clip);
    audio=clip;
    const finish=()=>{
      if(token!==soundEpoch)return;
      audio=null;
      clip.remove();
      normalSound();
      done();
    };
    const start=index=>{
      if(token!==soundEpoch)return;
      if(index===sources.length){finish();return;}
      onClip(index);
      clip.src=sources[index];
      clip.onended=()=>start(index+1);
      clip.onerror=()=>{
        if(token===soundEpoch){cancelAudio();status.textContent='音訊暫時未能播放';}
      };
      clip.play().catch(()=>{
        if(token===soundEpoch){cancelAudio();status.textContent='請再按播放';}
      });
    };
    start(0);
  }
  function speak(word){
    const clip=book.voice[word];
    if(clip)play([clip]);
  }
  function titleLine(panel,title){
    panel.append(el('h1','sr-only',title));
  }
  function paintedButton(label,name,handler){
    return btn('',`painted-hotspot ${name}`,handler,label);
  }
  function sceneHit(art,label,x,y,width,height,handler){
    const button=paintedButton(label,'scene-object',handler);
    Object.assign(button.style,{left:x+'%',top:y+'%',width:width+'%',height:height+'%'});
    art.append(button);
  }
  function pageComplete(page){
    if(page.words)return page.words.every(word=>progress.has('word:'+word.text))&&page.sentences.every((_,i)=>progress.has(page.id+':sentence:'+i));
    if(page.lines)return page.lines.every((_,i)=>progress.has(page.id+':verse:'+i));
    if(page.chars)return page.chars.every(char=>progress.has('write:'+char));
    if(page.groups)return Object.values(page.groups).flat().every(word=>progress.has('flower:'+word));
    if(page.pairs)return page.pairs.every((_,i)=>progress.has('pair:'+i))&&Object.keys(page.counts).every(ch=>progress.has('count:'+ch));
    if(page.correct)return page.correct.every(i=>progress.has('invention:'+i));
    return true;
  }
  function cover(page,art){
    if(page.type==='cover'){
      art.parentNode.prepend(el('h1','sr-only',book.title));
      art.append(
        paintedButton('開始讀繪本','start-sign',()=>go(1,true)),
        paintedButton('聽熊貓打招呼','cover-panda',()=>audio?cancelAudio():play(page.audio))
      );
      return;
    }
    const finished=book.pages.every(pageComplete);
    art.parentNode.prepend(el('h1','sr-only',finished?'旅程完成':'旅程到站'));
    const sign=btn(finished?'再讀一次':'繼續玩','painted-sign ink-surface',()=>{
      go(finished?0:book.pages.findIndex(p=>!pageComplete(p)));
    });
    art.parentNode.append(sign);
  }
  function illustratedStory(page,layout,art,image){
    const heading=el('h1','sr-only',page.title);
    const scene=[
      paintedButton('聽「地圖」','map-object',()=>speak('地圖')),
      paintedButton('聽「地球」','globe-object',()=>speak('地球'))
    ];
    const panel=el('section','panel notebook-page ink-surface');
    panel.setAttribute('aria-label','旅行筆記');
    const open=paintedButton('翻開筆記','notebook-object',()=>setNote(true));
    const close=paintedButton('返回場景','return-ribbon',()=>setNote(false));
    scene.push(open);
    function setNote(show){
      cancelAudio();
      layout.classList.toggle('open-notebook',show);
      for(const control of scene)control.hidden=show;
      close.hidden=!show;
      panel.hidden=!show;
      sound.hidden=show;
      image.src=show?'assets/pages/p01-notebook.webp':page.art;
      image.alt=show?'桌上攤開的旅行筆記，右上角有返回場景的紅色書籤。':page.alt;
      (show?close:open).focus({preventScroll:true});
    }
    panel.hidden=true;
    close.hidden=true;
    art.append(...scene,close);
    layout.prepend(heading);
    layout.append(panel);
    story(page,panel,art);
  }
  function story(page,panel,art){
    if(page.id!=='p01')titleLine(panel,page.title);
    const groups=[];
    for(let i=0;i<page.words.length;i+=3)groups.push(page.words.slice(i,i+3));
    const tasks=el('div','stack'), info=resultStatus();
    const controls=el('div','row spread');
    const words=el('div','words'), gloss=el('div','hint','點圖或詞語，聽讀音');
    const sentenceArea=el('div','stack');
    const sentence=el('p','typeline');
    const readSentence=btn('聽句子','quiet',()=>play([page.sentences[line].audio]));
    sentenceArea.hidden=true;
    let group=0,target=null,line=-1;
    const practice=btn('聽音揀詞','action',()=>{
      if(target){speak(target.text);return;}
      const available=groups[group];
      target=available.find(word=>!progress.has('word:'+word.text))||available[0];
      practice.textContent='再聽';
      words.querySelectorAll('.word').forEach(word=>word.classList.remove('active'));
      gloss.textContent='你聽到邊個詞？';
      feedback(info,'');
      speak(target.text);
    });
    const more=btn('更多詞','quiet',()=>{
      group=(group+1)%groups.length;
      target=null;
      practice.textContent='聽音揀詞';
      gloss.textContent='點一個詞聽讀音';
      feedback(info,'');
      cancelAudio();
      renderWords();
    });
    const textButton=btn('讀課文','quiet',()=>{
      if(page.sentences.length===1&&!sentenceArea.hidden){
        sentenceArea.hidden=true;
        textButton.textContent='讀課文';
        return;
      }
      sentenceArea.hidden=false;
      line=(line+1)%page.sentences.length;
      const {text,highlight}=page.sentences[line];
      const start=text.indexOf(highlight);
      sentence.replaceChildren(document.createTextNode(text.slice(0,start)),el('strong',null,highlight),document.createTextNode(text.slice(start+highlight.length)));
      textButton.textContent=page.sentences.length===1?'收起課文':'下一句';
      readSentence.hidden=!page.sentences[line].audio;
      record(page.id+':sentence:'+line);
    });
    function renderWords(){
      words.replaceChildren(...groups[group].map(word=>btn(word.text,'word',event=>{
        if(target){
          if(word!==target){feedback(info,'再聽一次，試吓另一個詞。',true);return;}
          record('word:'+word.text);
          event.currentTarget.classList.add('correct');
          feedback(info,'揀啱咗！');
          target=null;
          practice.textContent='聽音揀詞';
        }else{
          words.querySelectorAll('.word').forEach(button=>button.classList.remove('active'));
          event.currentTarget.classList.add('active');
        }
        gloss.textContent=word.clue;
        speak(word.text);
      })));
    }
    controls.append(practice,more,textButton);
    tasks.append(words,gloss,controls,info);
    sentenceArea.append(sentence,readSentence);
    panel.append(tasks,sentenceArea);
    renderWords();
    const hotspots={p01:[],p02:[['故宮',14,24,43,20],['拍照',62,26,17,19]],
      p04:[['麵粉娃娃',20,25,16,21],['餃子',15,70,22,17]]};
    for(const [term,x,y,w,h] of hotspots[page.id]){
      sceneHit(art,'聽「'+term+'」',x,y,w,h,()=>{
        group=groups.findIndex(cluster=>cluster.some(word=>word.text===term));
        target=null;
        practice.textContent='聽音揀詞';
        feedback(info,'');
        renderWords();
        const hit=[...words.children].find(button=>button.textContent===term);
        hit.click();
      });
    }
  }
  function verse(page,panel,art){
    titleLine(panel,page.title);
    if(page.author)panel.append(el('span','sr-only',page.author));
    const line=el('p','typeline'), hint=resultStatus();
    const tabs=row();
    const s=btn('聽一句','action',()=>listen(false));
    const follow=btn('跟我讀','quiet',()=>listen(true));
    const controls=row(s,follow);
    function paint(i){
      visibleVerse=i;
      line.textContent=page.lines[i].text;
      feedback(hint,'');
      for(const [j,button] of [...tabs.children].entries()){
        button.classList.toggle('active',j===i);
        button.setAttribute('aria-pressed',String(j===i));
      }
    }
    function select(i,withSound=false){
      cancelAudio();
      paint(i);
      if(withSound)listen(false);
    }
    updateVerseLine=paint;
    function listen(repeat){
      const selected=visibleVerse;
      feedback(hint,'');
      play([page.lines[selected].audio],()=>{
        record(page.id+':verse:'+selected);
        if(!repeat){feedback(hint,'輪到你讀讀。');return;}
        const end=performance.now()+6000;
        feedback(hint,'輪到你讀　6');
        followTimer=setInterval(()=>{
          const remaining=Math.max(0,Math.ceil((end-performance.now())/1000));
          if(remaining){feedback(hint,'輪到你讀　'+remaining);return;}
          clearInterval(followTimer);
          followTimer=null;
          feedback(hint,'讀完啦！');
        },100);
      });
    }
    if(page.id!=='p05')page.lines.forEach((_,i)=>tabs.append(btn(String(i+1),'tab',()=>select(i),`第 ${i+1} 句`)));
    if(page.type==='poem'){
      for(const [i,[x,y]] of [[53,13],[67,6],[78,21],[52,32]].entries()){
        sceneHit(art,`雪花，聽第 ${i+1} 句`,x,y,10,12,()=>select(i,true));
      }
    }
    if(page.id==='p05'){
      const objects=[['指南針',48,58,20,18],['煙花圖',81,32,15,24],['造紙篩',63,38,16,18],['活字印刷',70,64,22,19]];
      for(const [i,[name,x,y,w,h]] of objects.entries()){
        sceneHit(art,'聽「'+name+'」',x,y,w,h,()=>select(i,true));
      }
    }
    if(tabs.children.length)panel.append(tabs);
    panel.append(line,controls,hint);
    select(0);
  }
  function writing(page,panel){
    titleLine(panel,page.title);
    const tabs=row(), grid=el('div','write-grid'), hint=resultStatus(), controls=row();
    tabs.classList.add('char-tabs');
    let current=page.chars[0],revision=0;
    function quiz(token){
      if(token!==revision)return;
      writer.quiz({
        onMistake:()=>feedback(hint,'跟提示再寫一次',true),
        onCorrectStroke:data=>feedback(hint,`完成第 ${data.strokeNum+1} 畫`),
        onComplete:()=>{
          record('write:'+current);
          feedback(hint,`寫好「${current}」啦！`);
          mark();
        }
      });
    }
    function mark(){
      for(const child of tabs.children){
        child.classList.toggle('active',child.textContent===current);
        child.classList.toggle('done',progress.has('write:'+child.textContent));
      }
    }
    function mount(char){
      current=char;
      revision++;
      writer?.cancelQuiz();
      mark();
      grid.replaceChildren();
      if(!window.HanziWriter){feedback(hint,'筆順練習未能載入',true);return;}
      const size=Math.round(grid.clientWidth);
      writer=window.HanziWriter.create(grid,char,{width:size,height:size,padding:12,showOutline:true,
        strokeColor:'#304940',outlineColor:'#d4bda6',drawingColor:'#9b4733',drawingWidth:12,
        showHintAfterMisses:2,charDataLoader:()=>book.hanzi[char]});
      feedback(hint,'用手指寫');
      quiz(revision);
    }
    tabs.append(...page.chars.map(char=>btn(char,'tab',()=>{mount(char);speak(char);})));
    controls.append(btn('聽讀音','quiet',()=>speak(current)),btn('睇筆順','action',()=>{
      const token=++revision;
      if(!writer)return;
      writer.cancelQuiz();
      writer.animateCharacter({onComplete:()=>quiz(token)});
    }),btn('再寫','quiet',()=>mount(current)));
    panel.append(tabs,grid,controls,hint);
    requestAnimationFrame(()=>{if(grid.isConnected)mount(current);});
  }
  function flower(page,panel){
    titleLine(panel,page.title);
    const tabs=row(), words=el('div','flower-board'), hint=resultStatus();
    let current=Object.keys(page.groups)[0];
    function show(){
      for(const t of tabs.children)t.classList.toggle('active',t.textContent===current);
      const collection=page.groups[current];
      words.replaceChildren(...collection.map(word=>btn(word,'word'+(progress.has('flower:'+word)?' correct':''),event=>{
        record('flower:'+word);
        speak(word);
        event.currentTarget.classList.add('correct');
        const count=collection.filter(w=>progress.has('flower:'+w)).length;
        feedback(hint,count===collection.length?'五瓣花開晒啦！':`聽咗 ${count}／5 詞`);
      })));
      words.append(el('span','flower-heart',current));
    }
    tabs.append(...Object.keys(page.groups).map(char=>btn(char,'tab',()=>{current=char;show();feedback(hint,'點一個詞聽讀音');speak(char);})));
    panel.append(tabs,words,hint);
    feedback(hint,'點一個詞聽讀音');
    show();
  }
  function chineseQuiz(page,panel){
    const title=el('h1','sr-only',page.title);
    const prompt=el('div','quiz-letter'), answers=el('div','quiz-answer'), hint=resultStatus();
    const nextQuestion=btn('下一題','action',()=>{q++;render();});
    const redo=btn('再玩','quiet',()=>{q=0;render();});
    const turn=page.pairs.map(([first,choices,correct],i)=>({key:'pair:'+i,first,choices,correct}))
      .concat(Object.entries(page.counts).map(([first,correct])=>({key:'count:'+first,first,choices:[2,3,4,5],correct})));
    let q=0;
    function render(){
      const question=turn[q];
      answers.replaceChildren();
      nextQuestion.hidden=true;
      redo.hidden=Boolean(question);
      prompt.hidden=!question;
      if(!question){feedback(hint,'九題都做完喇。');return;}
      const {key,first,choices,correct}=question;
      const counting=key.startsWith('count:');
      title.textContent=counting?'數一數筆畫':page.title;
      prompt.textContent=counting?first:first+' ＋ ?';
      feedback(hint,counting?'呢個字有幾多畫？':'揀一個字，合成詞語。');
      answers.classList.toggle('four',counting);
      answers.append(...choices.map(choice=>btn(String(choice),'item',event=>{
        if(choice!==correct){feedback(hint,'再試吓。',true);return;}
        record(key);
        event.currentTarget.classList.add('correct');
        for(const item of answers.children)item.disabled=true;
        if(!counting){prompt.textContent=first+choice;speak(first+choice);}
        feedback(hint,counting?`啱喇！${choice} 畫。`:'配對成功！');
        nextQuestion.hidden=false;
      })));
    }
    panel.append(title,prompt,answers,hint,row(nextQuestion,redo));
    render();
  }
  function inventions(page,panel){
    titleLine(panel,page.title);
    const note=el('p','hint','揀出四大發明'), cards=el('div','picture-grid'), hint=resultStatus();
    function update(){
      const count=page.correct.filter(i=>progress.has('invention:'+i)).length;
      note.textContent=count===4?'四個印章齊晒！':`揀出四大發明　${count}／4`;
    }
    for(const [i,name] of page.inventions.entries()){
      const key='invention:'+i;
      const choice=btn('', 'card-choice'+(progress.has(key)?' correct':''),()=>{
        if(!page.correct.includes(i)){feedback(hint,`「${name}」再諗吓。`,true);return;}
        record(key);
        choice.classList.add('correct');
        choice.setAttribute('aria-pressed','true');
        feedback(hint,`「${name}」啱喇！`);
        update();
      },name);
      choice.setAttribute('aria-pressed',String(progress.has(key)));
      choice.append(el('span','object'),el('span','name',name));
      cards.append(choice);
    }
    update();
    panel.append(note,cards,hint);
  }
  function render(){
    stopPainting?.();
    const page=book.pages[pageIndex];
    updateVerseLine=null;
    const simple=page.type==='cover'||page.type==='celebration';
    const practice=pageIndex>=7&&pageIndex<=10;
    const layout=el('article',`layout illustrated-layout ${page.id}${simple?' cover':practice?' practice':''}`);
    stage.closest('.shell').classList.toggle('illustrated-cover',page.type==='cover');
    const art=el('div','art'), image=el('img');
    image.src=page.art;
    image.alt=page.alt;
    image.width=1448;
    image.height=1086;
    image.draggable=false;
    art.append(image);
    layout.append(art);
    sound.classList.add('in-page-audio');
    sound.classList.add('painted-hotspot');
    sound.hidden=page.type==='cover';
    art.append(sound);
    stage.replaceChildren(layout);
    if(simple)cover(page,art);
    else if(page.id==='p01')illustratedStory(page,layout,art,image);
    else{
      const panel=el('section','panel ink-surface');
      layout.append(panel);
      if(page.words)story(page,panel,art);
      else if(page.lines)verse(page,panel,art);
      else if(page.chars)writing(page,panel);
      else if(page.groups)flower(page,panel);
      else if(page.pairs)chineseQuiz(page,panel);
      else if(page.inventions)inventions(page,panel);
    }
    $('pageNumber').textContent=`${pageIndex+1} ／ ${book.pages.length}`;
    $('previous').disabled=pageIndex===0;
    $('next').disabled=pageIndex===book.pages.length-1;
    normalSound();
    stopPainting=window.illustrateInk(layout,art,image);
  }
  function go(index,playStory=false){
    if(index<0||index>=book.pages.length||index===pageIndex)return;
    writer?.cancelQuiz();
    writer=null;
    cancelAudio();
    pageIndex=index;
    render();
    window.scrollTo({top:0});
    if(playStory)play(book.pages[index].audio);
  }
  $('previous').addEventListener('click',()=>go(pageIndex-1));
  $('next').addEventListener('click',()=>go(pageIndex+1));
  sound.addEventListener('click',()=>{
    if(audio){cancelAudio();return;}
    const page=book.pages[pageIndex];
    if(page.type==='celebration'&&!book.pages.every(pageComplete)){
      status.textContent='仲有練習可以玩。';
      return;
    }
    if(page.lines){
      const intro=page.audio[0];
      play([intro,...page.lines.map(line=>line.audio)],()=>{},i=>{
        if(i>0)updateVerseLine?.(i-1);
      });
    }else play(page.audio);
  });
  $('contentsOpen').addEventListener('click',()=>$('contents').showModal());
  $('chapters').append(...book.pages.map((page,i)=>{
    const leaf=btn('','leaf-thumbnail',()=>{
      $('contents').close();
      go(i);
    },page.title);
    const thumbnail=el('img');
    thumbnail.src=page.art;
    thumbnail.alt='';
    thumbnail.loading='lazy';
    leaf.append(thumbnail);
    return leaf;
  }));
  let down=null;
  stage.addEventListener('pointerdown',event=>{
    down=event.target.closest('.art')&&!event.target.closest('button')?[event.clientX,event.clientY]:null;
  });
  stage.addEventListener('pointercancel',()=>{down=null;});
  stage.addEventListener('pointerup',event=>{
    if(!down)return;
    const [x,y]=down;
    down=null;
    const dx=event.clientX-x;
    if(Math.abs(dx)>62&&Math.abs(dx)>1.4*Math.abs(event.clientY-y))go(pageIndex+(dx<0?1:-1));
  });
  window.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||$('contents').open||/^(BUTTON|INPUT|TEXTAREA)$/.test(event.target?.tagName))return;
    if(event.key==='ArrowLeft')go(pageIndex-1);
    if(event.key==='ArrowRight')go(pageIndex+1);
  });
  window.addEventListener('pagehide',cancelAudio);
  function closeToLibrary(){cancelAudio();}
  window.paksonReader={closeToLibrary};
  render();
})();
