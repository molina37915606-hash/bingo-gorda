(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
const Scripts = window.BingoPresenterScripts || {};
const PRESENTERS = Scripts.profiles || {};

class PlayerApp {
  constructor() {
    this.token = localStorage.getItem('bingoOnlineToken') || '';
    this.deviceId = localStorage.getItem('bingoPlayerDeviceId') || this.makeDeviceId();
    localStorage.setItem('bingoPlayerDeviceId', this.deviceId);
    this.state = null;
    this.activeCardId = localStorage.getItem('bingoOnlineCard') || '';
    this.events = null;
    this.selectedOffers = new Set();
    this.pendingReservation = new Set();
    this.pendingMark = new Set();
    this.voices = [];
    this.phrases = Scripts.PhraseEngine ? new Scripts.PhraseEngine() : { ball:(id,n)=>`Número ${n}`, event:()=>'' };
    this.audioPreferenceLoaded = localStorage.getItem('bingoPlayerSound') !== null;
    this.audioEnabled = localStorage.getItem('bingoPlayerSound') !== 'false';
    this.alertsEnabled = localStorage.getItem('bingoPlayerAlerts') !== 'false';
    this.audioVolume = .92;
    this.lastPublicClaimKey = '';
    this.lastAdminMessageId = '';
    this.lastTestEventId = '';
    this.lastPrizeReadyKey = '';
    this.lastTransitionKey = '';
    this.lastStatus = '';
    this.claimOverlayTimer = null;
    this.messageTimer = null;
    this.sequenceTimer = null;
    this.finalSequenceTimer = null;
    this.lastFinalSequenceKey = '';
    this.transferPollTimer = null;
    this.pendingTransfer = null;
    this.pendingPlayerName = '';
    this.lastResult = null;
    this.theme = localStorage.getItem('bingoPlayerTheme') === 'day' ? 'day' : 'night';
    this.focusMode = false;
    this.fullscreenApiActive = false;
    this.guideStep = 0;
    this.finalOverlayDismissedFor = '';
    this.roomClosedShown = false;
    this.guideSteps = [
      { icon:'☀️', title:'Tema claro o nocturno', text:'Tocá el icono del sol o la luna para cambiar la apariencia de la pantalla cuando quieras.' },
      { icon:'👤', title:'Tu nombre y la sala', text:'En la parte superior aparecen tu nombre, el número de sala, el número de juego y la modalidad.' },
      { icon:'🧾', title:'Cambiar de cartón', text:'Usá las pestañas de cartones para pasar de uno a otro sin perder ninguna marca.' },
      { icon:'🔢', title:'Ver números', text:'El botón Ver números abre todos los números sorteados y también muestra el orden de salida.' },
      { icon:'🔊', title:'Sonido y avisos', text:'El parlante controla la voz y los sonidos. La campana controla los avisos visuales y la vibración.' },
      { icon:'✓', title:'Automarcar', text:'Automarcar completa tus cartones con las bolillas oficiales. El marcado manual solo está disponible con hasta 10 jugadores y 40 cartones activos.' },
      { icon:'🍀', title:'Cambiar mi suerte', text:'Durante la partida podés elegir otro presentador desde Mi suerte. Cambia solo la voz que escuchás en tu celular.' },
      { icon:'🏆', title:'Tenés que cantar', text:'Aunque el sistema marque solo o active una alarma, no avisa al administrador. Tocá el botón del premio correspondiente para enviar el reclamo.' },
      { icon:'📄', title:'Resultado oficial', text:'Cuando termine el sorteo aparecerá en el centro el botón Descargar resultados con el acta oficial.' },
      { icon:'⚠️', title:'Recordatorio importante', text:'Marcar no es cantar. El reclamo solo es válido cuando tocás manualmente el botón del premio.' }
    ];
  }

  makeDeviceId() {
    return `device_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  }

  async init() {
    this.injectChatUi();
    $('loginBtn').onclick = () => this.login();
    $('lastResultBtn').onclick = () => this.downloadLastPublicResult();
    $('accessCode').addEventListener('keydown', event => { if (event.key === 'Enter') this.login(); });
    $('claimAmbo').onclick = () => this.claim('ambo');
    $('claimCorners').onclick = () => this.claim('corners');
    $('claimLine').onclick = () => this.claim('line');
    $('claimDoubleLine').onclick = () => this.claim('doubleLine');
    $('claimTripleLine').onclick = () => this.claim('tripleLine');
    $('claimBingo').onclick = () => this.claim('bingo');
    $('logoutBtn').onclick = () => this.logout();
    $('themeToggle').onclick = () => this.toggleTheme();
    $('soundToggle').onclick = () => this.setAudioEnabled(!this.audioEnabled);
    $('alertsToggle').onclick = () => this.setAlertsEnabled(!this.alertsEnabled);
    $('autoMarkToggle').onclick = () => this.setAutoMark(!Boolean(this.state?.player?.autoMark));
    $('changeLuckBtn').onclick = () => this.openPresenterChoice();
    $('helpBtn').onclick = () => this.openGuide(true);
    $('closeGuideBtn').onclick = () => this.closeGuide();
    $('guideNoBtn').onclick = () => this.closeGuide();
    $('guideYesBtn').onclick = () => this.startGuide();
    $('guidePrevBtn').onclick = () => { this.guideStep = Math.max(0, this.guideStep - 1); this.renderGuideStep(); };
    $('guideNextBtn').onclick = () => { if (this.guideStep >= this.guideSteps.length - 1) this.closeGuide(); else { this.guideStep++; this.renderGuideStep(); } };
    $('requestTransferBtn').onclick = () => this.requestDeviceTransfer();
    $('cancelTransferBtn').onclick = () => this.closeTransfer();
    $('showDrawnBtn').onclick = () => this.openDrawnNumbers();
    $('closeDrawnBtn').onclick = () => this.closeModal('drawnOverlay');
    $('showWinnerBtn').onclick = () => this.openWinnerCard();
    $('resultsBtn').onclick = () => this.downloadResults();
    $('finalDownloadBtn').onclick = () => this.downloadResults();
    $('finalBackBtn').onclick = () => this.backToFinalCards();
    $('partialKeepChoosingBtn').onclick = () => this.closeModal('partialChoiceOverlay');
    $('partialContinueBtn').onclick = () => { this.closeModal('partialChoiceOverlay'); this.confirmChoice(true); };
    $('closePresenterChoiceBtn').onclick = () => this.closeModal('presenterChoiceOverlay');
    $('roomClosedBtn').onclick = () => this.logout(true);
    $('closeWinnerBtn').onclick = () => this.closeModal('winnerOverlay');
    $('fullScreenBtn').onclick = () => this.setFocusMode(true);
    $('exitFocusBtn').onclick = () => this.setFocusMode(false);
    ['drawnOverlay','winnerOverlay','partialChoiceOverlay','presenterChoiceOverlay'].forEach(id => $(id).addEventListener('click', event => { if (event.target === $(id)) this.closeModal(id); }));
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      this.closeModal('drawnOverlay'); this.closeModal('winnerOverlay'); this.closeModal('partialChoiceOverlay'); this.closeModal('presenterChoiceOverlay'); this.closeGuide();
      if (this.focusMode) this.setFocusMode(false);
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && this.fullscreenApiActive) {
        this.fullscreenApiActive = false; this.focusMode = false; document.body.classList.remove('focusMode');
      }
    });
    this.applyTheme(); this.updateQuickTools();
    await this.loadPublicInfo();
    this.refreshVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => this.refreshVoices();

    const params = new URLSearchParams(location.search);
    const directCode = String(params.get('acceso') || params.get('codigo') || params.get('code') || '').trim().toUpperCase();
    const roomCode = String(params.get('sala') || '').trim().toUpperCase();
    if (directCode) {
      $('accessCode').value = directCode;
      await this.login(directCode, roomCode);
    } else if (this.token) await this.resume();

    this.keepAliveTimer = setInterval(() => { if (this.state?.active) fetch('/api/ping', { cache:'no-store' }).catch(() => {}); }, 5 * 60 * 1000);
    this.assignmentClockTimer = setInterval(() => this.updateAssignmentCountdown(), 1000);
  }

  injectChatUi() {
    if ($('playerChatDock')) return;
    const style = document.createElement('style');
    style.textContent = `
      .playerChatDock{position:fixed;right:12px;bottom:12px;z-index:65}.playerChatToggle{border:0;border-radius:999px;padding:12px 16px;background:#5a167b;color:#fff;font-weight:900;box-shadow:0 10px 35px #0008}.playerChatPanel{display:none;width:min(360px,calc(100vw - 18px));height:min(520px,72vh);background:#11182a;border:1px solid #ffffff2d;border-radius:18px;overflow:hidden;box-shadow:0 25px 70px #000b}.playerChatPanel.show{display:grid;grid-template-rows:auto 1fr auto auto}.playerChatPanel header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#5a167b;color:#fff}.playerChatPanel header button{border:0;background:transparent;color:#fff;font-size:24px}.playerChatMessages{overflow:auto;padding:11px;display:grid;gap:8px;background:#080d18}.playerChatMessage{padding:9px 10px;border-radius:11px;background:#19233a;color:#fff}.playerChatMessage.admin{background:#3b2454;border:1px solid #9867b2}.playerChatMessage small{display:flex;justify-content:space-between;gap:8px;color:#b7c1d5;margin-bottom:4px}.playerChatMessage p{margin:0;word-break:break-word}.playerChatPanel textarea{resize:none;min-height:58px;padding:10px;border:0;border-top:1px solid #ffffff20;background:#121b30;color:#fff}.playerChatSend{border:0;padding:12px;background:#ffca2f;color:#1b1405;font-weight:1000}.playerChatNotice{padding:8px 10px;background:#3f2c0a;color:#ffe39a;font-size:12px}.playerChatBadge:not(:empty){display:inline-grid;place-items:center;min-width:20px;height:20px;border-radius:999px;background:#e83e87;margin-left:5px}.day .playerChatPanel{background:#fff;border-color:#d8cde1}.day .playerChatMessages{background:#f4eff7}.day .playerChatMessage{background:#e6deed;color:#23182b}.day .playerChatPanel textarea{background:#fff;color:#23182b}
      @media(max-width:700px){.playerChatDock{right:7px;bottom:7px}.playerChatPanel{height:68vh}}
    `;
    document.head.appendChild(style);
    const dock = document.createElement('aside');
    dock.id = 'playerChatDock'; dock.className = 'playerChatDock';
    dock.innerHTML = `<button id="playerChatToggle" class="playerChatToggle">💬 CHAT <span id="playerChatBadge" class="playerChatBadge"></span></button><section id="playerChatPanel" class="playerChatPanel"><header><b>CHAT PÚBLICO</b><button id="playerChatClose">×</button></header><div id="playerChatMessages" class="playerChatMessages"></div><div id="playerChatNotice" class="playerChatNotice hidden"></div><textarea id="playerChatInput" maxlength="160" placeholder="Escribí un mensaje"></textarea><button id="playerChatSend" class="playerChatSend">ENVIAR</button></section>`;
    document.body.appendChild(dock);
    $('playerChatToggle').onclick = () => { $('playerChatPanel').classList.toggle('show'); $('playerChatBadge').textContent = ''; this.renderChat(); };
    $('playerChatClose').onclick = () => $('playerChatPanel').classList.remove('show');
    $('playerChatSend').onclick = () => this.sendChat();
    $('playerChatInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.sendChat(); } });
  }

  chatTime(value) {
    try { return new Date(value).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }); }
    catch { return ''; }
  }

  renderChat(incoming = false) {
    const dock = $('playerChatDock');
    if (!dock) return;
    dock.style.display = this.state?.active ? '' : 'none';
    const chat = this.state?.chat || { messages: [] };
    const host = $('playerChatMessages');
    host.innerHTML = (chat.messages || []).map(message => `<article class="playerChatMessage ${message.role === 'admin' ? 'admin' : ''}"><small><b>${esc(message.name)}</b><span>${esc(this.chatTime(message.createdAt))}</span></small><p>${esc(message.text)}</p></article>`).join('') || '<div style="text-align:center;color:#aeb8cd;padding:25px">Todavía no hay mensajes.</div>';
    if (incoming || $('playerChatPanel').classList.contains('show')) host.scrollTop = host.scrollHeight;
    const blocked = chat.enabled === false || chat.locked || chat.muted;
    $('playerChatInput').disabled = blocked;
    $('playerChatSend').disabled = blocked;
    const notice = $('playerChatNotice');
    notice.classList.toggle('hidden', !blocked);
    notice.textContent = chat.enabled === false ? 'El chat está deshabilitado.' : chat.muted ? 'El administrador silenció tu participación.' : chat.locked ? 'El chat está pausado temporalmente.' : '';
    if (incoming && !$('playerChatPanel').classList.contains('show')) $('playerChatBadge').textContent = String(Math.min(99, Number($('playerChatBadge').textContent || 0) + 1));
  }

  async sendChat() {
    const input = $('playerChatInput');
    const text = String(input?.value || '').trim();
    if (!text) return;
    try { await this.request('/api/player/chat', { method:'POST', body:JSON.stringify({ text }) }); input.value = ''; }
    catch (error) { alert(error.message); }
  }

  async loadPublicInfo() {
    try {
      const response = await fetch('/api/info', { cache:'no-store' });
      const data = await response.json();
      this.lastResult = data.lastResult || null;
      $('lastResultBtn').classList.toggle('hidden', !this.lastResult);
      if (this.lastResult) $('lastResultBtn').textContent = 'DESCARGAR ÚLTIMO RESULTADO';
    } catch { $('lastResultBtn').classList.add('hidden'); }
  }

  async request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type':'application/json', ...(this.token ? { 'X-Player-Token':this.token } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || data.message || 'No se pudo completar la acción.'); error.status = response.status; error.data = data; throw error; }
    return data;
  }

  async login(codeOverride = '', roomOverride = '') {
    const code = String(codeOverride || $('accessCode').value).trim().toUpperCase();
    const queryRoom = String(new URLSearchParams(location.search).get('sala') || '').trim().toUpperCase();
    const roomCode = String(roomOverride || queryRoom).trim().toUpperCase();
    $('loginError').innerHTML = '';
    if (code.length < 4) return $('loginError').innerHTML = '<div class="error">Escribí el código completo.</div>';
    try {
      $('loginBtn').disabled = true;
      $('loginBtn').textContent = 'INGRESANDO…';
      const data = await this.request('/api/player/login', { method:'POST', body:JSON.stringify({ code, roomCode, deviceId:this.deviceId }) });
      this.acceptLogin(data);
    } catch (error) {
      if (error.status === 409 && error.data?.conflict) {
        this.pendingTransfer = { code, roomCode, playerName:error.data.playerName };
        $('transferText').textContent = `${error.data.playerName || 'Este jugador'} ya tiene una sesión activa en otro dispositivo.`;
        $('transferStatus').innerHTML = '';
        $('transferOverlay').classList.add('show');
      } else $('loginError').innerHTML = `<div class="error">${esc(error.message)}</div>`;
    } finally { $('loginBtn').disabled = false; $('loginBtn').textContent = 'ENTRAR A LA SALA'; }
  }

  acceptLogin(data) {
    this.token = data.token;
    localStorage.setItem('bingoOnlineToken', this.token);
    this.cleanDirectAccessUrl();
    this.applyState(data.state);
    this.connectEvents();
  }

  cleanDirectAccessUrl() {
    const url = new URL(location.href);
    let changed = false;
    ['acceso','codigo','code'].forEach(key => { if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; } });
    if (changed) history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async resume() {
    try { const data = await this.request('/api/player/state'); this.applyState(data); this.connectEvents(); }
    catch { this.logout(false); }
  }

  async requestDeviceTransfer() {
    if (!this.pendingTransfer) return;
    $('requestTransferBtn').disabled = true;
    try {
      const data = await this.request('/api/player/request-transfer', { method:'POST', body:JSON.stringify({ ...this.pendingTransfer, deviceId:this.deviceId }) });
      this.pendingTransfer.requestId = data.requestId;
      $('transferStatus').innerHTML = '<div class="notice">Solicitud enviada. Esperando la aprobación del administrador…</div>';
      this.pollTransfer();
    } catch (error) {
      $('transferStatus').innerHTML = `<div class="error">${esc(error.message)}</div>`;
      $('requestTransferBtn').disabled = false;
    }
  }

  pollTransfer() {
    clearTimeout(this.transferPollTimer);
    if (!this.pendingTransfer?.requestId) return;
    this.transferPollTimer = setTimeout(async () => {
      try {
        const data = await this.request('/api/player/transfer-status', { method:'POST', body:JSON.stringify({ requestId:this.pendingTransfer.requestId, deviceId:this.deviceId }) });
        if (data.status === 'approved') {
          this.closeTransfer(); this.acceptLogin({ token:data.token, state:data.state }); return;
        }
        if (data.status === 'rejected') {
          $('transferStatus').innerHTML = '<div class="error">El administrador rechazó el cambio. La sesión original continúa activa.</div>';
          $('requestTransferBtn').disabled = false; return;
        }
        this.pollTransfer();
      } catch (error) { $('transferStatus').innerHTML = `<div class="error">${esc(error.message)}</div>`; }
    }, 1800);
  }

  closeTransfer() {
    clearTimeout(this.transferPollTimer); this.pendingTransfer = null; $('transferOverlay').classList.remove('show'); $('requestTransferBtn').disabled = false;
  }

  connectEvents() {
    this.events?.close();
    this.events = new EventSource(`/api/events?role=player&token=${encodeURIComponent(this.token)}`);
    this.events.addEventListener('state', event => {
      $('connectionMask').classList.remove('show');
      this.applyState(JSON.parse(event.data));
    });
    this.events.addEventListener('chat', event => {
      const message = JSON.parse(event.data);
      this.state ||= {};
      this.state.chat ||= { messages: [] };
      this.state.chat.messages ||= [];
      if (!this.state.chat.messages.some(item => item.id === message.id)) this.state.chat.messages.push(message);
      this.state.chat.messages = this.state.chat.messages.slice(-100);
      this.renderChat(true);
    });
    this.events.addEventListener('chat-control', event => {
      const control = JSON.parse(event.data);
      this.state ||= {};
      this.state.chat = { ...(this.state.chat || {}), ...control };
      this.renderChat();
    });
    this.events.addEventListener('logout', () => this.logout());
    this.events.onerror = () => {
      $('connectionStatus').className = 'status off'; $('connectionStatus').textContent = 'SIN CONEXIÓN'; $('connectionMask').classList.add('show');
    };
  }

  applyState(data) {
    if (!data?.active) { this.showRoomClosed(); return; }
    const previous = this.state;
    const previousCount = previous?.game?.drawn?.length;
    const previousConfirmed = Boolean(previous?.player?.selectionConfirmed);
    this.state = data;
    if (data.status === 'waiting' && !data.player.selectionConfirmed) this.selectedOffers = new Set(data.player.reservedCardIds || []);
    else this.selectedOffers.clear();
    const cards = data.player.cards || [];
    if (!cards.some(card => card.id === this.activeCardId)) this.activeCardId = cards[0]?.id || '';
    localStorage.setItem('bingoOnlineCard', this.activeCardId);
    if (!this.audioPreferenceLoaded) { this.audioEnabled = Boolean(data.roomSettings?.playerAudioDefault); this.audioPreferenceLoaded = true; localStorage.setItem('bingoPlayerSound', String(this.audioEnabled)); }
    $('loginView').classList.add('hidden'); $('gameView').classList.remove('hidden');
    this.render(); this.renderChat(); this.renderPublicClaim(); this.handleOwnPrizeReadiness(); this.handleTestEvent(); this.handleSequence(previous);
    if ($('drawnOverlay').classList.contains('show')) this.renderDrawnNumbers();
    if ($('winnerOverlay').classList.contains('show')) this.renderWinnerCard();
    const currentCount = data.game.drawn.length;
    if (previousCount !== undefined && data.status === 'playing' && currentCount > previousCount && data.game.lastBall != null) this.speakBall(data.game.lastBall);
    if (!previousConfirmed && data.player.selectionConfirmed) this.showGreetingOnce();
  }

  render() {
    const data = this.state;
    $('playerName').textContent = data.player.name;
    $('roomInfo').textContent = `Sala ${data.roomCode} · Juego ${String(data.game.number).padStart(4,'0')} · ${data.game.mode} bolas`;
    $('connectionStatus').className = 'status on'; $('connectionStatus').textContent = data.status === 'waiting' ? 'EN ESPERA' : data.status === 'verifying' ? 'VERIFICANDO' : data.status === 'paused' ? 'PAUSADO' : data.status === 'finalizing' ? 'CIERRE FINAL' : data.status === 'starting' || data.status === 'resuming' ? 'PREPARANDO' : data.status === 'finished' ? 'FINALIZADO' : 'CONECTADO';
    this.renderPresenter();
    document.body.classList.toggle('isPlaying', ['playing','verifying','paused','resuming','finalizing','finished'].includes(data.status));
    document.body.classList.toggle('isPaused', data.status === 'paused');
    document.body.classList.toggle('isTransitioning', ['starting','resuming'].includes(data.status));
    if (data.status === 'waiting' || data.status === 'starting') this.renderWaiting(); else this.renderPlaying();
    if (data.status !== 'finished') { this.finalOverlayDismissedFor = ''; $('finalResultsOverlay').classList.remove('show'); }
    else $('finalResultsOverlay').classList.toggle('show', this.finalOverlayDismissedFor !== data.roomCode);
    this.renderNotice(); this.updateQuickTools();
  }

  personalPresenterId() {
    return this.state?.player?.personalPresenter || this.state?.game?.presenter || 'vero';
  }

  renderPresenter() {
    const id = this.personalPresenterId();
    const presenter = PRESENTERS[id] || PRESENTERS.vero || { name:'Presentador', phrase:'Mucha suerte.' };
    $('presenterImage').src = `assets/${id}.png`; $('presenterName').textContent = `${presenter.name} te acompaña`; $('presenterPhrase').textContent = presenter.phrase;
    $('autoMarkToggle').classList.toggle('active', Boolean(this.state.player.autoMark));
    $('autoMarkToggle').disabled = Boolean(this.state.player.autoMarkForced || this.state.markingPolicy?.automaticRequired);
    $('autoMarkToggle').title = this.state.markingPolicy?.automaticRequired ? this.state.markingPolicy.reason : 'Activar o desactivar automarcado';
    this.renderAdminMessage();
  }

  renderAdminMessage() {
    const bubble = $('adminSpeechBubble'), message = this.state?.adminMessage;
    if (!message?.text) { bubble.classList.add('hidden'); this.lastAdminMessageId = ''; return; }
    $('adminSpeechAuthor').textContent = `${(PRESENTERS[this.personalPresenterId()] || PRESENTERS.vero).name} dice:`;
    $('adminSpeechText').textContent = message.text; bubble.classList.remove('hidden');
    if (message.id !== this.lastAdminMessageId) { bubble.classList.remove('show'); void bubble.offsetWidth; bubble.classList.add('show'); this.lastAdminMessageId = message.id; }
  }

  assignmentRemainingSeconds() {
    const timer = this.state?.assignmentTimer;
    if (!timer) return null;
    if (timer.status === 'running' && timer.endsAt) return Math.max(0, Math.ceil((new Date(timer.endsAt).getTime() - Date.now()) / 1000));
    return timer.remainingSeconds == null ? null : Math.max(0, Number(timer.remainingSeconds) || 0);
  }

  formatCountdown(seconds) {
    if (seconds == null) return '--:--';
    return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  }

  assignmentTimerHtml() {
    const timer = this.state?.assignmentTimer;
    if (!timer?.enabled) return '';
    const label = timer.status === 'running' ? 'Tiempo para elegir' : timer.status === 'paused' ? 'Cuenta pausada' : timer.status === 'completed' ? 'Selección finalizada' : 'El conteo todavía no comenzó';
    const value = timer.status === 'completed' ? '00:00' : this.formatCountdown(this.assignmentRemainingSeconds());
    return `<div class="waitingTimer"><div><b>${label}</b><small>Si el tiempo termina, el sistema puede completar la asignación.</small></div><strong id="playerAssignmentCountdown">${value}</strong></div>`;
  }

  updateAssignmentCountdown() {
    const host = $('playerAssignmentCountdown');
    if (host) host.textContent = this.state?.assignmentTimer?.status === 'completed' ? '00:00' : this.formatCountdown(this.assignmentRemainingSeconds());
  }

  renderWaiting() {
    $('playPanel').classList.add('hidden'); $('waitingPanel').classList.remove('hidden');
    const player = this.state.player, timerHtml = this.assignmentTimerHtml();
    const nameSection = this.playerNameSectionHtml();
    if (player.selectionConfirmed) {
      if (!player.nameSet) {
        $('waitingPanel').innerHTML = `${timerHtml}<h2>Confirmá tu nombre</h2><div class="waitingLead">Tus cartones ya están asignados. Solo falta indicar quién va a jugar.</div>${nameSection}<button id="confirmAssignedName" class="btn primary" disabled>CONFIRMAR NOMBRE</button>`;
        this.bindPlayerNameInput('confirmAssignedName');
        $('confirmAssignedName').onclick = () => this.savePlayerName();
        return;
      }
      $('waitingPanel').innerHTML = `${timerHtml}<div class="waitingConfirmed waitingStateHero"><b>ESPERANDO SORTEO</b><div>Tus cartones están confirmados y reservados para vos.</div><div class="chosenList">${player.cards.map(card => `<span class="chosenBadge">Cartón ${esc(card.number)}</span>`).join('')}</div>${this.state.status === 'waiting' && !this.state.assignmentTimer?.selectionClosed ? '<button id="changeChoice" class="btn secondary" style="margin-top:10px">CAMBIAR CARTONES</button>' : ''}</div>`;
      if ($('changeChoice')) $('changeChoice').onclick = () => this.releaseChoice();
      return;
    }
    const offers = player.offeredCards || [], valid = new Set(offers.map(card => card.id));
    this.selectedOffers = new Set([...this.selectedOffers].filter(id => valid.has(id)));
    const ready = this.selectedOffers.size > 0 && this.selectedOffers.size <= player.allowedCardCount;
    const canContinue = ready && (player.nameSet || this.validPlayerNameDraft());
    const confirmation = ready
      ? `<div class="regulationBlock"><div class="regulationActions"><button id="readRules" class="btn secondary" type="button">LEER REGLAMENTO</button><button id="downloadRules" class="btn secondary" type="button">DESCARGAR PDF</button></div><button id="continueChoice" class="btn primary" style="margin:0" ${canContinue ? '' : 'disabled'}>CONTINUAR</button><small>Al continuar, aceptás el reglamento general y las condiciones de la partida.</small></div>`
      : '<button id="continueChoice" class="btn primary" disabled>CONTINUAR</button>';
    $('waitingPanel').innerHTML = `${timerHtml}<h2>Elegí hasta ${player.allowedCardCount} cartón${player.allowedCardCount === 1 ? '' : 'es'}</h2><div class="waitingLead">Podés renovar las opciones. Los cartones que ya elegiste se conservan.</div>${nameSection}<div class="choiceCounter">Seleccionados: <span id="choiceCount">${this.selectedOffers.size}</span> de ${player.allowedCardCount}</div><div id="offerGrid" class="offers">${offers.map(card => this.offerHtml(card)).join('')}</div><div class="choiceActions"><button id="clearChoice" class="btn secondary">LIMPIAR</button><button id="renewChoice" class="btn secondary">RENOVAR CARTONES</button></div>${confirmation}`;
    this.bindPlayerNameInput('continueChoice');
    $('offerGrid').querySelectorAll('[data-offer]').forEach(button => button.onclick = () => this.toggleOffer(button.dataset.offer));
    $('clearChoice').onclick = () => this.clearReservations();
    $('renewChoice').onclick = () => this.renewOffers();
    $('continueChoice').onclick = () => this.confirmChoice();
    if ($('readRules')) $('readRules').onclick = () => window.open('/reglamento.html', '_blank', 'noopener,noreferrer');
    if ($('downloadRules')) $('downloadRules').onclick = () => this.downloadRules();
  }

  playerNameSectionHtml() {
    if (this.state?.player?.nameSet) return '';
    return `<div class="nameChoice"><label for="selectionPlayerName">TU NOMBRE O APODO</label><input id="selectionPlayerName" maxlength="20" autocomplete="nickname" inputmode="text" placeholder="Ej.: Facu" value="${esc(this.pendingPlayerName)}"><small>Se mostrará en tus cartones y en los resultados del sorteo.</small></div>`;
  }

  normalizedPlayerNameDraft() {
    return String(this.pendingPlayerName || '').trim().replace(/\s+/g, ' ').slice(0, 20);
  }

  validPlayerNameDraft() {
    const name = this.normalizedPlayerNameDraft();
    return name.length >= 2 && !/^(jugador|player|invitado)(?:\s*[x#_-]?\s*\d*)?$/i.test(name);
  }

  bindPlayerNameInput(buttonId) {
    const input = $('selectionPlayerName');
    if (!input) return;
    const update = () => {
      this.pendingPlayerName = input.value;
      const button = $(buttonId);
      if (!button) return;
      const cardsReady = buttonId === 'confirmAssignedName' || (this.selectedOffers.size > 0 && this.selectedOffers.size <= Number(this.state?.player?.allowedCardCount || 1));
      button.disabled = !(cardsReady && this.validPlayerNameDraft());
    };
    input.addEventListener('input', update);
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (buttonId === 'confirmAssignedName') this.savePlayerName();
      else this.confirmChoice();
    });
    update();
  }

  requireValidPlayerName() {
    if (this.state?.player?.nameSet) return '';
    const name = this.normalizedPlayerNameDraft();
    if (name.length < 2) { this.showMessage('Escribí tu nombre o apodo antes de continuar.', 'error'); $('selectionPlayerName')?.focus(); return null; }
    if (/^(jugador|player|invitado)(?:\s*[x#_-]?\s*\d*)?$/i.test(name)) { this.showMessage('Elegí un nombre o apodo propio. No podés continuar como “Jugador X”.', 'error'); $('selectionPlayerName')?.focus(); return null; }
    return name;
  }

  async savePlayerName() {
    const name = this.requireValidPlayerName();
    if (name === null) return;
    try {
      this.applyState(await this.request('/api/player/name', { method:'POST', body:JSON.stringify({ name }) }));
      this.pendingPlayerName = '';
    } catch (error) { this.showMessage(error.message, 'error'); }
  }

  offerHtml(card) {
    const selected = this.selectedOffers.has(card.id);
    return `<button class="offer ${selected ? 'selected' : ''}" data-offer="${esc(card.id)}"><div class="offerHead"><b>Cartón ${esc(card.number)}</b><span>${selected ? 'ELEGIDO' : 'TOCAR'}</span></div>${this.miniTicket(card)}</button>`;
  }

  miniTicket(card) {
    return `<div class="miniGrid mode${card.mode}">${card.grid.flat().map(value => value === null ? '<span class="miniCell blank">·</span>' : value === 'LIBRE' ? '<span class="miniCell free">LIBRE</span>' : `<span class="miniCell">${value}</span>`).join('')}</div>`;
  }

  async toggleOffer(cardId) {
    if (this.pendingReservation.has(cardId)) return;
    const reserve = !this.selectedOffers.has(cardId);
    if (reserve && this.selectedOffers.size >= this.state.player.allowedCardCount) return this.showMessage(`Solo podés elegir ${this.state.player.allowedCardCount} cartón${this.state.player.allowedCardCount === 1 ? '' : 'es'}.`, 'error');
    this.pendingReservation.add(cardId);
    try { this.applyState(await this.request('/api/player/reserve', { method:'POST', body:JSON.stringify({ cardId, reserve }) })); }
    catch (error) { this.showMessage(error.message, 'error'); }
    finally { this.pendingReservation.delete(cardId); }
  }

  async clearReservations() {
    for (const cardId of [...this.selectedOffers]) {
      try { await this.request('/api/player/reserve', { method:'POST', body:JSON.stringify({ cardId, reserve:false }) }); } catch {}
    }
    const data = await this.request('/api/player/state'); this.applyState(data);
  }

  async renewOffers() {
    try { this.applyState(await this.request('/api/player/renew-offers', { method:'POST', body:'{}' })); }
    catch (error) { this.showMessage(error.message, 'error'); }
  }

  async confirmChoice(force = false) {
    const selected = this.selectedOffers.size;
    const maximum = Number(this.state?.player?.allowedCardCount || 1);
    if (selected < 1 || selected > maximum) return;
    const name = this.requireValidPlayerName();
    if (name === null) return;
    if (!force && selected < maximum) {
      const remaining = maximum - selected;
      $('partialChoiceText').textContent = `Todavía podés elegir ${remaining} cartón${remaining === 1 ? '' : 'es'} más. ¿Seguro que querés continuar?`;
      $('partialChoiceOverlay').classList.add('show');
      return;
    }
    try {
      this.applyState(await this.request('/api/player/choose', { method:'POST', body:JSON.stringify({ cardIds:[...this.selectedOffers], ...(name ? { name } : {}) }) }));
      this.pendingPlayerName = '';
    } catch (error) { this.showMessage(error.message, 'error'); }
  }

  async releaseChoice() {
    try { this.applyState(await this.request('/api/player/release', { method:'POST', body:'{}' })); }
    catch (error) { this.showMessage(error.message, 'error'); }
  }

  async downloadRules() {
    try {
      const response = await fetch('/reglamento.pdf', { cache:'no-store' });
      if (!response.ok) throw new Error('El reglamento todavía no fue cargado. Se incorporará antes de publicar la partida.');
      const blob = await response.blob(), link = document.createElement('a');
      link.href = URL.createObjectURL(blob); link.download = 'Reglamento_El_Bingo_de_la_Gorda.pdf'; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) { this.showMessage(error.message, 'error'); }
  }

  showGreetingOnce() {
    const key = `bingoGreeting:${this.state.roomCode}:${this.state.player.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setTimeout(() => this.openGuide(false), 250);
  }

  openGuide(manual = false) {
    if (!this.state) return;
    const id = this.personalPresenterId(), profile = PRESENTERS[id] || PRESENTERS.vero;
    $('guidePresenter').src = `assets/${id}.png`;
    $('guideGreeting').textContent = manual ? 'Guía rápida de la sala' : `Hola, soy ${profile.name}`;
    $('guideIntro').textContent = manual ? 'Repasá cómo usar las funciones principales.' : 'Enseguida arranca el sorteo. ¿Necesitás una guía?';
    $('guideQuestion').classList.toggle('hidden', manual);
    $('guideSteps').classList.toggle('hidden', !manual);
    $('guideOverlay').classList.add('show');
    if (manual) { this.guideStep = 0; this.renderGuideStep(); }
    else this.speak(profile.greeting || `Hola, soy ${profile.name}. ¿Necesitás una guía?`, true);
  }

  startGuide() { $('guideQuestion').classList.add('hidden'); $('guideSteps').classList.remove('hidden'); this.guideStep = 0; this.renderGuideStep(); }
  renderGuideStep() {
    const step = this.guideSteps[this.guideStep];
    $('guideStepContent').innerHTML = `<div class="guideStepIcon">${step.icon}</div><div class="guideStepTitle">${esc(step.title)}</div><div class="guideStepText">${esc(step.text)}</div>`;
    $('guidePrevBtn').disabled = this.guideStep === 0; $('guideNextBtn').textContent = this.guideStep === this.guideSteps.length - 1 ? 'TERMINAR' : 'SIGUIENTE';
  }
  closeGuide() { $('guideOverlay').classList.remove('show'); }

  renderPlaying() {
    $('waitingPanel').classList.add('hidden'); $('playPanel').classList.remove('hidden');
    const drawn = this.state.game.drawn || [];
    $('lastBall').textContent = this.state.game.lastBall ?? '—'; $('ballCount').textContent = `${drawn.length} de ${this.state.game.mode} sorteadas`;
    $('recent').innerHTML = [...drawn].reverse().slice(0,7).map(number => `<i>${number}</i>`).join('');
    $('resultsBtn').disabled = this.state.status !== 'finished'; $('showWinnerBtn').disabled = !this.latestConfirmedWinner();
    this.renderTabs(); this.renderTicket();
  }

  renderTabs() {
    const cards = this.state.player.cards || [];
    $('cardTabs').innerHTML = cards.map(card => {
      const ready = this.readinessFor(card.id);
      const anyIntermediate = ready?.tripleLineEligible || ready?.doubleLineEligible || ready?.cornersEligible || ready?.lineEligible || ready?.amboEligible;
      const cls = [card.id === this.activeCardId ? 'active' : '', ready?.bingoEligible ? 'readyBingo' : anyIntermediate ? 'readyLine' : ''].filter(Boolean).join(' ');
      return `<button data-card="${esc(card.id)}" class="${cls}">CARTÓN ${esc(card.number)}</button>`;
    }).join('');
    $('cardTabs').querySelectorAll('button').forEach(button => button.onclick = () => { this.activeCardId = button.dataset.card; localStorage.setItem('bingoOnlineCard', this.activeCardId); this.renderTabs(); this.renderTicket(); });
  }

  readinessFor(cardId) { return (this.state?.readiness || []).find(item => item.cardId === cardId) || null; }
  eligibleCard(type) { const key = `${type}Eligible`; return (this.state?.readiness || []).find(item => item[key]) || null; }
  claimLabel(type) {
    if (type === 'ambo') return 'AMBOCABEZA';
    if (type === 'corners') return '4 ESQUINAS';
    if (type === 'doubleLine') return 'DOBLE LÍNEA';
    if (type === 'tripleLine') return 'TRIPLE LÍNEA';
    if (type === 'bingo') return 'BINGO';
    if (Number(this.state?.game?.mode) === 90 && Number(this.state?.prizeStatus?.line?.awarded || 0) > 0 && !this.state?.prizeStatus?.line?.closed) return 'SEGUNDA LÍNEA';
    return 'LÍNEA';
  }

  renderTicket() {
    const card = this.state.player.cards.find(item => item.id === this.activeCardId);
    const buttons = {
      ambo:$('claimAmbo'), corners:$('claimCorners'), line:$('claimLine'), doubleLine:$('claimDoubleLine'), tripleLine:$('claimTripleLine'), bingo:$('claimBingo')
    };
    const allButtons = Object.values(buttons);
    $('ticketPanel').classList.toggle('mode75Card', Number(card?.mode) === 75);
    if (!card) { $('ticketPanel').innerHTML = '<div class="error">No hay un cartón elegido.</div>'; allButtons.forEach(button => button.disabled = true); return; }
    const marks = new Set((this.state.player.marks?.[card.id] || []).map(Number)), auto = Boolean(this.state.player.autoMark), locked = this.state.status !== 'playing';
    const cells = card.grid.flat().map(value => value === null ? '<div class="cell blank">·</div>' : value === 'LIBRE' ? '<div class="cell free">LIBRE</div>' : `<button class="cell number ${marks.has(value) ? 'marked' : ''}" data-number="${value}" ${auto || locked ? 'disabled' : ''}>${value}</button>`).join('');
    const readyInfo = this.readinessFor(card.id);
    const progress = Number(card.mode) === 75 ? ` · ${readyInfo?.lineCount || 0} líneas completas` : '';
    $('ticketPanel').innerHTML = `<div class="ticketHead"><div><b>Cartón ${esc(card.number)}</b><br><small>${esc(this.state.player.name)}</small></div><small>${marks.size} marcados${progress} · ${auto ? 'AUTO' : 'MANUAL'}</small></div><div class="grid mode${card.mode}">${cells}</div>`;
    if (!auto && !locked) $('ticketPanel').querySelectorAll('[data-number]').forEach(button => button.onclick = () => this.toggleMark(card.id, Number(button.dataset.number), !button.classList.contains('marked')));

    const prizes = this.state.prizeStatus || {}, pending = (this.state.publicClaims || []).some(claim => claim.status === 'pending');
    const mode75 = Number(card.mode) === 75;
    const definitions = [
      { type:'ambo', button:buttons.ambo, enabled:!mode75 && card.bets?.ambocabeza !== false && Number(prizes.ambo?.total || 0) > 0 },
      { type:'corners', button:buttons.corners, enabled:mode75 && card.bets?.corners !== false && Number(prizes.corners?.total || 0) > 0 },
      { type:'line', button:buttons.line, enabled:card.bets?.line !== false && Number(prizes.line?.total || 0) > 0 },
      { type:'doubleLine', button:buttons.doubleLine, enabled:mode75 && card.bets?.doubleLine !== false && Number(prizes.doubleLine?.total || 0) > 0 },
      { type:'tripleLine', button:buttons.tripleLine, enabled:mode75 && card.bets?.tripleLine !== false && Number(prizes.tripleLine?.total || 0) > 0 },
      { type:'bingo', button:buttons.bingo, enabled:card.bets?.bingo !== false && Number(prizes.bingo?.total || 0) > 0 }
    ].map(item => ({ ...item, prize:prizes[item.type] || { closed:true, winners:[] } }));
    const active = definitions.filter(item => item.enabled);
    $('claimBar').style.setProperty('--claim-count', String(Math.min(3, Math.max(1, active.length))));
    definitions.forEach(item => {
      item.button.style.display = item.enabled ? '' : 'none';
      const label = this.claimLabel(item.type);
      item.button.textContent = `CANTAR ${label}`;
      const ready = this.eligibleCard(item.type);
      const alreadyWon = (item.prize.winners || []).some(winner => winner.cardId === card.id);
      item.button.disabled = locked || pending || item.prize.closed || alreadyWon;
      item.button.classList.toggle('prizeReady', Boolean(ready) && !item.button.disabled);
      if (ready && !item.button.disabled) item.button.textContent = `¡TENÉS ${label}! TOCÁ ACÁ`;
    });
  }

  async toggleMark(cardId, number, marked) {
    if (this.state?.player.autoMark || this.pendingMark.has(`${cardId}:${number}`)) return;
    const key = `${cardId}:${number}`; this.pendingMark.add(key);
    try { this.applyState(await this.request('/api/player/mark', { method:'POST', body:JSON.stringify({ cardId, number, marked }) })); }
    catch (error) { this.showMessage(error.message, 'error'); }
    finally { this.pendingMark.delete(key); }
  }

  async setAutoMark(enabled) {
    if (!this.state?.active) return;
    $('autoMarkToggle').disabled = true;
    try { this.applyState(await this.request('/api/player/automark', { method:'POST', body:JSON.stringify({ enabled }) })); }
    catch (error) { this.showMessage(error.message, 'error'); }
    finally { $('autoMarkToggle').disabled = false; }
  }

  async claim(type) {
    if (this.state?.status !== 'playing') return;
    const ready = this.eligibleCard(type);
    if (ready) { this.activeCardId = ready.cardId; localStorage.setItem('bingoOnlineCard', this.activeCardId); this.renderTabs(); this.renderTicket(); }
    const card = this.state?.player.cards.find(item => item.id === this.activeCardId); if (!card) return;
    const label = this.claimLabel(type);
    [$('claimAmbo'),$('claimCorners'),$('claimLine'),$('claimDoubleLine'),$('claimTripleLine'),$('claimBingo')].forEach(button => button.disabled = true);
    try {
      const claim = await this.request('/api/player/claim', { method:'POST', body:JSON.stringify({ cardId:card.id, type }) });
      this.showMessage(`${label} enviado. El administrador ya recibió el aviso.`, 'notice');
      if (!claim.officialValid) this.showMessage(`El control oficial todavía no detecta ${label}.`, 'error');
    } catch (error) { this.showMessage(error.message, 'error'); }
    finally { this.renderTicket(); }
  }

  handleOwnPrizeReadiness() {
    if (!this.state || this.state.status !== 'playing') return;
    const order = ['bingo','tripleLine','doubleLine','corners','line','ambo'];
    let type = null, ready = null;
    for (const candidate of order) { ready = this.eligibleCard(candidate); if (ready) { type = candidate; break; } }
    if (!ready || !type) { this.lastPrizeReadyKey = ''; return; }
    const key = `${type}:${ready.cardId}:${this.state.game.drawn.length}`; if (key === this.lastPrizeReadyKey) return;
    this.lastPrizeReadyKey = key; this.activeCardId = ready.cardId; localStorage.setItem('bingoOnlineCard', ready.cardId);
    this.playAlertSound(type); if (this.alertsEnabled && navigator.vibrate) navigator.vibrate(type === 'bingo' ? [180,80,180,80,260] : [150,70,150]);
    const label = this.claimLabel(type);
    this.showMessage(`¡TENÉS ${label} EN EL CARTÓN ${ready.cardNumber}! Tocá el botón ahora.`, 'notice');
  }

  handleSequence(previous) {
    const status = this.state.status, transition = this.state.transition;
    if (status === 'verifying') {
      clearInterval(this.sequenceTimer); $('sequenceOverlay').classList.remove('show');
    } else if (status === 'paused') {
      if (this.state.pauseReason === 'manual') {
        this.showSequence('EL ADMINISTRADOR PAUSÓ LA PARTIDA', 'YA CONTINUAMOS', '');
        if (this.lastStatus !== 'paused') this.speakEvent('pause', {}, true);
      } else $('sequenceOverlay').classList.remove('show');
      clearInterval(this.sequenceTimer);
    } else if (status === 'finalizing') {
      clearInterval(this.sequenceTimer);
      $('sequenceOverlay').classList.remove('show');
      const key = transition?.id || 'final';
      if (this.lastFinalSequenceKey !== key) {
        this.lastFinalSequenceKey = key;
        clearTimeout(this.finalSequenceTimer);
        this.finalSequenceTimer = setTimeout(() => {
          if (this.state?.status !== 'finalizing' || (this.state.transition?.id || 'final') !== key) return;
          this.showSequence('SE RETIRAN LAS ÚLTIMAS BOLILLAS FALTANTES', 'Luego se publicará el resultado oficial.', '');
          this.speakSequenceOnce(`${key}:remaining`, 'remainingBalls', {});
        }, 3400);
      }
    } else if (status === 'starting' && transition) this.runStartSequence(transition);
    else if (status === 'resuming' && transition) this.runResumeSequence(transition);
    else { clearInterval(this.sequenceTimer); clearTimeout(this.finalSequenceTimer); $('sequenceOverlay').classList.remove('show'); }
    this.lastStatus = status;
  }

  runStartSequence(transition) {
    const key = transition.id || transition.startedAt;
    clearInterval(this.sequenceTimer);
    const update = () => {
      const start = new Date(transition.startedAt).getTime(), end = new Date(transition.endsAt).getTime(), now = Date.now(), elapsed = now - start, remaining = Math.max(0, end - now);
      if (elapsed < 3300) {
        this.showSequence(`SIENDO LAS ${transition.officialTime || ''} HORAS`, 'DAMOS INICIO A UN NUEVO SORTEO', '');
        this.speakSequenceOnce(`${key}:time`, 'startTime', { time:transition.officialTime || '' });
      } else if (remaining > 4300) {
        this.showSequence('¿TODOS PREPARADOS?', 'EN SEGUIDA INICIA EL SORTEO…', '');
        this.speakSequenceOnce(`${key}:ready`, 'ready', {});
      } else {
        const number = remaining > 3000 ? '3' : remaining > 2000 ? '2' : remaining > 1000 ? '1' : '¡BUENA SUERTE!';
        this.showSequence(number === '¡BUENA SUERTE!' ? '¡BUENA SUERTE!' : 'EL SORTEO INICIA EN', '', number === '¡BUENA SUERTE!' ? '' : number);
        if (number === '¡BUENA SUERTE!') this.speakSequenceOnce(`${key}:luck`, 'luck', {}); else this.speakTextOnce(`${key}:${number}`, number);
      }
    };
    update(); this.sequenceTimer = setInterval(update, 180);
  }

  runResumeSequence(transition) {
    const key = transition.id || transition.startedAt;
    clearInterval(this.sequenceTimer);
    const update = () => {
      const remaining = Math.max(0, new Date(transition.endsAt).getTime() - Date.now());
      const number = remaining > 4000 ? '' : remaining > 3000 ? '3' : remaining > 2000 ? '2' : remaining > 1000 ? '1' : '';
      this.showSequence('LA PARTIDA CONTINÚA EN', '', number);
      this.speakSequenceOnce(`${key}:resume`, 'resume', {});
      if (number) this.speakTextOnce(`${key}:${number}`, number);
    };
    update(); this.sequenceTimer = setInterval(update, 180);
  }

  showSequence(title, text, count) {
    $('sequencePresenter').src = `assets/${this.personalPresenterId()}.png`; $('sequenceTitle').textContent = title; $('sequenceText').textContent = text; $('sequenceCount').textContent = count; $('sequenceOverlay').classList.add('show');
  }

  speakSequenceOnce(key, event, replacements) { if (sessionStorage.getItem(`spoken:${key}`)) return; sessionStorage.setItem(`spoken:${key}`,'1'); this.speakEvent(event, replacements, true); }
  speakTextOnce(key, text) { if (sessionStorage.getItem(`spoken:${key}`)) return; sessionStorage.setItem(`spoken:${key}`,'1'); this.speak(text, true); }

  refreshVoices() { this.voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }
  preferredVoice(id) {
    const spanish = this.voices.filter(voice => /^es([-_]|$)/i.test(voice.lang) || /spanish|español|espanol/i.test(voice.name));
    if (id === 'josu') return spanish.find(voice => /male|mascul|hombre|jorge|diego|pablo|carlos|juan|luis|miguel/i.test(voice.name)) || spanish[1] || spanish[0] || this.voices[0];
    return spanish.find(voice => /female|femen|mujer|sofia|paulina|paloma|ximena|laura|lucia|maria|camila|valentina/i.test(voice.name)) || spanish[0] || this.voices[0];
  }
  speak(text, priority = false) {
    if (!this.audioEnabled || this.state?.roomSettings?.playerAudioAllowed === false || !window.speechSynthesis || !text) return;
    const id = this.personalPresenterId(), profile = PRESENTERS[id] || { rate:1,pitch:1 };
    const utterance = new SpeechSynthesisUtterance(text), voice = this.preferredVoice(id);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = 'es-AR';
    utterance.rate = profile.rate || 1; utterance.pitch = profile.pitch || 1; utterance.volume = this.audioVolume;
    if (priority) window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  }
  speakBall(number) { const id = this.personalPresenterId(); this.speak(this.phrases.ball(id, number, this.state.game.drawn.length, this.state.game.mode)); }
  speakEvent(name, replacements = {}, priority = true) { const id = this.personalPresenterId(); this.speak(this.phrases.event(id, name, replacements), priority); }

  openPresenterChoice() {
    if (!this.state) return;
    const current = this.personalPresenterId();
    $('presenterChoices').innerHTML = Object.entries(PRESENTERS).map(([id, profile]) => `<button class="presenterChoice ${id === current ? 'active' : ''}" data-presenter="${esc(id)}"><img src="assets/${esc(id)}.png" alt="${esc(profile.name)}"><span>${esc(profile.name)}<br><small>Cambiar mi suerte</small></span></button>`).join('');
    $('presenterChoices').querySelectorAll('[data-presenter]').forEach(button => button.onclick = () => this.changePresenter(button.dataset.presenter));
    $('presenterChoiceOverlay').classList.add('show');
  }

  async changePresenter(presenter) {
    try {
      this.applyState(await this.request('/api/player/presenter', { method:'POST', body:JSON.stringify({ presenter }) }));
      this.closeModal('presenterChoiceOverlay');
      const profile = PRESENTERS[presenter] || PRESENTERS.vero;
      this.speak(`Ahora juego con vos. Vamos a cambiar la suerte.`, true);
      this.showMessage(`${profile.name} ahora te acompaña.`, 'notice');
    } catch (error) { this.showMessage(error.message, 'error'); }
  }

  setAudioEnabled(enabled) { this.audioEnabled = Boolean(enabled); localStorage.setItem('bingoPlayerSound', String(this.audioEnabled)); this.updateQuickTools(); if (this.audioEnabled && this.state) this.speak((PRESENTERS[this.personalPresenterId()] || PRESENTERS.vero).preview, true); }
  setAlertsEnabled(enabled) { this.alertsEnabled = Boolean(enabled); localStorage.setItem('bingoPlayerAlerts', String(this.alertsEnabled)); this.updateQuickTools(); }
  updateQuickTools() { $('soundToggle')?.classList.toggle('active', this.audioEnabled); $('alertsToggle')?.classList.toggle('active', this.alertsEnabled); $('autoMarkToggle')?.classList.toggle('active', Boolean(this.state?.player?.autoMark)); }

  renderPublicClaim() {
    const claim = (this.state?.publicClaims || []).at(-1); if (!claim) return;
    const key = `${claim.id}:${claim.status}`; if (key === this.lastPublicClaimKey) return; this.lastPublicClaimKey = key;
    const label = String(claim.prizeLabel || this.claimLabel(claim.type)).toUpperCase();
    if (claim.status === 'pending') {
      this.showClaimOverlay({ kind:claim.type, icon:'', title:`${claim.playerName} cantó ${label}`, text:`Cartón ${claim.cardNumber}. Esperando verificación del administrador.`, duration:6500, badge:'assets/celebrations/verificando-jugada.png', force:true });
      this.playAlertSound(claim.type); this.speakEvent(claim.type === 'ambo' ? 'claimAmbo' : claim.type === 'bingo' ? 'claimBingo' : 'claimLine'); return;
    }
    if (claim.status === 'confirmed') {
      const badges = {
        ambo:'assets/celebrations/ambocabeza-confirmado.png',
        bingo:'assets/celebrations/bingo-confirmado.png',
        corners:'assets/celebrations/cuatro-esquinas-confirmadas.png',
        doubleLine:'assets/celebrations/doble-linea-confirmada-75.png',
        tripleLine:'assets/celebrations/triple-linea-confirmada-75.png',
        line: Number(this.state?.game?.mode) === 90
          ? (Number(claim.prizeNumber || 1) === 2 ? 'assets/celebrations/segunda-linea-confirmada.png' : 'assets/celebrations/primera-linea-confirmada.png')
          : 'assets/celebrations/linea-confirmada-75.png'
      };
      const badge = badges[claim.type] || badges.line;
      this.showClaimOverlay({ kind:'confirmed spectacular', icon:'', title:`${label} CONFIRMADO`, text:`Ganador: ${claim.playerName} · Cartón ${claim.cardNumber}.`, duration:claim.type === 'bingo' ? 9000 : 6000, badge, mascot:claim.type === 'bingo', force:true });
      this.playAlertSound('confirmed'); this.speakEvent(claim.type === 'ambo' ? 'amboConfirmed' : claim.type === 'bingo' ? 'bingoConfirmed' : 'lineConfirmed'); return;
    }
    this.showClaimOverlay({ kind:'rejected', icon:'', title:'PREMIO NO CONFIRMADO', text:`${claim.playerName} · Cartón ${claim.cardNumber}.`, duration:5000, badge:'assets/celebrations/premio-no-confirmado.png', force:true });
    this.playAlertSound('rejected'); this.speakEvent('rejected');
  }

  showClaimOverlay({ kind, icon, title, text, duration, badge = '', mascot = false, force = false }) {
    if (!this.alertsEnabled && !force) return;
    const overlay = $('publicClaimOverlay'), popup = $('publicClaimPopup'); popup.className = `claimPopup ${kind}`;
    const badgeEl = $('publicClaimBadge'), mascotEl = $('publicClaimMascot');
    badgeEl.src = badge || ''; badgeEl.style.display = badge ? 'block' : 'none'; mascotEl.style.display = mascot ? 'block' : 'none';
    $('publicClaimIcon').textContent = icon; $('publicClaimIcon').style.display = icon ? '' : 'none'; $('publicClaimTitle').textContent = title; $('publicClaimText').textContent = text; $('publicClaimConfetti').classList.toggle('hidden', kind.includes('rejected')); overlay.classList.add('show');
    clearTimeout(this.claimOverlayTimer); this.claimOverlayTimer = setTimeout(() => overlay.classList.remove('show'), duration || 5000); overlay.onclick = () => overlay.classList.remove('show');
  }

  playAlertSound(kind) {
    if (!this.audioEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext; if (!AudioCtx) return; const ctx = new AudioCtx();
      const seq = kind === 'bingo' || kind === 'confirmed' ? [523,659,784,1047] : kind === 'rejected' ? [330,247] : [660,880];
      seq.forEach((frequency,index) => { const osc=ctx.createOscillator(), gain=ctx.createGain(), start=ctx.currentTime+index*.13; osc.frequency.value=frequency; gain.gain.setValueAtTime(.0001,start); gain.gain.exponentialRampToValueAtTime(.13,start+.025); gain.gain.exponentialRampToValueAtTime(.0001,start+.18); osc.connect(gain).connect(ctx.destination); osc.start(start); osc.stop(start+.2); });
      setTimeout(() => ctx.close().catch(()=>{}), 1200);
    } catch {}
  }

  handleTestEvent() {
    const event = this.state?.testEvent; if (!event?.id || event.id === this.lastTestEventId || new Date(event.expiresAt || 0).getTime() <= Date.now()) return;
    this.lastTestEventId = event.id;
    if (event.type === 'ball') return this.speakBall(event.number || 42);
    this.showClaimOverlay({ kind:event.type, icon:'🔔', title:`PRUEBA DE ${String(event.type).toUpperCase()}`, text:event.text || 'Prueba del administrador.', duration:4200 }); this.playAlertSound(event.type);
  }

  latestConfirmedWinner() { return [...(this.state?.publicClaims || [])].reverse().find(claim => claim.status === 'confirmed' && claim.winningCard) || null; }
  openDrawnNumbers() { this.renderDrawnNumbers(); $('drawnOverlay').classList.add('show'); }
  renderDrawnNumbers() {
    const drawn = this.state?.game?.drawn || [], set = new Set(drawn);
    $('drawnSummary').textContent = `${drawn.length} de ${this.state?.game?.mode || 90} números`;
    $('drawBoard').innerHTML = Array.from({ length:this.state?.game?.mode || 90 },(_,i)=>i+1).map(number => `<div class="drawNumber ${set.has(number)?'drawn':''}">${number}</div>`).join('');
    $('drawOrder').innerHTML = drawn.map((number,index)=>`<span>${index+1}. <b>${number}</b></span>`).join('');
  }
  openWinnerCard() { this.renderWinnerCard(); $('winnerOverlay').classList.add('show'); }
  renderWinnerCard() {
    const claim = this.latestConfirmedWinner(); if (!claim?.winningCard) return $('winnerContent').innerHTML = '<div class="notice">Todavía no hay un ganador confirmado.</div>';
    const card=claim.winningCard, official=new Set((claim.officialMarked||[]).map(Number)), winning=new Set((claim.winningNumbers||[]).map(Number));
    const cells=card.grid.flat().map(value=>value===null?'<div class="winnerCell blank">·</div>':value==='LIBRE'?`<div class="winnerCell free${claim.type==='bingo'?' winning':''}">LIBRE</div>`:`<div class="winnerCell ${official.has(value)?'official':''} ${winning.has(value)?'winning':''}">${value}</div>`).join('');
    $('winnerContent').innerHTML=`<div class="winnerSummary"><b>${esc(String(claim.prizeLabel||'PREMIO').toUpperCase())} CONFIRMADO</b><br>${esc(claim.playerName)} · Cartón ${esc(claim.cardNumber)}</div><div class="winnerGrid mode${card.mode}">${cells}</div>`;
  }

  async downloadResults() { if (this.state?.status !== 'finished') return; this.downloadFile(`/api/results.pdf?sala=${encodeURIComponent(this.state.roomCode)}`, `Resultados_Bingo_${this.state.roomCode}.pdf`); }
  async downloadLastPublicResult() { if (this.lastResult?.roomCode) this.downloadFile(`/api/results.pdf?sala=${encodeURIComponent(this.lastResult.roomCode)}`, this.lastResult.filename || 'Resultados_Bingo.pdf'); }
  async downloadFile(url, filename) {
    try { const response=await fetch(url,{cache:'no-store'}); if(!response.ok) throw new Error((await response.json().catch(()=>({}))).error||'No se pudo descargar.'); const blob=await response.blob(),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000); }
    catch(error){ this.showMessage(error.message,'error'); }
  }

  backToFinalCards() {
    if (!this.state || this.state.status !== 'finished') return;
    this.finalOverlayDismissedFor = this.state.roomCode;
    $('finalResultsOverlay').classList.remove('show');
    setTimeout(() => ($('cardTabs') || $('ticketPanel'))?.scrollIntoView({ behavior:'smooth', block:'start' }), 50);
  }

  showRoomClosed() {
    if (this.roomClosedShown) return;
    this.roomClosedShown = true;
    this.events?.close();
    this.token = '';
    localStorage.removeItem('bingoOnlineToken');
    localStorage.removeItem('bingoOnlineCard');
    $('connectionMask').classList.remove('show');
    $('finalResultsOverlay').classList.remove('show');
    $('roomClosedOverlay').classList.add('show');
  }

  renderNotice() {
    const latest=(this.state?.player?.notices||[]).at(-1); if(!latest) return; const key=`noticeSeen:${latest.id}`; if(sessionStorage.getItem(key)) return; sessionStorage.setItem(key,'1'); this.showMessage(latest.text,latest.result==='confirmed'?'notice':'error');
  }
  showMessage(text,kind='notice') { $('playerNotice').innerHTML=`<div class="${kind}">${esc(text)}</div>`; clearTimeout(this.messageTimer); this.messageTimer=setTimeout(()=>{$('playerNotice').innerHTML='';},8000); }
  closeModal(id) { $(id)?.classList.remove('show'); }

  toggleTheme() { this.theme=this.theme==='day'?'night':'day'; localStorage.setItem('bingoPlayerTheme',this.theme); this.applyTheme(); }
  applyTheme() { document.documentElement.dataset.theme=this.theme; $('themeToggle').textContent=this.theme==='day'?'🌙':'☀️'; }
  async setFocusMode(enabled) {
    this.focusMode=Boolean(enabled); document.body.classList.toggle('focusMode',this.focusMode);
    if(this.focusMode){try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement){await document.documentElement.requestFullscreen();this.fullscreenApiActive=true;}}catch{} window.scrollTo({top:0});return;}
    if(document.fullscreenElement&&document.exitFullscreen)try{await document.exitFullscreen();}catch{} this.fullscreenApiActive=false;
  }

  logout(reload=true) {
    this.events?.close(); clearInterval(this.sequenceTimer); this.setFocusMode(false); this.token=''; this.state=null; this.roomClosedShown=false; localStorage.removeItem('bingoOnlineToken'); localStorage.removeItem('bingoOnlineCard');
    if(reload) location.reload(); else { $('gameView').classList.add('hidden'); $('loginView').classList.remove('hidden'); }
  }
}

window.addEventListener('DOMContentLoaded', () => new PlayerApp().init());
})();
