'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const roleNames = {narrator:'Narrator',pakson:'Pakson',pikachu:'Pikachu',fireman:'Fireman',policeman:'Policeman',policewoman:'Officer Jenny',doctor:'Doctor',nurse:'Nurse Joy',duck:'Little Duck'};
  const state = {book:null,index:0,turning:false,started:false,audio:null,autoTurn:false,worker:null,flip:null,ready:false,visualLeaf:0,pages:[],images:[],imagePromises:new Map(),imageFailures:new Set(),decodedPages:new Set(),navigation:null,gesture:null,lastError:null,canvas:null,image:null,renderInfo:null,lastReleaseMs:0,curl:null,fingerGeometry:null};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let webStarted = false;
  let currentSegment = '', frame = 0, resizePending = false, sequence = 0, gestureTimer = null;
  const GESTURE_IDLE_MS = 2400;
  const TURN_DEADLINE_MS = 7800;
  const escapeHTML = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  // Books can suspend rAF without suspending a visible document's timers.
  // A turn must remain cancellable and finishable when that happens.
  const nextFrame = () => new Promise(resolve => {
    let finished=false;
    const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);resolve();};
    const timer=setTimeout(finish,100);
    requestAnimationFrame(finish);
  });
  const withDeadline = (promise,milliseconds,message) => new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(message)),milliseconds);
    Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
  const painted = async () => { await nextFrame(); await nextFrame(); };
  const preferenceKey = key => ['page','readingMode'].includes(key) && state.book?.id ? `pakson:book:${state.book.id}:${key}` : `pakson:${key}`;
  const sessionPreferences = {};
  const loadPreference = (key,fallback) => {const name=preferenceKey(key);try{const stored=localStorage.getItem(name);if(stored!==null)return JSON.parse(stored);}catch{}return Object.prototype.hasOwnProperty.call(sessionPreferences,name)?sessionPreferences[name]:fallback;};
  const savePreference = (key,value) => {const name=preferenceKey(key);sessionPreferences[name]=value;try{localStorage.setItem(name,JSON.stringify(value));}catch{}};
  // The preference belongs to this book; old global autoTurn values are ignored.
  let autoTurnTimer=null,autoTurnToken=0,naturalEnd=null;
  function cancelAutomaticTurn(forget=true) {
    ++autoTurnToken;clearTimeout(autoTurnTimer);autoTurnTimer=null;
    if(forget)naturalEnd=null;
  }
  function currentNaturalEnd() {
    const audio=state.audio,page=state.book?.pages[state.index];
    return !!naturalEnd&&naturalEnd.index===state.index&&naturalEnd.generation===audio?.generation&&
      audio.state==='ended'&&audio.page===page&&audio.node.ended&&!!page?.audio&&page.page_type!=='closing_logo';
  }
  function scheduleAutomaticTurn() {
    cancelAutomaticTurn(false);
    if(state.book?.pages[state.index]?.page_type==='word_practice')return;
    if(!state.autoTurn||!currentNaturalEnd()||!state.ready||!entryVisible()||state.turning||state.navigation||state.gesture||$('bookDialog').open||state.index>=state.book.pages.length-1)return;
    const token=autoTurnToken,index=state.index,generation=state.audio.generation;
    autoTurnTimer=setTimeout(()=>{
      autoTurnTimer=null;
      if(token!==autoTurnToken||!state.autoTurn||!currentNaturalEnd()||state.index!==index||state.audio.generation!==generation||!state.ready||!entryVisible()||state.turning||state.navigation||state.gesture||$('bookDialog').open)return;
      cancelAutomaticTurn();turnTo(index+1,{autoplay:true});
    },650);
  }
  function syncReadingModeUI() {
    if($('readingModeManual'))$('readingModeManual').setAttribute('aria-checked',String(!state.autoTurn));
    if($('readingModeAuto'))$('readingModeAuto').setAttribute('aria-checked',String(state.autoTurn));
    if($('readingModeDescription'))$('readingModeDescription').textContent=state.autoTurn?
      'Automatic: story pages turn after narration. Correct answers continue to the next question. Turn the page when practice finishes.':
      'Manual: turn story pages when you are ready. Correct answers continue to the next question. Turn the page when practice finishes.';
    syncNextHint();
  }
  function setReadingMode(value,persist=false) {
    const mode=value==='auto'?'auto':'manual';
    cancelAutomaticTurn();state.autoTurn=mode==='auto';
    if(persist)savePreference('readingMode',mode);
    syncReadingModeUI();
    // Only an actual completed current audio may become eligible when choosing
    // Auto. Restored/visual emit('ended') and the silent logo are not completions.
    const audio=state.audio,page=state.book?.pages[state.index];
    if(state.autoTurn&&audio?.state==='ended'&&audio.page===page&&audio.node.ended&&page?.audio&&page.page_type!=='closing_logo'&&entryVisible()) {
      naturalEnd={index:state.index,generation:audio.generation};scheduleAutomaticTurn();
    }
  }
  function syncStoredReadingMode() {
    const mode=loadPreference('readingMode','manual')==='auto'?'auto':'manual';
    if((state.autoTurn?'auto':'manual')!==mode)setReadingMode(mode);
    else syncReadingModeUI();
  }
  function validNaturalEnd(media,proof) {
    const audio=state.audio;
    return !!proof&&proof===audio?.lastNaturalEnd&&proof.actualNaturalEnd===true&&proof.nodeEndedAtEvent===true&&proof.sessionEpoch===media?.practice_epoch&&proof.page===media&&media===audio.page&&proof.generation===audio.generation&&proof.token===audio.generation-1&&proof.source===audio.node.getAttribute('src')&&audio.state==='ended'&&audio.node.ended;
  }
  async function playNarration(page,restart=false,entry=false) {
    if(page?.page_type==='closing_logo')return false; // Reward owns this entry; no silent voice navigation.
    if(entry&&page?.page_type==='word_practice')window.PaksonPractice.restartGroup(page);
    const media=page?.page_type==='word_practice'?window.PaksonPractice.mediaFor(page,restart&&!entry):page;
    return entry?state.audio.playEntry(media):state.audio.play(media,restart);
  }
  let pendingPracticePlayback=null;
  function practicePlaybackCurrent(media) {
    return !!media&&state.book?.pages[state.index]?.page_id===media.practice_parent_id&&window.PaksonPractice?.getSession()?.matches(media);
  }
  function drainPracticePlayback() {
    const pending=pendingPracticePlayback;if(!pending)return false;
    if(pending.index!==state.index||!practicePlaybackCurrent(pending.media)){pendingPracticePlayback=null;return false;}
    if(!state.ready||!entryVisible()||state.turning||state.navigation||state.gesture||$('bookDialog').open)return false;
    pendingPracticePlayback=null;
    const current=state.audio.page;
    if(current?.audio_id===pending.media.audio_id&&current.practice_epoch===pending.media.practice_epoch&&['playing','loading'].includes(state.audio.state))return true;
    state.audio.navigation();state.started=true;
    state.audio.play(pending.media,true).catch(error=>report(error.message||'Turn away and return to hear this question.'));
    return true;
  }
  async function playPracticeClip(media) {
    if(!practicePlaybackCurrent(media))return false;
    // A real completion is committed by Practice immediately. Transient input
    // only delays its next PLAY command; it can never discard the completion.
    pendingPracticePlayback={media,index:state.index};return drainPracticePlayback();
  }
  function onNaturalAudioEnd(proof) {
    cancelAutomaticTurn();
    const audio=state.audio,page=state.book?.pages[state.index];
    if(page?.page_type==='word_practice'){
      if(state.ready&&state.book.pages[state.index].page_id===audio.page?.practice_parent_id&&validNaturalEnd(audio.page,proof))window.PaksonPractice.onNaturalEnd(audio.page,proof);
      return;
    }
    if(!state.ready||!entryVisible()||state.turning||state.navigation||audio?.state!=='ended'||audio.page!==page||!audio.node.ended||!page?.audio||page.page_type==='closing_logo')return;
    naturalEnd={index:state.index,generation:audio.generation};scheduleAutomaticTurn();
  }
  const titleFor = page => ({cover:'Cover',word_practice:`Word practice ${page.group_number}`,review:'D: read and say',song:'Song',closing_logo:'Pakson'})[page.page_type] || `Story page ${page.source_story_page}`;
  const highlighted = text => escapeHTML(text).replace(/\b(fireman|policeman|policewoman|doctor|nurse|duck|doll|door)\b/gi,'<strong>$1</strong>');
  function announce(message) { $('bookStatus').textContent = message; }
  function report(message, fatal = false) {
    state.lastError = message; announce(message); $('menuStatus').textContent = message; $('menuStatus').hidden = false;
    if (fatal) { $('reloadButton').hidden = false; openMenu('main'); }
  }
  function syncControls() {
    const disabled = !state.ready || state.turning;
    $('pageStage').setAttribute('aria-disabled',String(!state.ready));
    syncNextHint();
    $('bookShell').classList.toggle('is-turning',state.turning);
    $('bookShell').setAttribute('aria-busy',String(disabled));
    if (state.book) $('flipbook').setAttribute('aria-label',`${titleFor(state.book.pages[state.index])}: ${state.book.pages[state.index].title}`);
    document.querySelectorAll('.thumbnail-button').forEach(button => button.setAttribute('aria-current',String(Number(button.dataset.page) === state.index)));
    window.PaksonPractice?.sync(state.book?.pages[state.index],state.ready&&!state.turning);
    window.PaksonFeedback?.pageChanged(state.book?.pages[state.index],webStarted&&state.ready&&!state.turning&&!document.hidden);
    drainPracticePlayback();
  }
  function syncNextHint() {
    const show = state.book?.pages[state.index]?.page_type!=='word_practice' && !state.autoTurn && state.ready && !state.turning && state.audio?.state === 'ended' && state.index < (state.book?.pages.length || 0)-1;
    const button = $('nextPageButton');
    if (button.hidden === show) {button.hidden = !show;button.classList.toggle('just-finished',show);}
    button.disabled = !show;
  }
  function updateAudioUI(status,detail) {
    entryDiagnostic('audio:'+status,detail);
    if(status!=='ended')cancelAutomaticTurn();
    $('bookShell').classList.toggle('is-playing',status==='playing');
    syncNextHint();
    if(status==='error')report('The narration could not start. Turn away and return to try again.');
    else if(status==='playing')announce('Reading this page.');
    else if(status==='ended')announce(state.book?.pages[state.index]?.page_type==='word_practice'?'Choose an answer.':'This page has finished. Turn away and return to hear it again.');
    window.PaksonPractice?.audioState(status,state.audio?.page);
    window.PaksonFeedback?.voiceChanged(status);
  }
  function renderTranscript() {
    if (!state.book) return;
    const page = state.book.pages[state.index]; $('transcriptTitle').textContent = page.title;
    $('transcriptContent').innerHTML = page.segments.map(segment => `<div class="transcript-row" id="line-${escapeHTML(segment.id)}"><div class="transcript-role">${escapeHTML(roleNames[segment.speaker] || segment.speaker)}</div><p class="transcript-en" lang="en-GB">${highlighted(segment.text)}</p></div>`).join('');
    currentSegment = '';
  }
  function fitBook() {
    if (state.turning) { resizePending = true; return; }
    const reader = $('reader'), style = getComputedStyle(reader);
    const availableWidth = reader.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableHeight = reader.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    // Whole CSS pixels and an exact 4:3 ratio keep the Canvas logical bounds
    // aligned at every size, including fractional iPad viewport dimensions.
    const width = Math.max(4,Math.floor(Math.min(availableWidth,availableHeight*4/3)/4)*4), height = width*.75;
    $('bookShell').style.width = `${width}px`; $('bookShell').style.height = `${height}px`;
    $('flipbook').style.minWidth = `${width}px`; $('flipbook').style.minHeight = `${height}px`;
    if (state.flip) {
      Object.assign(state.flip.getSettings(),{width,height,minWidth:width,maxWidth:width,minHeight:height,maxHeight:height});
      state.flip.getUI().update(); state.flip.update();
    }
    const rect = $('bookShell').getBoundingClientRect();
    for (const [key,value] of Object.entries({left:rect.left,top:rect.top,width:rect.width,height:rect.height})) document.documentElement.style.setProperty(`--book-${key}`,`${value}px`);
    resizePending = false;
    return {width,height};
  }
  function installCanvasAdapters() {
    const ui = state.flip.getUI(), render = state.flip.getRender(), canvas = ui.getDistElement();
    if (!(canvas instanceof HTMLCanvasElement) || typeof ui.resizeCanvas !== 'function' || typeof render.drawBookShadow !== 'function') throw new Error('The whole-page paper renderer is unavailable.');
    state.canvas = canvas; canvas.setAttribute('aria-hidden','true');
    // StPageFlip 2.0.7 uses CSS offsetWidth/Height for geometry. Only the backing
    // bitmap is enlarged, so Pointer Events remain in unscaled CSS coordinates.
    ui.resizeCanvas = () => {
      const style = getComputedStyle(canvas), width = parseFloat(style.width), height = parseFloat(style.height), ratio = Math.min(devicePixelRatio || 1,2);
      const backingWidth=Math.max(1,Math.round(width*ratio)),backingHeight=Math.max(1,Math.round(height*ratio));
      // Assigning either dimension clears a canvas, even when its value is unchanged.
      if(canvas.width!==backingWidth||canvas.height!==backingHeight){canvas.width=backingWidth;canvas.height=backingHeight;++canvasEpoch;canvasDrawnIndex=null;}
      const ctx = canvas.getContext('2d'); ctx.setTransform(ratio,0,0,ratio,0,0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      state.renderInfo = {cssWidth:width,cssHeight:height,backingWidth:canvas.width,backingHeight:canvas.height,ratio};
    };
    // Remove the permanent binding shadow only. Native moving inner and outer
    // paper shadows stay intact during a fold; there is no line at rest.
    render.drawBookShadow = () => {};
    const nativeStart = render.startAnimation.bind(render);
    render.startAnimation = (frames,duration,finished) => {
      const milliseconds = Math.min(1100,Math.max(720,duration)), count = Math.max(48,Math.ceil(milliseconds*.06));
      const eased = Array.from({length:count+1},(_,index) => frames[Math.round((1-Math.pow(1-index/count,3))*(frames.length-1))]);
      state.lastReleaseMs = milliseconds;
      nativeStart(eased,milliseconds,finished);
    };
    const nativeUIUpdate=ui.update.bind(ui);
    ui.update=()=>{nativeUIUpdate();drawCurrentCanvasFrame('ui-update');if(state.ready)stabiliseBootFrame();};
    ui.update();
  }
  function installSymmetricPaperAdapters() {
    const render = state.flip.getRender(), controller = state.flip.getFlipController(), collection = state.flip.getPageCollection();
    if (![render.drawFrame,controller.checkDirection,collection.getBottomPage,collection.getFlippingPage,state.flip.turnToNextPage].every(item => typeof item === 'function')) throw new Error('The fingertip paper renderer is unavailable.');
    const isMirror = () => state.curl?.direction === -1;
    const nativeFrame = render.drawFrame.bind(render), ctx = render.getContext();
    render.drawFrame = () => {
      ctx.save();
      try {
        if (isMirror()) {ctx.translate(render.getRect().pageWidth,0);ctx.scale(-1,1);}
        nativeFrame();
        if (state.fingerGeometry && state.curl) state.fingerGeometry.drawnAt = performance.now();
      } catch(error) {
        rendererFailure(error);
      } finally {ctx.restore();}
    };
    // Keep the vendor's render loop alive if an animation callback throws.
    const renderTick=render.render.bind(render);
    render.render=time=>{
      if(state.rendererFault)return;
      try {renderTick(time);} catch(error) {rendererFailure(error);}
    };
    // Both directions use the same soft-page calculation. Backwards mirrors
    // only the geometry; these texture transforms keep every word readable.
    for (const page of state.pages) {
      const nativeDraw = page.draw.bind(page), nativeSimple = page.simpleDraw.bind(page);
      page.simpleDraw = orientation => {
        if (!isMirror() || !page.isLoad) {nativeSimple(orientation);return;}
        const rect = render.getRect();
        ctx.save();
        try {
          ctx.translate(rect.left+2*rect.pageWidth,rect.top);ctx.scale(-1,1);
          ctx.drawImage(page.image,0,0,rect.pageWidth,rect.height);
        } finally {ctx.restore();}
      };
      page.draw = density => {
        if (!isMirror() || !page.isLoad) {nativeDraw(density);return;}
        const rect=render.getRect(), position=render.convertToGlobal(page.state.position);
        ctx.save();
        try {
          ctx.translate(position.x,position.y);ctx.beginPath();
          for (const point of page.state.area) if (point) {const global=render.convertToGlobal(point);ctx.lineTo(global.x-position.x,global.y-position.y);}
          ctx.rotate(page.state.angle);ctx.clip();ctx.translate(rect.pageWidth,0);ctx.scale(-1,1);
          ctx.drawImage(page.image,0,0,rect.pageWidth,rect.height);
        } finally {ctx.restore();}
      };
    }
    const nativeFlipping=collection.getFlippingPage.bind(collection), nativeBottom=collection.getBottomPage.bind(collection), nativeCheck=controller.checkDirection.bind(controller), nativeNext=state.flip.turnToNextPage.bind(state.flip);
    collection.getFlippingPage = direction => state.curl ? state.pages[state.curl.from] : nativeFlipping(direction);
    collection.getBottomPage = direction => state.curl ? state.pages[state.curl.target] : nativeBottom(direction);
    controller.checkDirection = direction => state.curl ? state.curl.target>=0 && state.curl.target<state.pages.length : nativeCheck(direction);
    state.flip.turnToNextPage = () => state.curl ? state.flip.turnToPage(state.curl.target) : nativeNext();
  }
  function startPaper(tx,point,corner='bottom') {
    const controller=state.flip.getFlipController(), rect=state.flip.getBoundsRect();
    state.curl={direction:tx.target>tx.from ? 1 : -1,from:tx.from,target:tx.target};
    const top=corner==='top';
    if(!controller.start({x:rect.pageWidth-2,y:top?2:rect.height-2})){
      state.curl=null;throw new Error('This page cannot turn further.');
    }
    hideRestImage();
    controller.fold(point||{x:rect.pageWidth*.91,y:rect.height*.86});
  }
  function releasePaper(commit) {
    const controller=state.flip.getFlipController(), calculation=controller.getCalculation();
    if(!calculation)throw new Error('The paper touch was interrupted.');
    const {pageWidth,height}=state.flip.getBoundsRect();
    const y=calculation.getCorner()==='top'?0:height;
    controller.setState('flipping');
    controller.animateFlippingTo(calculation.getPosition(),{x:commit?-pageWidth:pageWidth,y},commit,true);
  }
  async function ensurePage(index) {
    const page = state.pages[index];
    let image = state.images[index];
    if (!page || !image) throw new Error('This page is unavailable.');
    if (!state.imagePromises.has(index)) {
      const promise = (async () => {
        // WebKit can keep a failed request on an Image after assigning the
        // same src. Replace only a never-decoded failure with the renderer's
        // actual fresh Image; successful images retain their original identity.
        if (((image.hasAttribute('src') && image.complete && !image.naturalWidth) || state.imageFailures.has(index)) && !state.decodedPages.has(index)) {
          image.onload = null; image.onerror = null;
          image = new Image(); image.decoding = 'async';
          page.image = image; state.images[index] = image; page.isLoad = false;
          page.load(); // Install the pinned ImagePage's native onload handler.
        }
        if(!image.hasAttribute('src'))image.src=state.book.pages[index].image;
        if (image.decode) await withDeadline(image.decode(),5000,'The local picture took too long to open.');
        else if (!image.complete) await withDeadline(new Promise((resolve,reject) => {image.addEventListener('load',resolve,{once:true});image.addEventListener('error',reject,{once:true});}),5000,'The local picture took too long to open.');
        if (!image.complete || image.naturalWidth!==1448 || image.naturalHeight!==1086) throw new Error('The picture is not ready.');
        // isLoad is the pinned renderer's real onload flag, not a substitute
        // image or successful decode mock. Give the native handler its frame.
        if (!page.isLoad) await painted();
        if (!page.isLoad) throw new Error('The paper image could not be prepared.');
        state.imageFailures.delete(index);state.decodedPages.add(index); return image;
      })().catch(error => {state.imagePromises.delete(index);state.imageFailures.add(index);throw error;});
      state.imagePromises.set(index,promise);
    }
    return state.imagePromises.get(index);
  }
  function warmNeighbours(index) {
    if(document.hidden||document.visibilityState==='hidden')return;
    for (const next of [index+1,index-1]) if (next>=0 && next<state.pages.length) ensurePage(next).catch(() => {});
  }
  function active(tx) { return state.navigation === tx; }
  function unlockNavigation(tx) {
    const attempt=(tx.unlockAttempt || 0)+1;tx.unlockAttempt=attempt;
    delete tx.unlockError;
    // Call synchronously in the trusted input event. A late rejection from an
    // older pointermove attempt must not overwrite a successful touch-end.
    tx.unlock=state.audio.unlock().catch(error=>{if (tx.unlockAttempt===attempt) tx.unlockError=error;});
  }
  function retireGesture(){
    const gesture=state.gesture;state.gesture=null;
    clearTimeout(gestureTimer);gestureTimer=null;
    try{if(gesture?.capture?.hasPointerCapture(gesture.pointer))gesture.capture.releasePointerCapture(gesture.pointer);}catch{}
    return gesture;
  }
  function resetPaper(index) {
    const render=state.flip.getRender(), controller=state.flip.getFlipController();
    state.curl=null;
    // StPageFlip 2.0.7 stores the scheduled animation here. Discard it
    // without invoking its previous landing callback.
    render.animation=null;
    let healthy=true;
    const attempt = action => {
      try {action();} catch(error) {healthy=false;state.lastNavigationError=String(error?.stack||error);}
    };
    attempt(()=>controller.reset());
    attempt(()=>controller.setState('read'));
    attempt(()=>{render.setFlippingPage(null);render.setBottomPage(null);render.clearShadow();});
    attempt(()=>state.flip.turnToPage(index));
    state.rendererFault=!healthy;
    showRestImage(index);
    return healthy;
  }
  function completeNavigation(tx,index,keepGesture=false) {
    clearTimeout(tx.deadline);
    state.navigation=null;
    state.turning=false;
    state.index=index;
    state.visualLeaf=index;
    state.image=state.images[index];
    if(!keepGesture&&state.gesture?.tx===tx)retireGesture();
    // Logical position and the decoded DOM page are independent of the vendor.
    resetPaper(index);
    savePreference('page',index);renderTranscript();syncControls();
    if(resizePending)fitBook();
    warmNeighbours(index);
  }
  function interruptNavigation(keepGesture=false) {
    const tx=state.navigation;
    if(!tx)return;
    const index=state.decodedPages.has(tx.landing)?tx.landing:tx.from;
    completeNavigation(tx,index,keepGesture);
    if(index===tx.from&&tx.snapshot.page){
      state.audio.page=window.PaksonPractice?.restoreMedia(tx.snapshot.page)||tx.snapshot.page;
      state.audio.offset=tx.snapshot.offset;
      state.audio.emit(tx.snapshot.status==='ended'?'ended':'paused');
    }
  }
  function recoverNavigation(tx,error) {
    if(!tx||!active(tx))return false;
    state.lastNavigationError=String(error?.stack||error);
    const index=state.decodedPages.has(tx.landing)?tx.landing:tx.from;
    completeNavigation(tx,index);
    if(index===tx.from){
      if(tx.landing!==tx.from)report('The page could not open. Please try turning again.');
      if(entryVisible())void restoreSnapshot(tx).catch(error=>report(error.message));
    }else if(tx.autoplay)void tryVisibleStart('recovered-turn');
    return index!==tx.from;
  }
  function rendererFailure(error) {
    state.lastNavigationError=String(error?.stack||error);
    if(state.rendererFault)return;
    state.rendererFault=true;
    const tx=state.navigation;
    if(tx)queueMicrotask(()=>recoverNavigation(tx,error));
    else showRestImage();
  }
  function beginNavigation(index,{silent=false,autoplay} = {}) {
    cancelAutomaticTurn();
    if (!state.ready || !state.book || index < 0 || index >= state.book.pages.length) return null;
    if (state.navigation) interruptNavigation();
    if (index === state.index) return null;
    cancelEntryStart();
    pendingPracticePlayback=null;
    const audio = state.audio;
    const tx = {id:++sequence,from:state.index,target:index,landing:state.index,silent,autoplay:autoplay ?? !silent,snapshot:{status:audio.state,offset:audio.position(),page:audio.page},unlock:null};
    state.navigation = tx; state.turning = true;
    tx.deadline=setTimeout(()=>recoverNavigation(tx,new Error('The paper turn timed out.')),TURN_DEADLINE_MS);
    // Cancellation happens before any image request, animation or await.
    audio.navigation();
    if (!silent) unlockNavigation(tx);
    syncControls(); announce('Turning the paper.'); return tx;
  }
  async function restoreSnapshot(tx) {
    const audio = state.audio;
    if (!tx.snapshot.page) return;
    const restored=window.PaksonPractice?.restoreMedia(tx.snapshot.page)||tx.snapshot.page;
    const changedClip=restored.audio_id!==tx.snapshot.page.audio_id;
    audio.page=restored;audio.offset=changedClip?0:tx.snapshot.offset;
    audio.emit(!changedClip&&tx.snapshot.status==='ended'?'ended':'paused');
    if((changedClip||['playing','loading'].includes(tx.snapshot.status))&&!document.hidden)await audio.play(restored);
  }
  async function resumeCurrentAfterRetiredTurn(tx){
    if(!state.ready||document.hidden||state.turning||state.navigation)return;
    // Reversing a pending turn back to the already visible page is a cancelled
    // move. Preserve its completed/manual-pause state and original playhead.
    if(tx?.from===state.index&&(tx.snapshot.page?.book_page===state.index||tx.snapshot.page?.practice_parent_id===state.book.pages[state.index].page_id))return restoreSnapshot(tx);
    return tryVisibleStart('interrupted-landing');
  }
  async function settle(tx) {
    if (!active(tx)) return false;
    const actual=tx.landing;
    await ensurePage(actual);
    if(!active(tx))return false;
    // Keep the frame between the animation and the settled DOM image visible.
    resetPaper(actual);
    await painted();
    if(!active(tx))return false;
    const changed=actual!==tx.from;
    completeNavigation(tx,actual);
    announce(`${titleFor(state.book.pages[actual])}. Page ${actual+1} of ${state.book.pages.length}.`); warmNeighbours(actual);
    if (!changed) await restoreSnapshot(tx);
    else if (tx.autoplay) void tryVisibleStart('page-turn');
    return changed;
  }
  async function waitForPaper(tx) {
    const started = performance.now(); await nextFrame();
    while (active(tx) && state.flip.getState() !== 'read') {
      // Finish a stalled renderer using its own last frame and completion callback.
      if (performance.now()-started > Math.max(1600,state.lastReleaseMs+500) || document.hidden) state.flip.getRender().finishAnimation();
      if (performance.now()-started > 2600 && state.flip.getState() !== 'read') throw new Error('The paper could not finish turning.');
      await nextFrame();
    }
    return active(tx) ? settle(tx) : false;
  }
  function failNavigation(tx,error) {
    return recoverNavigation(tx,error);
  }
  function paperSound() {} // Page turns are silent by the parent's choice.
  async function animateTo(tx,gesture=null) {
    if (!active(tx)) return false;
    await ensurePage(tx.target); if (!active(tx)) return false;
    tx.landing = tx.target;
    paperSound(tx);
    if (reducedMotion.matches || (state.rendererFault && !resetPaper(tx.from))) return settle(tx);
    // A fast swipe may finish before the destination picture is decoded.
    // Preserve its final fold; a generic start at the bottom edge looks flat.
    if(gesture)startPaper(tx,foldPoint(gesture),gesture.corner);
    else startPaper(tx);
    releasePaper(true);
    return waitForPaper(tx);
  }
  async function turnTo(index,options = {}) {
    const retired=state.navigation;
    // Menu, keyboard and auto-turn are independent of a pointer stream.
    if(state.gesture)retireGesture();
    const tx=beginNavigation(index,options);
    if(!tx){if(retired&&index===state.index&&!options.silent)await resumeCurrentAfterRetiredTurn(retired);return false;}
    tx.landing=tx.target; // A button/keyboard request is already a committed turn.
    try { return await animateTo(tx); } catch (error) { return failNavigation(tx,error); }
  }
  const navigationIndex = () => state.navigation?.landing ?? state.index;
  const forward = () => turnTo(Math.min(state.book.pages.length-1,navigationIndex()+1));
  function localPoint(event) {
    const shell=$('bookShell'), rect=shell.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*shell.clientWidth/rect.width,y:(event.clientY-rect.top)*shell.clientHeight/rect.height};
  }
  function foldPoint(gesture) {
    const rect=state.flip.getBoundsRect(), width=rect.pageWidth, height=rect.height;
    const x=gesture.direction>0?gesture.latest.x:width-gesture.latest.x;
    const startX=gesture.direction>0?gesture.start.x:width-gesture.start.x;
    const travel=Math.max(0,startX-x);
    // Interior grabs start with a small fold, then join the actual fingertip.
    // A grab beside the turning edge can follow the finger from the start.
    const offset=startX>=width*.88?0:(width-startX)*Math.max(0,1-travel/(width*.18));
    return {x:Math.max(-width+.5,Math.min(width-.5,x+offset)),
      y:Math.max(.5,Math.min(height-.5,gesture.latest.y))};
  }
  function recordFingerGeometry(gesture) {
    const calculation=state.flip.getFlipController().getCalculation();if (!calculation)return;
    const actual=state.flip.getRender().convertToGlobal(calculation.getPosition(),0), width=state.flip.getBoundsRect().pageWidth;
    const corner={x:gesture.direction>0 ? actual.x : width-actual.x,y:actual.y};
    const shell=$('bookShell'),bounds=shell.getBoundingClientRect(),pointer=gesture.latest;
    const toScreen=point=>({x:bounds.left+point.x*bounds.width/shell.clientWidth,y:bounds.top+point.y*bounds.height/shell.clientHeight});
    state.fingerGeometry={direction:gesture.direction,pointer,corner,
      screenPointer:toScreen(pointer),screenCorner:toScreen(corner),
      error:Math.hypot(corner.x-pointer.x,corner.y-pointer.y),constrained:Math.hypot(corner.x-pointer.x,corner.y-pointer.y)>1,
      eventAt:performance.now(),drawnAt:null,geometryDirection:calculation.getDirection(),paperDensity:state.pages[gesture.tx.from].getDensity()};
    gesture.progress=1-calculation.getPosition().x/width;
  }
  function primeGesture(gesture) {
    startPaper(gesture.tx,foldPoint(gesture),gesture.corner);
    gesture.native=true;recordFingerGeometry(gesture);
  }
  function moveGesture(gesture) {
    if (gesture.native) {state.flip.getFlipController().fold(foldPoint(gesture));recordFingerGeometry(gesture);}
  }
  function shouldCommit(gesture) {
    if (gesture.cancelled) return false;
    const width=state.flip.getBoundsRect().pageWidth, delta=-gesture.direction*(gesture.latest.x-gesture.start.x);
    const recent=gesture.history.find(point=>gesture.releasedAt-point.at<=100);
    const velocity=recent?-gesture.direction*(gesture.latest.x-recent.x)/Math.max(1,gesture.releasedAt-recent.at):0;
    return delta>=width*.35||(delta>=Math.min(75,width*.12)&&velocity>.50);
  }
  async function finishGesture(gesture) {
    const tx = gesture.tx;
    if (!tx || !active(tx) || gesture.finishing || !gesture.ready || !gesture.released) return;
    gesture.finishing = true;
    try {
      const commit = shouldCommit(gesture);
      tx.landing = commit ? tx.target : tx.from;
      if (gesture.native && !state.rendererFault) {
        if(commit)paperSound(tx);
        releasePaper(commit);
        await waitForPaper(tx);
      } else if(commit)await animateTo(tx,gesture);
      else await settle(tx);
    } catch (error) { await failNavigation(tx,error); }
  }
  function cancelHeldGesture() {
    const gesture=state.gesture;
    if(!gesture||gesture.released)return;
    const tx=gesture.tx;
    if(tx&&active(tx)){
      tx.landing=tx.from;
      interruptNavigation();
      void resumeCurrentAfterRetiredTurn(tx).catch(error=>report(error.message));
    }else retireGesture();
    drainPracticePlayback();scheduleAutomaticTurn();
  }
  function renewGestureDeadline(gesture) {
    clearTimeout(gestureTimer);
    gestureTimer=setTimeout(()=>{
      if(state.gesture===gesture)cancelHeldGesture();
    },GESTURE_IDLE_MS);
  }
  function bindSurfaceGesture() {
    const surface=$('pageStage'), shell=$('bookShell');
    const swipeTargets='#pageStage,#menuButton,.practice-option,.practice-next,#nextPageButton';
    let draggedControl=null;
    const streamID=(point,route)=>route==='touch'?point.identifier:point.pointerId;
    const sample = event => {
      const points=event.getCoalescedEvents?.();
      return points?.[points.length-1]||event;
    };
    function begin(point,target,route) {
      if(!state.ready||!target?.closest(swipeTargets)||$('bookDialog').open)return null;
      const start=localPoint(point), now=performance.now();
      const isTouch=route==='touch'||point.pointerType==='touch';
      const id=streamID(point,route), existing=state.gesture;
      // A single finger may reach the live Books page through either API or
      // both. Match the two starts before letting either move the same fold.
      if(isTouch&&existing?.isTouch&&!existing.released&&!(route in existing.streams)&&
        existing.target===target&&now-existing.beganAt<250&&Math.hypot(start.x-existing.start.x,start.y-existing.start.y)<24){
        existing.streams[route]=id;
        if(route==='pointer'){
          existing.pointer=id;
          if(target===surface||existing.moved)capturePointer(existing);
        }
        return existing;
      }
      cancelHeldGesture();cancelAutomaticTurn(false);draggedControl=null;
      const gesture={streams:{[route]:id},pointer:point.pointerId,isTouch,target,beganAt:now,start,latest:start,history:[{x:start.x,at:now}],
        baseIndex:navigationIndex(),retiredTurn:state.navigation,returnedToVisible:false,
        blocked:false,moved:false,tx:null,native:false,ready:false,released:false,cancelled:false,finishing:false};
      state.gesture=gesture;
      renewGestureDeadline(gesture);
      if(route==='pointer'&&target===surface)capturePointer(gesture);
      return gesture;
    }
    function capturePointer(gesture) {
      try {surface.setPointerCapture(gesture.pointer);gesture.capture=surface;} catch {}
    }
    function move(point,route) {
      const gesture=state.gesture;
      if(!ownsStream(gesture,point,route))return false;
      renewGestureDeadline(gesture);
      gesture.latest=localPoint(point);
      const now=performance.now(), dx=gesture.latest.x-gesture.start.x, dy=gesture.latest.y-gesture.start.y;
      gesture.history.push({x:gesture.latest.x,at:now});
      gesture.history=gesture.history.filter(p=>now-p.at<160);
      gesture.moved ||= Math.hypot(dx,dy)>12;
      if(gesture.blocked)return true;
      if(gesture.tx){
        if(gesture.native)try {moveGesture(gesture);} catch(error) {failNavigation(gesture.tx,error);}
        return true;
      }
      // Wait for horizontal intent. An initial vertical correction must not
      // permanently disqualify the rest of the drag.
      if(Math.abs(dx)<Math.max(10,Math.abs(dy)*.65))return true;
      gesture.direction=dx<0?1:-1;
      gesture.corner=gesture.start.y<state.flip.getBoundsRect().height*.25?'top':'bottom';
      const target=gesture.baseIndex+gesture.direction;
      if(target<0||target>=state.book.pages.length){
        gesture.blocked=true;announce(target<0?'This is the first page.':'This is the last page.');return true;
      }
      gesture.moved=true;
      if(gesture.target!==surface)draggedControl=gesture.target;
      if('pointer' in gesture.streams&&!gesture.capture)capturePointer(gesture);
      if(state.navigation){
        const previous=state.navigation;
        if(target===state.index&&gesture.baseIndex!==state.index)previous.landing=previous.from;
        interruptNavigation(true);
        if(target===state.index){gesture.returnedToVisible=true;gesture.blocked=true;return true;}
      }
      const tx=beginNavigation(target);
      if(!tx){gesture.blocked=true;return true;}
      gesture.tx=tx;
      ensurePage(target).then(()=>{
        if(!active(tx))return;
        gesture.ready=true;
        if(!gesture.released&&!reducedMotion.matches&&(!state.rendererFault||resetPaper(tx.from)))primeGesture(gesture);
        return finishGesture(gesture);
      }).catch(error=>failNavigation(tx,error));
      return true;
    }
    function ownsStream(gesture,point,route){
      return gesture&&!gesture.released&&route in gesture.streams&&gesture.streams[route]===streamID(point,route);
    }
    function end(point,cancelled,route) {
      const gesture=state.gesture;
      if(!ownsStream(gesture,point,route))return false;
      if(cancelled&&Object.keys(gesture.streams).length>1){
        delete gesture.streams[route];
        return true;
      }
      clearTimeout(gestureTimer);gestureTimer=null;
      gesture.latest=localPoint(point);gesture.releasedAt=performance.now();
      gesture.released=true;gesture.cancelled=cancelled;
      try{if(gesture.capture?.hasPointerCapture(gesture.pointer))gesture.capture.releasePointerCapture(gesture.pointer);}catch{}
      if(gesture.tx){
        // Commit the logical destination before the animation. A new swipe
        // can start from it even while an earlier page is still settling.
        gesture.tx.landing=shouldCommit(gesture)?gesture.tx.target:gesture.tx.from;
        unlockNavigation(gesture.tx);
        void finishGesture(gesture);
      }else{
        retireGesture();
        if(gesture.returnedToVisible)void resumeCurrentAfterRetiredTurn(gesture.retiredTurn).catch(error=>report(error.message));
        drainPracticePlayback();scheduleAutomaticTurn();
      }
      return true;
    }
    window.PaksonBookGesture={begin,move,end,cancelTouch:()=>{if(state.gesture?.isTouch)cancelHeldGesture();}};
    shell.addEventListener('pointerdown',event=>{
      if(event.button!==0||!event.isPrimary)return;
      if(begin(event,event.target.closest(swipeTargets),'pointer')){
        if(event.pointerType!=='touch'&&event.target===surface)surface.focus({preventScroll:true});
        event.preventDefault();
      }
    },true);
    window.addEventListener('pointermove',event=>{
      const gesture=state.gesture;
      if(!ownsStream(gesture,event,'pointer'))return;
      if(event.pointerType==='mouse'&&!event.buttons){cancelHeldGesture();return;}
      if(move(sample(event),'pointer'))event.preventDefault();
    },true);
    const release=event=>{
      if(end(sample(event),event.type!=='pointerup','pointer'))event.preventDefault();
    };
    for(const type of ['pointerup','pointercancel'])window.addEventListener(type,release,true);
    surface.addEventListener('lostpointercapture',release);
    shell.addEventListener('click',event=>{
      if(!draggedControl||event.detail===0||!draggedControl.contains(event.target))return;
      draggedControl=null;
      event.preventDefault();event.stopImmediatePropagation();
    },true);
    surface.addEventListener('click',event=>event.preventDefault());
  }
  function menuView(view) {
    for (const section of document.querySelectorAll('[data-menu-view]')) section.hidden = section.dataset.menuView !== view;
    $('panelBack').hidden = view === 'main'; $('panelTitle').textContent = ({main:'Story menu',contents:'Choose a page',transcript:'Read along',settings:'Sound & reading'})[view];
    $('bookDialog').dataset.view = view; $('panelBody').scrollTop = 0;
    if (view === 'transcript') renderTranscript();
  }
  function openMenu(view = 'main') { cancelAutomaticTurn(false);syncStoredReadingMode();menuView(view); if (!$('bookDialog').open) $('bookDialog').showModal(); $('panelClose').focus({preventScroll:true}); }
  function closeMenu() { $('bookDialog').close(); }
  function bindControls() {
    bindSurfaceGesture();
    $('nextPageButton').addEventListener('click',event => {event.preventDefault();event.stopPropagation();turnTo(state.index+1,{autoplay:true});});
    $('menuButton').addEventListener('click',() => openMenu()); $('panelClose').addEventListener('click',closeMenu); $('panelBack').addEventListener('click',() => {menuView('main'); $('contentsButton').focus({preventScroll:true});});
    $('bookDialog').addEventListener('close',() => {$('menuButton').focus({preventScroll:true});drainPracticePlayback();scheduleAutomaticTurn();});
    $('bookDialog').addEventListener('click',event => {if (event.target === $('bookDialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) closeMenu(); }});
    $('contentsButton').addEventListener('click',() => menuView('contents')); $('transcriptButton').addEventListener('click',() => menuView('transcript')); $('settingsButton').addEventListener('click',() => menuView('settings'));
    $('reloadButton').addEventListener('click',() => location.reload());
    $('masterVolume').value = loadPreference('volume',.9); state.audio.setVolume($('masterVolume').value);
    window.PaksonFeedback?.setVolume($('masterVolume').value);
    $('masterVolume').addEventListener('input',event => {state.audio.setVolume(event.target.value);window.PaksonFeedback?.setVolume(event.target.value);savePreference('volume',Number(event.target.value));});
    for(const id of ['readingModeManual','readingModeAuto'])$(id).addEventListener('click',event=>setReadingMode(event.currentTarget.value,true));
    syncStoredReadingMode();
    document.addEventListener('keydown',event => {
      if ($('bookDialog').open || /INPUT|SUMMARY|TEXTAREA/.test(event.target.tagName) || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight') {event.preventDefault(); forward();}
      if (event.key === 'ArrowLeft') {event.preventDefault(); turnTo(navigationIndex()-1);}
    });
  }
  function progressFrame() {
    if(state.audio&&state.book)window.PaksonPractice?.updatePosition(state.audio.page,state.audio.position());
    if (state.audio && state.book && $('bookDialog').open && $('bookDialog').dataset.view === 'transcript') {
      const seconds = state.audio.position(), main = state.book.pages[state.index], page=state.audio.page?.practice_parent_id===main.page_id?state.audio.page:main;
      const segment = (page.timeline || []).find(segment => seconds>=segment.at && seconds<segment.end);
      if (segment?.id !== currentSegment) {document.querySelectorAll('.transcript-row.active').forEach(row => row.classList.remove('active')); if (segment) $(`line-${segment.id}`)?.classList.add('active'); currentSegment = segment?.id || '';}
    }
    drainPracticePlayback();window.PaksonPractice?.pump();
    frame = requestAnimationFrame(progressFrame);
  }
  function workerMessage(){return Promise.reject(new Error('This EPUB is already self-contained.'));}
  // Start the visible current page and keep its original PNG until the canvas is stable.
  const ENTRY_REQUIRE_FOCUS=false;
  let entryGeneration=0,entryPending=null;
  let canvasEpoch=0,canvasDrawnIndex=null,canvasDrawCount=0,canvasDrawAt=null,bootFallbackVisible=true;
  const entryProof={lastPromise:'none',lastPlayError:null};
  function drawCurrentCanvasFrame(reason){
    if(!state.flip||!state.canvas||!state.pages.length)return false;
    const actual=state.flip.getCurrentPageIndex(),page=state.pages[actual];
    if(!page?.isLoad||!state.decodedPages.has(actual)||!state.canvas.width||!state.canvas.height)return false;
    state.flip.getRender().drawFrame();canvasDrawnIndex=actual;++canvasDrawCount;canvasDrawAt=new Date().toISOString();return true;
  }
  function showRestImage(index=state.index){
    const boot=$('bootCover'),image=state.images[index];
    if(!boot||!image||!state.decodedPages.has(index)||!image.complete||!image.naturalWidth||state.curl)return false;
    // This is the exact decoded Image already owned by the paper renderer.
    // A real DOM image at rest avoids stale native Books canvas snapshots.
    if(boot.firstElementChild!==image)boot.replaceChildren(image);
    image.draggable=false;image.alt='';image.setAttribute('aria-hidden','true');
    boot.style.pointerEvents='none';boot.style.zIndex='120';boot.style.visibility='visible';boot.setAttribute('aria-hidden','true');bootFallbackVisible=true;
    return true;
  }
  function hideRestImage(){
    const boot=$('bootCover');if(!boot)return;
    boot.style.pointerEvents='none';boot.style.visibility='hidden';boot.style.zIndex='0';bootFallbackVisible=false;
  }
  function stabiliseBootFrame(){
    if(state.ready&&!state.turning)showRestImage(state.index);
  }
  function renderEntryDiagnostic(){}
  function bindEntryMediaDiagnostics(){}
  function entryDiagnostic(){}
  function installEntryDiagnostic(){}
  function cancelEntryStart(){++entryGeneration;if(entryPending)entryProof.lastPromise='cancelled';entryPending=null;}
  function entryVisible(){return !document.hidden&&document.visibilityState!=='hidden'&&(!ENTRY_REQUIRE_FOCUS||document.hasFocus());}
  async function tryVisibleStart(reason){
    stabiliseBootFrame();
    const page=state.book?.pages[state.index],audio=state.audio;
    const blocked=!webStarted||!state.ready||!entryVisible()||!page||page.page_type==='closing_logo'||!page.audio||
      state.turning||state.navigation||entryPending||audio.state!=='idle';
    if(blocked)return;
    const token=++entryGeneration,index=state.index;
    entryPending={token,index};entryProof.lastPromise='pending';entryProof.lastPlayError=null;
    try{
      state.started=true;await playNarration(page,false,true);
      if(token===entryGeneration&&state.index===index&&entryVisible())entryProof.lastPromise='resolved:'+audio.state;
    }catch(error){
      if(token!==entryGeneration)return;
      entryProof.lastPromise='rejected';entryProof.lastPlayError=error.name+': '+error.message;
      audio.emit('error','The narration could not start. Turn away and return to try again.');
    }finally{if(entryPending?.token===token)entryPending=null;}
  }
  let pageAway=false;
  function leaveVisiblePage(reason){
    pageAway=true;entryDiagnostic(reason);cancelAutomaticTurn();cancelEntryStart();
    pendingPracticePlayback=null;
    if(state.navigation)interruptNavigation();
    retireGesture();
    window.PaksonPractice?.suspend();window.PaksonFeedback?.cancel('document-hidden');
    state.audio?.navigation();syncNextHint();
  }
  function returnVisiblePage(reason){
    if(!entryVisible())return;
    pageAway=false;startVisibleInit();
    if(state.ready){syncStoredReadingMode();syncControls();void tryVisibleStart(reason);}
  }
  document.addEventListener('visibilitychange',()=>entryVisible()?returnVisiblePage('visibility:visible'):leaveVisiblePage('visibility:hidden'));
  window.addEventListener('pagehide',()=>leaveVisiblePage('pagehide'));
  window.addEventListener('pageshow',()=>returnVisiblePage('pageshow'));
  window.addEventListener('focus',()=>{if(!pageAway){startVisibleInit();if(state.ready)syncStoredReadingMode();}});
  window.addEventListener('blur',()=>{
    if(!entryVisible()&&!pageAway)leaveVisiblePage('blur:hidden');
    else cancelHeldGesture();
  });
  window.addEventListener('storage',event=>{if(state.book&&(event.key===preferenceKey('readingMode')||event.key===null))syncStoredReadingMode();});
  entryDiagnostic('script-evaluated');
  let initPromise=null;
  function startVisibleInit(){
    if(state.ready||initPromise||document.readyState==='loading'||!entryVisible())return initPromise;
    // Invisible native preloads retain their original PNG without allocating a
    // whole-book reader. Once started, init is strictly one-time.
    initPromise=init();return initPromise;
  }
  async function init() {
    // Make the recovery corner usable even when the book data fails to load.
    $('menuButton').onclick = () => openMenu(); $('panelClose').onclick = closeMenu; $('reloadButton').onclick = () => location.reload();
    try {
      state.book = window.BOOK_DATA;
      if (!window.St?.PageFlip) throw new Error('The paper animation could not load.');
      const nativePage = NaN;
      const saved = Number.isInteger(nativePage) && nativePage>=0 && nativePage<state.book.pages.length ? nativePage : Number(loadPreference('page',0)); state.index = Number.isInteger(saved) && saved>=0 && saved<state.book.pages.length ? saved : 0;
      state.audio = new StoryAudio(state.book,{state:updateAudioUI,ended:onNaturalAudioEnd});bindEntryMediaDiagnostics();
      window.PaksonFeedback = new PaksonFeedbackAudio.FeedbackPlayer(state.book.feedback,{getVoice:()=>state.audio,isDocumentVisible:()=>webStarted&&entryVisible()});
      window.PaksonPractice.configure({isCurrentNaturalEnd:validNaturalEnd,canTransition:()=>state.ready&&entryVisible()&&!state.turning&&!state.navigation&&!state.gesture&&!$('bookDialog').open,currentMediaEnded:media=>state.audio.state==='ended'&&state.audio.node.paused&&state.audio.page?.audio_id===media.audio_id&&state.audio.page?.practice_epoch===media.practice_epoch,changed:syncNextHint,nextPage:()=>turnTo(state.index+1,{autoplay:true}),playNext:media=>playPracticeClip(media).catch(error=>report(error.message||'Turn away and return to try this question again.'))});
      let priorReadingMode='manual';
      try {
        const preference=localStorage.getItem('pakson:book:pakson-k3-b5-u01-thank-you-story-words-v17:readingMode')??
          localStorage.getItem('pakson:book:pakson-k3-b5-u01-thank-you-story-words-v16:readingMode');
        priorReadingMode=JSON.parse(preference)==='auto'?'auto':'manual';
      }catch{}
      const readingMode=loadPreference('readingMode',priorReadingMode);
      state.autoTurn=readingMode==='auto';
      savePreference('readingMode',readingMode);
      const size = fitBook();
      state.flip = new St.PageFlip($('flipbook'),{width:size.width,height:size.height,size:'fixed',minWidth:size.width,maxWidth:size.width,minHeight:size.height,maxHeight:size.height,startPage:state.index,usePortrait:true,showCover:false,autoSize:false,drawShadow:true,maxShadowOpacity:.20,flippingTime:1000,useMouseEvents:false,showPageCorners:false,disableFlipByClick:false,mobileScrollSupport:false});
      state.flip.on('flip',event => {state.visualLeaf=event.data;});
      state.flip.loadFromImages(state.book.pages.map(page => page.image));
      installCanvasAdapters();
      state.pages = state.book.pages.map((_,index) => state.flip.getPage(index));
      state.images = state.pages.map(page => page.image);
      for (const page of state.pages) {page.setDensity('soft');page.setDrawingDensity('soft');}
      installSymmetricPaperAdapters();
      await ensurePage(state.index); state.image=state.images[state.index]; await painted(); state.flip.update(); await painted();
      if (state.flip.getOrientation()!=='portrait' || state.flip.getPageCount()!==state.book.pages.length) throw new Error('The whole-page book could not be prepared.');
      state.ready=true; // Keep the original PNG until a visible canvas frame is stable.
      $('pageGrid').innerHTML = state.book.pages.map((page,index) => `<button class="thumbnail-button" data-page="${index}"><img src="${escapeHTML(page.image)}" alt="" loading="lazy" width="1448" height="1086"/><span>${escapeHTML(titleFor(page))} · ${escapeHTML(page.title)}</span></button>`).join('');
      $('pageGrid').querySelectorAll('button').forEach(button => button.addEventListener('click',() => {closeMenu(); turnTo(Number(button.dataset.page));}));
      if (state.book.creditsText) $('creditsText').textContent = state.book.creditsText;
      $('menuButton').onclick = null; $('panelClose').onclick = null; $('reloadButton').onclick = null;
      bindControls(); updateAudioUI('idle'); syncControls(); renderTranscript(); fitBook(); new ResizeObserver(fitBook).observe($('reader')); window.visualViewport?.addEventListener('resize',fitBook);
      warmNeighbours(state.index);progressFrame();installEntryDiagnostic();entryDiagnostic('init-ready');
      announce('The storybook is ready.');$('startBook').disabled=false;$('startBook').textContent='Tap to read';tryVisibleStart('init-ready');
    } catch (error) {state.ready = false; syncControls(); report(`${error.message || 'The story could not load.'} Reopen this page to try again.`,true);}
  }
  $('startBook').addEventListener('click',()=>{
    if(!state.ready||webStarted)return;
    webStarted=true;$('startGate').hidden=true;syncControls();
    // Call play() before leaving this trusted input event. No silent probe.
    void tryVisibleStart('trusted-start');
  });
  window.paksonReader = {state,turnTo,workerMessage,ensurePage,ensureSpread:ensurePage,getPageFlip:() => state.flip};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startVisibleInit,{once:true});else startVisibleInit();
})();
