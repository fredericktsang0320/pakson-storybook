'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const roleNames = {narrator:'Narrator',pakson:'Pakson',pikachu:'Pikachu',fireman:'Fireman',policeman:'Policeman',policewoman:'Officer Jenny',doctor:'Doctor',nurse:'Nurse Joy',duck:'Little Duck'};
  const state = {book:null,index:0,turning:false,started:false,audio:null,autoTurn:false,wasHidden:false,worker:null,flip:null,ready:false,visualLeaf:0,pages:[],images:[],imagePromises:new Map(),decodedPages:new Set(),navigation:null,gesture:null,lastError:null,canvas:null,image:null,renderInfo:null,lastReleaseMs:0};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let currentSegment = '', frame = 0, resizePending = false, sequence = 0, ignorePointerClickUntil = 0;
  const escapeHTML = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const painted = async () => { await nextFrame(); await nextFrame(); };
  const loadPreference = (key,fallback) => { try { const value = localStorage.getItem(`pakson:${key}`); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } };
  const savePreference = (key,value) => { try { localStorage.setItem(`pakson:${key}`,JSON.stringify(value)); } catch {} };
  const titleFor = page => page.book_page === 0 ? 'Cover' : page.book_page === 11 ? 'Read & spell' : page.book_page === 12 ? 'Song' : `Story page ${page.book_page}`;
  const highlighted = text => escapeHTML(text).replace(/\b(fireman|policeman|policewoman|doctor|nurse|duck|doll|door)\b/gi,'<strong>$1</strong>');
  function announce(message) { $('bookStatus').textContent = message; }
  function report(message, fatal = false) {
    state.lastError = message; announce(message); $('menuStatus').textContent = message; $('menuStatus').hidden = false;
    if (fatal) { $('reloadButton').hidden = false; openMenu('main'); }
  }
  function syncControls() {
    const disabled = !state.ready || state.turning;
    // Keep the surface enabled during a captured drag so Safari continues
    // delivering its pointer stream; a navigation lock rejects new gestures.
    $('pageStage').disabled = !state.ready;
    $('pageStage').setAttribute('aria-disabled',String(disabled));
    $('playButton').disabled = disabled;
    $('bookShell').classList.toggle('is-turning',state.turning);
    $('bookShell').setAttribute('aria-busy',String(disabled));
    if (state.book) $('flipbook').setAttribute('aria-label',`${titleFor(state.book.pages[state.index])}: ${state.book.pages[state.index].title}`);
    document.querySelectorAll('.thumbnail-button').forEach(button => button.setAttribute('aria-current',String(Number(button.dataset.page) === state.index)));
  }
  function updateAudioUI(status,detail) {
    const playing = status === 'playing', loading = status === 'loading';
    $('bookShell').classList.toggle('is-playing',playing);
    $('playIcon').querySelector('use').setAttribute('href',loading ? '#i-loading' : playing ? '#i-pause' : '#i-play');
    const label = loading ? 'Loading the narration. Tap to cancel' : playing ? 'Pause the story' : status === 'paused' ? 'Continue the story' : status === 'ended' ? 'Read this page again' : 'Listen to the story';
    $('playButton').setAttribute('aria-label',label); $('pageStage').setAttribute('aria-label',label);
    if (status === 'error') report(detail || 'The sound could not load. Tap the picture to try again.');
    else if (status === 'paused') announce('Narration paused. Tap the picture to continue.');
    else if (status === 'ended') announce('This page has ended. Tap anywhere on the picture to listen again, or swipe to carry on.');
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
      canvas.width = Math.max(1,Math.round(width*ratio)); canvas.height = Math.max(1,Math.round(height*ratio));
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
    ui.update();
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
        if (image.complete && !image.naturalWidth && !state.decodedPages.has(index)) {
          image.onload = null; image.onerror = null;
          image = new Image(); image.decoding = 'async';
          page.image = image; state.images[index] = image; page.isLoad = false;
          page.load(); // Install the pinned ImagePage's native onload handler.
          image.src = state.book.pages[index].image;
        }
        if (image.decode) await image.decode();
        else if (!image.complete) await new Promise((resolve,reject) => {image.addEventListener('load',resolve,{once:true});image.addEventListener('error',reject,{once:true});});
        if (!image.complete || image.naturalWidth!==1448 || image.naturalHeight!==1086) throw new Error('The picture is not ready.');
        // isLoad is the pinned renderer's real onload flag, not a substitute
        // image or successful decode mock. Give the native handler its frame.
        if (!page.isLoad) await painted();
        if (!page.isLoad) throw new Error('The paper image could not be prepared.');
        state.decodedPages.add(index); return image;
      })().catch(error => {state.imagePromises.delete(index);throw error;});
      state.imagePromises.set(index,promise);
    }
    return state.imagePromises.get(index);
  }
  function warmNeighbours(index) {
    for (const next of [index+1,index-1]) if (next>=0 && next<state.pages.length) ensurePage(next).catch(() => {});
  }
  function active(tx) { return state.navigation === tx; }
  function beginNavigation(index,{silent=false,autoplay} = {}) {
    if (!state.ready || !state.book || state.turning || index === state.index || index < 0 || index >= state.book.pages.length) return null;
    const audio = state.audio;
    const tx = {id:++sequence,from:state.index,target:index,silent,autoplay:autoplay ?? (!silent && ['playing','loading','ended'].includes(audio.state)),snapshot:{status:audio.state,offset:audio.position(),page:audio.page},unlock:null};
    state.navigation = tx; state.turning = true;
    // Cancellation happens before any image request, animation or await.
    audio.navigation();
    if (!silent) tx.unlock = audio.unlock().catch(error => {tx.unlockError = error;});
    syncControls(); announce('Turning the paper.'); return tx;
  }
  async function restoreSnapshot(tx) {
    const audio = state.audio;
    if (!tx.snapshot.page) return;
    audio.page = tx.snapshot.page; audio.offset = tx.snapshot.offset;
    audio.emit(tx.snapshot.status === 'ended' ? 'ended' : 'paused');
    if (['playing','loading'].includes(tx.snapshot.status) && !document.hidden) await audio.play(tx.snapshot.page);
  }
  async function settle(tx) {
    if (!active(tx)) return false;
    const actual = state.flip.getCurrentPageIndex();
    await ensurePage(actual); await painted();
    if (!active(tx)) return false;
    const changed = actual !== tx.from;
    state.index = actual; state.visualLeaf = actual; state.image = state.images[actual]; state.navigation = null; state.gesture = null; state.turning = false;
    savePreference('page',actual); renderTranscript(); syncControls(); if (resizePending) fitBook();
    announce(`${titleFor(state.book.pages[actual])}. Page ${actual+1} of ${state.book.pages.length}.`); warmNeighbours(actual);
    if (!changed) await restoreSnapshot(tx);
    else if (tx.autoplay && !document.hidden) {
      const generation = state.audio.generation;
      if (tx.unlock) await tx.unlock;
      if (tx.unlockError) { report(tx.unlockError.message); return false; }
      if (state.index === actual && !state.turning && !document.hidden && state.audio.generation === generation) { state.started = true; await state.audio.play(state.book.pages[actual],true); }
    }
    return changed;
  }
  async function waitForPaper(tx) {
    const started = performance.now(); await nextFrame();
    while (active(tx) && state.flip.getState() !== 'read') {
      if (performance.now()-started > 5500 || document.hidden) state.flip.getRender().finishAnimation();
      if (performance.now()-started > 6500 && state.flip.getState() !== 'read') throw new Error('The paper could not finish turning.');
      await nextFrame();
    }
    return active(tx) ? settle(tx) : false;
  }
  async function failNavigation(tx,error) {
    if (!active(tx)) return false;
    try { state.flip.getRender().finishAnimation(); state.flip.turnToPage(tx.from); } catch {}
    state.navigation = null; state.gesture = null; state.turning = false; state.index = tx.from; state.visualLeaf = tx.from; syncControls(); if (resizePending) fitBook();
    report('This page has not loaded. Check your connection, then swipe again.');
    await restoreSnapshot(tx); return false;
  }
  function paperSound(tx) { if (!tx.silent) state.audio.flipSound().catch(() => {}); }
  async function animateTo(tx) {
    if (!active(tx)) return false;
    await ensurePage(tx.target); if (!active(tx)) return false;
    paperSound(tx);
    if (reducedMotion.matches) { state.flip.turnToPage(tx.target); return settle(tx); }
    state.flip.flip(tx.target,'bottom'); return waitForPaper(tx);
  }
  async function turnTo(index,options = {}) {
    const tx = beginNavigation(index,options); if (!tx) return false;
    try { return await animateTo(tx); } catch (error) { return failNavigation(tx,error); }
  }
  const forward = () => turnTo(Math.min(state.book.pages.length-1,state.index+1));
  function localPoint(event) { const rect = $('bookShell').getBoundingClientRect(); return {x:event.clientX-rect.left,y:event.clientY-rect.top}; }
  function foldPoint(gesture) {
    const rect = state.flip.getBoundsRect(), width = rect.pageWidth, height = rect.height;
    const dx = gesture.latest.x-gesture.start.x, dy = gesture.latest.y-gesture.start.y;
    const progress = Math.max(0,Math.min(1.02,-gesture.direction*dx/width));
    gesture.progress = progress;
    return {x:gesture.direction>0 ? width-2*width*progress : -width+2*width*progress,
      y:Math.max(1,Math.min(height-1,gesture.cornerY+(gesture.start.y-gesture.cornerY)*Math.min(1,progress*3)+dy*.55))};
  }
  function primeGesture(gesture) {
    const controller = state.flip.getFlipController(), rect = state.flip.getBoundsRect();
    if (typeof controller.start!=='function' || typeof controller.animateFlippingTo!=='function' || typeof controller.setState!=='function') throw new Error('The touch paper controls are unavailable.');
    const seed = {x:gesture.direction>0 ? rect.pageWidth-2 : 2,y:gesture.cornerY};
    if (!controller.start(seed)) throw new Error('This page cannot turn further.');
    gesture.native = true;
    controller.fold(foldPoint(gesture));
  }
  function moveGesture(gesture) {
    if (gesture.native) state.flip.getFlipController().fold(foldPoint(gesture));
  }
  function shouldCommit(gesture) {
    if (gesture.cancelled) return false;
    const width = state.flip.getBoundsRect().pageWidth, delta = -gesture.direction*(gesture.latest.x-gesture.start.x);
    const recent = gesture.history.find(point => gesture.releasedAt-point.at<=100) || gesture.history[0];
    const velocity = recent ? -gesture.direction*(gesture.latest.x-recent.x)/Math.max(1,gesture.releasedAt-recent.at) : 0;
    return delta>=width*.30 || (delta>=Math.min(75,width*.12) && velocity>.50);
  }
  async function finishGesture(gesture) {
    const tx = gesture.tx;
    if (!tx || !active(tx) || gesture.finishing || !gesture.ready || !gesture.released) return;
    gesture.finishing = true;
    try {
      const commit = shouldCommit(gesture);
      if (gesture.native) {
        const controller = state.flip.getFlipController(), calculation = controller.getCalculation(), rect = state.flip.getBoundsRect();
        if (!calculation) throw new Error('The paper touch was interrupted.');
        if (commit) paperSound(tx);
        controller.setState('flipping');
        controller.animateFlippingTo(calculation.getPosition(),{x:commit ? -rect.pageWidth : rect.pageWidth,y:gesture.cornerY>rect.height/2 ? rect.height : 0},commit,true);
        await waitForPaper(tx);
      } else if (commit) await animateTo(tx);
      else await settle(tx);
    } catch (error) { await failNavigation(tx,error); }
  }
  function bindSurfaceGesture() {
    const surface = $('pageStage');
    surface.addEventListener('pointerdown',event => {
      if (event.button!==0 || !event.isPrimary || state.turning || !state.ready) return;
      event.preventDefault();
      const start = localPoint(event), now = performance.now();
      state.gesture = {pointer:event.pointerId,start,latest:start,history:[{x:start.x,at:now}],blocked:false,moved:false,tx:null,native:false,ready:false,released:false,cancelled:false,finishing:false};
      surface.setPointerCapture(event.pointerId);
    });
    surface.addEventListener('pointermove',event => {
      const gesture = state.gesture;
      if (!gesture || event.pointerId!==gesture.pointer || gesture.released) return;
      event.preventDefault(); gesture.latest = localPoint(event);
      const now = performance.now(), dx = gesture.latest.x-gesture.start.x, dy = gesture.latest.y-gesture.start.y;
      gesture.history.push({x:gesture.latest.x,at:now}); gesture.history = gesture.history.filter(point => now-point.at<160);
      gesture.moved ||= Math.hypot(dx,dy)>12;
      if (gesture.blocked) return;
      if (!gesture.tx) {
        if (Math.abs(dy)>12 && Math.abs(dy)>Math.abs(dx)*1.25) {gesture.blocked=true;return;}
        if (Math.abs(dx)<12 || Math.abs(dx)<Math.abs(dy)*1.15) return;
        gesture.direction = dx<0 ? 1 : -1;
        const target = state.index+gesture.direction;
        if (target<0 || target>=state.book.pages.length) {gesture.blocked=true;announce(target<0 ? 'This is the first page.' : 'This is the last page. Tap the picture to hear it again.');return;}
        const rect = state.flip.getBoundsRect(); gesture.cornerY = gesture.start.y<rect.height/2 ? 2 : rect.height-2;
        gesture.tx = beginNavigation(target);
        if (!gesture.tx) {gesture.blocked=true;return;}
        ensurePage(target).then(() => {
          if (!active(gesture.tx)) return;
          gesture.ready = true;
          if (!gesture.released && !reducedMotion.matches) primeGesture(gesture);
          finishGesture(gesture);
        }).catch(error => failNavigation(gesture.tx,error));
      } else if (gesture.native) moveGesture(gesture);
    });
    const release = event => {
      const gesture = state.gesture;
      if (!gesture || event.pointerId!==gesture.pointer || gesture.released) return;
      event.preventDefault(); gesture.latest = localPoint(event); gesture.releasedAt = performance.now();
      gesture.released = true; gesture.cancelled = event.type==='pointercancel'; ignorePointerClickUntil = performance.now()+500;
      if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
      if (gesture.tx) finishGesture(gesture);
      else {state.gesture=null;if (!gesture.cancelled && !gesture.moved && !gesture.blocked) playPause();}
    };
    surface.addEventListener('pointerup',release); surface.addEventListener('pointercancel',release);
    surface.addEventListener('lostpointercapture',event => {
      const gesture=state.gesture;
      if (gesture && !gesture.released && event.pointerId===gesture.pointer) {
        gesture.released=true;gesture.cancelled=true;gesture.releasedAt=performance.now();
        if (gesture.tx) finishGesture(gesture); else state.gesture=null;
      }
    });
    surface.addEventListener('click',event => {event.preventDefault();if(event.detail===0 && performance.now()>ignorePointerClickUntil) playPause();});
  }
  async function playPause(restart = false) {
    if (!state.ready || !state.book || state.turning) return;
    restart = restart || state.audio.state === 'ended';
    if (!restart && ['playing','loading'].includes(state.audio.state)) {state.audio.pause(); return;}
    if (restart) state.audio.navigation();
    const requestedIndex = state.index, generation = state.audio.generation;
    state.audio.emit('loading');
    try {
      // Invoke unlock in the original user event, before the first await.
      const unlocked = state.audio.unlock(); await ensurePage(requestedIndex); await unlocked;
      if (state.turning || state.index !== requestedIndex || state.audio.generation !== generation || document.hidden) return;
      state.started = true; await state.audio.play(state.book.pages[requestedIndex],restart);
    } catch (error) { if (state.index === requestedIndex && !state.turning && state.audio.generation === generation) state.audio.emit('error',error.message); }
  }
  function menuView(view) {
    for (const section of document.querySelectorAll('[data-menu-view]')) section.hidden = section.dataset.menuView !== view;
    $('panelBack').hidden = view === 'main'; $('panelTitle').textContent = ({main:'Story menu',contents:'Choose a page',transcript:'Read along',settings:'Sound & reading'})[view];
    $('bookDialog').dataset.view = view; $('panelBody').scrollTop = 0;
    if (view === 'transcript') renderTranscript();
  }
  function openMenu(view = 'main') { menuView(view); if (!$('bookDialog').open) $('bookDialog').showModal(); $('panelClose').focus({preventScroll:true}); }
  function closeMenu() { $('bookDialog').close(); }
  function bindControls() {
    bindSurfaceGesture();
    $('playButton').addEventListener('click',() => playPause());
    $('menuButton').addEventListener('click',() => openMenu()); $('panelClose').addEventListener('click',closeMenu); $('panelBack').addEventListener('click',() => {menuView('main'); $('contentsButton').focus({preventScroll:true});});
    $('bookDialog').addEventListener('close',() => $('menuButton').focus({preventScroll:true}));
    $('bookDialog').addEventListener('click',event => {if (event.target === $('bookDialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) closeMenu(); }});
    $('contentsButton').addEventListener('click',() => menuView('contents')); $('transcriptButton').addEventListener('click',() => menuView('transcript')); $('settingsButton').addEventListener('click',() => menuView('settings'));
    $('replayButton').addEventListener('click',() => {closeMenu(); playPause(true);});
    $('restartButton').addEventListener('click',() => {closeMenu(); state.index === 0 ? playPause(true) : turnTo(0,{autoplay:true});});
    $('reloadButton').addEventListener('click',() => location.reload());
    $('masterVolume').value = loadPreference('volume',.9); state.audio.setVolume($('masterVolume').value);
    $('masterVolume').addEventListener('input',event => {state.audio.setVolume(event.target.value); savePreference('volume',Number(event.target.value));});
    for (const [id,key,method] of [['musicToggle','music','setMusicEnabled'],['sfxToggle','sfx','setSfxEnabled']]) {
      $(id).checked = loadPreference(key,true); state.audio[method]($(id).checked);
      $(id).addEventListener('change',event => {state.audio[method](event.target.checked); savePreference(key,event.target.checked);});
    }
    $('autoTurnToggle').checked = state.autoTurn = loadPreference('autoTurn',false);
    $('autoTurnToggle').addEventListener('change',event => {state.autoTurn = event.target.checked; savePreference('autoTurn',state.autoTurn);});
    document.addEventListener('keydown',event => {
      if ($('bookDialog').open || /INPUT|SUMMARY|TEXTAREA/.test(event.target.tagName) || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight') {event.preventDefault(); forward();}
      if (event.key === 'ArrowLeft') {event.preventDefault(); turnTo(state.index-1);}
      if (event.code === 'Space' && event.target.tagName !== 'BUTTON') {event.preventDefault(); playPause();}
    });
    const pauseWhenHidden = () => {
      if (['playing','loading'].includes(state.audio.state)) {state.audio.pause(); state.wasHidden=true;}
      if (state.navigation) {state.navigation.autoplay=false;if(['playing','loading'].includes(state.navigation.snapshot.status))state.navigation.snapshot.status='paused';}
      const gesture=state.gesture;
      if (gesture?.tx && !gesture.released) {gesture.cancelled=true;gesture.released=true;gesture.releasedAt=performance.now();finishGesture(gesture);}
      if (state.turning && state.flip?.getState()==='flipping') state.flip.getRender().finishAnimation();
    };
    document.addEventListener('visibilitychange',() => {if (document.hidden) pauseWhenHidden(); else if (state.wasHidden) {announce('Tap the picture to continue.'); state.wasHidden = false;}});
    window.addEventListener('pagehide',pauseWhenHidden);
  }
  function progressFrame() {
    if (state.audio && state.book && $('bookDialog').open && $('bookDialog').dataset.view === 'transcript') {
      const seconds = state.audio.position(), page = state.book.pages[state.index];
      const segment = (page.timeline || []).find(segment => seconds>=segment.at && seconds<segment.end);
      if (segment?.id !== currentSegment) {document.querySelectorAll('.transcript-row.active').forEach(row => row.classList.remove('active')); if (segment) $(`line-${segment.id}`)?.classList.add('active'); currentSegment = segment?.id || '';}
    }
    frame = requestAnimationFrame(progressFrame);
  }
  function workerMessage(message,onProgress) {
    return new Promise((resolve,reject) => {
      const worker = navigator.serviceWorker.controller || state.worker;
      if (!worker) {reject(new Error('Offline reading is getting ready. Reopen this page and try again.')); return;}
      const channel = new MessageChannel(); const timer = setTimeout(() => {channel.port1.close(); reject(new Error('The download is taking longer. Stay connected and try again.'));},180000);
      channel.port1.onmessage = ({data}) => {if (data.type === 'PROGRESS') {onProgress?.(data); return;} clearTimeout(timer); channel.port1.close(); data.error ? reject(new Error(data.error)) : resolve(data);};
      worker.postMessage(message,[channel.port2]);
    });
  }
  function setOfflineReady() { $('offlineDescription').textContent = 'Every picture and sound in this chapter is saved.'; $('offlineButton').disabled = false; $('offlineButton').querySelector('span').textContent = 'Check the offline story'; $('offlineButton').querySelector('use').setAttribute('href','#i-check'); $('offlineStatus').textContent = 'All story files are checked. You can read offline.'; $('downloadProgress').hidden = true; }
  async function offlineSetup() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) { $('offlineDescription').textContent = 'You can read online. Open the secure website to save an offline copy.'; $('offlineButton').disabled = true; $('offlineStatus').textContent = 'Open the HTTPS storybook website first.'; return; }
    try {
      const registration = await navigator.serviceWorker.register('./sw.js',{scope:'./'}); await navigator.serviceWorker.ready; state.worker = navigator.serviceWorker.controller || registration.active;
      const check = await workerMessage({type:'CHECK_BOOK'}); if (check.complete) setOfflineReady();
      $('offlineButton').addEventListener('click',async () => {
        $('offlineButton').disabled = true; $('downloadProgress').hidden = false; $('downloadProgress').value = 0;
        try {await navigator.storage?.persist?.().catch(() => false); const result = await workerMessage({type:'CACHE_BOOK'},message => {if (message.type === 'PROGRESS') { $('downloadProgress').value = message.done/message.total*100; $('offlineStatus').textContent = `Saving the story: ${message.done} / ${message.total}`; }}); if (!result.complete) throw new Error('The download is incomplete. Stay connected and try again.'); setOfflineReady();}
        catch (error) {$('offlineStatus').textContent = error.message || 'The download could not finish. Reconnect and try again.'; $('offlineButton').disabled = false;}
      });
    } catch {$('offlineButton').disabled = true; $('offlineStatus').textContent = 'Offline reading is not ready yet. Reopen the page and try again.';}
  }
  async function init() {
    // Make the recovery corner usable even when the book data fails to load.
    $('menuButton').onclick = () => openMenu(); $('panelClose').onclick = closeMenu; $('reloadButton').onclick = () => location.reload();
    try {
      const response = await fetch('./book.json'); if (!response.ok) throw new Error('The story data could not load.'); state.book = await response.json();
      if (!window.St?.PageFlip) throw new Error('The paper animation could not load.');
      const saved = Number(loadPreference('page',0)); state.index = Number.isInteger(saved) && saved>=0 && saved<state.book.pages.length ? saved : 0;
      state.audio = new StoryAudio(state.book,{state:updateAudioUI,ended:() => {
        if (state.autoTurn && state.index<state.book.pages.length-1 && !document.hidden) {
          const index = state.index, generation = state.audio.generation;
          setTimeout(() => {if (state.autoTurn && state.index===index && state.audio.generation===generation && !state.turning && !document.hidden && !$('bookDialog').open) turnTo(index+1,{autoplay:true});},350);
        }
      }});
      const size = fitBook();
      state.flip = new St.PageFlip($('flipbook'),{width:size.width,height:size.height,size:'fixed',minWidth:size.width,maxWidth:size.width,minHeight:size.height,maxHeight:size.height,startPage:state.index,usePortrait:true,showCover:false,autoSize:false,drawShadow:true,maxShadowOpacity:.20,flippingTime:1000,useMouseEvents:false,showPageCorners:false,disableFlipByClick:false,mobileScrollSupport:false});
      state.flip.on('flip',event => {state.visualLeaf=event.data;});
      state.flip.loadFromImages(state.book.pages.map(page => page.image));
      installCanvasAdapters();
      state.pages = state.book.pages.map((_,index) => state.flip.getPage(index));
      state.images = state.pages.map(page => page.image);
      for (const page of state.pages) {page.setDensity('soft');page.setDrawingDensity('soft');}
      await ensurePage(state.index); state.image=state.images[state.index]; await painted(); state.flip.update(); await painted();
      if (state.flip.getOrientation()!=='portrait' || state.flip.getPageCount()!==state.book.pages.length) throw new Error('The whole-page book could not be prepared.');
      $('bootCover').remove(); state.ready=true;
      $('pageGrid').innerHTML = state.book.pages.map((page,index) => `<button class="thumbnail-button" data-page="${index}"><img src="${escapeHTML(page.image)}" alt="" loading="lazy" width="1448" height="1086"><span>${escapeHTML(titleFor(page))} · ${escapeHTML(page.title)}</span></button>`).join('');
      $('pageGrid').querySelectorAll('button').forEach(button => button.addEventListener('click',() => {closeMenu(); turnTo(Number(button.dataset.page));}));
      if (state.book.creditsText) $('creditsText').textContent = state.book.creditsText;
      $('menuButton').onclick = null; $('panelClose').onclick = null; $('reloadButton').onclick = null;
      bindControls(); syncControls(); updateAudioUI('idle'); renderTranscript(); fitBook(); new ResizeObserver(fitBook).observe($('reader')); window.visualViewport?.addEventListener('resize',fitBook);
      warmNeighbours(state.index); progressFrame(); offlineSetup(); announce('The storybook is ready. Tap the picture to listen.');
    } catch (error) {state.ready = false; syncControls(); report(`${error.message || 'The story could not load.'} Reopen this page to try again.`,true);}
  }
  window.paksonReader = {state,turnTo,playPause,workerMessage,ensurePage,ensureSpread:ensurePage,getPageFlip:() => state.flip};
  init();
})();
