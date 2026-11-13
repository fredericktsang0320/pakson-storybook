/* v14 whole-word screen. Completion uses genuine voice proof; automatic
   question flow additionally waits for an explicit FX terminal and visible
   reward dwell. No timers can manufacture voice/answer/FX completion. */
'use strict';
(()=>{
 const sessions=new Map();
 let page=null,session=null,visible=false,layer=null,vocabulary=null,hooks={};
 let wrong=null,wrongTimer=null,rewardTimer=null,pumpTimer=null,lastRewardTick=null,lastCue='',fxOwner=null;
 const allWords=/\b(fireman|policeman|policewoman|doctor|nurse|duck|doll|door)\b/gi;
 const same=(id,qid,epoch)=>visible&&page?.page_id===id&&session?.question?.id===qid&&session.epoch===epoch;
 function text(n,value){n.replaceChildren();for(const part of String(value).split(allWords)){if(/^(fireman|policeman|policewoman|doctor|nurse|duck|doll|door)$/i.test(part)){const s=document.createElement('strong');s.className='practice-target';s.textContent=part;n.appendChild(s);}else n.appendChild(document.createTextNode(part));}}
 function make(tag,cls,value){const n=document.createElement(tag);n.className=cls;if(value!==undefined)text(n,value);return n;}
 function ensure(){if(layer)return;vocabulary=document.getElementById('practiceVocabulary')||make('section','practice-vocabulary');vocabulary.id='practiceVocabulary';if(!vocabulary.parentNode)document.getElementById('bookShell').appendChild(vocabulary);layer=make('section','practice-task');layer.id='practiceTask';layer.setAttribute('aria-label','Read together, then choose an answer');document.getElementById('bookShell').appendChild(layer);}
 function stopClock(){clearTimeout(pumpTimer);pumpTimer=null;lastRewardTick=null;}
 function clearTransient(){clearTimeout(wrongTimer);clearTimeout(rewardTimer);wrongTimer=null;rewardTimer=null;wrong=null;stopClock();fxOwner=null;window.PaksonFeedback?.cancel('practice-transition');}
 function activate(next){
  ensure();
  if(next?.page_type!=='word_practice'){if(session){session.leave();clearTransient();}page=null;session=null;vocabulary.hidden=true;layer.hidden=true;vocabulary.replaceChildren();layer.replaceChildren();return null;}
  if(page?.page_id!==next.page_id){if(session)session.leave();clearTransient();page=next;if(!sessions.has(next.page_id))sessions.set(next.page_id,new PaksonPracticeState.PracticeSession(next));session=sessions.get(next.page_id);renderVocabulary();lastCue='';}
  return session;
 }
 function renderVocabulary(){
  vocabulary.replaceChildren();const v=page.vocabulary_layout;
  page.targets.forEach((t,i)=>{const c=make('div','vocabulary-column');c.dataset.word=t.word;c.style.left=`${(v.centres[i]-v.widths[i]/2)/1448*100}%`;c.style.width=`${v.widths[i]/1448*100}%`;c.style.setProperty('--indicator-top',`${(v.word_tops[i]-20)/1086*100}%`);c.style.setProperty('--plate-top',`${v.plate_tops[i]/1086*100}%`);c.style.setProperty('--plate-height',`${(v.plate_bottoms[i]-v.plate_tops[i])/1086*100}%`);c.style.setProperty('--plate-extra',`calc(var(--book-width,1448px)*${(v.plate_extra_width||0)/2/1448})`);const word=make('strong','vocabulary-word');word.style.top=`${v.word_tops[i]/1086*100}%`;const ink=make('span','vocabulary-word-ink');ink.textContent=t.display_word;const tracking=v.word_letter_spacing?.[i]||0;if(tracking)ink.style.letterSpacing=`calc(var(--book-width,1448px)*${tracking/1448})`;word.appendChild(ink);c.appendChild(word);vocabulary.appendChild(c);});
 }
 function activeWord(word){for(const c of vocabulary.children)c.dataset.active=String(c.dataset.word===word);}
 function addReward(parent,animate){const reward=make('span','practice-reward');reward.setAttribute('aria-hidden','true');const type=session.question.reward||'hearts';const paths={hearts:'M12 21s-8-4.8-8-11a4.7 4.7 0 0 1 8-3.3A4.7 4.7 0 0 1 20 10c0 6.2-8 11-8 11Z',stars:'m12 2 3 6.2 6.8 1-4.9 4.8 1.2 6.8-6.1-3.2-6.1 3.2 1.2-6.8L2.2 9.2l6.8-1Z',sparkles:'m12 1 3.2 7.8L23 12l-7.8 3.2L12 23l-3.2-7.8L1 12l7.8-3.2Z'};layer.dataset.reward=type;for(let i=0;i<5;i++){const n=make('span','practice-reward-mark');n.style.setProperty('--mark',String(i));const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),p=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');p.setAttribute('d',paths[type]||paths.hearts);svg.appendChild(p);n.appendChild(svg);reward.appendChild(n);}parent.appendChild(reward);if(animate){reward.classList.add('is-celebrating');const id=page.page_id,qid=session.question.id,epoch=session.epoch;rewardTimer=setTimeout(()=>{if(same(id,qid,epoch))reward.classList.remove('is-celebrating');},1100);}}
 function wrongSound(){
  const id=page.page_id,qid=session.question.id,epoch=session.epoch,token=wrong;
  const current=()=>same(id,qid,epoch)&&wrong===token&&!session.correct.has(qid);
  const startHint=()=>{if(!current()||token.hintTimerStarted)return;token.hintTimerStarted=true;clearTimeout(wrongTimer);wrongTimer=setTimeout(()=>{if(current()){window.PaksonFeedback?.cancelWrong();wrong=null;wrongTimer=null;render();}},session.question.wrong_feedback_ms||1200);};
  window.PaksonFeedback?.request('incorrect',{valid:current,ready:()=>session.promptEnded.has(qid),started:startHint,terminal:()=>startHint(),cancelled:()=>{if(current()){wrong=null;clearTimeout(wrongTimer);wrongTimer=null;render();}}});
 }
 function ensureCorrectSound(){
  const q=session?.question,player=window.PaksonFeedback;
  if(!q||!visible||!session.correct.has(q.id)||!session.promptEnded.has(q.id)||session.feedbackTerminal||fxOwner||!hooks.canTransition?.()||!hooks.currentMediaEnded?.(session.mediaPage()))return;
  const id=page.page_id,qid=q.id,epoch=session.epoch;
  const owner={valid:()=>same(id,qid,epoch)&&session.correct.has(qid),ready:()=>session.promptEnded.has(qid)&&hooks.currentMediaEnded?.(session.mediaPage()),terminal:proof=>{if(!owner.valid()||proof!==player.lastTerminal||proof.owner!==owner||proof.kind!=='correct'||proof.token!==proof.generation||proof.generation!==player.generation)return;fxOwner=null;if(session.recordFeedback(qid,epoch,proof.outcome)){render();pump();}},cancelled:()=>{if(owner.valid()&&fxOwner===owner)fxOwner=null;}};
  fxOwner=owner;player.request('correct',owner);
 }
 function activeNow(){return visible&&!!session&&hooks.canTransition?.();}
 function pump(){
  clearTimeout(pumpTimer);pumpTimer=null;
  if(!activeNow()||session.phase!=='question'||!session.correct.has(session.question.id)){lastRewardTick=null;return;}
  const now=performance.now();if(lastRewardTick!==null)session.addVisibleReward(now-lastRewardTick);lastRewardTick=now;
  ensureCorrectSound();
  if(session.stepReady()){
   if(session.complete()){if(!document.getElementById('practiceNextButton'))render();stopClock();return;}
   if(page.auto_question_advance!==false){const effect=session.next();if(effect.accepted){clearTransient();render();hooks.playNext?.(effect.play);}return;}
  }
  const id=page.page_id,qid=session.question.id,epoch=session.epoch;
  // Visual dwell only. All voice/correctness/FX gates remain independent proof.
  pumpTimer=setTimeout(()=>{if(same(id,qid,epoch))pump();},50);
 }
 function render(animate=false){
  if(!layer)return;layer.hidden=!visible||!session;vocabulary.hidden=!visible||!session;if(!session)return;
  const r=page.quiz_region;Object.assign(layer.style,{left:`${r.x/1448*100}%`,top:`${r.y/1086*100}%`,width:`${r.width/1448*100}%`,height:`${r.height/1086*100}%`});layer.replaceChildren();layer.dataset.phase=session.phase;delete layer.dataset.result;
  if(session.phase==='intro'){const cue=session.cueAt(session.position),heading=make('p','practice-prompt practice-cue');heading.id='practiceCue';const label=make('span','practice-cue-label',cue.label);label.id='practiceCueLabel';heading.appendChild(label);const number=make('span','practice-cue-countdown');number.id='practiceCountdown';number.setAttribute('aria-label','Seconds to read together');number.setAttribute('aria-live','off');heading.appendChild(number);layer.appendChild(heading);const meter=make('div','practice-turn-meter');meter.setAttribute('aria-hidden','true');meter.appendChild(make('span','practice-turn-fill'));layer.appendChild(meter);activeWord(cue.word);updatePosition(session.mediaPage(),session.position);hooks.changed?.();return;}
  const q=session.question,correct=session.correct.has(q.id);layer.dataset.questionId=q.id;layer.dataset.result=correct?'correct':wrong?'try-again':'unanswered';const heading=make('p',correct?'practice-feedback':'practice-prompt',correct?(q.reward_text||'Lovely work!'):q.prompt);heading.id='practiceQuestion';if(correct)addReward(heading,animate);layer.appendChild(heading);activeWord(q.word);
  if(session.complete()&&session.stepReady()){
   const next=make('button','practice-next','Next page');next.id='practiceNextButton';next.type='button';next.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(!session.complete()||!session.stepReady())return;clearTransient();hooks.nextPage?.();});layer.appendChild(next);
  }else{
   const choices=make('div','practice-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label',q.prompt);
   const parentId=page.page_id,questionId=q.id,renderEpoch=session.epoch;for(const o of q.options){const isWrong=wrong?.optionId===o.id&&wrong.epoch===session.epoch&&wrong.questionId===q.id;const button=make('button','practice-option',isWrong?(q.wrong_feedback||'Try again'):o.label);button.type='button';button.dataset.optionId=o.id;button.disabled=!visible||correct;if(correct&&o.id===q.correct_option_id)button.dataset.correct='true';if(isWrong)button.dataset.wrong='true';button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(!same(parentId,questionId,renderEpoch))return;const result=session.choose(o.id);if(!result.accepted)return;clearTransient();if(result.correct){render(true);pump();return;}wrong={optionId:o.id,questionId:q.id,epoch:session.epoch,hintTimerStarted:false};render();wrongSound();});choices.appendChild(button);}layer.appendChild(choices);
  }
  hooks.changed?.();
 }
 function sync(next,show){const was=visible,s=activate(next);visible=!!show;if(s&&was&&!visible){s.leave();clearTransient();}render();}
 function mediaFor(next,restart=false){const s=activate(next);if(!s)return next;if(restart){clearTransient();s.restartCurrent();}render();return s.mediaPage();}
 function onNaturalEnd(media,proof){if(!session||!visible||!session.matches(media)||!hooks.isCurrentNaturalEnd?.(media,proof))return false;const result=session.ended(media);if(!result.accepted)return false;if(result.play)clearTransient();render();if(result.play)hooks.playNext?.(result.play);else{window.PaksonFeedback?.flush();pump();}return true;}
 function updatePosition(media,seconds){if(!session||!session.matches(media))return;session.position=seconds;if(session.phase!=='intro')return;const cue=session.cueAt(seconds),key=[cue.label,cue.word].join('|');if(key!==lastCue){const n=layer.querySelector('#practiceCueLabel');if(n)text(n,cue.label);activeWord(cue.word);lastCue=key;}const number=layer.querySelector('#practiceCountdown');if(number){number.hidden=cue.phase!=='your_turn';number.textContent=cue.countdown==null?'':String(cue.countdown);}const meter=layer.querySelector('.practice-turn-meter');if(meter){meter.hidden=cue.phase!=='your_turn';const e=media.timeline?.find(e=>seconds>=(e.at??e.start)&&seconds<e.end),duration=e?e.end-(e.at??e.start):1;meter.firstChild.style.transform=`scaleX(${cue.remaining==null?0:Math.max(0,Math.min(1,cue.remaining/duration))})`;}}
 function restartGroup(next){const s=activate(next);if(!s)return;clearTransient();s.reset();lastCue='';render();}
 function resetAll(){clearTransient();for(const s of sessions.values())s.reset();if(session)render();}
 function restoreMedia(media){const s=sessions.get(media?.practice_parent_id);return s?s.mediaPage():media;}
 function suspend(){stopClock();fxOwner=null;}
 window.PaksonPractice={configure:v=>{hooks=v;},sync,mediaFor,onNaturalEnd,updatePosition,restartGroup,resetAll,restoreMedia,pump,suspend,resume:pump,isPractice:p=>p?.page_type==='word_practice',canAdvancePage:()=>!!session?.complete()&&session.stepReady(),getSession:()=>session,getSessions:()=>sessions,audioState(){if(session)render();}};
})();
