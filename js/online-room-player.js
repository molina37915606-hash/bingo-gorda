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
    this.voices = [];
    this.audioPreferenceLoaded = localStorage.getItem('bingoPlayerNumberVoice') !== null;
    this.audioEnabled = localStorage.getItem('bingoPlayerNumberVoice') === 'true';
    this.audioVolume = Number(localStorage.getItem('bingoPlayerNumberVolume') || .9);
  }

  init() {
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
    this.refreshVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => this.refreshVoices();
    if (this.token) this.resume();
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

  async login() {
    const code = $('accessCode').value.trim().toUpperCase();
    $('loginError').innerHTML = '';
    if (code.length < 4) {
      $('loginError').innerHTML = '<div class="error">Escribí el código completo.</div>';
      return;
    }
    try {
      $('loginBtn').disabled = true;
      const data = await this.request('/api/player/login', { method: 'POST', body: JSON.stringify({ code }) });
      this.token = data.token;
      sessionStorage.setItem('bingoOnlineToken', this.token);
      this.applyState(data.state);
      this.connectEvents();
    } catch (error) {
      $('loginError').innerHTML = `<div class="error">${esc(error.message)}</div>`;
    } finally {
      $('loginBtn').disabled = false;
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
    $('waitingPanel').innerHTML = `<h2>Elegí ${player.allowedCardCount} cartón${player.allowedCardCount === 1 ? '' : 'es'}</h2><div class="waitingLead">Estas son tus opciones disponibles (hasta cinco). Una vez confirmadas, nadie más podrá usarlas.</div><div class="choiceCounter">Seleccionados: <span id="choiceCount">${this.selectedOffers.size}</span> de ${player.allowedCardCount}</div><div id="offerGrid" class="offers">${offers.map(card => this.offerHtml(card)).join('')}</div><div class="choiceActions"><button id="clearChoice" class="btn secondary">LIMPIAR</button><button id="confirmChoice" class="btn primary" style="margin:0" ${this.selectedOffers.size === player.allowedCardCount ? '' : 'disabled'}>CONFIRMAR ELECCIÓN</button></div>`;
    $('offerGrid').querySelectorAll('[data-offer]').forEach(button => button.onclick = () => this.toggleOffer(button.dataset.offer));
    $('clearChoice').onclick = () => { this.selectedOffers.clear(); this.renderWaiting(); };
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

  toggleOffer(cardId) {
    const allowed = this.state.player.allowedCardCount;
    if (this.selectedOffers.has(cardId)) this.selectedOffers.delete(cardId);
    else {
      if (this.selectedOffers.size >= allowed) this.selectedOffers.delete([...this.selectedOffers][0]);
      this.selectedOffers.add(cardId);
    }
    this.renderWaiting();
  }

  async confirmChoice() {
    try {
      const data = await this.request('/api/player/choose', { method: 'POST', body: JSON.stringify({ cardIds: [...this.selectedOffers] }) });
      this.selectedOffers.clear();
      this.applyState(data);
      this.showMessage('Cartones confirmados. Ahora esperá que el administrador inicie la partida.', 'notice');
    } catch (error) {
      this.selectedOffers.clear();
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
    const cells = card.grid.flat().map(value => {
      if (value === null) return '<div class="cell blank">·</div>';
      if (value === 'LIBRE') return '<div class="cell free">LIBRE</div>';
      return `<button class="cell number ${marks.has(value) ? 'marked' : ''}" data-number="${value}" aria-label="Número ${value}">${value}</button>`;
    }).join('');
    $('ticketPanel').innerHTML = `<div class="ticketHead"><div><b>Cartón ${esc(card.number)}</b><br><small>${esc(this.state.player.name)}</small></div><small>${marks.size} marcados</small></div><div class="grid mode${card.mode}">${cells}</div><p class="manualHint">Tocá un número para marcarlo. Las bolillas sorteadas no se marcan automáticamente.</p>`;
    $('ticketPanel').querySelectorAll('[data-number]').forEach(button => button.onclick = () => this.toggleMark(card.id, Number(button.dataset.number), !button.classList.contains('marked')));
    $('claimLine').disabled = card.bets?.line === false;
    $('claimBingo').disabled = card.bets?.bingo === false;
  }

  async toggleMark(cardId, number, marked) {
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
