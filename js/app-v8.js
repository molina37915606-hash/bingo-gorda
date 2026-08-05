(() => {
'use strict';

const APP_VERSION = 20;
const STORE_KEY = 'bingoGordaV8Games';
const CURRENT_KEY = 'bingoGordaV8Current';
const OLD_STORE_KEY = 'bingoGordaV5Games';
const VOICE_KEY = 'bingoGordaV8Voices';
const PHASE = Object.freeze({
  HOME: 'HOME', CONFIGURING: 'CONFIGURING', READY: 'READY', DRAWING: 'DRAWING',
  PAUSED: 'PAUSED', REVIEW: 'REVIEWING_WINNER', ROUND_END: 'ROUND_ENDED'
});
const PRIZE_ORDER = ['ambo', 'line', 'bingo'];
const PRIZE_LABEL = { ambo: 'AMBOCABEZA', line: 'LÍNEA', bingo: 'BINGO' };
const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const memoryStorage = new Map();
const storageGet = key => { try { return window.localStorage.getItem(key); } catch { return memoryStorage.has(key) ? memoryStorage.get(key) : null; } };
const storageSet = (key, value) => { try { window.localStorage.setItem(key, String(value)); } catch { memoryStorage.set(key, String(value)); } };

class GameStore {
  constructor() { this.migrateLegacyOnce(); }
  readAll() {
    try { return JSON.parse(storageGet(STORE_KEY) || '[]'); }
    catch { return []; }
  }
  writeAll(games) { storageSet(STORE_KEY, JSON.stringify(games)); }
  nextNumber() { return this.readAll().reduce((m, g) => Math.max(m, Number(g.number) || 0), 0) + 1; }
  save(game) {
    const normalized = GameStore.normalizeGame(game);
    normalized.updatedAt = new Date().toISOString();
    const games = this.readAll();
    const index = games.findIndex(item => item.id === normalized.id);
    if (index >= 0) games[index] = clone(normalized); else games.push(clone(normalized));
    this.writeAll(games);
    storageSet(CURRENT_KEY, normalized.id);
    return normalized;
  }
  load(id) {
    const found = this.readAll().find(game => game.id === id);
    return found ? GameStore.normalizeGame(clone(found)) : null;
  }
  remove(id) { this.writeAll(this.readAll().filter(game => game.id !== id)); }
  migrateLegacyOnce() {
    if (storageGet(STORE_KEY) !== null) return;
    try {
      const old = JSON.parse(storageGet(OLD_STORE_KEY) || '[]');
      if (Array.isArray(old) && old.length) this.writeAll(old.map(GameStore.normalizeGame));
    } catch { /* ignore corrupt legacy saves */ }
  }
  static normalizeGame(raw) {
    const mode = Number(raw?.mode) === 75 ? 75 : 90;
    const rules = {
      ambocabeza: mode === 90 && Boolean(raw?.rules?.ambocabeza ?? true),
      line: Boolean(raw?.rules?.line ?? true),
      bingo: Boolean(raw?.rules?.bingo ?? true)
    };
    const cards = Array.isArray(raw?.cards) ? raw.cards.map((card, index) => CardService.normalizeCard(card, mode, rules, index)) : [];
    const oldPrize = type => {
      const awarded = type === 'ambo' ? raw?.amboAwarded : type === 'line' ? raw?.lineAwarded : raw?.bingoAwarded;
      const winners = type === 'ambo' ? raw?.amboWinners : type === 'line' ? raw?.lineWinners : raw?.bingoWinners;
      return {
        status: awarded ? 'confirmed' : (type === 'ambo' && raw?.amboStatus === 'expired' ? 'expired' : 'active'),
        winners: Array.isArray(winners) ? winners.map(w => ({ ...w, cardId: w.cardId || w.id })) : [],
        rejectedKeys: []
      };
    };
    const prizes = raw?.prizes ? clone(raw.prizes) : { ambo: oldPrize('ambo'), line: oldPrize('line'), bingo: oldPrize('bingo') };
    for (const type of PRIZE_ORDER) {
      prizes[type] ||= { status: 'active', winners: [], rejectedKeys: [] };
      prizes[type].winners ||= [];
      prizes[type].rejectedKeys ||= [];
      if (prizes[type].status === 'pending') prizes[type].status = 'active';
    }
    if (!rules.ambocabeza) prizes.ambo.status = 'disabled';
    if (!rules.line) prizes.line.status = 'disabled';
    if (!rules.bingo) prizes.bingo.status = 'disabled';
    return {
      version: APP_VERSION,
      id: raw?.id || uid('game'), number: Number(raw?.number) || 1, mode, rules,
      drawMode: raw?.drawMode === 'manual' ? 'manual' : 'automatic',
      autoSeconds: Math.max(3, Number(raw?.autoSeconds) || 6),
      presenter: ['vero', 'vivi', 'josu', 'daia'].includes(raw?.presenter) ? raw.presenter : 'vero',
      theme: raw?.theme || storageGet('gorda-theme') || 'clasico',
      cards, drawn: Array.isArray(raw?.drawn) ? [...new Set(raw.drawn.map(Number).filter(n => n >= 1 && n <= mode))] : [],
      prizes, phase: PHASE.PAUSED, createdAt: raw?.createdAt || new Date().toISOString(), updatedAt: raw?.updatedAt || new Date().toISOString()
    };
  }
}

const CardService = {
  normalizeCard(raw, mode, rules, index = 0) {
    const grid = Array.isArray(raw?.grid) ? clone(raw.grid) : this.emptyGrid(mode);
    return {
      id: raw?.id || uid('card'), number: String(raw?.number ?? index + 1).padStart(3, '0'),
      name: String(raw?.name || raw?.playerName || `Jugador ${index + 1}`).trim() || `Jugador ${index + 1}`,
      mode, source: raw?.source || 'generated', grid,
      bets: {
        ambocabeza: mode === 90 && rules.ambocabeza && Boolean(raw?.bets?.ambocabeza ?? rules.ambocabeza),
        line: rules.line && Boolean(raw?.bets?.line ?? rules.line),
        bingo: rules.bingo && Boolean(raw?.bets?.bingo ?? rules.bingo)
      }
    };
  },
  emptyGrid(mode) {
    if (mode === 90) return Array.from({ length: 3 }, () => Array(9).fill(null));
    return Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => r === 2 && c === 2 ? 'LIBRE' : null));
  },
  sample(values, count) {
    const list = [...values];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list.slice(0, count).sort((a, b) => a - b);
  },
  generate90() {
    const ranges = [[1,9],[10,19],[20,29],[30,39],[40,49],[50,59],[60,69],[70,79],[80,90]];
    for (let attempt = 0; attempt < 4000; attempt++) {
      const grid = Array.from({ length: 3 }, () => Array(9).fill(null));
      const colCount = Array(9).fill(0);
      for (let row = 0; row < 3; row++) {
        this.sample([...Array(9).keys()], 5).forEach(col => { grid[row][col] = 0; colCount[col]++; });
      }
      if (!colCount.every(Boolean)) continue;
      for (let col = 0; col < 9; col++) {
        const rows = [0,1,2].filter(row => grid[row][col] === 0);
        const [lo, hi] = ranges[col];
        const nums = this.sample(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), rows.length);
        rows.forEach((row, i) => { grid[row][col] = nums[i]; });
      }
      return grid;
    }
    throw new Error('No se pudo generar un cartón de 90 bolas.');
  },
  generate75() {
    const starts = [1,16,31,46,61];
    const grid = Array.from({ length: 5 }, () => Array(5).fill(null));
    for (let col = 0; col < 5; col++) {
      const nums = this.sample(Array.from({ length: 15 }, (_, i) => starts[col] + i), 5);
      for (let row = 0; row < 5; row++) grid[row][col] = nums[row];
    }
    grid[2][2] = 'LIBRE';
    return grid;
  },
  generateMany(count, mode) {
    const result = [], seen = new Set();
    let guard = 0;
    while (result.length < count && guard++ < 20000) {
      const grid = mode === 90 ? this.generate90() : this.generate75();
      const key = JSON.stringify(grid);
      if (!seen.has(key)) { seen.add(key); result.push(grid); }
    }
    if (result.length !== count) throw new Error('No se pudieron generar todos los cartones.');
    return result;
  },
  numbers(card) { return card.grid.flat().filter(value => typeof value === 'number'); },
  validate(card) {
    const errors = [];
    if (!card || !Array.isArray(card.grid)) return { valid: false, errors: ['El cartón no tiene una cuadrícula válida.'] };
    if (!String(card.number ?? '').trim()) errors.push('Falta el número del cartón.');
    if (!card.bets?.ambocabeza && !card.bets?.line && !card.bets?.bingo) errors.push('Elegí al menos una modalidad para este cartón.');
    const values = this.numbers(card);
    if (new Set(values).size !== values.length) errors.push('Hay números repetidos.');
    if (card.mode === 90) {
      if (card.grid.length !== 3 || card.grid.some(row => !Array.isArray(row) || row.length !== 9)) errors.push('La cuadrícula debe ser de 3 × 9.');
      if (values.length !== 15) errors.push(`Debe tener 15 números; tiene ${values.length}.`);
      card.grid.forEach((row, i) => {
        if (row.filter(v => typeof v === 'number').length !== 5) errors.push(`La fila ${i + 1} debe tener 5 números.`);
      });
      card.grid.forEach(row => row.forEach((value, col) => {
        if (typeof value !== 'number') return;
        const ok = col === 0 ? value >= 1 && value <= 9 : col === 8 ? value >= 80 && value <= 90 : value >= col * 10 && value <= col * 10 + 9;
        if (!ok) errors.push(`El ${value} está en una columna incorrecta.`);
      }));
      for (let col = 0; col < 9; col++) {
        const column = card.grid.map(row => row[col]).filter(v => typeof v === 'number');
        if (column.some((v, i) => i > 0 && v <= column[i - 1])) errors.push(`La columna ${col + 1} debe estar ordenada de arriba hacia abajo.`);
      }
    } else {
      if (card.grid.length !== 5 || card.grid.some(row => !Array.isArray(row) || row.length !== 5)) errors.push('La cuadrícula debe ser de 5 × 5.');
      if (values.length !== 24) errors.push(`Debe tener 24 números; tiene ${values.length}.`);
      if (card.grid?.[2]?.[2] !== 'LIBRE') errors.push('La casilla central debe ser LIBRE.');
      const ranges = [[1,15],[16,30],[31,45],[46,60],[61,75]];
      card.grid.forEach(row => row.forEach((value, col) => {
        if (value === null || value === 'LIBRE') return;
        if (value < ranges[col][0] || value > ranges[col][1]) errors.push(`El ${value} no corresponde a la columna ${'BINGO'[col]}.`);
      }));
    }
    return { valid: errors.length === 0, errors: [...new Set(errors)] };
  },
  betLabels(card) {
    return [card.bets?.ambocabeza && 'AmboCabeza', card.bets?.line && 'Línea', card.bets?.bingo && 'Bingo'].filter(Boolean).join(' · ');
  }
};

const PrizeEngine = {
  numberSet(game) { return new Set(game.drawn); },
  lines(card) {
    if (card.mode === 90) return card.grid.map((row, rowIndex) => ({ key: `row-${rowIndex}`, label: `Fila ${rowIndex + 1}`, values: row.filter(v => typeof v === 'number') }));
    const lines = [];
    for (let row = 0; row < 5; row++) lines.push({ key: `row-${row}`, label: `Fila ${row + 1}`, values: card.grid[row].filter(v => v !== 'LIBRE') });
    for (let col = 0; col < 5; col++) lines.push({ key: `col-${col}`, label: `Columna ${'BINGO'[col]}`, values: card.grid.map(row => row[col]).filter(v => v !== 'LIBRE') });
    lines.push({ key: 'diag-1', label: 'Diagonal principal', values: card.grid.map((row, i) => row[i]).filter(v => v !== 'LIBRE') });
    lines.push({ key: 'diag-2', label: 'Diagonal secundaria', values: card.grid.map((row, i) => row[4 - i]).filter(v => v !== 'LIBRE') });
    return lines;
  },
  markedCount(card, set) { return CardService.numbers(card).filter(n => set.has(n)).length; },
  lineMissing(card, set) { return Math.min(...this.lines(card).map(line => line.values.filter(n => !set.has(n)).length)); },
  bingoMissing(card, set) { return CardService.numbers(card).filter(n => !set.has(n)).length; },
  amboDetails(card, set) {
    if (card.mode !== 90) return [];
    return card.grid.map((row, rowIndex) => {
      const values = row.filter(v => typeof v === 'number');
      if (values.length !== 5) return null;
      const middleClean = values.slice(1, -1).every(n => !set.has(n));
      return set.has(values[0]) && set.has(values.at(-1)) && middleClean
        ? { key: `${card.id}:row-${rowIndex}`, label: `Fila ${rowIndex + 1}`, rowIndex, first: values[0], last: values.at(-1), values: [values[0], values.at(-1)] }
        : null;
    }).filter(Boolean);
  },
  lineDetails(card, set) {
    return this.lines(card).filter(line => line.values.every(n => set.has(n))).map(line => ({ ...line, key: `${card.id}:${line.key}` }));
  },
  candidateGroups(game) {
    const set = this.numberSet(game), groups = [];
    const defs = {
      ambo: card => this.amboDetails(card, set),
      line: card => this.lineDetails(card, set),
      bingo: card => CardService.numbers(card).every(n => set.has(n)) ? [{ key: `${card.id}:bingo`, label: 'Cartón completo', values: CardService.numbers(card) }] : []
    };
    for (const type of PRIZE_ORDER) {
      const prize = game.prizes[type];
      if (!prize || !['active', 'pending'].includes(prize.status)) continue;
      const betName = type === 'ambo' ? 'ambocabeza' : type;
      const candidates = [];
      for (const card of game.cards) {
        if (!card.bets?.[betName]) continue;
        const details = defs[type](card).filter(detail => !prize.rejectedKeys.includes(detail.key));
        if (details.length) candidates.push({ card, details });
      }
      if (candidates.length) groups.push({ type, candidates, ball: game.drawn.at(-1) });
    }
    return groups;
  },
  hasLiveAmbo(game) {
    if (!game.rules.ambocabeza || game.mode !== 90 || game.prizes.ambo.status === 'confirmed') return false;
    const set = this.numberSet(game), rejected = new Set(game.prizes.ambo.rejectedKeys || []);
    return game.cards.some(card => card.bets.ambocabeza && card.grid.some((row, rowIndex) => {
      const values = row.filter(v => typeof v === 'number');
      if (values.length !== 5 || rejected.has(`${card.id}:row-${rowIndex}`)) return false;
      return values.slice(1, -1).every(n => !set.has(n));
    }));
  },
  refreshAmbo(game) {
    const prize = game.prizes.ambo;
    if (!game.rules.ambocabeza || game.mode !== 90) { prize.status = 'disabled'; return; }
    if (prize.status === 'confirmed' || prize.status === 'pending') return;
    prize.status = this.hasLiveAmbo(game) ? 'active' : 'expired';
  }
};

class VoiceService {
  constructor(app) {
    this.app = app; this.voices = []; this.map = this.loadMap();
    this.audioCtx = null; this.musicTimer = null; this.musicStep = 0;
    this.profiles = window.BingoPresenterScripts?.profiles || {};
    this.phrases = new (window.BingoPresenterScripts?.PhraseEngine || class { ball(id,n){ return `Número ${n}`; } event(){ return ''; } reset(){} })();  }
  loadMap() { try { return JSON.parse(storageGet(VOICE_KEY) || '{}'); } catch { return {}; } }
  saveMap() { storageSet(VOICE_KEY, JSON.stringify(this.map)); }
  key(voice) { return `${voice.name}|||${voice.lang}`; }
  byKey(key) { return this.voices.find(v => this.key(v) === key) || null; }
  spanish(v) { return /^es([-_]|$)/i.test(v.lang) || /spanish|español|espanol/i.test(v.name); }
  female(v) { return /female|femen|mujer|sofia|paulina|paloma|ximena|helena|laura|lucia|carmen|maria|camila|gabriela|isabela|valentina|sabina|elvira|dalia|monica/i.test(v.name); }
  male(v) { return /male|mascul|hombre|jorge|diego|pablo|carlos|raul|andres|juan|pedro|antonio|luis|miguel/i.test(v.name); }
  refresh(force = false) {
    this.voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    const spanish = this.voices.filter(v => this.spanish(v));
    const female = spanish.find(v => this.female(v)) || spanish.find(v => !this.male(v)) || spanish[0] || this.voices[0];
    const male = spanish.find(v => this.male(v)) || spanish.find(v => !this.female(v)) || spanish[1] || this.voices[0];
    for (const id of ['vero','vivi','daia']) if (force || !this.byKey(this.map[id])) this.map[id] = female ? this.key(female) : '';
    if (force || !this.byKey(this.map.josu)) this.map.josu = male ? this.key(male) : '';
    this.saveMap(); this.renderControls();
  }
  voiceFor(id) { return this.byKey(this.map[id] || (id === 'josu' ? this.map.josu : this.map.vero)); }
  renderControls() {
    const ids = ['vero','vivi','josu','daia'];
    ids.forEach(id => {
      const select = $(`voiceSelect${id[0].toUpperCase()}${id.slice(1)}`);
      if (!select) return;
      const selected = this.map[id] || '';
      select.innerHTML = '';
      if (!this.voices.length) { const option = new Option('Sin voces disponibles', ''); select.add(option); return; }
      this.voices.forEach(v => select.add(new Option(`${v.name} — ${v.lang}`, this.key(v), false, this.key(v) === selected)));
    });
    const spanish = this.voices.filter(v => this.spanish(v));
    if ($('voiceStatus')) $('voiceStatus').textContent = this.voices.length ? `${this.voices.length} voces detectadas; ${spanish.length} en español. Cada presentador puede usar una voz distinta.` : 'El navegador todavía no informó voces.';
  }
  setVoice(id, key) {
    this.map[id] = key;
    this.saveMap(); this.renderControls();
  }
  speak(text, id = this.app.game?.presenter || this.app.wizard.presenter || 'vero', priority = false) {
    if (!$('voiceOn')?.checked || !window.speechSynthesis || !text) return;
    const profile = this.profiles[id] || this.profiles.vero || { rate: 1, pitch: 1 };
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = this.voiceFor(id);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = 'es-AR';
    utterance.rate = profile.rate; utterance.pitch = profile.pitch; utterance.volume = Number($('voiceVol')?.value || 1);
    if (priority) window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
  speakBall(n) {
    const id = this.app.game?.presenter || 'vero';
    const text = this.phrases.ball(id, n, this.app.game?.drawn?.length || 0, this.app.game?.mode || 90);
    this.speak(text, id, false);
  }
  event(name, replacements = {}, priority = true) {
    const id = this.app.game?.presenter || this.app.wizard.presenter || 'vero';
    this.speak(this.phrases.event(id, name, replacements), id, priority);
  }
  preview(id) { this.speak((this.profiles[id] || this.profiles.vero).preview, id, true); }
  audio() {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
  }
  tone(freq, duration = .12, type = 'sine', volume = 1, delay = 0) {
    if (!$('fxOn')?.checked) return;
    try {
      this.audio(); const osc = this.audioCtx.createOscillator(), gain = this.audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(Math.max(.001, Number($('fxVol')?.value || .18) * volume), this.audioCtx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(.001, this.audioCtx.currentTime + delay + duration);
      osc.connect(gain).connect(this.audioCtx.destination); osc.start(this.audioCtx.currentTime + delay); osc.stop(this.audioCtx.currentTime + delay + duration);
    } catch { /* audio is optional */ }
  }
  startMusic() {
    if (this.musicTimer) return;
    try { this.audio(); } catch { return; }
    const notes = [196,247,294,330,294,247,220,247];
    this.musicTimer = setInterval(() => {
      if (!$('musicOn')?.checked) return;
      const osc = this.audioCtx.createOscillator(), gain = this.audioCtx.createGain();
      osc.type = 'triangle'; osc.frequency.value = notes[this.musicStep++ % notes.length];
      gain.gain.setValueAtTime(Number($('musicVol')?.value || .04), this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, this.audioCtx.currentTime + .4);
      osc.connect(gain).connect(this.audioCtx.destination); osc.start(); osc.stop(this.audioCtx.currentTime + .4);
    }, 500);
  }
  stopMusic() { clearInterval(this.musicTimer); this.musicTimer = null; }
}

class PdfImporter {
  constructor(app) { this.app = app; this.loadingPromise = null; }
  async loadLibrary() {
    if (window.pdfjsLib) return window.pdfjsLib;
    if (this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error('No se pudo cargar el lector PDF. Revisá la conexión a internet.'));
      document.head.appendChild(script);
    });
    return this.loadingPromise;
  }
  numericItems(items) {
    const result = [];
    items.forEach(item => {
      const text = String(item.str ?? item.text ?? '').trim();
      const matches = [...text.matchAll(/(?:^|\s)(90|[1-8]?\d)(?=\s|$)/g)].map(m => Number(m[1])).filter(n => n >= 1 && n <= 90);
      if (!matches.length) return;
      const baseX = Number(item.transform?.[4] ?? item.x ?? 0), y = Number(item.transform?.[5] ?? item.y ?? 0);
      const width = Number(item.width || 0);
      matches.forEach((n, i) => result.push({ n, x: baseX + (matches.length > 1 ? width * (i + .5) / matches.length : 0), y }));
    });
    return result;
  }
  clusterRows(items, tolerance = 5) {
    const rows = [];
    [...items].sort((a, b) => b.y - a.y).forEach(item => {
      let row = rows.find(r => Math.abs(r.y - item.y) <= tolerance);
      if (!row) { row = { y: item.y, items: [] }; rows.push(row); }
      row.items.push(item); row.y = row.items.reduce((sum, value) => sum + value.y, 0) / row.items.length;
    });
    return rows.sort((a, b) => b.y - a.y);
  }
  parsePage(items, pageNumber, pageWidth) {
    const rows = this.clusterRows(this.numericItems(items), 5).filter(row => row.items.length >= 8 && row.items.length <= 12);
    const cards = [];
    for (let start = 0; start + 2 < rows.length; start += 3) {
      const group = rows.slice(start, start + 3);
      for (const side of ['left', 'right']) {
        const grid = Array.from({ length: 3 }, () => Array(9).fill(null));
        let count = 0, collision = false;
        group.forEach((row, rowIndex) => {
          row.items.filter(item => side === 'left' ? item.x < pageWidth / 2 : item.x >= pageWidth / 2)
            .sort((a, b) => a.x - b.x).forEach(item => {
              const col = item.n === 90 ? 8 : Math.floor(item.n / 10);
              if (grid[rowIndex][col] !== null) collision = true;
              else { grid[rowIndex][col] = item.n; count++; }
            });
        });
        if (count >= 12) {
          const card = { id: uid('pdf'), number: 'TEMP', name: 'Jugador', mode: 90, source: 'pdf', grid, bets: { ambocabeza: true, line: true, bingo: true } };
          cards.push({ card, page: pageNumber, valid: CardService.validate(card).valid && !collision, detectedCount: count, side });
        }
      }
    }
    return cards;
  }
  async import(file) {
    if (this.app.wizard.mode !== 90) throw new Error('La importación de bingo.es está preparada para cartones de 90 bolas.');
    const lib = await this.loadLibrary(), data = new Uint8Array(await file.arrayBuffer());
    const doc = await lib.getDocument({ data }).promise, detected = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber), viewport = page.getViewport({ scale: 1 }), text = await page.getTextContent();
      detected.push(...this.parsePage(text.items, pageNumber, viewport.width));
    }
    return detected.map((entry, index) => {
      const card = CardService.normalizeCard({ ...entry.card, number: String(index + 1).padStart(3, '0'), name: `Jugador ${index + 1}` }, 90, this.app.wizard.rules, index);
      return { ...card, page: entry.page, selected: false, reviewed: entry.valid, valid: entry.valid };
    });
  }
}

class BingoApp {
  constructor() {
    this.store = new GameStore();
    this.game = null; this.phase = PHASE.HOME; this.autoRunning = false; this.autoTimer = null;
    this.reviewQueue = []; this.activeReview = null; this.largeIndex = 0; this.zoom = 1;
    this.cardsPage = 0; this.cardsPerPage = 8; this.editCardId = null; this.pdfReviewIndex = -1;
    this.wizard = this.freshWizard();
    this.voice = new VoiceService(this); this.pdf = new PdfImporter(this);
  }
  freshWizard() {
    return { step: 1, mode: 90, rules: { ambocabeza: true, line: true, bingo: true }, drawMode: 'automatic', autoSeconds: 10, presenter: null, source: 'generated', names: [], manualCards: [], pdfCards: [], previewCards: [], previewPage: 0, previewPerPage: 8 };
  }
  init() {
    this.populateQuantities(); this.bindEvents(); this.renderGames(); this.renderThemes();
    this.voice.refresh(false);
    if (window.speechSynthesis) { window.speechSynthesis.onvoiceschanged = () => this.voice.refresh(false); setTimeout(() => this.voice.refresh(false), 300); }
    this.showScreen('home');
    window.__BINGO_V8__ = this;
    window.__BINGO_V8_TEST__ = {
      createGame: options => this.createTestGame(options),
      forceDraw: number => this.processSpecificBall(number, 'test'),
      getState: () => clone({ game: this.game, phase: this.phase, autoRunning: this.autoRunning, queue: this.reviewQueue, active: this.activeReview }),
      parsePdfPage: (items, width = 1000) => this.pdf.parsePage(items, 1, width)
    };
  }
  showScreen(id) { document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active')); $(id)?.classList.add('active'); }
  setPhase(phase) { this.phase = phase; if ($('game')) $('game').dataset.phase = phase; }
  save() { if (this.game) this.game = this.store.save(this.game); this.renderGames(); }
  loadGame(id) {
    this.stopAutomatic(false); const game = this.store.load(id);
    if (!game || !game.cards.length) { alert('No se pudo cargar la partida porque no tiene cartones válidos.'); return; }
    this.game = game; this.game.phase = PHASE.PAUSED; this.setPhase(this.game.drawn.length ? PHASE.PAUSED : PHASE.READY);
    this.reviewQueue = []; this.activeReview = null; $('gamesModal').classList.remove('show'); this.applyTheme(game.theme); this.showScreen('game'); this.renderGame();
  }
  exitGame() { this.stopAutomatic(false); this.save(); this.game = null; this.setPhase(PHASE.HOME); this.showScreen('home'); }
  createTestGame(options = {}) {
    const mode = options.mode === 75 ? 75 : 90, rules = options.rules || { ambocabeza: mode === 90, line: true, bingo: true };
    const cards = (options.cards || CardService.generateMany(2, mode).map((grid, i) => ({ grid, number: i + 1, name: `Jugador ${i + 1}` }))).map((card, i) => CardService.normalizeCard(card, mode, rules, i));
    this.game = GameStore.normalizeGame({ id: uid('test'), number: this.store.nextNumber(), mode, rules, drawMode: options.drawMode || 'manual', autoSeconds: 4, presenter: 'vero', cards, drawn: options.drawn || [] });
    this.setPhase(PHASE.READY); this.showScreen('game'); this.renderGame(); return this.game;
  }

  /* Wizard */
  populateQuantities() { $('qty').innerHTML = Array.from({ length: 250 }, (_, i) => `<option value="${i + 1}" ${i + 1 === 8 ? 'selected' : ''}>${i + 1}</option>`).join(''); }
  openWizard() {
    this.wizard = this.freshWizard(); $('pdfFile').value = ''; $('pdfStatus').textContent = 'Todavía no se cargó ningún PDF.'; $('gameModeError').textContent = '';
    document.querySelectorAll('.presenterCard').forEach(card => card.classList.remove('selected', 'dimmed'));
    document.querySelectorAll('.modeChoice button').forEach(button => button.classList.toggle('active', Number(button.dataset.mode) === 90));
    $('globalAmbo').checked = $('globalLine').checked = $('globalBingo').checked = true; $('globalAmbo').disabled = false;
    document.querySelector('input[name="drawMode"][value="automatic"]').checked = true; $('autoSeconds').value = '10'; $('qty').value = '8';
    this.setWizardSource('generated'); this.setWizardStep(1); this.setPhase(PHASE.CONFIGURING); this.showScreen('wizard');
  }
  setWizardStep(step) {
    this.wizard.step = step; document.querySelectorAll('.step').forEach(el => el.classList.toggle('active', Number(el.dataset.step) === step));
    $('wizardBack').style.visibility = step === 1 ? 'hidden' : 'visible'; $('wizardNext').textContent = step === 4 ? 'CONFIGURAR SALA' : 'CONTINUAR';
    $('wizardNext').disabled = step === 2 && !this.wizard.presenter;
  }
  setWizardSource(source) {
    if (source === 'pdf' && this.wizard.mode !== 90) { alert('La importación de bingo.es está disponible para Bingo 90.'); source = 'generated'; }
    this.wizard.source = source;
    $('sourceGenerated').classList.toggle('active', source === 'generated'); $('sourceManual').classList.toggle('active', source === 'manual'); $('sourcePdf').classList.toggle('active', source === 'pdf');
    $('generatedSetup').style.display = source === 'generated' ? '' : 'none'; $('manualSetup').style.display = source === 'manual' ? '' : 'none'; $('pdfSetup').style.display = source === 'pdf' ? 'block' : 'none';
    if (source === 'manual' && !this.wizard.manualCards.length) this.addManualCard();
  }
  renderNames() { /* En 2.0 los cartones generados no se vinculan a nombres. */ }

  addManualCard(copyBets = null) {
    if (this.wizard.manualCards.length >= 250) { alert('El máximo es de 250 cartones.'); return; }
    const i = this.wizard.manualCards.length, rules = this.wizard.rules;
    this.wizard.manualCards.push(CardService.normalizeCard({ id: uid('manual'), number: String(i + 1).padStart(3, '0'), name: `Jugador ${i + 1}`, source: 'manual', grid: CardService.emptyGrid(this.wizard.mode), bets: copyBets || { ambocabeza: rules.ambocabeza, line: rules.line, bingo: rules.bingo } }, this.wizard.mode, rules, i));
    this.renderManualCards();
  }
  renderManualCards() {
    const host = $('manualCards'); host.innerHTML = '';
    this.wizard.manualCards.forEach((card, index) => {
      const box = document.createElement('article'); box.className = 'manualCard';
      box.innerHTML = `<div class="manualCardHead"><input class="manualNumber" value="${escapeHtml(card.number)}"><input class="manualName" value="${escapeHtml(card.name)}"><button type="button" class="secondary removeManual">ELIMINAR</button></div>
      <div class="manualBets"><label><input type="checkbox" data-bet="ambocabeza" ${card.bets.ambocabeza ? 'checked' : ''} ${this.wizard.mode === 75 || !this.wizard.rules.ambocabeza ? 'disabled' : ''}> AmboCabeza</label><label><input type="checkbox" data-bet="line" ${card.bets.line ? 'checked' : ''} ${!this.wizard.rules.line ? 'disabled' : ''}> Línea</label><label><input type="checkbox" data-bet="bingo" ${card.bets.bingo ? 'checked' : ''} ${!this.wizard.rules.bingo ? 'disabled' : ''}> Bingo</label><button type="button" class="secondary allBets">TODAS LAS ACTIVAS</button></div><div class="${this.wizard.mode === 90 ? 'manualGrid90' : 'manualGrid75'}"></div><div class="manualError"></div>`;
      box.querySelector('.manualNumber').oninput = e => { card.number = e.target.value; this.showManualValidation(box, card); };
      box.querySelector('.manualName').oninput = e => { card.name = e.target.value; };
      box.querySelector('.removeManual').onclick = () => { this.wizard.manualCards.splice(index, 1); this.renderManualCards(); };
      box.querySelector('.allBets').onclick = () => { card.bets = { ambocabeza: this.wizard.mode === 90 && this.wizard.rules.ambocabeza, line: this.wizard.rules.line, bingo: this.wizard.rules.bingo }; this.renderManualCards(); };
      box.querySelectorAll('[data-bet]').forEach(input => input.onchange = e => { card.bets[e.target.dataset.bet] = e.target.checked; this.showManualValidation(box, card); });
      const gridHost = box.querySelector(this.wizard.mode === 90 ? '.manualGrid90' : '.manualGrid75');
      card.grid.forEach((row, r) => row.forEach((value, c) => {
        const input = document.createElement('input'); input.className = 'manualCell'; input.inputMode = 'numeric'; input.maxLength = 2; input.placeholder = '—';
        if (value === 'LIBRE') { input.value = '★'; input.disabled = true; } else input.value = value ?? '';
        input.oninput = () => { input.value = input.value.replace(/\D/g, '').slice(0, 2); card.grid[r][c] = input.value ? Number(input.value) : null; this.showManualValidation(box, card); };
        gridHost.appendChild(input);
      }));
      host.appendChild(box); this.showManualValidation(box, card);
    });
  }
  showManualValidation(box, card) { const result = CardService.validate(card), el = box.querySelector('.manualError'); el.textContent = result.valid ? 'Cartón válido.' : result.errors.join('\n'); el.style.color = result.valid ? '#77e6a1' : '#ff9aa2'; }
  async importPdf(file) {
    $('pdfStatus').textContent = 'Analizando el PDF y respetando la posición de cada número…'; this.wizard.pdfCards = []; this.renderPdfCards();
    try {
      this.wizard.pdfCards = await this.pdf.import(file); const valid = this.wizard.pdfCards.filter(card => CardService.validate(card).valid).length;
      $('pdfStatus').textContent = `PDF analizado. ${this.wizard.pdfCards.length} cartones detectados: ${valid} válidos y ${this.wizard.pdfCards.length - valid} para revisar. Seleccioná solamente los que jugarán.`;
    } catch (error) { $('pdfStatus').textContent = `No se pudo importar el PDF.\n${error.message}\nPodés usar CARGA MANUAL.`; }
    this.renderPdfCards();
  }
  renderPdfCards() {
    const host = $('pdfCards'), search = ($('pdfSearch').value || '').trim().toLowerCase(); host.innerHTML = '';
    this.wizard.pdfCards.forEach((card, index) => {
      if (search && !String(card.number).toLowerCase().includes(search) && !String(card.name).toLowerCase().includes(search)) return;
      const valid = CardService.validate(card).valid, el = document.createElement('article');
      el.className = `pdfCard${card.selected ? ' selected' : ''}${valid ? '' : ' invalid'}`;
      el.innerHTML = `<div class="pdfCardHead"><span>Cartón ${escapeHtml(card.number)}</span><input class="pdfPick" type="checkbox" ${card.selected ? 'checked' : ''}></div>
        <div class="pdfMini">${card.grid.flat().map(v => `<span class="${v === null ? 'blank' : ''}">${v ?? ''}</span>`).join('')}</div>
        <label class="pdfPlayerName">Jugador <input class="pdfName" value="${escapeHtml(card.name)}" maxlength="40"></label>
        <small>Página ${card.page || '—'} · ${valid ? 'Válido' : 'Necesita revisión'}</small><div class="pdfCardActions"><button type="button" class="secondary pdfEdit">REVISAR / CORREGIR</button></div>`;
      el.querySelector('.pdfPick').onchange = e => { card.selected = e.target.checked; this.renderPdfCards(); };
      el.querySelector('.pdfName').oninput = e => { card.name = e.target.value; };
      el.querySelector('.pdfEdit').onclick = () => this.openPdfReview(index);
      host.appendChild(el);
    });
    $('pdfSelectedCount').textContent = `${this.wizard.pdfCards.filter(card => card.selected).length} seleccionados de ${this.wizard.pdfCards.length}`;
  }
  openPdfReview(index) {
    const card = this.wizard.pdfCards[index]; if (!card) return; this.pdfReviewIndex = index;
    $('pdfReviewNumber').value = card.number; $('pdfReviewName').value = card.name; $('pdfReviewPage').textContent = `Página ${card.page || '—'}`; $('pdfReviewGrid').innerHTML = '';
    card.grid.forEach((row, r) => row.forEach((value, c) => {
      const input = document.createElement('input'); input.inputMode = 'numeric'; input.maxLength = 2; input.value = value ?? ''; input.placeholder = '—'; input.dataset.r = r; input.dataset.c = c;
      input.oninput = () => { input.value = input.value.replace(/\D/g, '').slice(0, 2); this.validatePdfReview(); }; $('pdfReviewGrid').appendChild(input);
    }));
    $('pdfReviewModal').classList.add('show'); this.validatePdfReview();
  }
  collectPdfReview() {
    const old = this.wizard.pdfCards[this.pdfReviewIndex], grid = Array.from({ length: 3 }, () => Array(9).fill(null));
    $('pdfReviewGrid').querySelectorAll('input').forEach(input => { grid[Number(input.dataset.r)][Number(input.dataset.c)] = input.value === '' ? null : Number(input.value); });
    return { ...old, number: $('pdfReviewNumber').value.trim() || old.number, name: $('pdfReviewName').value.trim() || old.name, grid };
  }
  validatePdfReview() { const card = this.collectPdfReview(), result = CardService.validate(card); $('pdfReviewError').textContent = result.valid ? 'Cartón válido.' : result.errors.join(' · '); return result; }
  buildPreview() {
    if (this.wizard.source === 'generated') {
      const count = Number($('qty').value); this.wizard.previewCards = CardService.generateMany(count, this.wizard.mode).map((grid, i) => CardService.normalizeCard({ id: uid('preview'), number: String(i + 1).padStart(3, '0'), name: `Cartón ${String(i + 1).padStart(3, '0')}`, source: 'generated', grid, bets: this.wizard.rules }, this.wizard.mode, this.wizard.rules, i));
    } else if (this.wizard.source === 'manual') {
      const invalid = this.wizard.manualCards.find(card => !CardService.validate(card).valid); if (invalid) { alert(`Revisá el cartón ${invalid.number}:\n${CardService.validate(invalid).errors.join('\n')}`); return false; }
      this.wizard.previewCards = clone(this.wizard.manualCards);
    } else {
      const selected = this.wizard.pdfCards.filter(card => card.selected); if (!selected.length) { alert('Seleccioná al menos un cartón del PDF.'); return false; }
      if (selected.length > 250) { alert('El máximo es de 250 cartones por partida.'); return false; }
      const invalid = selected.find(card => !CardService.validate(card).valid); if (invalid) { alert(`El cartón ${invalid.number} necesita revisión.`); return false; }
      this.wizard.previewCards = selected.map((card, i) => ({ ...clone(card), name: card.name.trim() || `Cartón ${String(i + 1).padStart(3, '0')}` }));
    }
    if (!this.wizard.previewCards.length) { alert('No hay cartones para iniciar la partida.'); return false; }
    this.wizard.previewPage = 0; this.renderPreview(); return true;
  }
  renderPreview() {
    const host = $('previewGrid'); host.innerHTML = ''; const cards = this.wizard.previewCards, per = this.wizard.previewPerPage;
    const pages = Math.max(1, Math.ceil(cards.length / per)); this.wizard.previewPage = Math.max(0, Math.min(this.wizard.previewPage, pages - 1));
    const start = this.wizard.previewPage * per, end = Math.min(start + per, cards.length); cards.slice(start, end).forEach(card => host.appendChild(this.makeTicket(card, false, false, new Set())));
    $('previewPageInfo').textContent = `Página ${this.wizard.previewPage + 1} de ${pages} · Cartones ${cards.length ? start + 1 : 0}–${end}`; $('previewPrev').disabled = this.wizard.previewPage === 0; $('previewNext').disabled = this.wizard.previewPage === pages - 1;
    $('previewTabs').innerHTML = ''; for (let p = 0; p < pages; p++) { const button = document.createElement('button'); button.textContent = `${p * per + 1}–${Math.min((p + 1) * per, cards.length)}`; button.classList.toggle('active', p === this.wizard.previewPage); button.onclick = () => { this.wizard.previewPage = p; this.renderPreview(); }; $('previewTabs').appendChild(button); }
  }
  startCreatedGame() {
    if (!this.wizard.previewCards.length) { alert('No hay cartones preparados. Volvé al paso anterior.'); return; }
    const cards = this.wizard.previewCards.map((card, i) => CardService.normalizeCard({ ...clone(card), id: uid('card') }, this.wizard.mode, this.wizard.rules, i));
    const invalid = cards.find(card => !CardService.validate(card).valid); if (invalid) { alert(`No se puede iniciar: el cartón ${invalid.number} no es válido.`); return; }
    this.game = GameStore.normalizeGame({ id: uid('game'), number: this.store.nextNumber(), mode: this.wizard.mode, rules: this.wizard.rules, drawMode: this.wizard.drawMode, autoSeconds: this.wizard.autoSeconds, presenter: this.wizard.presenter, theme: storageGet('gorda-theme') || 'clasico', cards, drawn: [] });
    this.setPhase(PHASE.READY); this.save(); this.showScreen('game'); this.applyTheme(this.game.theme); this.renderGame(); setTimeout(() => this.localRoom?.openMainModal(), 250);
  }

  /* Drawing and prize state machine */
  requestDraw(source = 'manual') {
    if (!this.game || !this.game.cards.length) { alert('No hay cartones activos.'); return false; }
    if (this.phase === PHASE.REVIEW || this.activeReview || this.localRoom?.claimOpen) return false;
    if (this.game.drawn.length >= this.game.mode) { this.stopAutomatic(); this.setPhase(PHASE.ROUND_END); this.renderGame(); return false; }
    clearTimeout(this.autoTimer); this.autoTimer = null;
    const remaining = Array.from({ length: this.game.mode }, (_, i) => i + 1).filter(n => !this.game.drawn.includes(n));
    const number = remaining[Math.floor(Math.random() * remaining.length)]; return this.processSpecificBall(number, source);
  }
  processSpecificBall(number, source = 'manual') {
    if (!this.game || this.phase === PHASE.REVIEW || this.activeReview) return false;
    number = Number(number); if (number < 1 || number > this.game.mode || this.game.drawn.includes(number)) return false;
    clearTimeout(this.autoTimer); this.autoTimer = null; this.setPhase(this.autoRunning ? PHASE.DRAWING : PHASE.PAUSED);
    this.game.drawn.push(number); this.voice.tone(530, .1, 'square', .8); this.voice.tone(760, .18, 'sine', .7, .1);
    this.animateLastBall();
    const candidateGame = this.localRoom?.active && this.localRoom.participatingGame ? this.localRoom.participatingGame() : this.game;
    let groups = PrizeEngine.candidateGroups(candidateGame);
    if (this.localRoom?.active) groups = groups.filter(group => group.type === 'ambo');
    if (groups.length) {
      this.stopAutomatic(false); this.reviewQueue = groups; this.setPhase(PHASE.REVIEW);
      groups.forEach(group => { this.game.prizes[group.type].status = 'pending'; });
      this.save(); this.renderGame(); setTimeout(() => this.showNextReview(), 0);
    } else {
      PrizeEngine.refreshAmbo(this.game); this.save(); this.renderGame();
      if (this.autoRunning) this.scheduleAutomatic();
    }
    setTimeout(() => this.voice.speakBall(number), 300); return true;
  }
  animateLastBall() { const ball = $('lastBall'); ball.classList.remove('spin'); void ball.offsetWidth; ball.classList.add('spin'); }
  startAutomatic() {
    if (!this.game || this.game.drawMode !== 'automatic' || this.phase === PHASE.REVIEW || this.activeReview) return;
    this.autoRunning = true; this.setPhase(PHASE.DRAWING); this.renderAutoControls(); this.requestDraw('automatic');
  }
  scheduleAutomatic() {
    clearTimeout(this.autoTimer); if (!this.autoRunning || !this.game || this.phase === PHASE.REVIEW) return;
    this.autoTimer = setTimeout(() => { if (this.autoRunning && this.phase !== PHASE.REVIEW) this.requestDraw('automatic'); }, Math.max(3, Number(this.game.autoSeconds) || 6) * 1000);
  }
  stopAutomatic(render = true) { this.autoRunning = false; clearTimeout(this.autoTimer); this.autoTimer = null; if (this.phase !== PHASE.REVIEW && this.game) this.setPhase(this.game.drawn.length ? PHASE.PAUSED : PHASE.READY); if (render) this.renderAutoControls(); }
  toggleAutomatic() { this.autoRunning ? this.stopAutomatic() : this.startAutomatic(); }
  showNextReview() {
    if (this.activeReview || !this.reviewQueue.length) { if (!this.activeReview) this.finishReviewCycle(); return; }
    this.activeReview = { ...this.reviewQueue.shift(), pending: true }; const type = this.activeReview.type;
    this.game.prizes[type].status = 'pending'; this.renderWinnerOverlay(true); this.renderPrizeButtons();
  }
  renderWinnerOverlay(pending) {
    const review = this.activeReview; if (!review) return;
    const type = review.type, label = PRIZE_LABEL[type];
    document.querySelectorAll('.big').forEach(button => button.classList.remove('pendingPrize')); $(type === 'ambo' ? 'amboBtn' : `${type}Btn`)?.classList.add('pendingPrize');
    $('winnerBox').className = `winnerBox ${type === 'line' ? 'lineWinner' : type === 'bingo' ? 'bingoWinner' : ''}`;
    $('winnerKicker').textContent = pending ? '¡POSIBLE GANADOR!' : '¡GANADOR CONFIRMADO!'; $('winnerMain').textContent = label;
    $('winnerNames').innerHTML = review.candidates.map(({ card, details }) => `${escapeHtml(card.name)}<br><small>Cartón N.º ${escapeHtml(card.number)} · ${escapeHtml(details.map(d => type === 'ambo' ? `${d.label}: ${d.first} y ${d.last}` : d.label).join(' · '))}${pending ? ' · Revisá el cartón físico' : ' · Premio confirmado'}</small>`).join('<hr style="border-color:#ffffff33">');
    $('continueGame').textContent = pending ? '✅ CONFIRMAR GANADOR' : (this.reviewQueue.length ? 'REVISAR SIGUIENTE PREMIO' : 'CONTINUAR CANTANDO');
    $('finishGame').textContent = pending ? '❌ NO ES VÁLIDO' : 'CERRAR'; $('finishGame').style.display = pending ? '' : 'none'; $('winnerOverlay').classList.add('show');
    this.voice.tone(type === 'ambo' ? 700 : type === 'line' ? 659 : 523, .25, 'square', 1);
  }
  confirmReview() {
    const review = this.activeReview; if (!review || !review.pending) return this.advanceReview();
    const prize = this.game.prizes[review.type], records = review.candidates.map(({ card, details }) => ({ cardId: card.id, name: card.name, number: card.number, ball: review.ball, details: clone(details), confirmedAt: new Date().toISOString() }));
    prize.status = 'confirmed'; prize.winners = records; review.pending = false; this.save(); this.renderGame(); this.celebrate(review.type);
    this.voice.event(review.type === 'ambo' ? 'amboConfirmed' : review.type === 'line' ? 'lineConfirmed' : 'bingoConfirmed');
    this.renderWinnerOverlay(false);
  }
  rejectReview() {
    const review = this.activeReview; if (!review) return;
    const prize = this.game.prizes[review.type]; review.candidates.forEach(candidate => candidate.details.forEach(detail => { if (!prize.rejectedKeys.includes(detail.key)) prize.rejectedKeys.push(detail.key); }));
    prize.status = 'active'; this.activeReview = null; $('winnerOverlay').classList.remove('show'); document.querySelectorAll('.big').forEach(button => button.classList.remove('pendingPrize'));
    PrizeEngine.refreshAmbo(this.game); this.save(); this.renderGame(); this.showNextReview();
  }
  advanceReview() {
    this.activeReview = null; $('winnerOverlay').classList.remove('show'); document.querySelectorAll('.big').forEach(button => button.classList.remove('pendingPrize'));
    this.showNextReview();
  }
  finishReviewCycle() {
    this.reviewQueue = []; this.activeReview = null; this.setPhase(PHASE.PAUSED); PrizeEngine.refreshAmbo(this.game); this.save(); this.renderGame();
  }
  undoLast() {
    if (!this.game || this.phase === PHASE.REVIEW || !this.game.drawn.length) return;
    this.stopAutomatic(false); this.game.drawn.pop();
    for (const type of PRIZE_ORDER) { if (this.game.prizes[type].status !== 'confirmed' && this.game.prizes[type].status !== 'disabled') this.game.prizes[type].status = 'active'; this.game.prizes[type].rejectedKeys = []; }
    PrizeEngine.refreshAmbo(this.game); this.setPhase(this.game.drawn.length ? PHASE.PAUSED : PHASE.READY); this.save(); this.renderGame();
  }
  newRound() {
    if (!this.game || !confirm('¿Iniciar una nueva ronda conservando los cartones y las apuestas?')) return;
    this.stopAutomatic(false); this.game.drawn = []; this.game.prizes = {
      ambo: { status: this.game.rules.ambocabeza ? 'active' : 'disabled', winners: [], rejectedKeys: [] },
      line: { status: this.game.rules.line ? 'active' : 'disabled', winners: [], rejectedKeys: [] },
      bingo: { status: this.game.rules.bingo ? 'active' : 'disabled', winners: [], rejectedKeys: [] }
    };
    this.reviewQueue = []; this.activeReview = null; this.setPhase(PHASE.READY); this.save(); this.renderGame();
  }

  /* Rendering */
  renderGame() {
    if (!this.game) return; this.game.phase = this.phase; const set = new Set(this.game.drawn);
    $('lastBall').textContent = this.game.drawn.at(-1) ?? '—'; $('counter').textContent = `${this.game.drawn.length} / ${this.game.mode}`; $('gameNo').textContent = `Juego ${String(this.game.number).padStart(4, '0')}`;
    $('modeLabel').textContent = `Bingo de ${this.game.mode} · ${this.game.drawMode === 'automatic' ? 'Automático' : 'Manual'}`; $('gamePresenterImage').src = `assets/${this.game.presenter}.png`;
    $('recent').innerHTML = ''; [...this.game.drawn].reverse().slice(0, 6).forEach(n => { const item = document.createElement('i'); item.textContent = n; $('recent').appendChild(item); });
    $('board').innerHTML = ''; for (let n = 1; n <= this.game.mode; n++) { const cell = document.createElement('div'); cell.className = 'n'; cell.textContent = n; if (set.has(n)) cell.classList.add('drawn'); if (this.game.drawn.at(-1) === n) cell.classList.add('latest'); $('board').appendChild(cell); }
    this.renderStatus(); this.renderAutoControls(); this.renderPrizeButtons(); this.renderRanking(); this.renderCards();
  }
  renderStatus() {
    if (this.phase === PHASE.REVIEW && this.activeReview) $('lineStatus').textContent = `REVISANDO ${PRIZE_LABEL[this.activeReview.type]}`;
    else if (this.game.prizes.line.winners.length) $('lineStatus').textContent = `LÍNEA · ${this.game.prizes.line.winners.map(w => `${w.name} (Cartón ${w.number})`).join(' · ')}`;
    else $('lineStatus').textContent = 'Premios pendientes';
    const lineWinners = this.game.prizes.line.winners;
    if (lineWinners.length) { $('lineHistory').textContent = `Ganó Línea: ${lineWinners.map(w => `${w.name} (Cartón ${w.number})`).join(' · ')}`; $('lineHistory').classList.add('show'); } else $('lineHistory').classList.remove('show');
  }
  renderAutoControls() {
    if (!this.game) return;
    const automatic = this.game.drawMode === 'automatic';
    const roomStatus = this.localRoom?.serverState?.status || '';
    const online = Boolean(this.localRoom?.active);
    const bingoLocked = Boolean(online && this.localRoom?.serverState?.bingoConfirmed);
    const roomBlocked = online && roomStatus !== 'playing';
    const locked = this.phase === PHASE.REVIEW || Boolean(this.localRoom?.claimOpen) || roomBlocked || bingoLocked;
    $('autoBtn').style.display = automatic && !online ? '' : 'none';
    $('pauseBtn').style.display = online || automatic ? '' : 'none';
    $('autoBtn').textContent = this.autoRunning ? '⏸ PAUSAR AUTOMÁTICO' : '▶ INICIAR AUTOMÁTICO';
    $('pauseBtn').textContent = roomStatus === 'paused' ? '▶ CONTINUAR PARTIDA' : roomStatus === 'resuming' ? '⏳ REANUDANDO' : '⏸ PAUSAR PARTIDA';
    const stateText = roomStatus === 'starting' ? 'Preparando inicio y cuenta regresiva' : roomStatus === 'paused' ? 'Partida pausada por el administrador' : roomStatus === 'resuming' ? 'La partida continúa en 3, 2, 1…' : roomStatus === 'waiting' ? 'Sala de espera · iniciá desde SALA ONLINE' : bingoLocked ? 'Bingo confirmado · bolillero bloqueado' : locked ? 'Detenido por posible ganador' : automatic ? (this.autoRunning ? `Automático activo · cada ${this.game.autoSeconds} segundos` : 'Automático detenido') : 'Sorteo manual';
    $('autoState').textContent = stateText;
    $('drawBtn').textContent = automatic ? '🎱 CANTAR SIGUIENTE AHORA' : '🎱 SIGUIENTE BOLILLA';
    ['drawBtn','autoBtn','undoBtn'].forEach(id => { $(id).disabled = locked; });
    $('pauseBtn').disabled = online ? !['playing','paused'].includes(roomStatus) : locked;
  }
  renderPrizeButtons() {
    const defs = { ambo: ['amboBtn', 'AMBOCABEZA'], line: ['lineBtn', '★ LÍNEA'], bingo: ['bingoBtn', 'BINGO'] };
    for (const type of PRIZE_ORDER) {
      const [id, label] = defs[type], button = $(id), prize = this.game.prizes[type]; if (!button) continue;
      const activeForCards = this.game.cards.some(card => card.bets[type === 'ambo' ? 'ambocabeza' : type]); button.style.display = prize.status === 'disabled' || !activeForCards ? 'none' : '';
      button.classList.toggle('amboExpired', type === 'ambo' && prize.status === 'expired'); button.disabled = type === 'ambo' && prize.status === 'expired';
      button.querySelector('.prizeDefault').textContent = label;
      const name = button.querySelector('.prizeWinnerName'), card = button.querySelector('.prizeWinnerCard');
      if (type === 'ambo' && prize.status === 'expired') { name.textContent = 'SIN GANADOR'; card.textContent = 'APUESTAS CERRADAS'; }
      else if (prize.winners.length) { name.textContent = prize.winners.length === 1 ? `GANADOR: ${prize.winners[0].name}` : `${prize.winners.length} GANADORES`; card.textContent = prize.winners.map(w => `N.º ${w.number}`).join(' · '); }
      else { name.textContent = ''; card.textContent = ''; }
    }
  }
  makeTicket(card, interactive = true, showStats = true, set = new Set(this.game?.drawn || [])) {
    const article = document.createElement('article'); article.className = 'ticket';
    const header = document.createElement('div'); header.className = 'ticketHead'; header.innerHTML = `<b>EL BINGO DE LA GORDA</b><span>${escapeHtml(card.name)} · Cartón ${escapeHtml(card.number)}</span><small class="betTag">Juega: ${escapeHtml(CardService.betLabels(card) || 'Sin apuestas')}</small>`; article.appendChild(header);
    const grid = document.createElement('div'); grid.className = card.mode === 90 ? 't90' : 't75';
    if (card.mode === 75) 'BINGO'.split('').forEach(letter => { const head = document.createElement('div'); head.className = 'head75'; head.textContent = letter; grid.appendChild(head); });
    card.grid.flat().forEach(value => { const cell = document.createElement('div'); if (value === null) cell.className = 'blank'; else if (value === 'LIBRE') { cell.className = 'free freeLogoCell'; cell.innerHTML = '<img src="assets/logo.png" alt="Casilla libre"/>'; } else { cell.textContent = value; if (set.has(value)) cell.classList.add('marked'); } grid.appendChild(cell); });
    article.appendChild(grid);
    if (showStats) { const stats = document.createElement('div'); stats.className = 'cardStats'; stats.innerHTML = `<span>Marcados: <b>${PrizeEngine.markedCount(card, set)}/${CardService.numbers(card).length}</b></span><span>Faltan Línea: <b>${PrizeEngine.lineMissing(card, set)}</b></span><span>Faltan Bingo: <b>${PrizeEngine.bingoMissing(card, set)}</b></span>`; article.appendChild(stats); }
    if (interactive) article.onclick = () => this.openLarge(card.id); return article;
  }
  miniCard(card, set) {
    const item = document.createElement('div'); item.className = 'rankCard'; item.innerHTML = `<div class="rankTitle"><span>${escapeHtml(card.name)}</span><span>#${escapeHtml(card.number)}</span></div>`;
    const grid = document.createElement('div'); grid.className = card.mode === 90 ? 'mini90' : 'mini75'; card.grid.flat().forEach(value => { const cell = document.createElement('div'); cell.className = 'miniCell'; if (value === null) cell.classList.add('blank'); else if (value === 'LIBRE') { cell.classList.add('free', 'miniFreeLogo'); cell.innerHTML = '<img src="assets/logo.png" alt=""/>'; } else { cell.textContent = value; if (set.has(value)) cell.classList.add('marked'); } grid.appendChild(cell); });
    item.appendChild(grid); const meta = document.createElement('div'); meta.className = 'rankMeta'; meta.textContent = `${PrizeEngine.markedCount(card, set)}/${CardService.numbers(card).length} marcados · Línea: ${PrizeEngine.lineMissing(card, set)} · Bingo: ${PrizeEngine.bingoMissing(card, set)}`; item.appendChild(meta); item.onclick = () => this.openLarge(card.id); return item;
  }
  renderRanking() {
    const host = $('rankList'); host.innerHTML = ''; if (!this.game.cards.length) { host.innerHTML = '<div style="color:var(--muted)">No hay cartones.</div>'; return; }
    const set = new Set(this.game.drawn), sorted = [...this.game.cards].sort((a, b) => PrizeEngine.markedCount(b, set) - PrizeEngine.markedCount(a, set) || PrizeEngine.lineMissing(a, set) - PrizeEngine.lineMissing(b, set) || PrizeEngine.bingoMissing(a, set) - PrizeEngine.bingoMissing(b, set));
    sorted.slice(0, 6).forEach(card => host.appendChild(this.miniCard(card, set)));
  }
  renderCards() {
    const host = $('cardsGrid'); if (!host || !this.game) return; host.innerHTML = ''; const pages = Math.max(1, Math.ceil(this.game.cards.length / this.cardsPerPage)); this.cardsPage = Math.max(0, Math.min(this.cardsPage, pages - 1));
    const start = this.cardsPage * this.cardsPerPage, end = Math.min(start + this.cardsPerPage, this.game.cards.length); this.game.cards.slice(start, end).forEach(card => host.appendChild(this.makeTicket(card)));
    $('pageInfo').textContent = `Página ${this.cardsPage + 1} de ${pages} · Cartones ${this.game.cards.length ? start + 1 : 0}–${end}`; $('prevPage').disabled = this.cardsPage === 0; $('nextPage').disabled = this.cardsPage === pages - 1;
  }
  openLarge(cardId) {
    if (!this.game?.cards.length) return; const index = this.game.cards.findIndex(card => card.id === cardId); if (index >= 0) this.largeIndex = index; this.zoom = 1; this.renderLarge(); $('large').classList.add('show');
  }
  renderLarge() {
    if (!this.game?.cards.length) return; this.largeIndex = (this.largeIndex + this.game.cards.length) % this.game.cards.length; const card = this.game.cards[this.largeIndex];
    $('largeTitle').textContent = `Juego ${String(this.game.number).padStart(4, '0')} · Cartón ${card.number} · ${card.name}`; $('zoomWrap').innerHTML = ''; $('zoomWrap').appendChild(this.makeTicket(card, false)); $('zoomWrap').style.transform = `scale(${this.zoom})`; $('zoomLabel').textContent = `${Math.round(this.zoom * 100)}%`;
    let edit = $('editCurrentCard'); if (!edit) { edit = document.createElement('button'); edit.id = 'editCurrentCard'; edit.className = 'nav'; edit.textContent = '✏ EDITAR CARTÓN'; document.querySelector('.largeFoot').appendChild(edit); }
    edit.disabled = this.game.drawn.length > 0 || this.phase === PHASE.REVIEW; edit.onclick = () => { $('large').classList.remove('show'); this.openEditCard(card.id); };
  }
  renderGames() {
    const host = $('gamesList'); if (!host) return; host.innerHTML = ''; const games = this.store.readAll().sort((a, b) => Number(b.number) - Number(a.number));
    if (!games.length) { host.innerHTML = '<div style="color:var(--muted)">No hay juegos guardados.</div>'; return; }
    games.forEach(raw => { const game = GameStore.normalizeGame(raw), row = document.createElement('div'); row.className = 'gameRow'; row.innerHTML = `<b>Juego ${String(game.number).padStart(4, '0')}</b><span>${game.cards.length} cartones · Bingo ${game.mode}</span>`; const load = document.createElement('button'); load.className = 'load'; load.textContent = 'CARGAR'; load.onclick = () => this.loadGame(game.id); const del = document.createElement('button'); del.className = 'delete'; del.textContent = 'ELIMINAR'; del.onclick = () => { if (confirm('¿Eliminar este juego?')) { this.store.remove(game.id); this.renderGames(); } }; row.append(load, del); host.appendChild(row); });
  }
  showConfirmedPrize(type) {
    const prize = this.game.prizes[type]; if (!prize.winners.length) return;
    this.stopAutomatic(false); this.setPhase(PHASE.REVIEW);
    this.activeReview = { type, ball: prize.winners[0].ball, pending: false, candidates: prize.winners.map(record => ({ card: this.game.cards.find(card => card.id === record.cardId) || { id: record.cardId, name: record.name, number: record.number }, details: record.details || [] })) };
    this.renderWinnerOverlay(false); this.renderAutoControls();
  }
  celebrate(type) {
    const layer = $('confettiLayer'); layer.innerHTML = ''; const colors = ['#ffca2f','#ff4f72','#64dd72','#48a7ff','#b85cff','#fff'];
    for (let i = 0; i < 90; i++) { const piece = document.createElement('i'); piece.style.left = `${Math.random() * 100}%`; piece.style.background = colors[i % colors.length]; piece.style.animationDelay = `${Math.random() * .5}s`; piece.style.animationDuration = `${1.7 + Math.random() * 1.5}s`; layer.appendChild(piece); }
    layer.classList.add('show'); setTimeout(() => { layer.classList.remove('show'); layer.innerHTML = ''; }, 3500);
    this.voice.tone(type === 'bingo' ? 784 : 659, .35, 'square', 1); this.voice.tone(type === 'bingo' ? 1046 : 880, .45, 'sine', .8, .2);
  }

  /* Card editing */
  editCellRange(mode, col) {
    if (mode === 75) return [col * 15 + 1, col * 15 + 15];
    if (col === 0) return [1, 9];
    if (col === 8) return [80, 90];
    return [col * 10, col * 10 + 9];
  }
  moveEditFocus(input, deltaRow, deltaCol) {
    const board = input.closest('.editCardBoard'); if (!board) return;
    const row = Number(input.dataset.row), col = Number(input.dataset.col), mode = Number(input.dataset.mode);
    const rows = mode === 90 ? 3 : 5, cols = mode === 90 ? 9 : 5;
    let nextRow = row + deltaRow, nextCol = col + deltaCol;
    while (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
      const target = board.querySelector(`input[data-row="${nextRow}"][data-col="${nextCol}"]`);
      if (target) { target.focus(); target.select(); return; }
      nextRow += deltaRow; nextCol += deltaCol;
    }
  }
  openEditCard(cardId) {
    if (!this.game || this.game.drawn.length || this.phase === PHASE.REVIEW) { alert('Los cartones solo se pueden editar entre rondas, antes de cantar la primera bolilla.'); return; }
    const card = this.game.cards.find(item => item.id === cardId); if (!card) return; this.editCardId = cardId;
    $('editCardName').value = card.name; $('editCardNumber').value = card.number; $('editBetAmbo').checked = card.bets.ambocabeza; $('editBetAmbo').disabled = card.mode !== 90 || !this.game.rules.ambocabeza; $('editBetLine').checked = card.bets.line; $('editBetLine').disabled = !this.game.rules.line; $('editBetBingo').checked = card.bets.bingo; $('editBetBingo').disabled = !this.game.rules.bingo;
    const host = $('editCardGrid'); host.innerHTML = ''; host.className = `manualGrid editTicketShell ${card.mode === 90 ? 'editGrid90' : 'editGrid75'}`;
    const caption = document.createElement('div'); caption.className = 'editTicketCaption'; caption.innerHTML = `<strong>EL BINGO DE LA GORDA</strong><span>${card.mode} BOLILLAS · Cartón ${escapeHtml(card.number)}</span>`; host.appendChild(caption);
    const board = document.createElement('div'); board.className = 'editCardBoard';
    const headers = card.mode === 90 ? ['1–9','10–19','20–29','30–39','40–49','50–59','60–69','70–79','80–90'] : 'BINGO'.split('');
    headers.forEach(text => { const head = document.createElement('div'); head.className = 'editGridHeader'; head.textContent = text; board.appendChild(head); });
    card.grid.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
      const index = rowIndex * row.length + colIndex;
      if (value === 'LIBRE') {
        const free = document.createElement('div'); free.className = 'editFreeLogo'; free.dataset.index = index; free.dataset.row = rowIndex; free.dataset.col = colIndex;
        free.innerHTML = '<img src="assets/logo.png" alt="Logo El Bingo de la Gorda"/>'; board.appendChild(free); return;
      }
      const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off'; input.className = 'editNumberCell'; input.dataset.index = index; input.dataset.row = rowIndex; input.dataset.col = colIndex; input.dataset.mode = card.mode;
      const [min, max] = this.editCellRange(card.mode, colIndex); input.dataset.min = min; input.dataset.max = max; input.maxLength = 2; input.setAttribute('aria-label', `Fila ${rowIndex + 1}, columna ${colIndex + 1}, números ${min} a ${max}`);
      if (typeof value === 'number') input.value = value; else input.classList.add('empty');
      input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 2); input.classList.toggle('empty', input.value === ''); this.updateEditCardState(); });
      input.addEventListener('keydown', event => {
        const moves = { ArrowUp: [-1,0], ArrowDown: [1,0], ArrowLeft: [0,-1], ArrowRight: [0,1] };
        if (moves[event.key]) { event.preventDefault(); this.moveEditFocus(input, ...moves[event.key]); }
        if (event.key === 'Enter') { event.preventDefault(); this.moveEditFocus(input, 0, 1); }
      });
      board.appendChild(input);
    }));
    host.appendChild(board); $('editCardError').textContent = ''; $('editCardModal').classList.add('show'); this.updateEditCardState();
  }
  collectEditedCard() {
    const old = this.game.cards.find(card => card.id === this.editCardId), columns = old.mode === 90 ? 9 : 5, total = old.mode === 90 ? 27 : 25;
    const values = Array(total).fill(null); if (old.mode === 75) values[12] = 'LIBRE';
    $('editCardGrid').querySelectorAll('[data-index]').forEach(cell => {
      const index = Number(cell.dataset.index); if (cell.classList.contains('editFreeLogo')) values[index] = 'LIBRE'; else values[index] = cell.value === '' ? null : Number(cell.value);
    });
    const grid = []; for (let i = 0; i < values.length; i += columns) grid.push(values.slice(i, i + columns));
    return { ...old, name: $('editCardName').value.trim() || 'Jugador', number: $('editCardNumber').value.trim() || old.number, grid, bets: { ambocabeza: !$('editBetAmbo').disabled && $('editBetAmbo').checked, line: !$('editBetLine').disabled && $('editBetLine').checked, bingo: !$('editBetBingo').disabled && $('editBetBingo').checked } };
  }
  updateEditCardState() {
    if (!this.editCardId) return;
    const card = this.collectEditedCard(), inputs = [...$('editCardGrid').querySelectorAll('.editNumberCell')];
    inputs.forEach(input => input.classList.remove('invalid', 'duplicate'));
    const byNumber = new Map();
    inputs.forEach(input => {
      if (!input.value) return;
      const value = Number(input.value), min = Number(input.dataset.min), max = Number(input.dataset.max);
      if (!Number.isInteger(value) || value < min || value > max) input.classList.add('invalid');
      if (!byNumber.has(value)) byNumber.set(value, []); byNumber.get(value).push(input);
    });
    byNumber.forEach(group => { if (group.length > 1) group.forEach(input => input.classList.add('duplicate')); });
    const counters = $('editCardCounters'); counters.innerHTML = '';
    if (card.mode === 90) {
      card.grid.forEach((row, index) => { const count = row.filter(value => typeof value === 'number').length; const tag = document.createElement('span'); tag.className = `editCounter ${count === 5 ? 'ok' : 'bad'}`; tag.textContent = `Fila ${index + 1}: ${count}/5`; counters.appendChild(tag); });
      const total = CardService.numbers(card).length, tag = document.createElement('span'); tag.className = `editCounter ${total === 15 ? 'ok' : 'bad'}`; tag.textContent = `Total: ${total}/15`; counters.appendChild(tag);
    } else {
      const total = CardService.numbers(card).length, tag = document.createElement('span'); tag.className = `editCounter ${total === 24 ? 'ok' : 'bad'}`; tag.textContent = `Números: ${total}/24`; counters.appendChild(tag);
    }
    const result = CardService.validate(card); $('editCardError').textContent = result.valid ? '' : result.errors.join(' · '); $('saveEditCard').disabled = !result.valid;
  }

  /* Themes */
  themeDefinitions() { return [['clasico','Violeta clásico','#8338eb','#168ce8'],['azul','Azul eléctrico','#1379e8','#00a6ff'],['rojo','Rojo show','#e63345','#ff6b3d'],['esmeralda','Verde esmeralda','#13a879','#15c9a3'],['dorado','Dorado','#b8790a','#d39a22'],['rosa','Rosa neón','#e334bd','#ff62d6'],['turquesa','Turquesa','#09a6b6','#1bd6c4'],['naranja','Naranja','#ef6d19','#ff9c2f'],['hielo','Blanco y azul','#5a83d8','#e7f7ff'],['premium','Negro premium','#6d52a9','#d9bd75']]; }
  applyTheme(id) { document.body.dataset.theme = id === 'clasico' ? '' : id; storageSet('gorda-theme', id); if (this.game) { this.game.theme = id; this.save(); } document.querySelectorAll('.themeChoice').forEach(button => button.classList.toggle('active', button.dataset.theme === id)); }
  renderThemes() { const host = $('themeGrid'); host.innerHTML = ''; this.themeDefinitions().forEach(([id, name, a, b]) => { const button = document.createElement('button'); button.className = 'themeChoice'; button.dataset.theme = id; button.style.background = `linear-gradient(135deg,${a},${b})`; button.innerHTML = `<span>${name}</span>`; button.onclick = () => this.applyTheme(id); host.appendChild(button); }); this.applyTheme(storageGet('gorda-theme') || 'clasico'); }

  bindEvents() {
    $('newGameBtn').onclick = () => this.openWizard(); if ($('enterRoomBtn')) $('enterRoomBtn').onclick = () => location.href = '/jugador'; $('loadGameBtn').onclick = () => { this.renderGames(); $('gamesModal').classList.add('show'); }; $('cancelWizard').onclick = () => { this.setPhase(PHASE.HOME); this.showScreen('home'); };
    document.querySelectorAll('.modeChoice button').forEach(button => button.onclick = () => { this.wizard.mode = Number(button.dataset.mode); document.querySelectorAll('.modeChoice button').forEach(b => b.classList.toggle('active', b === button)); if (this.wizard.mode === 75) { $('globalAmbo').checked = false; $('globalAmbo').disabled = true; if (this.wizard.source === 'pdf') this.setWizardSource('generated'); } else $('globalAmbo').disabled = false; });
    document.querySelectorAll('.presenterCard').forEach(card => {
      card.onclick = event => { if (event.target.closest('.voicePreview')) return; this.wizard.presenter = card.dataset.id; document.querySelectorAll('.presenterCard').forEach(other => { other.classList.toggle('selected', other === card); other.classList.toggle('dimmed', other !== card); }); $('wizardNext').disabled = false; };
    });
    document.querySelectorAll('.voicePreview').forEach(button => button.onclick = event => { event.stopPropagation(); this.voice.preview(button.dataset.voice); });
    $('sourceGenerated').onclick = () => this.setWizardSource('generated'); $('sourceManual').onclick = () => this.setWizardSource('manual'); $('sourcePdf').onclick = () => this.setWizardSource('pdf');
    $('qty').onchange = () => {}; 
    $('addManualCard').onclick = () => this.addManualCard(); $('copyLastBets').onclick = () => this.addManualCard(this.wizard.manualCards.at(-1)?.bets);
    $('pdfFile').onchange = event => { const file = event.target.files?.[0]; if (file) this.importPdf(file); }; $('pdfSelectAll').onclick = () => { this.wizard.pdfCards.forEach(card => { card.selected = true; }); this.renderPdfCards(); }; $('pdfSelectNone').onclick = () => { this.wizard.pdfCards.forEach(card => { card.selected = false; }); this.renderPdfCards(); }; $('pdfSearch').oninput = () => this.renderPdfCards();
    $('wizardBack').onclick = () => this.setWizardStep(Math.max(1, this.wizard.step - 1));
    $('wizardNext').onclick = () => {
      if (this.wizard.step === 1) {
        this.wizard.rules = { ambocabeza: this.wizard.mode === 90 && $('globalAmbo').checked, line: $('globalLine').checked, bingo: $('globalBingo').checked };
        if (!Object.values(this.wizard.rules).some(Boolean)) { $('gameModeError').textContent = 'Elegí al menos un premio para jugar.'; return; }
        $('gameModeError').textContent = ''; this.wizard.drawMode = document.querySelector('input[name="drawMode"]:checked')?.value || 'manual'; this.wizard.autoSeconds = Number($('autoSeconds').value) || 6; this.setWizardStep(2); return;
      }
      if (this.wizard.step === 2) { if (!this.wizard.presenter) return; this.setWizardStep(3); return; }
      if (this.wizard.step === 3) { if (!this.buildPreview()) return; this.setWizardStep(4); return; }
      this.startCreatedGame();
    };
    $('previewPrev').onclick = () => { this.wizard.previewPage--; this.renderPreview(); }; $('previewNext').onclick = () => { this.wizard.previewPage++; this.renderPreview(); }; $('previewPerPage').onchange = event => { this.wizard.previewPerPage = Number(event.target.value); this.wizard.previewPage = 0; this.renderPreview(); };
    $('savePdfReview').onclick = () => { const card = this.collectPdfReview(), result = CardService.validate(card); if (!result.valid) { $('pdfReviewError').textContent = result.errors.join(' · '); return; } card.reviewed = true; card.valid = true; this.wizard.pdfCards[this.pdfReviewIndex] = card; $('pdfReviewModal').classList.remove('show'); this.renderPdfCards(); };
    $('clearPdfReview').onclick = () => { $('pdfReviewGrid').querySelectorAll('input').forEach(input => { input.value = ''; }); this.validatePdfReview(); }; $('closePdfReview').onclick = () => $('pdfReviewModal').classList.remove('show');

    $('drawBtn').onclick = () => this.requestDraw('button'); $('autoBtn').onclick = () => this.toggleAutomatic(); $('pauseBtn').onclick = () => this.toggleAutomatic(); $('undoBtn').onclick = () => this.undoLast(); $('resetBtn').onclick = () => this.newRound();
    $('amboBtn').onclick = () => this.game?.prizes.ambo.winners.length ? this.showConfirmedPrize('ambo') : null; $('lineBtn').onclick = () => this.game?.prizes.line.winners.length ? this.showConfirmedPrize('line') : null; $('bingoBtn').onclick = () => this.game?.prizes.bingo.winners.length ? this.showConfirmedPrize('bingo') : null;
    $('continueGame').onclick = () => this.activeReview?.pending ? this.confirmReview() : this.advanceReview(); $('finishGame').onclick = () => this.activeReview?.pending ? this.rejectReview() : this.advanceReview();
    $('viewWinnerCard').onclick = () => { const card = this.activeReview?.candidates?.[0]?.card; if (card) { $('winnerOverlay').classList.remove('show'); this.openLarge(card.id); } };
    $('cardsBtn').onclick = () => { $('cardsModal').classList.add('show'); this.renderCards(); }; $('closeCards').onclick = () => $('cardsModal').classList.remove('show'); $('prevPage').onclick = () => { this.cardsPage--; this.renderCards(); }; $('nextPage').onclick = () => { this.cardsPage++; this.renderCards(); }; $('perPage').onchange = event => { this.cardsPerPage = Number(event.target.value); this.cardsPage = 0; this.renderCards(); }; $('printVisible').onclick = () => window.print();
    $('closeGames').onclick = () => $('gamesModal').classList.remove('show'); $('exitGameBtn').onclick = () => this.exitGame(); $('fullBtn').onclick = async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch {} };
    $('closeLarge').onclick = () => { $('large').classList.remove('show'); if (this.activeReview) $('winnerOverlay').classList.add('show'); }; $('prevCard').onclick = () => { this.largeIndex--; this.renderLarge(); }; $('nextCard').onclick = () => { this.largeIndex++; this.renderLarge(); }; $('zoomIn').onclick = () => { this.zoom = Math.min(2, this.zoom + .15); this.renderLarge(); }; $('zoomOut').onclick = () => { this.zoom = Math.max(.7, this.zoom - .15); this.renderLarge(); }; $('printOne').onclick = () => window.print();
    $('themeBtn').onclick = () => { $('themeModal').classList.add('show'); this.renderThemes(); }; $('closeTheme').onclick = () => $('themeModal').classList.remove('show'); $('soundBtn').onclick = () => { $('settings').style.display = $('settings').style.display === 'block' ? 'none' : 'block'; setTimeout(() => this.voice.refresh(false), 0); };
    ['vero','vivi','josu','daia'].forEach(id => { const cap = `${id[0].toUpperCase()}${id.slice(1)}`; $(`voiceSelect${cap}`).onchange = event => { this.voice.setVoice(id, event.target.value); this.voice.preview(id); }; $(`testVoice${cap}`).onclick = () => this.voice.preview(id); });
    $('autoAssignVoices').onclick = () => { this.voice.refresh(true); this.voice.preview(this.game?.presenter || this.wizard.presenter || 'vero'); }; $('musicOn').onchange = event => event.target.checked ? this.voice.startMusic() : this.voice.stopMusic();
    $('saveEditCard').onclick = () => { const card = this.collectEditedCard(), result = CardService.validate(card); if (!result.valid) { $('editCardError').textContent = result.errors.join(' · '); this.updateEditCardState(); return; } const index = this.game.cards.findIndex(item => item.id === this.editCardId); this.game.cards[index] = card; this.save(); this.renderGame(); $('editCardModal').classList.remove('show'); };
    $('clearEditCard').onclick = () => { $('editCardGrid').querySelectorAll('.editNumberCell').forEach(input => { input.value = ''; input.classList.add('empty'); }); this.updateEditCardState(); }; $('closeEditCard').onclick = () => $('editCardModal').classList.remove('show');
    ['editCardName','editCardNumber','editBetAmbo','editBetLine','editBetBingo'].forEach(id => $(id).addEventListener('input', () => this.updateEditCardState()));
    document.addEventListener('keydown', event => { if (event.target.matches('input,textarea,select')) return; if (event.code === 'Space' && $('game').classList.contains('active')) { event.preventDefault(); this.requestDraw('keyboard'); } });
    window.addEventListener('beforeunload', () => this.save());
  }
}

function showFatal(error) {
  console.error(error); const box = $('fatalError'); if (box) { box.style.display = 'block'; box.textContent = `Bingo de la Gorda 2.0 encontró un error y detuvo la ejecución para no perder datos.\n\n${error?.stack || error}`; }
}

window.BingoV8Engine = { APP_VERSION, PHASE, GameStore, CardService, PrizeEngine, VoiceService, PdfImporter, BingoApp };

window.addEventListener('DOMContentLoaded', () => { try { new BingoApp().init(); } catch (error) { showFatal(error); } });
window.addEventListener('error', event => showFatal(event.error || event.message));
window.addEventListener('unhandledrejection', event => showFatal(event.reason));

})();
