(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

class PlayerApp {
  constructor() {
    this.token = sessionStorage.getItem('bingoOnlineToken') || '';
    this.state = null;
    this.activeCardId = sessionStorage.getItem('bingoOnlineCard') || '';
    this.events = null;
    this.pendingMark = new Set();
  }

  init() {
    $('loginBtn').onclick = () => this.login();
    $('accessCode').addEventListener('keydown', event => { if (event.key === 'Enter') this.login(); });
    $('claimLine').onclick = () => this.claim('line');
    $('claimBingo').onclick = () => this.claim('bingo');
    $('logoutBtn').onclick = () => this.logout();
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
    this.state = data;
    const cards = data.player.cards || [];
    if (!cards.some(card => card.id === this.activeCardId)) this.activeCardId = cards[0]?.id || '';
    sessionStorage.setItem('bingoOnlineCard', this.activeCardId);
    $('loginView').classList.add('hidden');
    $('gameView').classList.remove('hidden');
    this.render();
  }

  render() {
    const data = this.state;
    if (!data) return;
    $('playerName').textContent = data.player.name;
    $('roomInfo').textContent = `Sala ${data.roomCode} · Juego ${String(data.game.number).padStart(4, '0')} · Bingo ${data.game.mode}`;
    $('lastBall').textContent = data.game.lastBall ?? '—';
    $('ballCount').textContent = `${data.game.drawn.length} bolillas sorteadas`;
    $('recent').innerHTML = [...data.game.drawn].reverse().slice(0, 6).map(number => `<i>${number}</i>`).join('');
    this.renderTabs();
    this.renderTicket();
    this.renderNotice();
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
      $('ticketPanel').innerHTML = '<div class="error">No hay un cartón asignado.</div>';
      return;
    }
    const marks = new Set((this.state.player.marks?.[card.id] || []).map(Number));
    const cells = card.grid.flat().map(value => {
      if (value === null) return '<div class="cell blank">·</div>';
      if (value === 'LIBRE') return '<div class="cell free">LIBRE</div>';
      return `<button class="cell number ${marks.has(value) ? 'marked' : ''}" data-number="${value}" aria-label="Número ${value}">${value}</button>`;
    }).join('');
    $('ticketPanel').innerHTML = `<div class="ticketHead"><div><b>Cartón ${esc(card.number)}</b><br><small>${esc(card.name)}</small></div><small>${marks.size} marcados</small></div><div class="grid mode${card.mode}">${cells}</div><p class="manualHint">Tocá un número para marcarlo. Volvé a tocarlo para desmarcarlo. Las bolillas sorteadas no se marcan automáticamente.</p>`;
    $('ticketPanel').querySelectorAll('[data-number]').forEach(button => button.onclick = () => this.toggleMark(card.id, Number(button.dataset.number), !button.classList.contains('marked')));
    $('claimLine').disabled = card.bets?.line === false;
    $('claimBingo').disabled = card.bets?.bingo === false;
  }

  async toggleMark(cardId, number, marked) {
    const key = `${cardId}:${number}`;
    if (this.pendingMark.has(key)) return;
    this.pendingMark.add(key);
    const button = $(`number-${number}`);
    try {
      const data = await this.request('/api/player/mark', { method: 'POST', body: JSON.stringify({ cardId, number, marked }) });
      this.applyState(data);
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
      if (!claim.officialValid) this.showMessage(`El sistema detectó que todavía no hay ${label} oficial. El administrador verá igualmente la comparación.`, 'error');
    } catch (error) {
      this.showMessage(error.message, 'error');
    } finally {
      this.renderTicket();
    }
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
