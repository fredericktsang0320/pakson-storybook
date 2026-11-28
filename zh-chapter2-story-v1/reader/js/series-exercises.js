'use strict';
(() => {
  // Fractions refer to the accepted 4:3 illustration, including every picture and its label.
  const validRect = rect => Array.isArray(rect) && rect.length === 4 &&
    rect.every(Number.isFinite) && rect[0] >= 0 && rect[1] >= 0 &&
    rect[2] > 0 && rect[3] > 0 && rect[0] + rect[2] <= 100 && rect[1] + rect[3] <= 100;

  function position(element, rect) {
    const [x,y,w,h] = rect;
    Object.assign(element.style,{left:x+'%',top:y+'%',width:w+'%',height:h+'%'});
  }

  function dictation(layer, targets, questions, {feedback, complete}) {
    if (targets.size !== questions.size || ![...questions].every(([id, answer]) =>
      targets.has(id) && Array.isArray(answer) && answer.length === 1 && Array.from(answer[0]).length === 1)) {
      throw new Error('默書空格同答案唔相符');
    }
    const elements = [];
    let remaining = targets.size;
    for (const [id, target] of targets) {
      const field = document.createElement('input');
      field.type = 'text';
      field.className = 'zh-activity-target zh-dictation-field';
      field.setAttribute('aria-label',target.label);
      field.autocomplete = 'off';
      field.autocapitalize = 'off';
      field.spellcheck = false;
      position(field,target.rect);
      function check() {
        const written = field.value.trim().normalize('NFC');
        if (!written || field.readOnly) return;
        const correct = written === questions.get(id)[0];
        field.setAttribute('aria-invalid',String(!correct));
        feedback(correct);
        if (!correct) return;
        field.readOnly = true;
        if (--remaining === 0) complete();
      }
      field.addEventListener('change',check);
      field.addEventListener('keydown',event => {
        if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        check();
      });
      layer.append(field);
      elements.push(field);
    }
    return () => elements.forEach(field => field.remove());
  }

  function mount(layer, exercise, {feedback, complete}) {
    const modes = ['choice', 'pair', 'sequence', 'multi', 'assign', 'dictation', 'colour'];
    if (!modes.includes(exercise.mode)) throw new Error('未支援嘅中文題型');
    const targets = new Map();
    const answered = new Set();
    let pairStart = null;
    let selectedPrompt = null;
    const progress = new Map();
    const lines = [];
    const marked = new Set();
    const colors = ['#a33120','#235d75','#466932','#805389','#a06315','#814732'];

    for (const target of exercise.targets) {
      if (!target.id || targets.has(target.id) || !target.label || !validRect(target.rect)) {
        throw new Error('答題位置或標籤需要核對');
      }
      targets.set(target.id, target);
    }
    const questions = new Map(Object.entries(exercise.answers));
    if (!questions.size) throw new Error('題目未設定答案');
    if (exercise.mode === 'dictation') return dictation(layer,targets,questions,{feedback,complete});
    const references = [...questions].flatMap(([id, answers]) =>
      ['pair', 'assign', 'colour'].includes(exercise.mode) ? [id, ...answers] : answers);
    if (!references.every(id => targets.has(id))) throw new Error('答案缺少畫面熱區');
    if (exercise.mode === 'colour' && (new Set(references).size !== references.length ||
      [...questions.values()].some(answers => answers.length !== 1))) {
      throw new Error('相反詞必須一對一配色');
    }

    const contrast = document.createElement('canvas');
    contrast.className = 'zh-choice-lines';
    contrast.setAttribute('aria-hidden', 'true');
    Object.assign(contrast.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
    if (exercise.mode === 'pair') layer.append(contrast);
    const buttons = new Map();
    const input = new AbortController();

    function paintPairs() {
      if (!lines.length) return;
      const rect = layer.getBoundingClientRect();
      const scale = Math.min(devicePixelRatio || 1, 2);
      contrast.width = Math.round(rect.width * scale);
      contrast.height = Math.round(rect.height * scale);
      const ctx = contrast.getContext('2d');
      const width = contrast.width;
      const height = contrast.height;
      const center = id => {
        const [x, y, w, h] = targets.get(id).rect;
        return [(x+w/2) * width / 100, (y+h/2) * height / 100];
      };
      lines.forEach(([left,right], index) => {
        ctx.beginPath();
        ctx.moveTo(...center(left));
        ctx.lineTo(...center(right));
        ctx.strokeStyle = '#fff2d2';
        ctx.lineWidth = 7 * scale;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.strokeStyle = colors[index % colors.length];
        ctx.lineWidth = 4 * scale;
        ctx.stroke();
      });
    }
    const resize = exercise.mode === 'pair' ? new ResizeObserver(paintPairs) : null;
    resize?.observe(layer);

    function press(id, state) { buttons.get(id)?.setAttribute('aria-pressed', String(state)); }
    function finish(id) {
      answered.add(id);
      feedback(true);
      if (answered.size === questions.size) complete();
    }

    function pair(target) {
      const isLeft = target.side === 'left';
      if (isLeft ? !questions.has(target.id) || answered.has(target.id) : lines.some(([,right]) => right === target.id)) return;
      if (target.id === pairStart) {
        press(pairStart, false);
        pairStart = null;
        return;
      }
      if (!pairStart || targets.get(pairStart).side === target.side) {
        press(pairStart, false);
        pairStart = target.id;
        press(pairStart, true);
        return;
      }
      const [left,right] = isLeft ? [target.id,pairStart] : [pairStart,target.id];
      if (!questions.get(left).includes(right)) { feedback(false); return; }
      lines.push([left,right]);
      press(target.id, true);
      paintPairs();
      finish(left);
      pairStart = null;
    }

    function choose(target, question = target.question) {
      const correct = questions.get(question);
      if (!correct || answered.has(question)) return;
      const picked = progress.get(question) ?? [];
      if (picked.includes(target.id)) return;
      const ordered = exercise.mode === 'sequence' || exercise.mode === 'assign';
      const valid = ordered ? correct[picked.length] === target.id : correct.includes(target.id);
      if (!valid) {
        if (ordered) {
          picked.forEach(id => press(id, false));
          progress.delete(question);
        }
        feedback(false);
        return;
      }
      picked.push(target.id);
      progress.set(question, picked);
      press(target.id, true);
      if (picked.length === correct.length) {
        if (exercise.mode === 'assign') {
          picked.forEach(id => press(id, false));
          selectedPrompt = null;
        }
        finish(question);
      }
    }

    function assign(target) {
      if (questions.has(target.id)) {
        if (answered.has(target.id)) return;
        if (selectedPrompt) {
          press(selectedPrompt, false);
          (progress.get(selectedPrompt) ?? []).forEach(id => press(id, false));
        }
        selectedPrompt = selectedPrompt === target.id ? null : target.id;
        if (selectedPrompt) {
          press(selectedPrompt, true);
          (progress.get(selectedPrompt) ?? []).forEach(id => press(id, true));
        }
        return;
      }
      if (selectedPrompt) choose(target, selectedPrompt);
    }

    function colour(target) {
      if (marked.has(target.id)) return;
      if (!pairStart) {
        pairStart = target.id;
        press(pairStart, true);
        return;
      }
      const first = pairStart;
      if (first === target.id) {
        press(first, false);
        pairStart = null;
        return;
      }
      const question = questions.get(first)?.includes(target.id) ? first :
        questions.get(target.id)?.includes(first) ? target.id : null;
      if (!question) {
        feedback(false);
        return;
      }
      const ink = colors[answered.size % colors.length];
      for (const id of [first,target.id]) {
        marked.add(id);
        press(id, true);
        buttons.get(id).style.boxShadow = `inset 0 0 0 3px ${ink}, 0 0 0 2px #fff2d2`;
      }
      pairStart = null;
      finish(question);
    }

    for (const target of targets.values()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'zh-activity-target';
      button.setAttribute('aria-label', target.label);
      button.setAttribute('aria-pressed', 'false');
      position(button,target.rect);
      button.addEventListener('click', () => {
        if (exercise.mode === 'pair') pair(target);
        else if (exercise.mode === 'assign') assign(target);
        else if (exercise.mode === 'colour') colour(target);
        else choose(target);
      }, {signal:input.signal});
      buttons.set(target.id,button);
      layer.append(button);
    }
    return () => {
      input.abort();
      resize?.disconnect();
      contrast.remove();
      for (const button of buttons.values()) button.remove();
    };
  }

  window.PaksonZhExercise = {mount};
})();
