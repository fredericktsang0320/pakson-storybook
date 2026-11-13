/* One cancellable feedback element for correct / retry / logo reward.
   Never used to probe/unlock audio, never loops, and never races narration. */
'use strict';
((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PaksonFeedbackAudio=api;})(typeof window==='object'?window:globalThis,()=>{
 class FeedbackPlayer{
  constructor(assets={},options={}){
   this.assets=assets;this.getVoice=options.getVoice||(()=>null);this.isDocumentVisible=options.isDocumentVisible||(()=>true);this.now=options.now||(()=>Date.now());this.node=options.createNode?options.createNode():document.createElement('audio');
   this.node.id='feedbackAudio';this.node.preload='auto';this.node.loop=false;this.node.setAttribute('playsinline','');this.node.style&&(this.node.style.display='none');if(!options.createNode)document.body.appendChild(this.node);
   this.generation=0;this.pending=null;this.active=null;this.lastTerminal=null;this.pageId=null;this.visible=false;this.entry=0;this.logoAttempted=false;this.volume=.9;this.events=[];
   this.node.addEventListener('play',()=>this.guard());this.node.addEventListener('playing',()=>{if(this.guard()){this.active.actualPlaying=true;this.note('playing',this.active.kind);this.active.owner.started?.();}});
   this.node.addEventListener('ended',()=>this.settle(this.active,'ended'));
   this.node.addEventListener('error',()=>{if(this.active&&this.node.error)this.settle(this.active,'error');});
  }
  note(event,kind=null,detail=null){this.events.push({event,kind,detail,at:this.now()});if(this.events.length>80)this.events.shift();}
  blockedByVoice(){const v=this.getVoice();return !!v&&(['playing','loading'].includes(v.state)||(!v.node.paused&&!v.node.ended));}
  valid(request){return !!request&&this.visible&&this.isDocumentVisible()&&request.owner.valid()&&(request.expiresAt==null||this.now()<request.expiresAt);}
  current(intent){return !!intent&&this.active===intent&&intent.generation===this.generation&&this.node.getAttribute('src')===intent.src;}
  guard(){const a=this.active;if(!this.current(a)||!this.valid(a)||this.blockedByVoice()){this.cancel('stale-or-voice');return false;}return true;}
  cancel(reason='cancelled'){
   const retired=this.active||this.pending,kind=retired?.kind||null;++this.generation;this.pending=null;this.active=null;this.lastTerminal=null;this.node.pause();this.node.removeAttribute('src');this.node.load?.();if(retired?.watch)clearTimeout(retired.watch);if(kind){this.note('cancelled',kind,reason);retired.owner.cancelled?.({kind,reason});}
  }
  request(kind,owner){
   this.cancel('replace');const asset=this.assets[kind];if(!asset){const proof={owner,kind,source:null,token:this.generation,generation:this.generation,outcome:'error',detail:'asset-missing',nodeEndedAtEvent:false};this.lastTerminal=proof;this.note('terminal',kind,'asset-missing');owner.terminal?.(proof);return false;}
   this.pending={kind,asset,owner,expiresAt:owner.expiresAt??null,generation:this.generation};this.note('requested',kind);this.flush();return true;
  }
  flush(){
   const r=this.pending;if(!r)return false;
   if(!this.valid(r)){this.note('dropped',r.kind,'expired-owner');this.pending=null;return false;}
   if(this.blockedByVoice()||!r.owner.ready())return false;
   // Retry is only useful while its visible hint remains, including playback.
   if(r.kind==='incorrect'&&r.expiresAt!=null&&this.now()+(r.asset.duration*1000)+75>r.expiresAt){this.note('dropped',r.kind,'hint-too-short');this.pending=null;return false;}
   this.pending=null;const src=r.asset.audio||r.asset.file;const intent={...r,src,generation:this.generation,requestedAt:this.now(),actualPlaying:false,watch:null,pausedAt:null};this.active=intent;
   this.node.loop=false;this.node.src=src;this.node.volume=Math.max(0,Math.min(1,this.volume*(r.asset.gain??1)));this.node.load?.();this.watch(intent);
   let promise;try{promise=this.node.play();this.note('attempt',r.kind);}catch(error){if(this.current(intent)){this.settle(intent,error.name==='NotAllowedError'?'blocked':'error',error.name||'play');}return false;}
   Promise.resolve(promise).then(()=>{if(!this.current(intent)&&!this.active)this.node.pause();},error=>{if(this.current(intent)){this.settle(intent,error?.name==='NotAllowedError'?'blocked':'error',error?.name||'play');}});return true;
  }
  settle(intent,outcome,detail=null){
   if(!this.current(intent)||!intent.owner.valid())return false;
   if(outcome==='ended'&&!this.node.ended)return false;
   const proof={owner:intent.owner,kind:intent.kind,source:intent.src,token:intent.generation,generation:this.generation,outcome,nodeEndedAtEvent:outcome==='ended'&&this.node.ended};
   clearTimeout(intent.watch);this.pending=null;this.active=null;this.lastTerminal=proof;
   if(outcome==='ended')this.note('ended',intent.kind);else{this.note('failed',intent.kind,detail||outcome);this.node.pause();this.node.removeAttribute('src');this.node.load?.();}
   this.note('terminal',intent.kind,outcome);intent.owner.terminal?.(proof);return true;
  }
  watch(intent){
   if(!this.current(intent))return;
   if(this.node.ended){this.settle(intent,'ended');return;}
   const now=this.now();
   // A start/interruption FAILURE is explicit, never a guessed natural end.
   if(this.node.paused){
    if(intent.actualPlaying){intent.pausedAt??=now;if(now-intent.pausedAt>=500){this.settle(intent,'error','native-interruption');return;}}
    else if(now-intent.requestedAt>=2000){this.settle(intent,'error','start-failed-paused');return;}
   }else intent.pausedAt=null;
   intent.watch=setTimeout(()=>this.watch(intent),100);
  }
  voiceChanged(status){
   if(status==='idle'||!this.isDocumentVisible()){this.cancel(status==='idle'?'voice-navigation':'hidden');return;}
   if(this.active&&this.blockedByVoice()){this.cancel('voice-priority');return;}
   if(this.active&&!this.valid(this.active))this.cancel('owner-changed');this.flush();
  }
  cancelWrong(){if(this.pending?.kind==='incorrect'||this.active?.kind==='incorrect')this.cancel('hint-ended');}
  setVolume(value){const n=Number(value);this.volume=Number.isFinite(n)?Math.max(0,Math.min(1,n)):.9;if(this.active)this.node.volume=Math.max(0,Math.min(1,this.volume*(this.active.asset.gain??1)));}
  pageChanged(page,show){
   const id=page?.page_id||null;if(id!==this.pageId){this.cancel('page-changed');this.pageId=id;++this.entry;this.logoAttempted=false;}this.visible=!!show;
   if(!this.visible){this.cancel('page-not-visible');return;}
   if(page?.page_type==='closing_logo'&&!this.logoAttempted){
    this.logoAttempted=true;const entry=this.entry,pageId=id;
    this.request('logo_reward',{valid:()=>this.entry===entry&&this.pageId===pageId&&this.visible,ready:()=>true});
   }
  }
 }
 return{FeedbackPlayer};
});
