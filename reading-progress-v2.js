'use strict';
(() => {
  const keyPrefix = 'pakson:reading-progress:v1:';
  const firstAvailable = { english: 3, chinese: 2 };
  const memory = new Set();

  function key(subject, number, item) {
    return keyPrefix + subject + ':' + number + ':' + item;
  }

  function has(subject, number, item) {
    const id = key(subject, number, item);
    try {
      return localStorage.getItem(id) === '1' || memory.has(id);
    } catch {
      return memory.has(id);
    }
  }

  function save(subject, number, item) {
    const id = key(subject, number, item);
    memory.add(id);
    try { localStorage.setItem(id, '1'); } catch {}
  }

  function completed(subject, number) {
    return has(subject, number, 'complete');
  }

  function allowed(subject, number) {
    const start = firstAvailable[subject];
    if (!start || !Number.isInteger(number) || number < 1) return false;
    if (number <= start) return true;
    const requiredFrom = subject === 'english' ? start : 1;
    for (let earlier = requiredFrom; earlier < number; earlier++) {
      if (!completed(subject, earlier)) return false;
    }
    return true;
  }

  function subjectOf(book) {
    return book.language?.startsWith('zh') ? 'chinese' : 'english';
  }

  function readerAllowed(book) {
    return allowed(subjectOf(book), book.chapter_number);
  }

  function mark(book, page, kind) {
    if (!readerAllowed(book)) return;
    save(subjectOf(book), book.chapter_number, kind + ':' + page.page_id);
  }

  function hasRequiredProgress(book, subject, number) {
    return book.pages.every(page => {
      if (page.page_type === 'cover' || page.page_type === 'closing_logo') return true;
      if (page.page_type === 'word_practice') return has(subject, number, 'practice:' + page.page_id);
      if (page.audio && !has(subject, number, 'listen:' + page.page_id)) return false;
      const hasQuiz = (subject === 'chinese' && page.exercise) || page.targets?.some(target => target.correct);
      return !hasQuiz || has(subject, number, 'quiz:' + page.page_id);
    });
  }

  function onPage(book, index) {
    if (book.pages[index]?.page_type !== 'closing_logo') return;
    const subject = subjectOf(book);
    const number = book.chapter_number;
    if (!readerAllowed(book) || completed(subject, number) || !hasRequiredProgress(book, subject, number)) return;
    save(subject, number, 'complete');
    if (window.parent !== window) window.parent.dispatchEvent(new Event('pakson:progress-changed'));
  }

  function archiveEntry(subject, number) {
    if (subject === 'chinese' && number < 3 && !(completed(subject, 1) && completed(subject, 2))) return false;
    return completed(subject, number);
  }

  function shelfBooks(books, subject, reread) {
    return books.map((book, index) => ({ ...book, sequence: index + 1 }))
      .filter(book => archiveEntry(subject, book.sequence) === reread);
  }

  function shelfMode() {
    return new URL(location.href).searchParams.get('reread') === '1';
  }

  function shelfToggle(header, visible, rerender) {
    let button = header.querySelector('.reread-toggle');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'reread-toggle';
      button.addEventListener('click', () => {
        const url = new URL(location.href);
        if (shelfMode()) url.searchParams.delete('reread');
        else url.searchParams.set('reread', '1');
        url.searchParams.delete('page');
        history.pushState(null, '', url);
        rerender();
        window.scrollTo(0, 0);
      });
      header.append(button);
    }
    button.textContent = shelfMode() ? '學習書架' : '重讀';
    button.hidden = !visible && !shelfMode();
  }

  function lockCard(card, image, title, book) {
    card.removeAttribute('href');
    card.setAttribute('role', 'link');
    card.setAttribute('aria-disabled', 'true');
    card.setAttribute('aria-label', book.title + '，尚未解鎖');
    const face = document.createElement('span');
    face.className = 'locked-cover';
    const icon = document.createElement('span');
    icon.className = 'book-lock';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 11V7a5 5 0 0 1 10 0v4"/><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M12 14v3"/></svg>';
    face.append(image, icon);
    card.replaceChildren(face, title);
  }

  window.PaksonProgress = { allowed, readerAllowed, mark, onPage, shelfBooks, shelfMode, shelfToggle, lockCard, keyPrefix };
})();
