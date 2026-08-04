(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

const PRESENTERS = {
  vero: { name: 'Vero', phrase: 'Revisá bien tus cartones y mucha suerte.', preview: '¡Hola! Soy Vero. ¡Vamos a jugar!', rate: 1.06, pitch: 1.32, intros: ['¡Sale el', '¡Vamos con el', '¡Atención, número'] },
  vivi: { name: 'Vivi', phrase: 'Vamos a divertirnos en esta partida.', preview: '¡Hola! Soy Vivi. ¡Vamos a divertirnos!', rate: 1.06, pitch: 1.32, intros: ['¡Sale el', '¡Vamos con el', '¡Atención, número'] },
  daia: { name: 'Daia', phrase: 'Mucha suerte para todos.', preview: '¡Hola! Soy Daia. Mucha suerte para todos.', rate: 1.06, pitch: 1.32, intros: ['¡Sale el', '¡Vamos con el', '¡Atención, número'] },
  josu: { name: 'Josu', phrase: '¿Listos para jugar?', preview: '¡Buenas! Soy Josu. ¿Listos para jugar?', rate: .98, pitch: .88, intros: ['Seguimos con el', 'En juego el número', 'Sale el'] }
};

class PlayerApp {
  constructor() {
    this.token = sessionStorage.getItem('bingoOnlineToken') || '';
    this.state = null;
    this.activeCardId = sessionStorage.getItem('bingoOnlineCard') || '';
    this.events = null;
    this.pendingMark = new Set();
    this.selectedOffers = new Set();
    this.pendingReservation = new Set();
    this.voices = [];
    this.audioPreferenceLoaded = localStorage.getItem('bingoPlayerNumberVoice') !== null;
    this.audioEnabled = localStorage.getItem('bingoPlayerNumberVoice') === 'true';
    this.audioVolume = Number(localStorage.getItem('bingoPlayerNumberVolume') || .9);
    this.alertSoundEnabled = localStorage.getItem('bingoPlayerAlertSound') !== 'false';
    this.lastPublicClaimKey = '';
    this.lastAdminMessageId = '';
    this.claimOverlayTimer = null;
  }

  async init() {
    $('loginBtn').onclick = () => this.login();
    $('accessCode').addEventListener('keydown', event => { if (event.key === 'Enter') this.login(); });
    $('claimLine').onclick = () => this.claim('line');
    $('claimBingo').onclick = () => this.claim('bingo');
    $('logoutBtn').onclick = () => this.logout();
    $('numberVoiceOn').onchange = event => this.setAudioEnabled(event.target.checked);
    $('numberVoiceVolume').value = String(this.audioVolume);
    $('numberVoiceVolume').oninput = event => {
      this.audioVolume = Number(event.target.value);
      localStorage.setItem('bingoPlayerNumberVolume', String(this.audioVolume));
    };
    $('testNumberVoice').onclick = () => this.testVoice();
    $('autoMarkOn').onchange = event => this.setAutoMark(event.target.checked);
    $('alertSoundOn').checked = this.alertSoundEnabled;
    $('alertSoundOn').onchange = event => {
      this.alertSoundEnabled = Boolean(event.target.checked);
      localStorage.setItem('bingoPlayerAlertSound', String(this.alertSoundEnabled));
      if (this.alertSoundEnabled) this.playAlertSound('line');
    };
    this.refreshVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => this.refreshVoices();
    const params = new URLSearchParams(location.search);
    const directCode = String(params.get('acceso') || params.get('codigo') || params.get('code') || '').trim().toUpperCase();
    const roomCode = String(params.get('sala') || '').trim().toUpperCase();
    if (directCode) {
      this.token = '';
      sessionStorage.removeItem('bingoOnlineToken');
      sessionStorage.removeItem('bingoOnlineCard');
      $('accessCode').value = directCode;
      $('loginBtn').textContent = 'INGRESANDO…';
      await this.login(directCode, roomCode, true);
    } else if (this.token) {
      await this.resume();
    }
    this.keepAliveTimer = setInterval(() => { if (this.state?.active) fetch('/api/ping', { cache: 'no-store' }).catch(() => {}); }, 5 * 60 * 1000);
  }

  async request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(this.token ? { 'X-Player-Token': this.token } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la acción.');
    return data;
  }

  async login(codeOverride = '', roomOverride = '', direct = false) {
    const code = String(codeOverride || $('accessCode').value).trim().toUpperCase();
    const queryRoom = String(new URLSearchParams(location.search).get('sala') || '').trim().toUpperCase();
    const roomCode = String(roomOverride || queryRoom).trim().toUpperCase();
    $('loginError').innerHTML = '';
    if (code.length < 4) {
      $('loginError').innerHTML = '<div class="error">Escribí el código completo.</div>';
      return;
    }
    try {
      $('loginBtn').disabled = true;
      const data = await this.request('/api/player/login', { method: 'POST', body: JSON.stringify({ code, roomCode }) });
      this.token = data.token;
      sessionStorage.setItem('bingoOnlineToken', this.token);
      this.applyState(data.state);
      this.connectEvents();
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete('acceso');
      cleanUrl.searchParams.delete('codigo');
      cleanUrl.searchParams.delete('code');
      history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}`);
    } catch (error) {
      $('loginError').innerHTML = `<div class="error">${esc(error.message)}</div>`;
    } finally {
      $('loginBtn').disabled = false;
      $('loginBtn').textContent = 'ENTRAR A LA SALA';
    }
  }

  async resume() {
    try {
      const data = await this.request('/api/player/state');
      this.applyState(data);
      this.connectEvents();
    } catch {
      this.logout(false);
    }
  }

  connectEvents() {
    this.events?.close();
    this.events = new EventSource(`/api/events?role=player&token=${encodeURIComponent(this.token)}`);
    this.events.addEventListener('state', event => {
      $('connectionMask').classList.remove('show');
      $('connectionStatus').className = 'status on';
      $('connectionStatus').textContent = 'CONECTADO';
      this.applyState(JSON.parse(event.data));
    });
    this.events.addEventListener('logout', () => this.logout());
    this.events.onerror = () => {
      $('connectionStatus').className = 'status off';
      $('connectionStatus').textContent = 'SIN CONEXIÓN';
      $('connectionMask').classList.add('show');
    };
  }

  applyState(data) {
    if (!data?.active) {
      $('connectionMask').classList.add('show');
      return;
    }
    const previousCount = this.state?.game?.drawn?.length;
    this.state = data;
    if (data.status === 'waiting' && !data.player.selectionConfirmed) this.selectedOffers = new Set(data.player.reservedCardIds || []);
    else this.selectedOffers.clear();
    const cards = data.player.cards || [];
    if (!cards.some(card => card.id === this.activeCardId)) this.activeCardId = cards[0]?.id || '';
    sessionStorage.setItem('bingoOnlineCard', this.activeCardId);
    if (!this.audioPreferenceLoaded) {
      this.audioEnabled = Boolean(data.roomSettings?.playerAudioDefault);
      localStorage.setItem('bingoPlayerNumberVoice', String(this.audioEnabled));
      this.audioPreferenceLoaded = true;
    }
    $('loginView').classList.add('hidden');
    $('gameView').classList.remove('hidden');
    this.render();
    this.renderPublicClaim();
    const currentCount = data.game.drawn.length;
    if (previousCount !== undefined && data.status === 'playing' && currentCount > previousCount && data.game.lastBall != null) {
      this.speakBall(data.game.lastBall);
    }
  }

  render() {
    const data = this.state;
    if (!data) return;
    $('playerName').textContent = data.player.name;
    $('roomInfo').textContent = `Sala ${data.roomCode} · Juego ${String(data.game.number).padStart(4, '0')} · Bingo ${data.game.mode}`;
    this.renderPresenter();
    if (data.status === 'waiting') this.renderWaiting();
    else this.renderPlaying();
    this.renderNotice();
  }

  renderPresenter() {
    const id = this.state.game.presenter || 'vero';
    const presenter = PRESENTERS[id] || PRESENTERS.vero;
    $('presenterImage').src = `assets/${id}.png`;
    $('presenterName').textContent = `${presenter.name} te acompaña`;
    $('presenterPhrase').textContent = presenter.phrase;
    const allowed = this.state.roomSettings?.playerAudioAllowed !== false;
    $('audioControls').classList.toggle('hidden', !allowed);
    $('numberVoiceOn').checked = allowed && this.audioEnabled;
    $('numberVoiceOn').disabled = !allowed;
    $('numberVoiceVolume').disabled = !allowed || !this.audioEnabled;
    $('testNumberVoice').disabled = !allowed;
    $('autoMarkOn').checked = Boolean(this.state.player.autoMark);
    $('autoMarkOn').disabled = false;
    $('alertSoundOn').checked = this.alertSoundEnabled;
    this.renderAdminMessage();
  }

  renderAdminMessage() {
    const bubble = $('adminSpeechBubble');
    const message = this.state?.adminMessage;
    if (!bubble) return;
    if (!message?.text) {
      bubble.classList.add('hidden');
      bubble.classList.remove('show');
      this.lastAdminMessageId = '';
      return;
    }
    $('adminSpeechAuthor').textContent = `${(PRESENTERS[this.state.game.presenter] || PRESENTERS.vero).name} dice:`;
    $('adminSpeechText').textContent = message.text;
    bubble.classList.remove('hidden');
    if (message.id !== this.lastAdminMessageId) {
      bubble.classList.remove('show');
      void bubble.offsetWidth;
      bubble.classList.add('show');
      this.lastAdminMessageId = message.id;
    } else {
      bubble.classList.add('show');
    }
  }

  renderWaiting() {
    $('playPanel').classList.add('hidden');
    $('waitingPanel').classList.remove('hidden');
    $('connectionStatus').className = 'status wait';
    $('connectionStatus').textContent = 'EN ESPERA';
    const player = this.state.player;
    if (player.selectionConfirmed) {
      $('waitingPanel').innerHTML = `<div class="waitingConfirmed"><h2 style="margin:0 0 6px">Cartones confirmados</h2><div>La partida todavía no comenzó. Esperá la orden del administrador.</div><div class="chosenList">${player.cards.map(card => `<span class="chosenBadge">Cartón ${esc(card.number)}</span>`).join('')}</div><button id="changeChoice" class="btn secondary" style="margin-top:13px">CAMBIAR ELECCIÓN</button></div>`;
      $('changeChoice').onclick = () => this.releaseChoice();
      return;
    }
    const offers = player.offeredCards || [];
    const valid = new Set(offers.map(card => card.id));
    this.selectedOffers = new Set([...this.selectedOffers].filter(id => valid.has(id)));
    $('waitingPanel').innerHTML = `<h2>Elegí ${player.allowedCardCount} cartón${player.allowedCardCount === 1 ? '' : 'es'}</h2><div class="waitingLead">Estas son tus opciones disponibles (hasta diez). Al tocar una, queda reservada para vos durante ${this.state.player.reservationTtlSeconds || 120} segundos y desaparece de las opciones de los demás.</div><div class="choiceCounter">Seleccionados: <span id="choiceCount">${this.selectedOffers.size}</span> de ${player.allowedCardCount}</div><div id="offerGrid" class="offers">${offers.map(card => this.offerHtml(card)).join('')}</div><div class="choiceActions"><button id="clearChoice" class="btn secondary">LIMPIAR</button><button id="confirmChoice" class="btn primary" style="margin:0" ${this.selectedOffers.size === player.allowedCardCount ? '' : 'disabled'}>CONFIRMAR ELECCIÓN</button></div>`;
    $('offerGrid').querySelectorAll('[data-offer]').forEach(button => button.onclick = () => this.toggleOffer(button.dataset.offer));
    $('clearChoice').onclick = () => this.clearReservations();
    $('confirmChoice').onclick = () => this.confirmChoice();
  }

  offerHtml(card) {
    const selected = this.selectedOffers.has(card.id);
    return `<button class="offer ${selected ? 'selected' : ''}" data-offer="${esc(card.id)}"><div class="offerHead"><b>Cartón ${esc(card.number)}</b><span>${selected ? 'ELEGIDO' : 'TOCAR PARA ELEGIR'}</span></div>${this.miniTicket(card)}</button>`;
  }

  miniTicket(card) {
    const cells = card.grid.flat().map(value => {
      if (value === null) return '<div class="miniCell blank">·</div>';
      if (value === 'LIBRE') return '<div class="miniCell free">LIBRE</div>';
      return `<div class="miniCell">${value}</div>`;
    }).join('');
    return `<div class="miniGrid mode${card.mode}">${cells}</div>`;
  }

  async toggleOffer(cardId) {
    if (this.pendingReservation.has(cardId)) return;
    const reserve = !this.selectedOffers.has(cardId);
    if (reserve && this.selectedOffers.size >= this.state.player.allowedCardCount) {
      this.showMessage(`Solo podés elegir ${this.state.player.allowedCardCount} cartón${this.state.player.allowedCardCount === 1 ? '' : 'es'}. Desmarcá uno primero.`, 'error');
      return;
    }
    this.pendingReservation.add(cardId);
    try {
      const data = await this.request('/api/player/reserve', { method: 'POST', body: JSON.stringify({ cardId, reserve }) });
      this.applyState(data);
      if (reserve) this.showMessage('Cartón reservado para vos. Confirmá la elección antes de que venza la reserva.', 'notice');
    } catch (error) {
      this.showMessage(error.message, 'error');
      try { this.applyState(await this.request('/api/player/state')); } catch {}
    } finally {
      this.pendingReservation.delete(cardId);
    }
  }

  async clearReservations() {
    try {
      this.applyState(await this.request('/api/player/release', { method: 'POST', body: '{}' }));
      this.showMessage('Reservas liberadas.', 'notice');
    } catch (error) { this.showMessage(error.message, 'error'); }
  }

  async confirmChoice() {
    try {
      const data = await this.request('/api/player/choose', { method: 'POST', body: JSON.stringify({ cardIds: [...this.selectedOffers] }) });
      this.applyState(data);
      this.showMessage('Cartones confirmados. Ahora esperá que el administrador inicie la partida.', 'notice');
    } catch (error) {
      this.showMessage(error.message, 'error');
      try { this.applyState(await this.request('/api/player/state')); } catch {}
    }
  }

  async releaseChoice() {
    if (!confirm('¿Cambiar tus cartones? Los elegidos volverán a quedar disponibles.')) return;
    try {
      this.applyState(await this.request('/api/player/release', { method: 'POST', body: '{}' }));
    } catch (error) { this.showMessage(error.message, 'error'); }
  }

  renderPlaying() {
    $('waitingPanel').classList.add('hidden');
    $('playPanel').classList.remove('hidden');
    $('connectionStatus').className = 'status on';
    $('connectionStatus').textContent = 'JUGANDO';
    const data = this.state;
    $('lastBall').textContent = data.game.lastBall ?? '—';
    $('ballCount').textContent = `${data.game.drawn.length} bolillas sorteadas`;
    $('recent').innerHTML = [...data.game.drawn].reverse().slice(0, 6).map(number => `<i>${number}</i>`).join('');
    this.renderTabs();
    this.renderTicket();
  }

  renderTabs() {
    const cards = this.state.player.cards || [];
    $('cardTabs').innerHTML = cards.map(card => `<button data-card="${esc(card.id)}" class="${card.id === this.activeCardId ? 'active' : ''}">CARTÓN ${esc(card.number)}</button>`).join('');
    $('cardTabs').querySelectorAll('button').forEach(button => button.onclick = () => {
      this.activeCardId = button.dataset.card;
      sessionStorage.setItem('bingoOnlineCard', this.activeCardId);
      this.renderTabs();
      this.renderTicket();
    });
  }

  renderTicket() {
    const card = this.state.player.cards.find(item => item.id === this.activeCardId);
    if (!card) {
      $('ticketPanel').innerHTML = '<div class="error">No hay un cartón elegido.</div>';
      $('claimLine').disabled = $('claimBingo').disabled = true;
      return;
    }
    const marks = new Set((this.state.player.marks?.[card.id] || []).map(Number));
    const autoMark = Boolean(this.state.player.autoMark);
    const cells = card.grid.flat().map(value => {
      if (value === null) return '<div class="cell blank">·</div>';
      if (value === 'LIBRE') return '<div class="cell free">LIBRE</div>';
      return `<button class="cell number ${marks.has(value) ? 'marked' : ''}" data-number="${value}" aria-label="Número ${value}" ${autoMark ? 'disabled' : ''}>${value}</button>`;
    }).join('');
    const hint = autoMark
      ? 'Marcado automático activado: todos tus cartones se actualizan con las bolillas oficiales.'
      : 'Marcado manual: tocá cada número cuando salga. Podés activar el automarcado arriba.';
    $('ticketPanel').innerHTML = `<div class="ticketHead"><div><b>Cartón ${esc(card.number)}</b><br><small>${esc(this.state.player.name)}</small></div><small>${marks.size} marcados · ${autoMark ? 'AUTO' : 'MANUAL'}</small></div><div class="grid mode${card.mode}">${cells}</div><p class="manualHint">${hint}</p>`;
    if (!autoMark) $('ticketPanel').querySelectorAll('[data-number]').forEach(button => button.onclick = () => this.toggleMark(card.id, Number(button.dataset.number), !button.classList.contains('marked')));
    $('claimLine').disabled = card.bets?.line === false;
    $('claimBingo').disabled = card.bets?.bingo === false;
  }

  async toggleMark(cardId, number, marked) {
    if (this.state?.player.autoMark) return;
    const key = `${cardId}:${number}`;
    if (this.pendingMark.has(key)) return;
    this.pendingMark.add(key);
    try {
      this.applyState(await this.request('/api/player/mark', { method: 'POST', body: JSON.stringify({ cardId, number, marked }) }));
    } catch (error) {
      this.showMessage(error.message, 'error');
    } finally {
      this.pendingMark.delete(key);
    }
  }

  async setAutoMark(enabled) {
    if (!this.state?.active) return;
    $('autoMarkOn').disabled = true;
    try {
      const data = await this.request('/api/player/automark', { method: 'POST', body: JSON.stringify({ enabled }) });
      this.applyState(data);
      this.showMessage(enabled ? 'Automarcado activado en todos tus cartones.' : 'Automarcado desactivado. Ahora podés marcar manualmente.', 'notice');
    } catch (error) {
      $('autoMarkOn').checked = Boolean(this.state?.player.autoMark);
      this.showMessage(error.message, 'error');
    } finally {
      $('autoMarkOn').disabled = false;
    }
  }

  async claim(type) {
    const card = this.state?.player.cards.find(item => item.id === this.activeCardId);
    if (!card) return;
    const label = type === 'line' ? 'línea' : 'bingo';
    if (!confirm(`¿Cantar ${label} con el cartón ${card.number}? El sorteo se pausará para que el administrador lo revise.`)) return;
    try {
      $('claimLine').disabled = $('claimBingo').disabled = true;
      const claim = await this.request('/api/player/claim', { method: 'POST', body: JSON.stringify({ cardId: card.id, type }) });
      this.showMessage(`${label.toUpperCase()} enviado. El administrador está comparando tu marcado con el control oficial.`, 'notice');
      if (!claim.officialValid) this.showMessage(`El sistema detectó que todavía no hay ${label} oficial.`, 'error');
    } catch (error) {
      this.showMessage(error.message, 'error');
    } finally {
      this.renderTicket();
    }
  }

  setAudioEnabled(enabled) {
    this.audioEnabled = Boolean(enabled);
    localStorage.setItem('bingoPlayerNumberVoice', String(this.audioEnabled));
    $('numberVoiceVolume').disabled = !this.audioEnabled;
    if (this.audioEnabled) this.testVoice();
  }

  refreshVoices() {
    this.voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  }

  preferredVoice(presenterId) {
    const spanish = this.voices.filter(voice => /^es([-_]|$)/i.test(voice.lang) || /spanish|español|espanol/i.test(voice.name));
    if (presenterId === 'josu') return spanish.find(voice => /male|mascul|hombre|jorge|diego|pablo|carlos|juan|luis|miguel/i.test(voice.name)) || spanish[1] || spanish[0] || this.voices[0];
    return spanish.find(voice => /female|femen|mujer|sofia|paulina|paloma|ximena|laura|lucia|maria|camila|valentina/i.test(voice.name)) || spanish[0] || this.voices[0];
  }

  speak(text) {
    if (!this.audioEnabled || this.state?.roomSettings?.playerAudioAllowed === false || !window.speechSynthesis) return;
    const id = this.state?.game?.presenter || 'vero';
    const profile = PRESENTERS[id] || PRESENTERS.vero;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = this.preferredVoice(id);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = 'es-AR';
    utterance.rate = profile.rate;
    utterance.pitch = profile.pitch;
    utterance.volume = this.audioVolume;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  speakBall(number) {
    const id = this.state?.game?.presenter || 'vero';
    const profile = PRESENTERS[id] || PRESENTERS.vero;
    const intro = profile.intros[Math.floor(Math.random() * profile.intros.length)];
    this.speak(`${intro} ${number}`);
  }

  testVoice() {
    const id = this.state?.game?.presenter || 'vero';
    this.speak((PRESENTERS[id] || PRESENTERS.vero).preview);
  }

  renderPublicClaim() {
    const claims = this.state?.publicClaims || [];
    const claim = claims.at(-1);
    if (!claim) return;
    const key = `${claim.id}:${claim.status}`;
    if (key === this.lastPublicClaimKey) return;
    this.lastPublicClaimKey = key;
    const label = claim.type === 'bingo' ? 'BINGO' : 'LÍNEA';
    if (claim.status === 'pending') {
      this.showClaimOverlay({
        kind: claim.type,
        icon: claim.type === 'bingo' ? '🎉' : '🔔',
        title: `${claim.playerName} cantó ${label}`,
        text: `Cartón ${claim.cardNumber}. El sorteo está en pausa mientras el administrador verifica.`,
        duration: 6500
      });
      this.playAlertSound(claim.type);
      return;
    }
    if (claim.status === 'confirmed') {
      this.showClaimOverlay({
        kind: 'confirmed',
        icon: '🏆',
        title: `${label} VÁLIDO`,
        text: `Ganador: ${claim.playerName} · Cartón ${claim.cardNumber}.`,
        duration: 6500
      });
      this.playAlertSound('confirmed');
      return;
    }
    this.showClaimOverlay({
      kind: 'rejected',
      icon: '✖',
      title: 'RECLAMO INVÁLIDO',
      text: `${claim.playerName} · Cartón ${claim.cardNumber}. La partida puede continuar.`,
      duration: 4500
    });
    this.playAlertSound('rejected');
  }

  showClaimOverlay({ kind, icon, title, text, duration }) {
    const overlay = $('publicClaimOverlay');
    const popup = $('publicClaimPopup');
    popup.className = `claimPopup ${kind}`;
    $('publicClaimIcon').textContent = icon;
    $('publicClaimTitle').textContent = title;
    $('publicClaimText').textContent = text;
    $('publicClaimConfetti').classList.toggle('hidden', kind === 'rejected');
    overlay.classList.add('show');
    clearTimeout(this.claimOverlayTimer);
    this.claimOverlayTimer = setTimeout(() => overlay.classList.remove('show'), duration || 5000);
    overlay.onclick = () => overlay.classList.remove('show');
  }

  playAlertSound(kind) {
    if (!this.alertSoundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const sequence = kind === 'bingo' || kind === 'confirmed'
        ? [523, 659, 784, 1047]
        : kind === 'rejected' ? [330, 247] : [660, 880];
      sequence.forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = kind === 'rejected' ? 'square' : 'sine';
        oscillator.frequency.value = frequency;
        const start = ctx.currentTime + index * .13;
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.16, start + .025);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .18);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + .2);
      });
      setTimeout(() => ctx.close().catch(() => {}), 1300);
    } catch {}
  }

  renderNotice() {
    const notices = this.state?.player.notices || [];
    const latest = notices.at(-1);
    if (!latest) return;
    const key = `noticeSeen:${latest.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    this.showMessage(latest.text, latest.result === 'confirmed' ? 'notice' : 'error');
  }

  showMessage(text, kind = 'notice') {
    $('playerNotice').innerHTML = `<div class="${kind}">${esc(text)}</div>`;
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => { $('playerNotice').innerHTML = ''; }, 9000);
  }

  logout(reload = true) {
    this.events?.close();
    this.token = '';
    this.state = null;
    sessionStorage.removeItem('bingoOnlineToken');
    sessionStorage.removeItem('bingoOnlineCard');
    if (reload) location.reload();
    else {
      $('gameView').classList.add('hidden');
      $('loginView').classList.remove('hidden');
    }
  }
}

window.addEventListener('DOMContentLoaded', () => new PlayerApp().init());
})();
