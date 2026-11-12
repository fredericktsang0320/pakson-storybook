'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const roleNames = {narrator:'Narrator',pakson:'Pakson',pikachu:'Pikachu',fireman:'Fireman',policeman:'Policeman',policewoman:'Officer Jenny',doctor:'Doctor',nurse:'Nurse Joy',duck:'Little Duck'};
  const state = {book:null,index:0,turning:false,started:false,audio:null,autoTurn:false,wasHidden:false,worker:null,flip:null,ready:false,visualLeaf:0,leaves:[],pairs:[],decodedSpreads:new Set(),navigation:null,gesture:null,lastError:null};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let currentSegment = '', frame = 0, resizePending = false, sequence = 0, lastCornerPointer = 0;
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
    $('pageStage').disabled = disabled; $('playButton').disabled = disabled;
    $('previousButton').disabled = !state.ready || state.index === 0;
    $('nextButton').disabled = !state.ready;
    for (const id of ['previousButton','nextButton']) $(id).setAttribute('aria-disabled',String(disabled || $(id).disabled));
    $('nextButton').setAttribute('aria-label',state.book && state.index === state.book.pages.length - 1 ? 'Read again from the cover' : 'Next spread');
    $('bookShell').classList.toggle('is-turning',state.turning);
    $('bookShell').setAttribute('aria-busy',String(!state.ready || state.turning));
    document.querySelectorAll('.thumbnail-button').forEach(button => button.setAttribute('aria-current',String(Number(button.dataset.page) === state.index)));
    state.leaves.forEach((leaf,index) => leaf.setAttribute('aria-hidden',String(Math.floor(index/2) !== state.index)));
  }
  function updateAudioUI(status,detail) {
    const playing = status === 'playing', loading = status === 'loading';
    $('bookShell').classList.toggle('is-playing',playing);
    $('playIcon').querySelector('use').setAttribute('href',loading ? '#i-loading' : playing ? '#i-pause' : '#i-play');
    const label = loading ? 'Loading the narration. Tap to cancel' : playing ? 'Pause the story' : status === 'paused' ? 'Continue the story' : status === 'ended' ? 'Read this spread again' : 'Listen to the story';
    $('playButton').setAttribute('aria-label',label); $('pageStage').setAttribute('aria-label',label);
    if (status === 'error') report(detail || 'The sound could not load. Tap the picture to try again.');
    else if (status === 'paused') announce('Narration paused. Tap the picture to continue.');
    else if (status === 'ended') announce('This spread has ended. Turn a lower corner to carry on, or tap to listen again.');
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
    const width = Math.max(1,Math.min(availableWidth,availableHeight*4/3));
    $('bookShell').style.width = `${width}px`; $('bookShell').style.height = `${width*.75}px`;
    if (state.flip) state.flip.update();
    const rect = $('bookShell').getBoundingClientRect();
    for (const [key,value] of Object.entries({left:rect.left,top:rect.top,width:rect.width,height:rect.height})) document.documentElement.style.setProperty(`--book-${key}`,`${value}px`);
    resizePending = false;
  }
  function makeLeaves() {
    const fragment = document.createDocumentFragment();
    state.book.pages.forEach((page,index) => {
      const pair = {images:[],promise:null};
      for (const half of ['left','right']) {
        const leaf = document.createElement('div'); leaf.className = 'book-leaf'; leaf.dataset.density = 'soft'; leaf.dataset.spread = index; leaf.dataset.half = half;
        const window = document.createElement('div'); window.className = 'leaf-window';
        const image = new Image(); image.className = 'leaf-image'; image.width = 1448; image.height = 1086; image.draggable = false;
        image.alt = half === 'left' ? `${titleFor(page)}: ${page.title}` : ''; image.decoding = 'async';
        window.append(image); leaf.append(window); fragment.append(leaf); state.leaves.push(leaf); pair.images.push(image);
      }
      state.pairs.push(pair);
    });
    $('flipbook').append(fragment);
  }
  async function decodeImage(image,url) {
    // Decode the actual node that StPageFlip renders. Never clone it or reassign
    // its src after success: WebKit can start another request with stale pixels.
    if (!image.getAttribute('src')) image.src = url;
    else if (image.complete && !image.naturalWidth) image.src = url;
    if (image.decode) await image.decode();
    else if (!image.complete) await new Promise((resolve,reject) => { image.addEventListener('load',resolve,{once:true}); image.addEventListener('error',reject,{once:true}); });
    if (!image.complete || !image.naturalWidth) throw new Error('The picture is not ready.');
  }
  async function ensureSpread(index) {
    const pair = state.pairs[index];
    if (!pair) throw new Error('This spread is unavailable.');
    if (!pair.promise) pair.promise = Promise.all(pair.images.map(image => decodeImage(image,state.book.pages[index].image))).then(() => {state.decodedSpreads.add(index); return pair.images;}).catch(error => {pair.promise = null; state.decodedSpreads.delete(index); throw error;});
    const images = await pair.promise;
    if (images.some(image => !image.complete || !image.naturalWidth || !image.isConnected)) throw new Error('The picture is not ready.');
    return images;
  }
  function warmNeighbours(index) {
    for (const next of [index+1,index-1]) if (next >= 0 && next < state.pairs.length) ensureSpread(next).catch(() => {});
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
    const actual = Math.floor(state.flip.getCurrentPageIndex()/2);
    await ensureSpread(actual); await painted();
    if (!active(tx)) return false;
    const changed = actual !== tx.from;
    state.index = actual; state.visualLeaf = actual*2; state.navigation = null; state.gesture = null; state.turning = false;
    savePreference('page',actual); renderTranscript(); syncControls(); if (resizePending) fitBook();
    announce(`${titleFor(state.book.pages[actual])}. Spread ${actual+1} of ${state.book.pages.length}.`); warmNeighbours(actual);
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
    try { state.flip.getRender().finishAnimation(); state.flip.turnToPage(tx.from*2); } catch {}
    state.navigation = null; state.gesture = null; state.turning = false; state.index = tx.from; state.visualLeaf = tx.from*2; syncControls(); if (resizePending) fitBook();
    report('This spread has not loaded. Check your connection, then try its paper corner again.');
    await restoreSnapshot(tx); return false;
  }
  function paperSound(tx) { if (!tx.silent) state.audio.flipSound().catch(() => {}); }
  async function animateTo(tx) {
    if (!active(tx)) return false;
    await ensureSpread(tx.target); if (!active(tx)) return false;
    paperSound(tx);
    if (reducedMotion.matches) { state.flip.turnToPage(tx.target*2); return settle(tx); }
    state.flip.flip(tx.target*2,'bottom'); return waitForPaper(tx);
  }
  async function turnTo(index,options = {}) {
    const tx = beginNavigation(index,options); if (!tx) return false;
    try { return await animateTo(tx); } catch (error) { return failNavigation(tx,error); }
  }
  const forward = () => turnTo(state.index === state.book.pages.length-1 ? 0 : state.index+1);
  function localPoint(event) { const rect = $('flipbook').getBoundingClientRect(); return {x:event.clientX-rect.left,y:event.clientY-rect.top}; }
  function moveGesture(gesture) {
    if (!gesture.primed) {
      // Start the fold in its original half before following a fast pointer
      // across the spine. The renderer chooses direction at the first fold.
      state.flip.userMove({x:gesture.start.x-gesture.direction*6,y:gesture.start.y},true);
      gesture.primed = true;
    }
    state.flip.userMove(gesture.latest,true);
  }
  async function finishGesture(gesture) {
    const tx = gesture.tx; if (!active(tx) || gesture.finishing || !gesture.ready || !gesture.released) return;
    gesture.finishing = true;
    try {
      if (gesture.cancelled) {
        if (gesture.native && gesture.primed) { state.flip.userMove({x:gesture.start.x-gesture.direction*6,y:gesture.start.y},true); state.flip.userStop(gesture.start); await waitForPaper(tx); }
        else if (gesture.native) {state.flip.userStop(gesture.start,true); await settle(tx);}
        else await settle(tx);
      } else if (gesture.native) {
        paperSound(tx); state.flip.userStop(gesture.latest); await waitForPaper(tx);
      } else {
        const cross = gesture.direction > 0 ? gesture.latest.x < $('flipbook').clientWidth/2 : gesture.latest.x > $('flipbook').clientWidth/2;
        if (gesture.moved && !cross && !gesture.wrap) await settle(tx);
        else await animateTo(tx);
      }
    } catch (error) { await failNavigation(tx,error); }
  }
  function bindCorner(id,direction) {
    const button = $(id);
    button.addEventListener('pointerdown',event => {
      if (event.button !== 0 || !event.isPrimary || state.turning || !state.ready) return;
      const target = direction > 0 ? (state.index+1)%state.book.pages.length : state.index-1;
      const tx = beginNavigation(target); if (!tx) return;
      event.preventDefault(); event.stopPropagation(); lastCornerPointer = performance.now();
      const start = localPoint(event), gesture = {tx,pointer:event.pointerId,direction,start,latest:start,moved:false,released:false,cancelled:false,ready:false,native:false,finishing:false,wrap:direction>0 && target===0};
      state.gesture = gesture; button.setPointerCapture(event.pointerId);
      ensureSpread(target).then(() => {
        if (!active(tx)) return;
        gesture.ready = true;
        if (!gesture.released && !gesture.wrap && !reducedMotion.matches) {
          state.flip.startUserTouch(gesture.start); gesture.native = true;
          if (gesture.moved) moveGesture(gesture);
        }
        finishGesture(gesture);
      }).catch(error => failNavigation(tx,error));
    });
    button.addEventListener('pointermove',event => {
      const gesture = state.gesture;
      if (!gesture || event.pointerId !== gesture.pointer || gesture.released) return;
      event.preventDefault(); gesture.latest = localPoint(event);
      gesture.moved ||= Math.hypot(gesture.latest.x-gesture.start.x,gesture.latest.y-gesture.start.y)>5;
      if (gesture.native && gesture.moved) moveGesture(gesture);
    });
    const release = event => {
      const gesture = state.gesture;
      if (!gesture || event.pointerId !== gesture.pointer || gesture.released) return;
      event.preventDefault(); event.stopPropagation(); lastCornerPointer = performance.now();
      gesture.latest = localPoint(event); gesture.released = true; gesture.cancelled = event.type === 'pointercancel';
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      finishGesture(gesture);
    };
    button.addEventListener('pointerup',release); button.addEventListener('pointercancel',release);
    button.addEventListener('click',event => {
      event.preventDefault(); event.stopPropagation();
      // Native keyboard activation has detail=0; pointer clicks were handled above.
      if (event.detail === 0 && performance.now()-lastCornerPointer>300) direction > 0 ? forward() : turnTo(state.index-1);
    });
  }
  async function playPause(restart = false) {
    if (!state.ready || !state.book || state.turning) return;
    if (!restart && ['playing','loading'].includes(state.audio.state)) {state.audio.pause(); return;}
    if (restart) state.audio.navigation();
    const requestedIndex = state.index, generation = state.audio.generation;
    state.audio.emit('loading');
    try {
      // Invoke unlock in the original user event, before the first await.
      const unlocked = state.audio.unlock(); await ensureSpread(requestedIndex); await unlocked;
      if (state.turning || state.index !== requestedIndex || state.audio.generation !== generation || document.hidden) return;
      state.started = true; await state.audio.play(state.book.pages[requestedIndex],restart);
    } catch (error) { if (state.index === requestedIndex && !state.turning && state.audio.generation === generation) state.audio.emit('error',error.message); }
  }
  function menuView(view) {
    for (const section of document.querySelectorAll('[data-menu-view]')) section.hidden = section.dataset.menuView !== view;
    $('panelBack').hidden = view === 'main'; $('panelTitle').textContent = ({main:'Story menu',contents:'Choose a spread',transcript:'Read along',settings:'Sound & reading'})[view];
    $('bookDialog').dataset.view = view; $('panelBody').scrollTop = 0;
    if (view === 'transcript') renderTranscript();
  }
  function openMenu(view = 'main') { menuView(view); if (!$('bookDialog').open) $('bookDialog').showModal(); $('panelClose').focus({preventScroll:true}); }
  function closeMenu() { $('bookDialog').close(); }
  function bindControls() {
    let centreStart = null, ignoreCentreClick = false;
    $('pageStage').addEventListener('pointerdown',event => {centreStart = {x:event.clientX,y:event.clientY}; ignoreCentreClick = false;});
    $('pageStage').addEventListener('pointermove',event => {if (centreStart && Math.hypot(event.clientX-centreStart.x,event.clientY-centreStart.y)>12) ignoreCentreClick = true;});
    $('pageStage').addEventListener('pointercancel',() => {ignoreCentreClick = true; centreStart = null;});
    $('pageStage').addEventListener('click',() => {centreStart = null; if (!ignoreCentreClick) playPause(); ignoreCentreClick = false;});
    $('playButton').addEventListener('click',() => playPause());
    bindCorner('previousButton',-1); bindCorner('nextButton',1);
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
    const pauseWhenHidden = () => {if (['playing','loading'].includes(state.audio.state)) {state.audio.pause(); state.wasHidden = true;} if (state.turning && state.flip?.getState() === 'flipping') state.flip.getRender().finishAnimation();};
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
      makeLeaves(); fitBook(); await ensureSpread(state.index);
      state.flip = new St.PageFlip($('flipbook'),{width:724,height:1086,size:'stretch',minWidth:50,maxWidth:2000,minHeight:75,maxHeight:3000,startPage:state.index*2,usePortrait:false,showCover:false,autoSize:false,drawShadow:true,maxShadowOpacity:.22,flippingTime:850,useMouseEvents:false,showPageCorners:true,disableFlipByClick:true,mobileScrollSupport:false});
      state.flip.on('flip',event => {state.visualLeaf = event.data;});
      state.flip.loadFromHTML(state.leaves); await painted(); state.flip.update(); await painted();
      if (state.flip.getOrientation() !== 'landscape' || state.flip.getPageCount() !== state.book.pages.length*2) throw new Error('The open book could not be prepared.');
      await ensureSpread(state.index); $('bootCover').remove(); state.ready = true;
      $('pageGrid').innerHTML = state.book.pages.map((page,index) => `<button class="thumbnail-button" data-page="${index}"><img src="${escapeHTML(page.image)}" alt="" loading="lazy" width="1448" height="1086"><span>${escapeHTML(titleFor(page))} · ${escapeHTML(page.title)}</span></button>`).join('');
      $('pageGrid').querySelectorAll('button').forEach(button => button.addEventListener('click',() => {closeMenu(); turnTo(Number(button.dataset.page));}));
      if (state.book.creditsText) $('creditsText').textContent = state.book.creditsText;
      $('menuButton').onclick = null; $('panelClose').onclick = null; $('reloadButton').onclick = null;
      bindControls(); syncControls(); updateAudioUI('idle'); renderTranscript(); fitBook(); new ResizeObserver(fitBook).observe($('reader')); window.visualViewport?.addEventListener('resize',fitBook);
      warmNeighbours(state.index); progressFrame(); offlineSetup(); announce('The storybook is ready. Tap the picture to listen.');
    } catch (error) {state.ready = false; syncControls(); report(`${error.message || 'The story could not load.'} Reopen this page to try again.`,true);}
  }
  window.paksonReader = {state,turnTo,playPause,workerMessage,ensureSpread,getPageFlip:() => state.flip};
  init();
})();
