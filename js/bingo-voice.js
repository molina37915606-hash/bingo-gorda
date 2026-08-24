(() => {
'use strict';

// V9.2.13 · Voz del navegador / Google TTS.
// Mantiene la API BingoVoice para no tocar la lógica de Jugador, Admin, TV,
// Transmisión, Evento ni Comunidad. No descarga ni reproduce MP3 de voz.

const EVENT_FOLDERS = {
  inicio: 'inicio', partida: 'partida', reclamo: 'reclamos', premio: 'premios',
  comentario: 'comentarios', cierre: 'cierre', demo: 'demo'
};

const EVENT_TEXT = {
  inicio_bienvenida: 'Bienvenidos a El Bingo de la Gorda.',
  inicio_preparados: 'Preparen sus cartones, que estamos por comenzar.',
  inicio_atencion: 'Atención, que comienza la partida.',
  inicio_suerte: 'Mucha suerte para todos.',
  inicio_comenzamos: 'Comenzamos.',
  partida_pausa: 'La partida está en pausa.',
  partida_continuamos: 'Continuamos con la partida.',
  partida_reanudamos: 'Reanudamos el sorteo.',
  partida_ultima_etapa: 'Entramos en la etapa final de la partida.',
  partida_ultima_bolilla: 'Atención. Última bolilla.',
  partida_finalizada: 'Partida finalizada.',
  reclamo_recibido: 'Reclamo recibido.',
  reclamo_verificando: 'Estamos verificando el reclamo.',
  reclamo_valido: 'Reclamo válido.',
  reclamo_no_valido: 'El reclamo no es válido. Continuamos jugando.',
  reclamo_empate: 'Tenemos más de un ganador.',
  premio_ambo_cantado: '¡Ambo cabeza!',
  premio_ambo_confirmado: 'Ambo cabeza confirmado.',
  premio_linea_cantada: '¡Línea!',
  premio_linea_confirmada: 'Línea confirmada.',
  premio_segunda_linea_cantada: '¡Segunda línea!',
  premio_segunda_linea_confirmada: 'Segunda línea confirmada.',
  premio_doble_linea_cantada: '¡Doble línea!',
  premio_doble_linea_confirmada: 'Doble línea confirmada.',
  premio_triple_linea_cantada: '¡Triple línea!',
  premio_triple_linea_confirmada: 'Triple línea confirmada.',
  premio_esquinas_cantado: '¡Cuatro esquinas!',
  premio_esquinas_confirmado: 'Cuatro esquinas confirmadas.',
  premio_bingo_cantado: '¡Bingo!',
  premio_bingo_confirmado: 'Bingo confirmado.',
  comentario_01: 'Seguimos jugando.',
  comentario_02: 'Atención a sus cartones.',
  comentario_03: 'La suerte puede estar en la próxima bolilla.',
  comentario_04: 'Vamos por la siguiente.',
  comentario_05: 'Cada vez falta menos.',
  comentario_06: 'Seguimos con El Bingo de la Gorda.',
  cierre_felicitaciones: 'Felicitaciones a los ganadores.',
  cierre_final: 'Gracias por jugar al Bingo de la Gorda.',
  demo_inicio: 'Esta es una partida de demostración de El Bingo de la Gorda.',
  demo_explicacion: 'Podés usar esta partida para conocer cómo funciona el juego.',
  demo_fin: 'La demostración terminó.'
};

const LETTER_TEXT = { b:'Be', i:'I', n:'Ene', g:'Ge', o:'O' };

function eventPath(key) {
  const value = String(key || '').trim();
  const prefix = value.split('_')[0];
  const folder = EVENT_FOLDERS[prefix];
  return folder ? `/assets/voice/${folder}/${value}.mp3` : '';
}

function numberPath(number) {
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1 || n > 90) return '';
  return `/assets/voice/numeros/numero_${String(n).padStart(2, '0')}.mp3`;
}

function bingoLetter(number) {
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1 || n > 75) return '';
  return 'BINGO'[Math.min(4, Math.floor((n - 1) / 15))];
}

function letterPath(letter) {
  const value = String(letter || '').trim().toLowerCase();
  return /^[bingo]$/.test(value) ? `/assets/voice/letras/letra_${value}.mp3` : '';
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
  const feminine = ['linea','segunda_linea','doble_linea','triple_linea'].includes(base);
  const suffix = confirmed ? (feminine ? 'confirmada' : 'confirmado') : (feminine ? 'cantada' : 'cantado');
  return `premio_${base}_${suffix}`;
}

function sourceText(source) {
  const value = String(source || '').trim();
  if (!value) return '';
  if (EVENT_TEXT[value]) return EVENT_TEXT[value];
  const eventMatch = value.match(/\/([^/]+)\.mp3(?:\?.*)?$/i);
  if (eventMatch && EVENT_TEXT[eventMatch[1]]) return EVENT_TEXT[eventMatch[1]];
  const num = value.match(/numero_(\d{2})\.mp3/i);
  if (num) return String(Number(num[1]));
  const letter = value.match(/letra_([bingo])\.mp3/i);
  if (letter) return LETTER_TEXT[letter[1].toLowerCase()] || letter[1].toUpperCase();
  return value;
}

class VoicePlayer {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.volume = Math.max(0, Math.min(1, Number(options.volume ?? 1)));
    this.rate = Math.max(.65, Math.min(1.25, Number(options.rate ?? .92)));
    this.pitch = Math.max(.7, Math.min(1.3, Number(options.pitch ?? 1)));
    this.gapMs = Math.max(0, Number(options.gapMs ?? 110));
    this.queue = [];
    this.running = false;
    this.cancelToken = 0;
    this.currentResolve = null;
    this.voiceCache = null;
    this.unlocked = false;
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.addEventListener?.('voiceschanged', () => { this.voiceCache = null; }); } catch {}
    }
  }

  supported() { return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'; }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.enabled) this.stop(true);
    return this.enabled;
  }

  isUnlocked() { return Boolean(this.enabled && this.supported() && this.unlocked); }

  async unlock() {
    if (!this.enabled || !this.supported()) return false;
    this.unlocked = true;
    this._preferredVoice();
    return true;
  }

  _preferredVoice() {
    if (this.voiceCache) return this.voiceCache;
    let voices = [];
    try { voices = window.speechSynthesis.getVoices?.() || []; } catch {}
    if (!voices.length) return null;
    const lang = v => String(v?.lang || '').toLowerCase();
    const name = v => String(v?.name || '').toLowerCase();
    const preferred = [
      v => name(v).includes('google') && lang(v).startsWith('es-ar'),
      v => name(v).includes('google') && lang(v).startsWith('es'),
      v => lang(v).startsWith('es-ar'),
      v => lang(v).startsWith('es-419'),
      v => lang(v).startsWith('es'),
      v => name(v).includes('google')
    ];
    this.voiceCache = preferred.map(test => voices.find(test)).find(Boolean) || voices[0] || null;
    return this.voiceCache;
  }

  stop(clearQueue = true) {
    this.cancelToken += 1;
    if (clearQueue) this.queue.length = 0;
    try { window.speechSynthesis?.cancel?.(); } catch {}
    const resolve = this.currentResolve;
    this.currentResolve = null;
    try { resolve?.(); } catch {}
  }

  playFiles(paths, options = {}) {
    if (!this.enabled || !this.supported()) return false;
    const texts = (Array.isArray(paths) ? paths : [paths]).map(sourceText).filter(Boolean);
    if (!texts.length) return false;
    if (options.priority) this.stop(true);
    this.unlocked = true;
    this.queue.push({ texts, gapMs: Math.max(0, Number(options.gapMs ?? this.gapMs)) });
    this._pump();
    return true;
  }

  playEvent(key, options = {}) { return this.playFiles(EVENT_TEXT[key] || key, options); }
  playSequence(keys, options = {}) { return this.playFiles((keys || []).map(key => EVENT_TEXT[key] || key), options); }

  playBall(number, mode = 90, options = {}) {
    const n = Number(number);
    if (!Number.isInteger(n) || n < 1 || n > 90) return false;
    if (Number(mode) === 75) {
      const letter = LETTER_TEXT[String(bingoLetter(n)).toLowerCase()] || bingoLetter(n);
      return this.playFiles([letter, String(n)], { ...options, gapMs: options.gapMs ?? 85 });
    }
    return this.playFiles(String(n), options);
  }

  playPrize(type, options = {}) {
    const key = prizeEvent(type, options);
    return key ? this.playEvent(key, options) : false;
  }

  playClaim(type, options = {}) {
    const prize = prizeEvent(type, { ...options, confirmed:false });
    return this.playSequence([prize, 'reclamo_verificando'].filter(Boolean), { ...options, priority: options.priority !== false });
  }

  playConfirmed(type, options = {}) {
    const prize = prizeEvent(type, { ...options, confirmed:true });
    return this.playSequence([prize, 'reclamo_valido'].filter(Boolean), { ...options, priority: options.priority !== false });
  }

  playFinal(options = {}) {
    return this.playSequence(['partida_finalizada','cierre_felicitaciones','cierre_final'], { ...options, priority: options.priority !== false, gapMs: options.gapMs ?? 150 });
  }

  preloadBall() { return Promise.resolve([]); }

  async _pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.enabled && this.queue.length) {
        const item = this.queue.shift();
        const token = this.cancelToken;
        for (let i=0; i<item.texts.length && this.enabled && token===this.cancelToken; i++) {
          await this._speakText(item.texts[i], token);
          if (token !== this.cancelToken) break;
          if (i < item.texts.length-1 && item.gapMs) await new Promise(resolve => setTimeout(resolve, item.gapMs));
        }
      }
    } finally {
      this.running = false;
      if (this.enabled && this.queue.length) this._pump();
    }
  }

  async _speakText(text, token = this.cancelToken) {
    if (!this.enabled || !this.supported() || !text || token !== this.cancelToken) return false;
    return new Promise(resolve => {
      try {
        const utterance = new window.SpeechSynthesisUtterance(String(text));
        utterance.lang = 'es-AR';
        utterance.rate = this.rate;
        utterance.pitch = this.pitch;
        utterance.volume = this.volume;
        const selected = this._preferredVoice();
        if (selected) utterance.voice = selected;
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          if (this.currentResolve === done) this.currentResolve = null;
          resolve(true);
        };
        this.currentResolve = done;
        utterance.onend = done;
        utterance.onerror = done;
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve(false);
      }
    });
  }
}

window.BingoVoice = {
  create: options => new VoicePlayer(options),
  eventPath, numberPath, letterPath, bingoLetter, prizeEvent,
  eventText: key => EVENT_TEXT[key] || ''
};
})();
