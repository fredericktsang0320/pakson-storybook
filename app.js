'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const roleNames = {narrator:'Narrator',pakson:'Pakson',pikachu:'Pikachu',fireman:'Fireman',policeman:'Policeman',policewoman:'Officer Jenny',doctor:'Doctor',nurse:'Nurse Joy',duck:'Little Duck'};
  const state = {book:null,index:0,turning:false,started:false,audio:null,autoTurn:false,wasHidden:false,worker:null};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let toastTimer, currentSegment = '', tick = 0;
  const escapeHTML = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function showToast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => {$('toast').hidden = true;}, 4800); }
  function loadPreference(key, fallback) { try { const value = localStorage.getItem(`pakson:${key}`); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } }
  function savePreference(key, value) { try { localStorage.setItem(`pakson:${key}`, JSON.stringify(value)); } catch {} }
  function highlighted(text) {
    const safe = escapeHTML(text);
    return safe.replace(/\b(fireman|policeman|policewoman|doctor|nurse|duck|doll|door)\b/gi, '<strong>$1</strong>');
  }
  function titleFor(page) { return page.book_page === 0 ? 'Cover' : page.book_page === 11 ? 'Read & spell' : page.book_page === 12 ? 'Song' : `Story page ${page.book_page}`; }
  function syncControls() {
    if (!state.book) return;
    const page = state.book.pages[state.index];
    $('pageNumber').textContent = titleFor(page); $('pageCount').textContent = `${state.book.pages.length} pages`;
    $('previousButton').disabled = state.index === 0 || state.turning;
    $('nextButton').disabled = state.turning;
    $('nextButton').querySelector('span').textContent = state.index === state.book.pages.length - 1 ? 'Read again' : 'Next';
    $('nextButton').setAttribute('aria-label', state.index === state.book.pages.length - 1 ? 'Start again from the cover' : 'Next');
    $('pageStage').setAttribute('aria-label', state.index === state.book.pages.length - 1 ? 'Tap to read again from the cover' : 'Tap to turn to the next page');
    $('pageHint').textContent = state.index === state.book.pages.length - 1 ? 'The end · Tap to read again' : 'Tap the picture to turn the page';
    document.querySelectorAll('.thumbnail-button').forEach(button => button.setAttribute('aria-current', String(Number(button.dataset.page) === state.index)));
  }
  function updateAudioUI(status, detail) {
    const playing = status === 'playing', loading = status === 'loading';
    $('playButton').classList.toggle('is-playing', playing);
    $('playIcon').querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
    $('playLabel').textContent = loading ? 'Loading…' : playing ? 'Pause' : status === 'paused' ? 'Continue' : status === 'ended' ? 'Read again' : 'Read to me';
    $('playButton').setAttribute('aria-label', playing ? 'Pause this page' : status === 'paused' ? 'Continue this page' : 'Read this page aloud');
    if (status === 'error') showToast(detail || 'The sound could not load. Please try again.');
  }
  function renderTranscript() {
    if (!state.book) return;
    const page = state.book.pages[state.index];
    $('transcriptTitle').textContent = page.title;
    $('transcriptContent').innerHTML = page.segments.map(segment => `<div class="transcript-row" id="line-${segment.id}"><div class="transcript-role">${escapeHTML(roleNames[segment.speaker] || segment.speaker)}</div><p class="transcript-en" lang="en-GB">${highlighted(segment.text)}</p></div>`).join('');
    currentSegment = '';
  }
  function prefetchImage(page) { if (!page) return; const image = new Image(); image.src = page.image; image.decode?.().catch(() => {}); }
  function fitBook() {
    const area = document.querySelector('.reading-area'), hint = $('pageHint');
    const hintHeight = getComputedStyle(hint).display === 'none' ? 0 : hint.getBoundingClientRect().height + 10;
    const width = Math.min(area.clientWidth, Math.max(120,(area.clientHeight - hintHeight - 6)*4/3));
    $('bookFrame').style.width = `${Math.floor(width)}px`;
  }
  async function imageReady(page) {
    const image = new Image(); image.src = page.image;
    if (image.decode) await image.decode();
    else if (!image.complete) await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    if (!image.naturalWidth) throw new Error('image');
    return image;
  }
  function showReadyImage(image, page) {
    // Keep the decoded object itself. Assigning its URL to a different <img>
    // can start a second load in WebKit while the old pixels remain visible.
    const previous = $('pageImage');
    for (const attribute of previous.attributes) {
      if (attribute.name !== 'src') image.setAttribute(attribute.name, attribute.value);
    }
    image.alt = `${titleFor(page)}: ${page.title}`;
    previous.replaceWith(image);
    previous.removeAttribute('id'); previous.alt = '';
    return previous;
  }
  async function turnTo(index, {silent = false} = {}) {
    if (!state.book || state.turning || index === state.index || index < 0 || index >= state.book.pages.length) return;
    state.turning = true; syncControls();
    const wasListening = state.audio?.state === 'playing' || state.audio?.state === 'loading' || state.started;
    if (!silent) {
      try { await state.audio.unlock(); state.started = true; } catch (error) { showToast(error.message); }
    }
    state.audio?.navigation();
    const old = state.book.pages[state.index], next = state.book.pages[index], direction = index > state.index ? 'forward' : 'reverse';
    let loadingTimer = setTimeout(() => { $('pageLoading').hidden = false; }, 160);
    try {
      const readyImage = await imageReady(next);
      if (!silent) state.audio.flipSound().catch(() => {});
      const sheet = document.createElement('div'); sheet.className = `turn-sheet ${direction}`;
      const front = document.createElement('div'); front.className = 'turn-face';
      const oldImage = showReadyImage(readyImage, next); front.append(oldImage);
      const shade = document.createElement('div'); shade.className = 'turn-shade'; front.append(shade);
      const back = document.createElement('div'); back.className = 'turn-face turn-back'; sheet.append(front,back);
      $('turnLayer').replaceChildren(sheet);
      clearTimeout(loadingTimer); $('pageLoading').hidden = true;
      if (!reducedMotion.matches) await new Promise(resolve => { let done = false; const finish = () => {if (!done) { done = true; resolve(); }}; sheet.addEventListener('animationend',finish,{once:true}); setTimeout(finish,760); });
      $('turnLayer').replaceChildren(); state.index = index; state.turning = false;
      savePreference('page', index); syncControls(); renderTranscript();
      prefetchImage(state.book.pages[index + 1]); prefetchImage(state.book.pages[index - 1]);
      if (!silent && (wasListening || state.started)) await state.audio.play(next, true);
    } catch {
      clearTimeout(loadingTimer); $('pageLoading').hidden = true; state.turning = false; syncControls();
      showToast('This page has not loaded yet. Reconnect, then tap to try again.');
    }
  }
  async function forward() { await turnTo(state.index === state.book.pages.length - 1 ? 0 : state.index + 1); }
  async function playPause(restart = false) {
    if (!state.book || state.turning) return;
    if (!restart && ['playing','loading'].includes(state.audio.state)) { state.audio.pause(); return; }
    if (restart) state.audio.navigation();
    const requestedIndex = state.index, generation = state.audio.generation;
    state.audio.emit('loading');
    try {
      await state.audio.unlock();
      if (state.turning || state.index !== requestedIndex || state.audio.generation !== generation) return;
      state.started = true; await state.audio.play(state.book.pages[requestedIndex], restart);
    } catch (error) { state.audio.emit('error', error.message); }
  }
  function openDialog(id, trigger) { const dialog = $(id); dialog.showModal(); dialog.dataset.trigger = trigger; }
  function bindControls() {
    $('pageStage').addEventListener('click',forward);
    $('previousButton').addEventListener('click',() => turnTo(state.index - 1));
    $('nextButton').addEventListener('click',forward);
    $('playButton').addEventListener('click',() => playPause()); $('replayButton').addEventListener('click',() => playPause(true));
    $('settingsButton').addEventListener('click',() => openDialog('settingsDialog','settingsButton'));
    $('transcriptButton').addEventListener('click',() => { renderTranscript(); openDialog('transcriptDialog','transcriptButton'); });
    $('chaptersButton').addEventListener('click',() => openDialog('contentsDialog','chaptersButton'));
    document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click',() => button.closest('dialog').close()));
    document.querySelectorAll('dialog').forEach(dialog => {
      dialog.addEventListener('close',() => $(dialog.dataset.trigger)?.focus());
      dialog.addEventListener('click',event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
    });
    $('masterVolume').value = loadPreference('volume',.9); state.audio.setVolume($('masterVolume').value);
    $('masterVolume').addEventListener('input',event => { state.audio.setVolume(event.target.value); savePreference('volume',Number(event.target.value)); });
    $('musicToggle').checked = loadPreference('music',true); state.audio.setMusicEnabled($('musicToggle').checked);
    $('sfxToggle').checked = loadPreference('sfx',true); state.audio.setSfxEnabled($('sfxToggle').checked);
    $('autoTurnToggle').checked = loadPreference('autoTurn',false); state.autoTurn = $('autoTurnToggle').checked;
    $('musicToggle').addEventListener('change',event => { state.audio.setMusicEnabled(event.target.checked); savePreference('music',event.target.checked); });
    $('sfxToggle').addEventListener('change',event => { state.audio.setSfxEnabled(event.target.checked); savePreference('sfx',event.target.checked); });
    $('autoTurnToggle').addEventListener('change',event => { state.autoTurn = event.target.checked; savePreference('autoTurn',state.autoTurn); });
    document.addEventListener('keydown',event => {
      if (document.querySelector('dialog[open]') || /INPUT|BUTTON|SUMMARY/.test(event.target.tagName)) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); forward(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); turnTo(state.index - 1); }
      if (event.code === 'Space') { event.preventDefault(); playPause(); }
    });
    document.addEventListener('visibilitychange',() => { if (document.hidden && ['playing','loading'].includes(state.audio.state)) { state.audio.pause(); state.wasHidden = true; } else if (!document.hidden && state.wasHidden) { showToast('Tap Continue when you are ready.'); state.wasHidden = false; } });
    window.addEventListener('pagehide',() => { if (state.audio?.ctx) state.audio.pause(); });
  }
  function progressFrame() {
    if (state.audio && state.book) {
      const page = state.book.pages[state.index], seconds = state.audio.position(), duration = page.duration || 1;
      const fraction = Math.min(1,Math.max(0,seconds/duration));
      $('audioProgressFill').style.transform = `scaleX(${fraction})`; $('audioProgress').setAttribute('aria-valuenow',String(Math.round(fraction*100)));
      if ($('transcriptDialog').open) {
        const segment = (page.timeline || []).find(segment => seconds >= segment.at && seconds < segment.end);
        if (segment?.id !== currentSegment) { document.querySelectorAll('.transcript-row.active').forEach(row => row.classList.remove('active')); if (segment) $(`line-${segment.id}`)?.classList.add('active'); currentSegment = segment?.id || ''; }
      }
    }
    tick = requestAnimationFrame(progressFrame);
  }
  async function offlineSetup() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      $('offlineDescription').textContent = 'You can read online. Open the secure website to save an offline copy.'; $('offlineButton').disabled = true; $('offlineStatus').textContent = 'Open the HTTPS storybook website first.'; return;
    }
    try {
      const registration = await navigator.serviceWorker.register('./sw.js',{scope:'./'});
      await navigator.serviceWorker.ready;
      state.worker = navigator.serviceWorker.controller || registration.active;
      const check = await workerMessage({type:'CHECK_BOOK'});
      if (check.complete) setOfflineReady();
      $('offlineButton').addEventListener('click',async () => {
        $('offlineButton').disabled = true; $('downloadProgress').hidden = false; $('downloadProgress').value = 0;
        try {
          await navigator.storage?.persist?.().catch(() => false);
          const result = await workerMessage({type:'CACHE_BOOK'},message => {if (message.type === 'PROGRESS') { $('downloadProgress').value = message.done/message.total*100; $('offlineStatus').textContent = `Saving the story: ${message.done} / ${message.total}`; }});
          if (!result.complete) throw new Error('The download is incomplete. Stay connected and try again.'); setOfflineReady();
        } catch (error) { $('offlineStatus').textContent = error.message || 'The download could not finish. Reconnect and try again.'; $('offlineButton').disabled = false; }
      });
    } catch { $('offlineButton').disabled = true; $('offlineStatus').textContent = 'Offline reading is not ready yet. Reopen the page and try again.'; }
  }
  function workerMessage(message,onProgress) {
    return new Promise((resolve,reject) => {
      const worker = navigator.serviceWorker.controller || state.worker;
      if (!worker) { reject(new Error('Offline reading is getting ready. Reopen this page and try again.')); return; }
      const channel = new MessageChannel(); const timer = setTimeout(() => reject(new Error('The download is taking longer. Stay connected and try again.')),180000);
      channel.port1.onmessage = ({data}) => { if (data.type === 'PROGRESS') { onProgress?.(data); return; } clearTimeout(timer); data.error ? reject(new Error(data.error)) : resolve(data); };
      worker.postMessage(message,[channel.port2]);
    });
  }
  function setOfflineReady() { $('offlineDescription').textContent = 'Every picture and sound in this chapter is saved.'; $('offlineButton').disabled = false; $('offlineButton').querySelector('span').textContent = 'Check the offline story'; $('offlineButton').querySelector('use').setAttribute('href','#i-check'); $('offlineStatus').textContent = 'All story files are checked. You can read offline.'; $('downloadProgress').hidden = true; }
  async function init() {
    try {
      const response = await fetch('./book.json'); if (!response.ok) throw new Error('book'); state.book = await response.json();
      state.audio = new StoryAudio(state.book,{state:updateAudioUI,ended:() => {
        if (state.autoTurn && state.index < state.book.pages.length-1 && !document.hidden) {
          const index = state.index, generation = state.audio.generation;
          setTimeout(() => {if (state.autoTurn && state.index === index && state.audio.generation === generation && !document.hidden) forward();},800);
        }
      }});
      const saved = Number(loadPreference('page',0)); state.index = Number.isInteger(saved) && saved >= 0 && saved < state.book.pages.length ? saved : 0;
      const page = state.book.pages[state.index]; showReadyImage(await imageReady(page), page);
      $('pageGrid').innerHTML = state.book.pages.map(page => `<button class="thumbnail-button" data-page="${page.book_page}"><img src="${escapeHTML(page.image)}" alt="" loading="lazy" width="1448" height="1086"><span>${escapeHTML(titleFor(page))} · ${escapeHTML(page.title)}</span></button>`).join('');
      $('pageGrid').querySelectorAll('button').forEach(button => button.addEventListener('click',() => { $('contentsDialog').close(); turnTo(Number(button.dataset.page)); }));
      if (state.book.creditsText) $('creditsText').textContent = state.book.creditsText;
      bindControls(); syncControls(); renderTranscript(); fitBook(); new ResizeObserver(fitBook).observe(document.querySelector('.reading-area'));
      prefetchImage(state.book.pages[state.index+1]); progressFrame(); offlineSetup();
      window.paksonReader = {state,turnTo,playPause,workerMessage};
    } catch { $('playButton').disabled = true; $('nextButton').disabled = true; $('pageHint').textContent = 'The story could not load. Reopen this page to try again.'; }
  }
  init();
})();
