/* Pure merged-practice state machine. Only validated native media ended events
   may call ended(); elapsed guesses and UI timers never unlock navigation. */
'use strict';
((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PaksonPracticeState=api;})(typeof window==='object'?window:globalThis,()=>{
  class PracticeSession{
    constructor(page){this.page=page;this.reset();}
    reset(){this.epoch=(this.epoch||0)+1;this.phase='intro';this.questionIndex=-1;this.introEnded=false;this.promptEnded=new Set();this.correct=new Set();this.selected=new Map();this.position=0;this.feedbackTerminal=null;this.rewardVisibleMs=0;return this.snapshot();}
    get questions(){return this.page.questions;}
    get question(){return this.questionIndex>=0?this.questions[this.questionIndex]:null;}
    get clip(){return this.phase==='intro'?this.page.intro:this.question?.media;}
    get audioId(){return this.clip?.audio_id;}
    mediaPage(){const c=this.clip;return{...c,book_page:c.audio_id,page_id:c.audio_id,page_type:'practice_clip',practice_parent_id:this.page.page_id,practice_epoch:this.epoch};}
    matches(media){return !!media&&media.practice_parent_id===this.page.page_id&&media.audio_id===this.audioId&&media.practice_epoch===this.epoch;}
    restartCurrent(){++this.epoch;this.position=0;this.feedbackTerminal=null;this.rewardVisibleMs=0;if(this.phase==='intro')this.introEnded=false;else this.promptEnded.delete(this.question.id);return this.mediaPage();}
    leave(){++this.epoch;this.feedbackTerminal=null;this.rewardVisibleMs=0;}
    ended(media){
      if(!this.matches(media))return{accepted:false};
      if(this.phase==='intro'){this.introEnded=true;this.phase='question';this.questionIndex=0;this.position=0;this.feedbackTerminal=null;this.rewardVisibleMs=0;++this.epoch;return{accepted:true,play:this.mediaPage()};}
      this.promptEnded.add(this.question.id);return{accepted:true,canAdvance:this.canAdvance(),complete:this.complete(),feedbackTerminal:this.feedbackTerminal,rewardVisibleMs:this.rewardVisibleMs,stepReady:this.stepReady()};
    }
    choose(id){
      const q=this.question;if(this.phase!=='question'||!q||this.correct.has(q.id))return{accepted:false};
      if(!q.options.some(o=>o.id===id))return{accepted:false};
      this.selected.set(q.id,id);
      const correct=id===q.correct_option_id;if(correct)this.correct.add(q.id);
      return{accepted:true,correct,epoch:this.epoch,questionId:q.id};
    }
    canAdvance(){const q=this.question;return this.introEnded&&!!q&&this.correct.has(q.id)&&this.promptEnded.has(q.id);}
    complete(){return this.canAdvance()&&this.questionIndex===this.questions.length-1&&this.questions.every(q=>this.correct.has(q.id)&&this.promptEnded.has(q.id));}
    next(){
      if(!this.canAdvance())return{accepted:false};
      if(this.complete())return{accepted:true,nextPage:true};
      ++this.questionIndex;++this.epoch;this.position=0;this.feedbackTerminal=null;this.rewardVisibleMs=0;return{accepted:true,play:this.mediaPage()};
    }
    recordFeedback(questionId,epoch,outcome){
      if(this.phase!=='question'||this.question?.id!==questionId||this.epoch!==epoch||!this.correct.has(questionId)||!this.promptEnded.has(questionId)||!['ended','blocked','error'].includes(outcome))return false;
      this.feedbackTerminal={questionId,epoch,outcome};return true;
    }
    addVisibleReward(milliseconds){if(this.question&&this.correct.has(this.question.id))this.rewardVisibleMs+=Math.max(0,Math.min(100,Number(milliseconds)||0));}
    stepReady(){return this.canAdvance()&&this.feedbackTerminal?.epoch===this.epoch&&this.feedbackTerminal?.questionId===this.question.id&&this.rewardVisibleMs>=900;}
    cueAt(seconds){
      if(this.phase!=='intro')return{label:this.correct.has(this.question.id)?'Lovely work!':this.promptEnded.has(this.question.id)?'Choose an answer':'Listen and choose',word:this.question.word,phase:'question'};
      const timeline=this.clip.timeline||[];const event=timeline.find(e=>seconds>=(e.at??e.start)&&seconds<e.end);
      const raw=event?.cue_state||event?.ui_phase||(event?.type==='response_gap'||event?.kind==='response_gap'?'your_turn':'read_with_me');
      const phase=/your[ _]turn/i.test(raw)?'your_turn':'read_with_me';
      const remaining=event&&phase==='your_turn'?Math.max(0,event.end-seconds):null;
      const countdown=remaining===null?null:Math.max(1,Math.min(6,Math.ceil(remaining-1e-6)));
      return{label:phase==='your_turn'?'Your turn':'Read with me',word:event?.word||event?.target_word||null,phase,remaining,countdown};
    }
    snapshot(){return{pageId:this.page.page_id,epoch:this.epoch,phase:this.phase,questionIndex:this.questionIndex,audioId:this.audioId,introEnded:this.introEnded,promptEnded:[...this.promptEnded],correct:[...this.correct],currentCorrect:!!this.question&&this.correct.has(this.question.id),currentPromptEnded:!!this.question&&this.promptEnded.has(this.question.id),canAdvance:this.canAdvance(),complete:this.complete(),feedbackTerminal:this.feedbackTerminal,rewardVisibleMs:this.rewardVisibleMs,stepReady:this.stepReady()};}
  }
  return{PracticeSession};
});
