(() => {
'use strict';

// FINAL INTERNACIONAL · voz del navegador sincronizada con ES / PT-BR / EN.
// Mantiene la API BingoVoice usada por Jugador, Admin, TV, Transmisión,
// Evento y Comunidad.

const EVENT_FOLDERS = {
  inicio: 'inicio', partida: 'partida', reclamo: 'reclamos', premio: 'premios',
  comentario: 'comentarios', cierre: 'cierre', demo: 'demo'
};

const EVENT_TEXT_ES = {
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

const EVENT_TEXT_PT = {
  inicio_bienvenida: 'Bem-vindos ao El Bingo de la Gorda.',
  inicio_preparados: 'Preparem suas cartelas, estamos prestes a começar.',
  inicio_atencion: 'Atenção, a partida vai começar.',
  inicio_suerte: 'Boa sorte para todos.',
  inicio_comenzamos: 'Começamos.',
  partida_pausa: 'A partida está pausada.',
  partida_continuamos: 'Continuamos com a partida.',
  partida_reanudamos: 'Retomamos o sorteio.',
  partida_ultima_etapa: 'Entramos na etapa final da partida.',
  partida_ultima_bolilla: 'Atenção. Última bola.',
  partida_finalizada: 'Partida encerrada.',
  reclamo_recibido: 'Jogada recebida.',
  reclamo_verificando: 'Estamos verificando a jogada.',
  reclamo_valido: 'Jogada válida.',
  reclamo_no_valido: 'A jogada não é válida. Continuamos jogando.',
  reclamo_empate: 'Temos mais de um vencedor.',
  premio_ambo_cantado: 'Dupla cabeça!',
  premio_ambo_confirmado: 'Dupla cabeça confirmada.',
  premio_linea_cantada: 'Linha!',
  premio_linea_confirmada: 'Linha confirmada.',
  premio_segunda_linea_cantada: 'Segunda linha!',
  premio_segunda_linea_confirmada: 'Segunda linha confirmada.',
  premio_doble_linea_cantada: 'Linha dupla!',
  premio_doble_linea_confirmada: 'Linha dupla confirmada.',
  premio_triple_linea_cantada: 'Linha tripla!',
  premio_triple_linea_confirmada: 'Linha tripla confirmada.',
  premio_esquinas_cantado: 'Quatro cantos!',
  premio_esquinas_confirmado: 'Quatro cantos confirmados.',
  premio_bingo_cantado: 'Bingo!',
  premio_bingo_confirmado: 'Bingo confirmado.',
  comentario_01: 'Continuamos jogando.',
  comentario_02: 'Atenção às suas cartelas.',
  comentario_03: 'A sorte pode estar na próxima bola.',
  comentario_04: 'Vamos para a próxima.',
  comentario_05: 'Falta cada vez menos.',
  comentario_06: 'Continuamos com El Bingo de la Gorda.',
  cierre_felicitaciones: 'Parabéns aos vencedores.',
  cierre_final: 'Obrigado por jogar El Bingo de la Gorda.',
  demo_inicio: 'Esta é uma partida de demonstração de El Bingo de la Gorda.',
  demo_explicacion: 'Você pode usar esta partida para conhecer como o jogo funciona.',
  demo_fin: 'A demonstração terminou.'
};

const EVENT_TEXT_EN = {
  inicio_bienvenida: 'Welcome to El Bingo de la Gorda.',
  inicio_preparados: 'Get your cards ready. We are about to begin.',
  inicio_atencion: 'Attention. The game is starting.',
  inicio_suerte: 'Good luck, everyone.',
  inicio_comenzamos: 'Let us begin.',
  partida_pausa: 'The game is paused.',
  partida_continuamos: 'We continue with the game.',
  partida_reanudamos: 'The draw is resuming.',
  partida_ultima_etapa: 'We are entering the final stage of the game.',
  partida_ultima_bolilla: 'Attention. Last ball.',
  partida_finalizada: 'Game finished.',
  reclamo_recibido: 'Claim received.',
  reclamo_verificando: 'We are checking the claim.',
  reclamo_valido: 'Valid claim.',
  reclamo_no_valido: 'The claim is not valid. We continue playing.',
  reclamo_empate: 'We have more than one winner.',
  premio_ambo_cantado: 'Two-number head!',
  premio_ambo_confirmado: 'Two-number head confirmed.',
  premio_linea_cantada: 'Line!',
  premio_linea_confirmada: 'Line confirmed.',
  premio_segunda_linea_cantada: 'Second line!',
  premio_segunda_linea_confirmada: 'Second line confirmed.',
  premio_doble_linea_cantada: 'Double line!',
  premio_doble_linea_confirmada: 'Double line confirmed.',
  premio_triple_linea_cantada: 'Triple line!',
  premio_triple_linea_confirmada: 'Triple line confirmed.',
  premio_esquinas_cantado: 'Four corners!',
  premio_esquinas_confirmado: 'Four corners confirmed.',
  premio_bingo_cantado: 'Bingo!',
  premio_bingo_confirmado: 'Bingo confirmed.',
  comentario_01: 'We keep playing.',
  comentario_02: 'Keep an eye on your cards.',
  comentario_03: 'The next ball could be the lucky one.',
  comentario_04: 'Let us draw the next one.',
  comentario_05: 'We are getting closer.',
  comentario_06: 'We continue with El Bingo de la Gorda.',
  cierre_felicitaciones: 'Congratulations to the winners.',
  cierre_final: 'Thank you for playing El Bingo de la Gorda.',
  demo_inicio: 'This is a demo game of El Bingo de la Gorda.',
  demo_explicacion: 'You can use this game to learn how it works.',
  demo_fin: 'The demo is over.'
};

const EVENT_TEXTS = { es:EVENT_TEXT_ES, pt:EVENT_TEXT_PT, en:EVENT_TEXT_EN };
const LETTER_TEXT = {
  es:{ b:'Be', i:'I', n:'Ene', g:'Ge', o:'O' },
  pt:{ b:'Bê', i:'I', n:'Ene', g:'Gê', o:'O' },
  en:{ b:'Bee', i:'Eye', n:'En', g:'Gee', o:'Oh' }
};
const SPEECH_LOCALE = { es:'es-AR', pt:'pt-BR', en:'en-US' };

function normalizeLanguage(value) {
  const v = String(value || '').toLowerCase();
  if (v.startsWith('pt')) return 'pt';
  if (v.startsWith('en')) return 'en';
  return 'es';
}

function currentLanguage() {
  try {
    if (window.LGI18N?.language) return normalizeLanguage(window.LGI18N.language);
    return normalizeLanguage(localStorage.getItem('lg_language') || navigator.language || 'es');
  } catch { return 'es'; }
}

function speechLocale(language = currentLanguage()) { return SPEECH_LOCALE[normalizeLanguage(language)] || 'es-AR'; }
function eventText(key, language = currentLanguage()) {
  const lang = normalizeLanguage(language);
  return EVENT_TEXTS[lang]?.[key] || EVENT_TEXT_ES[key] || String(key || '');
}

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
function letterText(letter, language = currentLanguage()) {
  const lang = normalizeLanguage(language), key = String(letter || '').trim().toLowerCase();
  return LETTER_TEXT[lang]?.[key] || LETTER_TEXT.es[key] || String(letter || '').toUpperCase();
}

function prizeEvent(type, { mode = 90, prizeNumber = 1, confirmed = true } = {}) {
  const raw = String(type || ''); let base = '';
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

function spokenPrizeLabel(type, options = {}, language = currentLanguage()) {
  const lang = normalizeLanguage(language), raw = String(type || '');
  let key = 'line';
  if (raw === 'ambo' || raw === 'ambocabeza') key = 'ambo';
  else if (raw === 'bingo') key = 'bingo';
  else if (raw === 'doubleLine') key = 'doubleLine';
  else if (raw === 'tripleLine') key = 'tripleLine';
  else if (raw === 'quadrupleLine') key = 'quadrupleLine';
  else if (raw === 'quintupleLine') key = 'quintupleLine';
  else if (raw === 'corners') key = 'corners';
  else if (raw === 'secondLine' || (raw === 'line' && Number(options.mode) === 90 && Number(options.prizeNumber) === 2)) key = 'secondLine';
  const labels = {
    es:{ ambo:'Ambo cabeza', line:'Línea', secondLine:'Segunda línea', doubleLine:'Doble línea', tripleLine:'Triple línea', quadrupleLine:'Cuádruple línea', quintupleLine:'Quinta línea', corners:'Cuatro esquinas', bingo:'Bingo' },
    pt:{ ambo:'Dupla cabeça', line:'Linha', secondLine:'Segunda linha', doubleLine:'Linha dupla', tripleLine:'Linha tripla', quadrupleLine:'Quarta linha', quintupleLine:'Quinta linha', corners:'Quatro cantos', bingo:'Bingo' },
    en:{ ambo:'Two-number head', line:'Line', secondLine:'Second line', doubleLine:'Double line', tripleLine:'Triple line', quadrupleLine:'Fourth line', quintupleLine:'Fifth line', corners:'Four corners', bingo:'Bingo' }
  };
  return labels[lang]?.[key] || labels.es[key];
}

function cleanPersonName(value) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 60); }
function winnerNames(options = {}) {
  const source = Array.isArray(options.winnerNames) ? options.winnerNames : [options.playerName || options.winnerName];
  return [...new Set(source.map(cleanPersonName).filter(Boolean))].slice(0, 8);
}
function joinedNames(names, language = currentLanguage()) {
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  const conjunction = normalizeLanguage(language) === 'en' ? 'and' : normalizeLanguage(language) === 'pt' ? 'e' : 'y';
  if (names.length === 2) return `${names[0]} ${conjunction} ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} ${conjunction} ${names.at(-1)}`;
}

function sourceText(source, language = currentLanguage()) {
  const value = String(source || '').trim();
  if (!value) return '';
  const lang = normalizeLanguage(language);
  if (EVENT_TEXT_ES[value]) return eventText(value, lang);
  const eventMatch = value.match(/\/([^/]+)\.mp3(?:\?.*)?$/i);
  if (eventMatch && EVENT_TEXT_ES[eventMatch[1]]) return eventText(eventMatch[1], lang);
  const num = value.match(/numero_(\d{2})\.mp3/i);
  if (num) return String(Number(num[1]));
  const letter = value.match(/letra_([bingo])\.mp3/i);
  if (letter) return letterText(letter[1], lang);
  return value;
}

class VoicePlayer {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.volume = Math.max(0, Math.min(1, Number(options.volume ?? 1)));
    this.rate = Math.max(.65, Math.min(1.25, Number(options.rate ?? .92)));
    this.pitch = Math.max(.7, Math.min(1.3, Number(options.pitch ?? 1)));
    this.gapMs = Math.max(0, Number(options.gapMs ?? 110));
    this.queue = []; this.running = false; this.cancelToken = 0; this.currentResolve = null;
    this.voiceCache = null; this.voiceCacheLanguage = ''; this.unlocked = false;
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.addEventListener?.('voiceschanged', () => { this.voiceCache = null; this.voiceCacheLanguage = ''; }); } catch {}
    }
    try { window.addEventListener?.('lg:languagechange', () => { this.voiceCache = null; this.voiceCacheLanguage = ''; this.stop(true); }); } catch {}
  }
  supported() { return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'; }
  setEnabled(value) { this.enabled = Boolean(value); if (!this.enabled) this.stop(true); return this.enabled; }
  isUnlocked() { return Boolean(this.enabled && this.supported() && this.unlocked); }
  async unlock() { if (!this.enabled || !this.supported()) return false; this.unlocked = true; this._preferredVoice(); return true; }

  _preferredVoice() {
    const language = currentLanguage();
    if (this.voiceCache && this.voiceCacheLanguage === language) return this.voiceCache;
    let voices = []; try { voices = window.speechSynthesis.getVoices?.() || []; } catch {}
    if (!voices.length) return null;
    const locale = speechLocale(language).toLowerCase(), family = locale.split('-')[0];
    const lang = v => String(v?.lang || '').toLowerCase(); const name = v => String(v?.name || '').toLowerCase();
    const preferred = [
      v => name(v).includes('google') && lang(v).startsWith(locale),
      v => name(v).includes('google') && lang(v).startsWith(family),
      v => lang(v).startsWith(locale),
      v => lang(v).startsWith(family),
      v => name(v).includes('google')
    ];
    this.voiceCache = preferred.map(test => voices.find(test)).find(Boolean) || voices[0] || null;
    this.voiceCacheLanguage = language;
    return this.voiceCache;
  }

  stop(clearQueue = true) {
    this.cancelToken += 1; if (clearQueue) this.queue.length = 0;
    try { window.speechSynthesis?.cancel?.(); } catch {}
    const resolve = this.currentResolve; this.currentResolve = null; try { resolve?.(); } catch {}
  }

  playFiles(paths, options = {}) {
    if (!this.enabled || !this.supported()) return false;
    const language = currentLanguage();
    const texts = (Array.isArray(paths) ? paths : [paths]).map(source => sourceText(source, language)).filter(Boolean);
    if (!texts.length) return false;
    if (options.priority) this.stop(true);
    this.unlocked = true;
    this.queue.push({ texts, language, gapMs: Math.max(0, Number(options.gapMs ?? this.gapMs)) });
    this._pump(); return true;
  }

  playEvent(key, options = {}) { return this.playFiles(key, options); }
  playSequence(keys, options = {}) { return this.playFiles(keys || [], options); }
  playBall(number, mode = 90, options = {}) {
    const n = Number(number); if (!Number.isInteger(n) || n < 1 || n > 90) return false;
    if (Number(mode) === 75) return this.playFiles([letterText(bingoLetter(n), currentLanguage()), String(n)], { ...options, gapMs: options.gapMs ?? 85 });
    return this.playFiles(String(n), options);
  }
  playPrize(type, options = {}) { const key = prizeEvent(type, options); return key ? this.playEvent(key, options) : false; }

  playClaim(type, options = {}) {
    const name = cleanPersonName(options.playerName), language = currentLanguage();
    if (name) {
      const prize = spokenPrizeLabel(type, options, language);
      let called = '';
      if (language === 'pt') called = `${name} cantou ${prize}.`;
      else if (language === 'en') called = `${name} called ${prize}.`;
      else {
        const rawType = String(type || ''), calledWord = rawType === 'corners' ? 'cantadas' : ['line','secondLine','doubleLine','tripleLine','quadrupleLine','quintupleLine'].includes(rawType) ? 'cantada' : 'cantado';
        called = `${prize} ${calledWord} por ${name}.`;
      }
      return this.playFiles([called, eventText('reclamo_verificando', language)], { ...options, priority: options.priority !== false });
    }
    const prize = prizeEvent(type, { ...options, confirmed:false });
    return this.playSequence([prize, 'reclamo_verificando'].filter(Boolean), { ...options, priority: options.priority !== false });
  }

  playConfirmed(type, options = {}) {
    const names = winnerNames(options), language = currentLanguage();
    if (names.length) {
      const prize = spokenPrizeLabel(type, options, language), joined = joinedNames(names, language); let text = '';
      if (language === 'pt') text = String(type || '') === 'bingo' ? (names.length === 1 ? `Bingo confirmado! Ganhou ${names[0]}.` : `Bingo confirmado! Ganharam ${joined}.`) : `Jogada confirmada: ${prize}, para ${joined}.`;
      else if (language === 'en') text = String(type || '') === 'bingo' ? (names.length === 1 ? `Bingo confirmed! ${names[0]} wins.` : `Bingo confirmed! Winners are ${joined}.`) : `Confirmed: ${prize}, for ${joined}.`;
      else if (String(type || '') === 'bingo') text = names.length === 1 ? `¡Bingo confirmado! Ganó ${names[0]}.` : `¡Bingo confirmado! Ganaron ${joined}.`;
      else {
        const key = prizeEvent(type, { ...options, confirmed:true });
        const confirmedText = String(eventText(key, language) || `${prize} confirmado.`).replace(/\.\s*$/, '');
        text = `${confirmedText} para ${joined}.`;
      }
      return this.playFiles(text, { ...options, priority: options.priority !== false });
    }
    const prize = prizeEvent(type, { ...options, confirmed:true });
    return this.playSequence([prize, 'reclamo_valido'].filter(Boolean), { ...options, priority: options.priority !== false });
  }
  playFinal(options = {}) { return this.playSequence(['partida_finalizada','cierre_felicitaciones','cierre_final'], { ...options, priority: options.priority !== false, gapMs: options.gapMs ?? 380 }); }
  preloadBall() { return Promise.resolve([]); }

  async _pump() {
    if (this.running) return; this.running = true;
    try {
      while (this.enabled && this.queue.length) {
        const item = this.queue.shift(), token = this.cancelToken;
        for (let i=0; i<item.texts.length && this.enabled && token===this.cancelToken; i++) {
          await this._speakText(item.texts[i], token, item.language);
          if (token !== this.cancelToken) break;
          if (i < item.texts.length-1 && item.gapMs) await new Promise(resolve => setTimeout(resolve, item.gapMs));
        }
      }
    } finally { this.running = false; if (this.enabled && this.queue.length) this._pump(); }
  }

  async _speakText(text, token = this.cancelToken, language = currentLanguage()) {
    if (!this.enabled || !this.supported() || !text || token !== this.cancelToken) return false;
    return new Promise(resolve => {
      try {
        const utterance = new window.SpeechSynthesisUtterance(String(text));
        utterance.lang = speechLocale(language);
        utterance.rate = this.rate; utterance.pitch = this.pitch; utterance.volume = this.volume;
        const selected = this._preferredVoice(); if (selected) utterance.voice = selected;
        let settled = false; const done = () => { if (settled) return; settled = true; if (this.currentResolve === done) this.currentResolve = null; resolve(true); };
        this.currentResolve = done; utterance.onend = done; utterance.onerror = done; window.speechSynthesis.speak(utterance);
      } catch { resolve(false); }
    });
  }
}

window.BingoVoice = {
  create: options => new VoicePlayer(options), eventPath, numberPath, letterPath, bingoLetter, prizeEvent,
  eventText: (key, language) => eventText(key, language), currentLanguage, speechLocale
};
})();
