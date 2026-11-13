/* EPUB audio: one local narration player. No unlock probe or page-turn sound. */
'use strict';
class StoryAudio {
  constructor(book,callbacks={}) {
    this.book=book;this.callbacks=callbacks;this.generation=0;this.state='idle';this.page=null;this.offset=0;this.volume=.9;
    this.unlocked=false;
    this.startTimeoutMs=10000;this._intent=null;
    this.node=document.createElement('audio');this.node.preload='auto';this.node.setAttribute('playsinline','');
    this.node.style.display='none';document.body.appendChild(this.node);
    const guard=()=>{
      const intent=this._intent;
      if(!this._current(intent)){this.node.pause();return false;}
      return true;
    };
    this.node.addEventListener('play',guard);
    this.node.addEventListener('playing',()=>{
      if(guard()&&!this.node.paused&&!this.node.ended){this._intent.actualPlaying=true;this._intent.started?.();this.unlocked=true;this.emit('playing');}
    });
    this.node.addEventListener('timeupdate',()=>{
      const intent=this._intent;
      // Some hosts omit playing/play-promise settlement. Actual forward media
      // time can confirm START, never END; lesson completion still requires EOF.
      if(this._current(intent)&&!this.node.paused&&!this.node.ended&&!this.node.seeking&&this._time()>intent.resumeOffset+.01){intent.actualPlaying=true;intent.started?.();this.unlocked=true;this.emit('playing');}
    });
    this.node.addEventListener('ended',()=>{
      this._finishNaturalEnd(this._intent,'native-ended');
    });
    this.node.addEventListener('pause',()=>{
      // WebKit dispatches pause before ended at the natural media boundary.
      // Keep that intent alive so ended can finish it; explicit pause() already cancels it.
      if(!this.node.paused||this.node.ended||this.state==='ended'||!this._current(this._intent))return;
      // A host may deliver the old source's pause after a new source is loaded.
      // Explicit pause() already cancels loading. Such an event cannot retire
      // a new intent that has never actually started playing.
      if(!this._intent.actualPlaying&&this.state!=='playing')return;
      this.offset=this._time();this._cancelIntent(false);this.emit('paused');
    });
    this.node.addEventListener('error',()=>{
      if(!this._current(this._intent)||!this.node.error)return;
      const detail='The local narration could not play. Turn away and return to try again.';
      this.offset=this._time();this._cancelIntent(true);this.emit('error',detail);
    });
  }
  emit(state,detail){if(this.state===state&&detail===undefined)return;this.state=state;this.callbacks.state?.(state,detail);}
  _time(){const value=Number(this.node.currentTime);return Number.isFinite(value)&&value>=0?value:0;}
  _current(intent){return !!intent&&this._intent===intent&&intent.token===this.generation&&this.node.getAttribute('src')===intent.src;}
  _cancelIntent(clearSource=false){
    const intent=this._intent;++this.generation;this._intent=null;this.lastNaturalEnd=null;
    if(intent){clearTimeout(intent.timer);intent.cancel?.();}
    this.node.pause();
    // Clearing the resource aborts pending native play() work as well as JS work.
    if(clearSource){this.node.removeAttribute('src');this.node.load?.();}
    else if(intent&&!intent.nativeSettled)this.node.load?.();
  }
  _finishNaturalEnd(intent,trigger) {
    // Every EOF path uses this one real-media proof, once per current intent.
    // Host play() resolution is never a completion unless node.ended is true.
    if(!this.node.ended||!this._current(intent))return false;
    const page=intent.page,source=intent.src,token=intent.token,sessionEpoch=page.practice_epoch;
    intent.nativeSettled=true;this._cancelIntent(false);this.offset=0;
    this.lastNaturalEnd={page,source,token,sessionEpoch,nodeEndedAtEvent:true,generation:this.generation,actualNaturalEnd:true,trigger};
    this.emit('ended');this.callbacks.ended?.(this.lastNaturalEnd);return true;
  }
  // Kept for the app's trusted-input path. It deliberately never calls play().
  unlock(){return Promise.resolve(this.node);}
  position(){return ['playing','loading'].includes(this.state)?this._time():this.offset;}
  playEntry(page){return this._start(page,false,true);}
  play(page,restart=false){return this._start(page,restart,false);}
  async _start(page,restart,throwOnError){
    if(!page||page.page_type==='closing_logo'||!page.audio){this.navigation();this.page=page||null;this.emit('ended');return false;}
    const samePage=this.page?.book_page===page.book_page&&this.node.getAttribute('src')===page.audio;
    if(samePage&&!restart&&this.state==='playing'&&!this.node.paused)return true;
    if(samePage&&!restart&&this.state==='loading'&&this._current(this._intent))return this._intent.result;
    const offset=!restart&&this.page?.book_page===page.book_page&&this.state!=='ended'?this.offset:0;
    this._cancelIntent(true);
    const cancelled={};let cancel;
    const cancellation=new Promise(resolve=>{cancel=()=>resolve(cancelled);});
    const intent={token:this.generation,src:page.audio,page,cancel,timer:null,settled:false,nativeSettled:false,actualPlaying:false,resumeOffset:offset,result:null,started:null};
    const actualStarted=new Promise(resolve=>{intent.started=resolve;});
    this._intent=intent;this.page=page;this.offset=offset;
    this.node.src=page.audio;this.node.muted=false;this.node.volume=this.volume;this.node.load?.();
    try{this.node.currentTime=offset;}catch{}
    this.emit('loading');
    const run=async()=>{
      try{
        // The only play() call in this module: its source is already this page.
        const nativeResult=this.node.play();
        const native=nativeResult&&typeof nativeResult.then==='function'?Promise.resolve(nativeResult):new Promise(()=>{});
        // Some hosts settle an old play request late. It must stay stopped after cancellation.
        native.then(()=>{intent.nativeSettled=true;if(!this._current(intent)&&!this._intent)this.node.pause();},()=>{intent.nativeSettled=true;});
        const timeout=new Promise((resolve,reject)=>{intent.timer=setTimeout(()=>{
          // A real playing event is stronger evidence than a host promise that never settles.
          if(this._current(intent)&&intent.actualPlaying&&!this.node.paused){resolve();return;}
          const error=new Error('The narration did not start. Turn away and return to try again.');error.name='TimeoutError';reject(error);
        },this.startTimeoutMs);});
        const result=await Promise.race([native,actualStarted,cancellation,timeout]);
        if(result===cancelled||!this._current(intent))return false;
        intent.settled=true;
        if(this.node.ended){this._finishNaturalEnd(intent,'play-settled-at-native-EOF');return false;}
        if(this.node.paused){this.offset=this._time();this._cancelIntent(false);this.emit('paused');return false;}
        this.unlocked=true;this.emit('playing');return true;
      }catch(error){
        if(!this._current(intent))return false;
        this.offset=this._time();this._cancelIntent(true);
        this.emit(['NotAllowedError','AbortError'].includes(error.name)?'paused':'error',error.message);
        if(throwOnError)throw error;
        return false;
      }finally{clearTimeout(intent.timer);}
    };
    intent.result=run();return intent.result;
  }
  pause(){this.offset=this.position();this._cancelIntent(false);this.emit('paused');}
  navigation(){this._cancelIntent(true);this.offset=0;this.page=null;this.emit('idle');}
  setVolume(value){const number=Number(value);this.volume=Number.isFinite(number)?Math.max(0,Math.min(1,number)):.9;this.node.volume=this.volume;}
}
window.StoryAudio=StoryAudio;
