(() => {
'use strict';

const BASE = '/assets/voice';
const EVENT_FOLDERS = {
  inicio: 'inicio',
  partida: 'partida',
  reclamo: 'reclamos',
  premio: 'premios',
  comentario: 'comentarios',
  cierre: 'cierre',
  demo: 'demo'
};

function eventPath(key) {
  const value = String(key || '').trim();
  const prefix = value.split('_')[0];
  const folder = EVENT_FOLDERS[prefix];
  return folder ? `${BASE}/${folder}/${value}.mp3` : '';
}

function numberPath(number) {
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1 || n > 90) return '';
  return `${BASE}/numeros/numero_${String(n).padStart(2, '0')}.mp3`;
}

function bingoLetter(number) {
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1 || n > 75) return '';
  return 'BINGO'[Math.min(4, Math.floor((n - 1) / 15))];
}

function letterPath(letter) {
  const value = String(letter || '').trim().toLowerCase();
  return /^[bingo]$/.test(value) ? `${BASE}/letras/letra_${value}.mp3` : '';
}

function prizeEvent(type, { mode = 90, prizeNumber = 1, confirmed = true } = {}) {
  const raw = String(type || '');
  let base = '';
  if (raw === 'ambo' || raw === 'ambocabeza') base = 'ambo';
  else if (raw === 'bingo') base = 'bingo';
  else if (raw === 'doubleLine') base = 'doble_linea';
  else if (raw === 'tripleLine') base = 'triple_linea';
  else if (raw === 'corners') base = 'esquinas';
  else if (raw === 'secondLine' || (raw === 'line' && Number(mode) === 90 && Number(prizeNumber) === 2)) base = 'segunda_linea';
  else if (raw === 'line') base = 'linea';
  if (!base) return '';
  const feminine = ['linea', 'segunda_linea', 'doble_linea', 'triple_linea'].includes(base);
  const suffix = confirmed ? (feminine ? 'confirmada' : 'confirmado') : (feminine ? 'cantada' : 'cantado');
  return `premio_${base}_${suffix}`;
}

class VoicePlayer {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.volume = Math.max(0, Math.min(1, Number(options.volume ?? 1)));
    this.gapMs = Math.max(0, Number(options.gapMs ?? 130));
    this.queue = [];
    this.running = false;
    this.currentSource = null;
    this.currentAudio = null;
    this.currentResolve = null;
    this.cancelToken = 0;
    this.ctx = null;
    this.cache = new Map();
    this.unlocked = false;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.enabled) this.stop(true);
    return this.enabled;
  }

  isUnlocked() {
    return Boolean(this.unlocked || this.ctx?.state === 'running');
  }

  _context() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try { this.ctx = new Ctx(); } catch { this.ctx = null; }
    return this.ctx;
  }

  async unlock() {
    if (!this.enabled) return false;
    const ctx = this._context();
    if (!ctx) {
      this.unlocked = true;
      return true;
    }
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      this.unlocked = ctx.state === 'running';
      return this.unlocked;
    } catch {
      return false;
    }
  }

  stop(clearQueue = true) {
    this.cancelToken += 1;
    if (clearQueue) this.queue.length = 0;
    try { this.currentSource?.stop?.(); } catch {}
    try {
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      }
    } catch {}
    this.currentSource = null;
    this.currentAudio = null;
    const resolve = this.currentResolve;
    this.currentResolve = null;
    try { resolve?.(); } catch {}
  }

  playFiles(paths, options = {}) {
    if (!this.enabled) return false;
    const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
    if (!list.length) return false;
    if (options.priority) this.stop(true);
    this.queue.push({ paths: list, gapMs: Math.max(0, Number(options.gapMs ?? this.gapMs)) });
    this._pump();
    return true;
  }

  playEvent(key, options = {}) {
    return this.playFiles(eventPath(key), options);
  }

  playSequence(keys, options = {}) {
    return this.playFiles((keys || []).map(eventPath).filter(Boolean), options);
  }

  playBall(number, mode = 90, options = {}) {
    const nPath = numberPath(number);
    if (!nPath) return false;
    if (Number(mode) === 75) {
      const lPath = letterPath(bingoLetter(number));
      return this.playFiles([lPath, nPath], { ...options, gapMs: options.gapMs ?? 120 });
    }
    return this.playFiles(nPath, options);
  }

  playPrize(type, options = {}) {
    const key = prizeEvent(type, options);
    return key ? this.playEvent(key, options) : false;
  }

  playClaim(type, options = {}) {
    const prize = prizeEvent(type, { ...options, confirmed: false });
    const keys = [prize, 'reclamo_verificando'].filter(Boolean);
    return this.playSequence(keys, { ...options, priority: options.priority !== false });
  }

  playConfirmed(type, options = {}) {
    const prize = prizeEvent(type, { ...options, confirmed: true });
    const keys = [prize, 'reclamo_valido'].filter(Boolean);
    return this.playSequence(keys, { ...options, priority: options.priority !== false });
  }

  playFinal(options = {}) {
    return this.playSequence(['partida_finalizada', 'cierre_felicitaciones', 'cierre_final'], { ...options, priority: options.priority !== false, gapMs: options.gapMs ?? 180 });
  }

  preloadBall(number, mode = 90) {
    const paths = [numberPath(number)];
    if (Number(mode) === 75) paths.unshift(letterPath(bingoLetter(number)));
    return Promise.all(paths.filter(Boolean).map(path => this._loadBuffer(path).catch(() => null)));
  }

  async _pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.enabled && this.queue.length) {
        const item = this.queue.shift();
        const token = this.cancelToken;
        for (let i = 0; i < item.paths.length && this.enabled && token === this.cancelToken; i++) {
          await this._playPath(item.paths[i], token);
          if (token !== this.cancelToken) break;
          if (i < item.paths.length - 1 && item.gapMs) await new Promise(resolve => setTimeout(resolve, item.gapMs));
        }
      }
    } finally {
      this.running = false;
      if (this.enabled && this.queue.length) this._pump();
    }
  }

  async _loadBuffer(path) {
    const ctx = this._context();
    if (!ctx) return null;
    if (!this.cache.has(path)) {
      this.cache.set(path, (async () => {
        const response = await fetch(path, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`Audio ${response.status}: ${path}`);
        const data = await response.arrayBuffer();
        return ctx.decodeAudioData(data.slice(0));
      })());
    }
    return this.cache.get(path);
  }

  async _playPath(path, token = this.cancelToken) {
    if (!this.enabled || !path || token !== this.cancelToken) return false;
    const ctx = this._context();
    if (ctx) {
      try {
        if (ctx.state === 'suspended') await ctx.resume();
        if (ctx.state !== 'running') {
          window.dispatchEvent(new CustomEvent('bingo-voice-blocked'));
          return false;
        }
        this.unlocked = true;
        const buffer = await this._loadBuffer(path);
        if (!buffer || !this.enabled || token !== this.cancelToken) return false;
        await new Promise(resolve => {
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          source.buffer = buffer;
          gain.gain.value = this.volume;
          source.connect(gain);
          gain.connect(ctx.destination);
          this.currentSource = source;
          this.currentResolve = resolve;
          source.onended = () => {
            if (this.currentSource === source) this.currentSource = null;
            if (this.currentResolve === resolve) this.currentResolve = null;
            resolve();
          };
          source.start(0);
        });
        return true;
      } catch (error) {
        console.warn('[BingoVoice] No se pudo reproducir', path, error);
        return false;
      }
    }

    try {
      await new Promise(resolve => {
        const audio = new Audio(path);
        this.currentAudio = audio;
        this.currentResolve = resolve;
        audio.volume = this.volume;
        audio.onended = audio.onerror = () => {
          if (this.currentAudio === audio) this.currentAudio = null;
          if (this.currentResolve === resolve) this.currentResolve = null;
          resolve();
        };
        const result = audio.play();
        if (result?.catch) result.catch(() => {
          window.dispatchEvent(new CustomEvent('bingo-voice-blocked'));
          resolve();
        });
      });
      this.unlocked = true;
      return true;
    } catch {
      return false;
    }
  }
}

window.BingoVoice = {
  create: options => new VoicePlayer(options),
  eventPath,
  numberPath,
  letterPath,
  bingoLetter,
  prizeEvent
};
})();
