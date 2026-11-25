/* Keep Books' native gestures outside the live story page. */
'use strict';
(() => {
  let touch = null, mouse = false, lastTouchClick = null;
  const selector = '#pageStage,.book-control,#nextPageButton,#bookDialog button,.practice-option,.practice-next';
  const targetFor = event => event.target?.closest?.(selector);
  const ready = () => !!window.paksonReader?.state.ready;
  const options = {capture:true,passive:false};
  const cancel = event => { if (event.cancelable) event.preventDefault(); event.stopPropagation(); };
  const changedTouch = (event,id) => Array.from(event.changedTouches).find(point => point.identifier === id);
  function clearTouch() {
    if (!touch) return;
    touch.target.removeEventListener('touchmove',moveTouch,options);
    touch.target.removeEventListener('touchend',endTouch,options);
    touch.target.removeEventListener('touchcancel',endTouch,options);
    touch=null;
  }
  function clearStreams() { clearTouch(); mouse=false; lastTouchClick=null; }
  window.addEventListener('pagehide',clearStreams);
  window.addEventListener('blur',clearStreams);
  document.addEventListener('visibilitychange',() => { if (document.hidden) clearStreams(); });

  document.addEventListener('touchstart',event => {
    const target = targetFor(event);
    if (!ready() || !target) return;
    if (event.touches.length !== 1) {
      if (touch) { window.PaksonBookGesture.cancelTouch(); clearTouch(); }
      cancel(event);
      return;
    }
    const point = event.changedTouches[0];
    if (!point) return;
    clearTouch();
    const gesture = window.PaksonBookGesture.begin(point,target,'touch');
    touch = {target,start:point,gesture,moved:false};
    // A practice control can be detached as soon as the turn starts. WebKit
    // can continue targeting the original element for the rest of the touch.
    target.addEventListener('touchmove',moveTouch,options);
    target.addEventListener('touchend',endTouch,options);
    target.addEventListener('touchcancel',endTouch,options);
    cancel(event);
  },options);
  function moveTouch(event) {
    const point = touch && changedTouch(event,touch.start.identifier);
    if (!point) return;
    touch.moved ||= Math.hypot(point.clientX-touch.start.clientX,point.clientY-touch.start.clientY)>=12;
    if (touch.gesture) window.PaksonBookGesture.move(point,'touch');
    cancel(event);
  }
  document.addEventListener('touchmove',moveTouch,options);
  function endTouch(event) {
    const point = touch && changedTouch(event,touch.start.identifier);
    if (!point) return;
    const ended = touch;
    clearTouch();
    const cancelled = event.type === 'touchcancel';
    if (ended.gesture) window.PaksonBookGesture.end(point,cancelled,'touch');
    cancel(event);
    // preventDefault suppresses the compatibility click. Restore only a true
    // control tap; a drag over a quiz answer must never submit it.
    if (!cancelled && ended.target.id!=='pageStage' && !ended.moved && !ended.gesture?.moved &&
        Math.hypot(point.clientX-ended.start.clientX,point.clientY-ended.start.clientY)<12) {
      lastTouchClick={target:ended.target,at:performance.now()};
      ended.target.click();
    }
  }
  document.addEventListener('touchend',endTouch,options);
  document.addEventListener('touchcancel',endTouch,options);
  document.addEventListener('mousedown',event => {
    mouse=ready() && !!targetFor(event);
    if(mouse)cancel(event);
  },options);
  document.addEventListener('mousemove',event => { if(mouse)cancel(event); },options);
  document.addEventListener('mouseup',event => { if(mouse){mouse=false;cancel(event);} },options);
  document.addEventListener('click',event => {
    const target=targetFor(event);
    if (!target || !ready()) return;
    if (event.isTrusted && lastTouchClick && target===lastTouchClick.target && performance.now()-lastTouchClick.at<700) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    // Stop Books' default action and keep the book's own control listener.
    if (event.cancelable) event.preventDefault();
  },options);
})();
