/* One gesture-unlocked AudioContext for speech, effects and music. */
'use strict';
class StoryAudio {
  constructor(book, callbacks = {}) {
    this.book = book; this.callbacks = callbacks; this.ctx = null;
    this.generation = 0; this.source = null; this.effects = new Set();
    this.speechCache = new Map(); this.effectCache = new Map(); this.pending = new Map();
    this.state = 'idle'; this.page = null; this.offset = 0; this.startedAt = 0;
    this.musicEnabled = true; this.sfxEnabled = true; this.volume = .9;
    this.musicSource = null; this.musicNode = null; this.musicId = null; this.musicRequest = 0; this.turnEffects = new Set();
  }
  async unlock() {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('This browser cannot play the story. Please try Safari.');
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
      this.speechGain = this.ctx.createGain(); this.speechGain.gain.value = 1;
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = .65;
      this.speechGain.connect(this.master); this.sfxGain.connect(this.master); this.master.connect(this.ctx.destination);
      this.ctx.addEventListener('statechange', () => {
        if (this.ctx.state === 'interrupted' && this.state === 'playing') this.pause();
      });
    }
    const resumed = this.ctx.resume();
    const silent = this.ctx.createBufferSource();
    silent.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate); silent.connect(this.master); silent.start();
    await resumed;
    if (this.ctx.state !== 'running') throw new Error('Tap Read to me to turn on the sound.');
    return this.ctx;
  }
  emit(state, detail) { this.state = state; this.callbacks.state?.(state, detail); }
  async buffer(url, pinned = false) {
    const cache = pinned ? this.effectCache : this.speechCache;
    if (cache.has(url)) { const value = cache.get(url); cache.delete(url); cache.set(url, value); return value; }
    if (this.pending.has(url)) return this.pending.get(url);
    const promise = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('The sound has not loaded. Reconnect and tap Read again.');
      const value = await this.ctx.decodeAudioData(await response.arrayBuffer());
      cache.set(url, value);
      if (!pinned) {
        for (const key of cache.keys()) {
          if (cache.size <= 4) break;
          if (key !== this.page?.audio) cache.delete(key);
        }
      }
      return value;
    })();
    this.pending.set(url, promise);
    try { return await promise; } finally { this.pending.delete(url); }
  }
  stopSources() {
    if (this.source) { this.source.onended = null; try { this.source.stop(); } catch {} this.source.disconnect(); this.source = null; }
    for (const node of this.effects) { try { node.stop(); } catch {} }
    this.effects.clear();
  }
  position() {
    if (this.state === 'playing' && this.ctx) return Math.min(this.page?.duration || Infinity, Math.max(0, this.ctx.currentTime - this.startedAt));
    return this.offset;
  }
  async play(page, restart = false) {
    if (page.page_type === 'closing_logo') {
      this.navigation(); this.stopMusic(); this.page = page; this.emit('ended'); return;
    }
    if (this.state === 'playing' && this.page?.book_page === page.book_page && !restart) return;
    const token = ++this.generation;
    await this.unlock();
    if (token !== this.generation) return;
    this.stopSources();
    if (restart || this.page?.book_page !== page.book_page || this.state === 'ended') this.offset = 0;
    this.page = page;
    if (!page.audio) { this.emit('error', 'The voice for this page is not ready yet. Please try again later.'); return; }
    this.emit('loading');
    try {
      const effectIds = [...new Set((page.effects || []).map(item => item.id))];
      const [speech] = await Promise.all([
        this.buffer(page.audio),
        ...effectIds.map(id => this.book.sfx?.[id]?.url ? this.buffer(this.book.sfx[id].url, true).catch(() => null) : null),
      ]);
      if (token !== this.generation) return;
      if (this.ctx.state !== 'running') await this.ctx.resume();
      if (token !== this.generation) return;
      if (this.ctx.state !== 'running') throw new Error('The sound is paused. Tap to continue.');
      this.offset = Math.min(this.offset, Math.max(0, speech.duration - .02));
      const now = this.ctx.currentTime + .04;
      this.source = this.ctx.createBufferSource(); this.source.buffer = speech; this.source.connect(this.speechGain);
      this.startedAt = now - this.offset;
      this.source.onended = () => {
        if (token !== this.generation) return;
        this.source = null; this.offset = 0; this.duckMusic(false); this.emit('ended'); this.callbacks.ended?.();
      };
      this.source.start(now, this.offset);
      if (this.sfxEnabled) for (const cue of page.effects || []) {
        if (cue.at < this.offset) continue;
        this.scheduleEffect(cue.id, now + cue.at - this.offset, cue.gain ?? 1);
      }
      this.emit('playing'); this.setMusic(page.bgm_cue || 'bgm_warm').catch(() => {}); this.duckMusic(true);
      const next = this.book.pages[page.book_page + 1];
      if (next?.audio) this.buffer(next.audio).catch(() => {});
    } catch (error) {
      if (token === this.generation) { this.offset = 0; this.duckMusic(false); this.emit('error', error.message); }
    }
  }
  pause() {
    this.offset = this.position(); ++this.generation; this.stopSources(); this.duckMusic(false, true); this.emit('paused');
  }
  navigation() {
    ++this.generation; this.stopSources(); this.offset = 0; this.page = null; this.duckMusic(false); this.emit('idle');
  }
  scheduleEffect(id, when, gain = 1) {
    const info = this.book.sfx?.[id]; if (!info || !this.ctx || !this.sfxEnabled) return;
    const buffer = this.effectCache.get(info.url); if (!buffer) return;
    const source = this.ctx.createBufferSource(), level = this.ctx.createGain(); source.buffer = buffer;
    level.gain.value = (info.gain ?? .65) * gain;
    const pool = id === 'page_turn' ? this.turnEffects : this.effects;
    source.connect(level); level.connect(this.sfxGain); pool.add(source);
    source.onended = () => { pool.delete(source); source.disconnect(); level.disconnect(); };
    source.start(Math.max(this.ctx.currentTime, when));
  }
  async flipSound() {
    if (!this.sfxEnabled) return;
    await this.unlock();
    const info = this.book.sfx?.page_turn; if (!info) return;
    try { await this.buffer(info.url, true); this.scheduleEffect('page_turn', this.ctx.currentTime, .7); } catch {}
  }
  musicInfo(id) {
    const mapped = this.book.musicAliases?.[id] || id;
    return this.book.music?.[mapped] || this.book.music?.bgm_warm;
  }
  async setMusic(id) {
    if (!this.ctx) return;
    const info = this.musicInfo(id); if (!info) return;
    const request = ++this.musicRequest; this.musicBase = info.gain ?? .17;
    if (this.musicId === info.url && this.musicSource) { this.duckMusic(this.state === 'playing'); return; }
    const buffer = await this.buffer(info.url, true);
    if (request !== this.musicRequest) return;
    const old = this.musicSource, oldNode = this.musicNode;
    if (oldNode) {
      oldNode.gain.cancelScheduledValues(this.ctx.currentTime); oldNode.gain.setTargetAtTime(0, this.ctx.currentTime, .18);
      if (old) { try { old.stop(this.ctx.currentTime + .8); } catch {} }
    }
    this.musicSource = this.ctx.createBufferSource(); this.musicSource.buffer = buffer; this.musicSource.loop = true;
    this.musicSource.loopStart = info.loopStart || 0; this.musicSource.loopEnd = info.loopEnd || buffer.duration;
    this.musicNode = this.ctx.createGain(); this.musicNode.gain.value = 0; this.musicBase = info.gain ?? .17;
    this.musicSource.connect(this.musicNode); this.musicNode.connect(this.master); this.musicId = info.url;
    this.musicSource.start(); this.duckMusic(this.state === 'playing');
  }
  stopMusic() {
    ++this.musicRequest;
    if (this.musicSource) { try { this.musicSource.stop(); } catch {} this.musicSource.disconnect(); }
    if (this.musicNode) this.musicNode.disconnect();
    this.musicSource = null; this.musicNode = null; this.musicId = null;
  }
  duckMusic(speaking, paused = false) {
    if (!this.musicNode || !this.ctx) return;
    const value = this.musicEnabled && !paused ? (this.musicBase || .17) * (speaking ? .22 : .65) : 0;
    this.musicNode.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicNode.gain.setTargetAtTime(value, this.ctx.currentTime, speaking ? .07 : .25);
  }
  setVolume(value) { this.volume = Number(value); if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, .03); }
  setMusicEnabled(enabled) { this.musicEnabled = enabled; this.duckMusic(this.state === 'playing', this.state === 'paused'); }
  setSfxEnabled(enabled) { this.sfxEnabled = enabled; if (!enabled) { for (const pool of [this.effects,this.turnEffects]) { for (const node of pool) { try { node.stop(); } catch {} } pool.clear(); } } }
}
window.StoryAudio = StoryAudio;
