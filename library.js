(() => {
  'use strict';
  const grid = document.getElementById('bookGrid');
  const filters = document.getElementById('subjectFilters');
  const status = document.getElementById('libraryStatus');
  const empty = document.getElementById('emptyState');
  const error = document.getElementById('errorState');
  const retry = document.getElementById('retryButton');
  let catalogue = null;
  let selected = 'all';
  let loading = false;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function localPath(path) {
    if (typeof path !== 'string' || !path.trim()) throw new Error('Missing local path');
    const url = new URL(path, location.href);
    const base = new URL('./', location.href);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new Error('Invalid local path');
    return url.href;
  }
  function bookCard(book) {
    const subject = catalogue.subjects.find(item => item.id === book.subject);
    const link = element('a', 'book-card');
    link.href = localPath(book.href);
    link.dataset.bookId = book.id;
    link.setAttribute('aria-label', `閱讀 ${book.title}，${book.subtitle}`);
    const coverWrap = element('div', 'cover-wrap');
    const image = element('img', 'book-cover');
    image.src = localPath(book.cover);
    image.alt = book.cover_alt || book.title;
    image.width = 1448;
    image.height = 1086;
    image.decoding = 'async';
    image.addEventListener('error', () => {
      image.hidden = true;
      coverWrap.append(element('p', 'cover-error', '封面暫時未能顯示，仍可打開故事。'));
    }, { once: true });
    coverWrap.append(image);
    const copy = element('div', 'book-copy');
    const meta = element('div', 'book-meta');
    [subject.label, book.level, `${book.page_count} 頁`].forEach(value => meta.append(element('span', '', value)));
    const title = element('h3', 'book-title', book.title);
    title.lang = book.subject === 'english' ? 'en-GB' : 'zh-HK';
    copy.append(meta, title, element('p', 'book-subtitle', book.subtitle), element('span', 'read-book', '打開故事'));
    link.append(coverWrap, copy);
    return link;
  }
  function render() {
    if (!catalogue) return;
    const books = catalogue.books.filter(book => selected === 'all' || book.subject === selected);
    grid.classList.toggle('is-multiple', books.length > 1);
    grid.replaceChildren(...books.map(bookCard));
    grid.setAttribute('aria-busy', 'false');
    empty.hidden = books.length !== 0;
    document.getElementById('emptyTitle').textContent = selected === 'chinese' ? '中文讀物準備中' : '新讀物準備中';
    status.textContent = '';
    document.getElementById('shelfTitle').textContent = selected === 'all' ? '我的小書架' : `${catalogue.subjects.find(subject => subject.id === selected).label}小書架`;
    filters.querySelectorAll('button').forEach(button => {
      const active = button.dataset.subject === selected;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-selected', active);
    });
  }
  function chooseSubject(subject) {
    if (!catalogue || (subject !== 'all' && !catalogue.subjects.some(item => item.id === subject))) return;
    selected = subject;
    render();
  }
  filters.addEventListener('click', event => {
    const button = event.target.closest('button[data-subject]');
    if (button) chooseSubject(button.dataset.subject);
  });
  document.getElementById('showEnglish').addEventListener('click', () => {
    chooseSubject('english');
    filters.querySelector('[data-subject="english"]').focus();
  });
  async function loadCatalogue() {
    if (loading) return;
    loading = true;
    retry.disabled = true;
    error.hidden = true;
    empty.hidden = true;
    grid.setAttribute('aria-busy', 'true');
    status.textContent = '正在打開小書房……';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('./library.json', { signal: controller.signal });
      if (!response.ok) throw new Error('Catalogue unavailable');
      const data = await response.json();
      if (data.schema_version !== 1 || !Array.isArray(data.subjects) || !Array.isArray(data.books)) throw new Error('Invalid catalogue');
      if (!data.subjects.every(subject => typeof subject.id === 'string' && typeof subject.label === 'string')) throw new Error('Invalid subjects');
      data.books.forEach(book => {
        if (!book.id || !book.title || !book.subtitle || !book.level || !Number.isInteger(book.page_count) || book.page_count < 1 || !data.subjects.some(subject => subject.id === book.subject)) throw new Error('Invalid book');
        localPath(book.href);
        localPath(book.cover);
      });
      catalogue = data;
      const all = element('button', 'subject-button', '全部');
      all.type = 'button';
      all.dataset.subject = 'all';
      filters.replaceChildren(all, ...data.subjects.map(subject => {
        const button = element('button', 'subject-button', subject.label);
        button.type = 'button';
        button.dataset.subject = subject.id;
        return button;
      }));
      render();
    } catch (_) {
      grid.replaceChildren();
      grid.setAttribute('aria-busy', 'false');
      status.textContent = '';
      error.hidden = false;
    } finally {
      clearTimeout(timeout);
      retry.disabled = false;
      loading = false;
    }
  }
  retry.addEventListener('click', loadCatalogue);
  loadCatalogue();
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(() => {});
})();
