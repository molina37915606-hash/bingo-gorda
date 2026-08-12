(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
const Scripts = window.BingoPresenterScripts || {};
const PRESENTERS = Scripts.profiles || {};
const storage = {
  getItem(key){ try { return window['localStorage'].getItem(key); } catch { return null; } },
  setItem(key,value){ try { window['localStorage'].setItem(key,String(value)); } catch {} },
  removeItem(key){ try { window['localStorage'].removeItem(key); } catch {} }
};

class PlayerApp {
  constructor() {
    this.token = String(window.__BINGO_DEMO_DIRECT_TOKEN__ || storage.getItem('bingoOnlineToken') || '');
    this.cookieSession = false;
    this.tokenRoom = String(storage.getItem('bingoOnlineRoom') || '').trim().toUpperCase();
    this.deviceId = storage.getItem('bingoPlayerDeviceId') || this.makeDeviceId();
    storage.setItem('bingoPlayerDeviceId', this.deviceId);
    this.state = null;
    this.activeCardId = storage.getItem('bingoOnlineCard') || '';
    this.events = null;
    this.reconnectRefreshTimer = null;
    this.reconnectAttempts = 0;
    this.selectedOffers = new Set();
    this.pendingReservation = new Set();
    this.pendingMark = new Set();
    this.pendingClaims = new Set();
    this.claimClickGuard = new Map();
    this.voices = [];
    this.phrases = Scripts.PhraseEngine ? new Scripts.PhraseEngine() : { ball:(id,n)=>`Número ${n}`, event:()=>'' };
    this.audioPreferenceLoaded = storage.getItem('bingoPlayerSound') !== null;
    this.audioEnabled = storage.getItem('bingoPlayerSound') !== 'false';
    this.voiceEnabled = storage.getItem('bingoPlayerVoice') !== 'false';
    this.alertsEnabled = storage.getItem('bingoPlayerAlerts') !== 'false';
    this.audioVolume = Math.max(0, Math.min(1, Number(storage.getItem('bingoPlayerVolume') ?? .92)));
    this.largeNumbers = storage.getItem('bingoPlayerLargeNumbers') === null ? true : storage.getItem('bingoPlayerLargeNumbers') === 'true';
    this.lastPublicClaimKey = '';
    this.lastAdminMessageId = '';
    this.seenChatMessageIds = new Set();
    this.chatUnreadCount = 0;
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
    this.theme = storage.getItem('bingoPlayerTheme') === 'day' ? 'day' : 'night';
    this.focusMode = false;
    this.fullscreenApiActive = false;
    this.guideStep = 0;
    this.guideStage = '';
    this.guideSteps = [];
    this.guideOpen = false;
    this.guideManual = false;
    this.guideTarget = null;
    this.guidePositionTimer = null;
    this.guideAutoTimer = null;
    this.guideResumeStep = 0;
    this.guideSessionStatus = '';
    this.autoMarkDesired = null;
    this.autoMarkFeedback = null;
    this.autoMarkSyncing = false;
    this.finalOverlayDismissedFor = '';
    this.roomClosedShown = false;
    this.drawerTab = 'winners';
    this.selectedWinnerId = '';
    this.resultsViewerUrl = '';
    this.resultsViewerObjectUrl = '';
    this.stickerSendTimes = [];
    this.openJoinMode = false;
    this.openJoinCardCount = 2;
    this.waitingMini = {
      activeType: ['red_black','higher_lower'].includes(storage.getItem('bingoWaitingMiniGame')) ? storage.getItem('bingoWaitingMiniGame') : 'red_black',
      score: 0, best: 0, bestByType: { red_black: 0, higher_lower: 0 }, current: null, ended: false, busy: false, message: ''
    };
    this.ticketTouchStartX = null;
    this.wakeLock = null;
    this.systemClockTimer = null;
    this.networkTimer = null;
    this.networkState = 'connecting';
    this.lastNetworkSuccessAt = 0;
    this.lastDrawCount = 0;
    this.lastBallAnimationTimer = null;
    this.demoBootRetrying = false;
    this.demoStartBusy = false;
    this.demoAutoStartTimer = null;
    this.demoAutoStartDeadline = 0;
    this.demoAutoStartFailure = '';
    this.manualLagStartDrawCount = null;
    this.manualLagPrompted = false;
    this.lastManualPending = 0;
    this.markingModeChoosing = false;
    this.adminPreviewMode = false;
    this.adminPreviewSession = '';
    this.adminPreviewTimer = null;
  }

  makeDeviceId() {
    return `device_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  }

  async init() {
    this.injectDemoUi();
    this.injectChatUi();
    this.systemClockTimer = setInterval(() => this.renderSystemTrust(), 1000);
    this.networkTimer = setInterval(() => this.refreshNetworkIndicator(), 1800);
    window.addEventListener('online', () => { this.setNetworkState('connecting'); this.scheduleReconnectRefresh(true); });
    window.addEventListener('offline', () => this.setNetworkState('bad'));
    document.addEventListener('visibilitychange', () => this.updateWakeLock());
    window.addEventListener('pagehide', () => this.releaseWakeLock());
    window.addEventListener('resize', () => this.guideOpen && this.positionGuide());
    window.addEventListener('scroll', () => this.guideOpen && this.positionGuide(), { passive:true });
    $('loginBtn').onclick = () => this.login();
    $('lastResultBtn').onclick = () => this.downloadLastPublicResult();
    $('demoBootRetryBtn')?.addEventListener('click', () => this.retryDemoBoot());
    $('demoBootBackBtn')?.addEventListener('click', () => location.replace('/demo'));
    $('accessCode').addEventListener('keydown', event => { if (event.key === 'Enter') this.login(); });
    $('openJoinName')?.addEventListener('keydown', event => { if (event.key === 'Enter') this.login(); });
    $('openJoinCardCount')?.querySelectorAll('[data-count]').forEach(button => button.onclick = () => { this.openJoinCardCount = Number(button.dataset.count) || 2; $('openJoinCardCount').querySelectorAll('[data-count]').forEach(item => item.classList.toggle('active', item === button)); });
    $('claimAmbo').onclick = () => this.claim('ambo');
    $('claimCorners').onclick = () => this.claim('corners');
    $('claimLine').onclick = () => this.claim('line');
    $('claimDoubleLine').onclick = () => this.claim('doubleLine');
    $('claimTripleLine').onclick = () => this.claim('tripleLine');
    $('claimBingo').onclick = () => this.claim('bingo');
    $('logoutBtn').onclick = () => this.logout();
    $('themeToggle').onclick = () => this.toggleTheme();
    $('settingsToggle').onclick = () => this.openSettings();
    $('settingsClose').onclick = () => this.closeSettings();
    $('settingsOverlay').addEventListener('click', event => { if (event.target === $('settingsOverlay')) this.closeSettings(); });
    $('soundToggle').onclick = () => this.setAudioEnabled(!this.audioEnabled);
    $('voiceToggle').onclick = () => this.setVoiceEnabled(!this.voiceEnabled);
    $('quickSoundBtn').onclick = () => this.setAudioEnabled(!this.audioEnabled);
    $('quickVoiceBtn').onclick = () => this.setVoiceEnabled(!this.voiceEnabled);
    $('volumeRange').oninput = event => this.setVolume(Number(event.target.value) / 100);
    $('numberSizeToggle').onclick = () => this.setLargeNumbers(!this.largeNumbers);
    $('autoMarkToggle').onclick = () => this.queueAutoMark(!this.autoMarkVisualState());
    $('quickAutoMarkBtn').onclick = () => this.queueAutoMark(true);
    $('quickManualMarkBtn').onclick = () => this.queueAutoMark(false);
    $('markingModeManual').onclick = () => this.chooseInitialMarkingMode(false);
    $('markingModeAuto').onclick = () => this.chooseInitialMarkingMode(true);
    $('autoAssistAccept').onclick = () => { this.closeModal('autoAssistOverlay'); this.queueAutoMark(true); };
    $('autoAssistDecline').onclick = () => { this.manualLagPrompted = true; this.closeModal('autoAssistOverlay'); };
    $('helpBtn').onclick = () => this.openTutorialChoice();
    $('tutorialContinueBtn').onclick = () => this.continueGuideFromMemory();
    $('tutorialRestartBtn').onclick = () => this.restartGuide();
    $('tutorialChoiceClose').onclick = () => this.closeModal('tutorialChoiceOverlay');
    $('tutorialChoiceOverlay').addEventListener('click', event => { if (event.target === $('tutorialChoiceOverlay')) this.closeModal('tutorialChoiceOverlay'); });
    $('closeGuideBtn').onclick = () => this.closeGuide(true);
    $('guideSkipBtn').onclick = () => this.skipGuide();
    $('guidePrevBtn').onclick = () => { this.guideStep = Math.max(0, this.guideStep - 1); this.renderGuideStep(); };
    $('guideNextBtn').onclick = () => this.nextGuideStep();
    $('requestTransferBtn').onclick = () => this.requestDeviceTransfer();
    $('cancelTransferBtn').onclick = () => this.closeTransfer();
    $('showDrawnBtn').onclick = () => this.openInfoDrawer('numbers');
    $('showWinnerBtn').onclick = () => this.openInfoDrawer('winners');
    $('resultsBtn').onclick = () => this.openResultsViewer();
    $('finalViewBtn').onclick = () => this.openResultsViewer();
    $('finalDownloadBtn').onclick = () => this.downloadResults();
    $('finalBackBtn').onclick = () => this.backToFinalCards();
    $('drawerViewResultsBtn').onclick = () => this.openResultsViewer();
    $('drawerDownloadResultsBtn').onclick = () => this.downloadResults();
    $('resultsViewerClose').onclick = () => this.closeResultsViewer();
    $('resultsViewerDownloadBtn').onclick = () => this.downloadResults();
    $('resultsOpenTabBtn').onclick = () => this.openResultsInNewTab();
    $('resultsViewerOverlay').addEventListener('click', event => { if (event.target === $('resultsViewerOverlay')) this.closeResultsViewer(); });
    $('infoDrawerToggle').onclick = () => this.toggleInfoDrawer();
    $('infoDrawerClose').onclick = () => this.closeInfoDrawer();
    $('infoDrawerBackdrop').onclick = () => this.closeInfoDrawer();
    $('drawerWinnersTab').onclick = () => this.setDrawerTab('winners');
    $('drawerNumbersTab').onclick = () => this.setDrawerTab('numbers');
    $('partialKeepChoosingBtn').onclick = () => this.closeModal('partialChoiceOverlay');
    $('partialContinueBtn').onclick = () => { this.closeModal('partialChoiceOverlay'); this.confirmChoice(true); };
    $('roomClosedBtn').onclick = () => this.logout(true);
    $('closeWinnerBtn').onclick = () => this.closeModal('winnerOverlay');
    $('watchBtn').onclick = () => this.openWatchPanel();
    $('closeWatchBtn').onclick = () => this.closeModal('watchOverlay');
    $('openWatchBtn').onclick = () => this.state?.broadcastUrl && window.open(this.state.broadcastUrl,'_blank','noopener');
    $('copyWatchBtn').onclick = () => this.copyWatchLink();
    $('castWatchBtn').onclick = () => this.castWatch();
    $('fullScreenBtn').onclick = () => this.setFocusMode(!this.focusMode);
    ['winnerOverlay','partialChoiceOverlay','watchOverlay'].forEach(id => $(id)?.addEventListener('click', event => { if (event.target === $(id)) this.closeModal(id); }));
    $('ticketPanel').addEventListener('touchstart', event => this.beginTicketSwipe(event), { passive:true });
    $('ticketPanel').addEventListener('touchend', event => this.endTicketSwipe(event), { passive:true });
    document.addEventListener('keydown', event => {
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && this.state?.player?.cards?.length > 1 && !this.guideOpen && !$('settingsOverlay').classList.contains('show') && !$('playerChatPanel')?.classList.contains('show')) {
        this.switchCard(event.key === 'ArrowRight' ? 1 : -1, 'keyboard');
        return;
      }
      if (event.key !== 'Escape') return;
      if ($('tutorialChoiceOverlay').classList.contains('show')) return this.closeModal('tutorialChoiceOverlay');
      if ($('resultsViewerOverlay').classList.contains('show')) return this.closeResultsViewer();
      if ($('settingsOverlay').classList.contains('show')) return this.closeSettings();
      if ($('infoDrawer').classList.contains('show')) return this.closeInfoDrawer();
      if ($('playerChatPanel')?.classList.contains('show')) return this.closeChat();
      this.closeModal('winnerOverlay'); this.closeModal('partialChoiceOverlay'); this.closeModal('watchOverlay'); this.closeGuide();
      if (this.focusMode) this.setFocusMode(false);
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        this.fullscreenApiActive = false;
        this.focusMode = false;
        document.body.classList.remove('focusMode');
      }
      this.updateFullscreenButton();
    });
    this.applyTheme();
    this.setLargeNumbers(this.largeNumbers, false);
    this.setVolume(this.audioVolume, false);
    this.updateQuickTools();
    this.setNetworkState(navigator.onLine === false ? 'bad' : 'connecting');
    this.refreshVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => this.refreshVoices();

    const params = new URLSearchParams(location.search);
    const adminPreviewEntry = params.get('adminpreview') === '1';
    const adminPreviewSession = String(params.get('previewSession') || '').trim();
    if (adminPreviewEntry) {
      this.adminPreviewMode = true;
      this.adminPreviewSession = adminPreviewSession;
      this.injectAdminPreviewBadge();
    }
    const demoEntry = params.get('demo') === '1';
    const directSession = String(params.get('session') || '').trim();
    const directCode = String(params.get('acceso') || params.get('codigo') || params.get('code') || '').trim().toUpperCase();
    const roomCode = String(params.get('sala') || '').trim().toUpperCase();
    this.openJoinMode = params.get('prueba') === '1' && Boolean(roomCode);
    if (this.openJoinMode) {
      $('codeLoginFields')?.classList.add('hidden');
      $('openJoinFields')?.classList.add('show');
      $('loginIntro').textContent = 'Escribí tu nombre, elegí tus cartones y entrá directamente a la sala de prueba.';
      $('loginBtn').textContent = 'ENTRAR A LA SALA';
    }
    if (adminPreviewEntry && adminPreviewSession) {
      this.token = '';
      this.tokenRoom = '';
      storage.removeItem('bingoOnlineToken');
      $('loginView').classList.add('hidden');
      $('gameView').classList.remove('hidden');
      document.body.classList.add('playerLogged');
      await this.resumeAdminPreview();
      this.adminPreviewTimer = setInterval(() => this.resumeAdminPreview({ silent:true }), 1000);
    } else if (demoEntry) {
      // La DEMO v3 entra por una ruta propia. El servidor embebe tanto el estado
      // inicial como un token temporal de esa demostración; no depende de cookies
      // ni de localStorage para poder iniciar la interfaz real del jugador.
      const directDemoToken = String(window.__BINGO_DEMO_DIRECT_TOKEN__ || '');
      this.token = directDemoToken;
      this.tokenRoom = '';
      this.cookieSession = !directDemoToken;
      storage.removeItem('bingoOnlineToken');
      storage.removeItem('bingoOnlineRoom');
      storage.removeItem('bingoOnlineCard');
      const initialDemoState = window.__BINGO_DEMO_BOOTSTRAP__;
      if (initialDemoState?.demo?.active && initialDemoState?.player?.demoHuman) {
        this.tokenRoom = String(initialDemoState.roomCode || '').trim().toUpperCase();
        if (this.tokenRoom) storage.setItem('bingoOnlineRoom', this.tokenRoom);
        this.applyState(initialDemoState);
        delete document.documentElement.dataset.demoBoot;
        delete document.documentElement.dataset.demoBootError;
        $('demoBootError')?.classList.remove('show');
        window.__BINGO_DEMO_BOOT_READY__ = true;
        clearTimeout(window.__bingoDemoBootWatchdog);
        this.connectEvents();
      } else {
        await this.resume({ demoBoot:true });
      }
    } else if (directSession) {
      this.token = directSession;
      this.tokenRoom = '';
      storage.setItem('bingoOnlineToken', this.token);
      this.cleanDirectAccessUrl();
      await this.resume();
      this.connectEvents();
    } else if (directCode) {
      $('accessCode').value = directCode;
      await this.login(directCode, roomCode);
    } else if (this.token && (!roomCode || (this.tokenRoom && this.tokenRoom === roomCode))) {
      await this.resume();
    } else if (roomCode && this.token && this.tokenRoom !== roomCode) {
      this.token = '';
      this.tokenRoom = '';
      this.activeCardId = '';
      storage.removeItem('bingoOnlineToken');
      storage.removeItem('bingoOnlineRoom');
      storage.removeItem('bingoOnlineCard');
    }

    // Información secundaria: se carga después del intento de entrada y nunca bloquea la DEMO.
    this.loadPublicInfo();
    this.keepAliveTimer = setInterval(() => { if (this.state?.active) fetch('/api/ping', { cache:'no-store' }).catch(() => {}); }, 5 * 60 * 1000);
    this.assignmentClockTimer = setInterval(() => this.updateAssignmentCountdown(), 1000);
  }


  injectAdminPreviewBadge() {
    if ($('adminPreviewBadge')) return;
    const style = document.createElement('style');
    style.textContent = `.adminPreviewBadge{position:fixed;left:8px;bottom:8px;z-index:118;padding:7px 10px;border-radius:12px;background:#151a2cdd;border:1px solid #6cc7ff88;box-shadow:0 8px 25px #0008;color:#fff;font-size:10px;font-weight:1000;backdrop-filter:blur(10px)}.adminPreviewMode #claimBar button,.adminPreviewMode #autoMarkToggle,.adminPreviewMode #quickAutoMarkBtn,.adminPreviewMode #quickManualMarkBtn,.adminPreviewMode #markingModeManual,.adminPreviewMode #markingModeAuto,.adminPreviewMode #waitingPanel button,.adminPreviewMode #waitingPanel input,.adminPreviewMode .cell.number,.adminPreviewMode .playerChatComposer,.adminPreviewMode .playerPicker button{pointer-events:none!important}.adminPreviewMode #logoutBtn{display:none!important}`;
    document.head.appendChild(style);
    document.body.classList.add('adminPreviewMode');
    const badge = document.createElement('div');
    badge.id='adminPreviewBadge';badge.className='adminPreviewBadge';badge.textContent='▯ VISTA PREVIA · NO MODIFICA LA PARTIDA';
    document.body.appendChild(badge);
  }

  async resumeAdminPreview({ silent = false } = {}) {
    if (!this.adminPreviewSession) return false;
    try {
      const response = await fetch(`/api/admin-player-preview/state?token=${encodeURIComponent(this.adminPreviewSession)}`, { cache:'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar la vista previa.');
      this.applyState(data);
      this.setNetworkState('good');
      return true;
    } catch (error) {
      this.setNetworkState('bad');
      if (!silent) {
        $('loginView').classList.add('hidden');
        $('gameView').classList.remove('hidden');
        document.body.classList.add('playerLogged');
        this.showMessage(error.message || 'La vista previa no está disponible.', 'error');
      }
      return false;
    }
  }

  injectDemoUi() {
    if ($('demoPlayerBanner')) return;
    const style = document.createElement('style');
    style.textContent = `
      .demoPlayerBanner{display:none;margin:0 0 14px;padding:12px 14px;border-radius:15px;background:linear-gradient(135deg,#4b1764,#7e1f73);border:1px solid #d79de6;color:#fff;box-shadow:0 12px 34px #0005}.demoPlayerBanner.show{display:grid;gap:9px}.demoPlayerBannerTop{display:flex;justify-content:space-between;align-items:center;gap:12px}.demoPlayerBanner strong{font-size:14px;letter-spacing:.04em}.demoPlayerBanner small{color:#f2dff5}.demoParticipants{display:flex;flex-wrap:wrap;gap:7px}.demoParticipant{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;background:#ffffff14;border:1px solid #ffffff22;font-size:12px;font-weight:800}.demoParticipant.you{background:#ffca2f;color:#241805;border-color:#ffdf78}.demoPlayerActions{display:flex;gap:7px;align-items:center}.demoAiTag{font-size:9px;padding:2px 5px;border-radius:999px;background:#17243a;color:#d9ebff}.demoAutoStart{display:grid;gap:8px;margin-top:12px;padding:12px;border-radius:14px;background:#11182a;border:1px solid #53627f;text-align:center}.demoAutoStart strong{font-size:18px}.demoAutoStart .demoCountdown{font-size:34px;line-height:1;font-weight:1000;color:#ffca2f}.demoAutoStart small{color:#c8d3e8}.demoAutoStart.error{border-color:#d85464;background:#30151b}.demoAutoStart.error strong{color:#ffd6dc}.demoAutoStart button{justify-self:center;min-width:150px}.demoAutoStart.waitingTutorial .demoCountdown{font-size:20px;color:#d9e2f2}html[data-theme="day"] .demoPlayerBanner{background:linear-gradient(135deg,#efe1f3,#f6e8f2);color:#32153d;border-color:#b98ac4}html[data-theme="day"] .demoPlayerBanner small{color:#6f4e75}html[data-theme="day"] .demoParticipant{background:#fff8;border-color:#80588a33}html[data-theme="day"] .demoParticipant.you{background:#ffca2f;color:#241805}html[data-theme="day"] .demoAutoStart{background:#f4f6fb;border-color:#bcc7da;color:#1e2a40}html[data-theme="day"] .demoAutoStart small{color:#53627a}html[data-theme="day"] .demoAutoStart.error{background:#fff0f2;border-color:#d85464}
    `;
    document.head.appendChild(style);
    const host = $('gameView') || document.body;
    const banner = document.createElement('section');
    banner.id = 'demoPlayerBanner'; banner.className = 'demoPlayerBanner';
    banner.innerHTML = `<div class="demoPlayerBannerTop"><div><strong>DEMOSTRACIÓN · SIN VALIDEZ OFICIAL</strong><br><small id="demoPlayerSummary"></small></div><div class="demoPlayerActions"><span id="demoPlayerSpeed"></span><button id="demoResetBtn" class="demoResetButton" type="button">REINICIAR DEMO</button></div></div><div id="demoParticipants" class="demoParticipants"></div>`;
    $('demoResetBtn').onclick = () => this.restartDemo();
    host.prepend(banner);
  }

  renderDemoUi() {
    const banner = $('demoPlayerBanner');
    if (!banner) return;
    const demo = this.state?.demo;
    banner.classList.toggle('show', Boolean(demo?.active));
    if (!demo?.active) return;
    const participants = demo.participants || [];
    const rivals = participants.filter(item => item.virtual).length;
    $('demoPlayerSummary').textContent = `${this.state.game.mode} bolas · ${rivals} rival${rivals === 1 ? '' : 'es'} IA · tutorial completo`;
    $('demoPlayerSpeed').textContent = `${Number(demo.autoSeconds) || 4} s por bolilla`;
    $('demoParticipants').innerHTML = participants.map(item => `<span class="demoParticipant ${item.virtual ? '' : 'you'}">${esc(item.name)}${item.virtual ? '<span class="demoAiTag">IA</span>' : ''} · ${Number(item.cardCount) || 0} cartón${Number(item.cardCount) === 1 ? '' : 'es'}</span>`).join('');
  }

  injectChatUi() {
    if ($('playerChatDock')) return;
    const style = document.createElement('style');
    style.textContent = `
      .playerChatDock{position:fixed;right:9px;bottom:max(9px,env(safe-area-inset-bottom));z-index:105}.playerChatToggle{position:relative;min-height:44px;border:0;border-radius:999px;padding:10px 14px;background:#5a167b;color:#fff;font-weight:1000;box-shadow:0 10px 35px #0008;cursor:pointer}.playerChatPanel{display:none;position:fixed;right:9px;bottom:62px;width:min(430px,calc(100vw - 18px));height:min(620px,calc(100dvh - 82px));background:var(--panel);border:1px solid var(--border);border-radius:20px;overflow:hidden;box-shadow:0 25px 70px #000b}.playerChatPanel.show{display:grid;grid-template-rows:auto minmax(0,1fr) auto auto auto auto}.playerChatPanel header{display:flex;justify-content:space-between;align-items:center;padding:11px 13px;background:linear-gradient(135deg,#5a167b,#7b2494);color:#fff}.playerChatPanel header button{border:0;background:transparent;color:#fff;font-size:24px}.playerChatMessages{min-height:0;overflow:auto;padding:10px;display:grid;align-content:start;gap:8px;background:var(--panel3);overscroll-behavior:contain}.playerChatMessage{padding:9px 10px;border-radius:11px;background:var(--panel2);color:var(--text);border:1px solid var(--border)}.playerChatMessage.admin{background:#3b2454;color:#fff;border-color:#9867b2}.playerChatMessage small{display:flex;justify-content:space-between;gap:8px;color:var(--muted);margin-bottom:4px}.playerChatMessage.admin small{color:#e3cdeb}.playerChatMessage p{margin:0;word-break:break-word}.playerChatMessage.stickerMessage{background:transparent;border-color:transparent;padding:5px 8px}.playerChatMessage.stickerMessage small{margin-bottom:1px}.playerChatMessage.stickerMessage p{display:flex;align-items:center;min-height:104px}.playerChatComposer{display:grid;grid-template-columns:46px 46px minmax(0,1fr) auto;align-items:end;border-top:1px solid var(--border);background:var(--panel)}.playerChatToolButton{width:46px;height:52px;border:0;border-right:1px solid var(--border);background:var(--panel2);color:var(--text);font-size:22px;font-weight:900;cursor:pointer}.playerChatToolButton.active{background:#5a167b;color:#fff}.playerChatPanel textarea{resize:none;min-height:52px;max-height:94px;padding:10px;border:0;background:var(--panel);color:var(--text);outline:none}.playerChatSend{height:52px;border:0;padding:0 14px;background:#ffca2f;color:#1b1405;font-weight:1000}.playerChatNotice{padding:8px 10px;background:#3f2c0a;color:#ffe39a;font-size:12px}.playerPicker{display:none;padding:9px;border-top:1px solid var(--border);background:var(--panel2);max-height:min(38dvh,280px);overflow:auto}.playerPicker.show{display:grid}.playerEmojiMenu{grid-template-columns:repeat(5,1fr);gap:5px}.playerEmojiMenu button{height:48px;border:1px solid var(--border);border-radius:11px;background:var(--panel3);color:var(--text);font-size:25px;cursor:pointer}.playerEmojiMenu button:active{transform:scale(.92)}.playerStickerMenu{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.playerStickerMenu .premiumStickerButton{min-height:88px}.playerStickerHint{grid-column:1/-1;color:var(--muted);font-size:11px;line-height:1.35;padding:2px 3px 5px}.playerChatBadge:not(:empty){position:absolute;right:-5px;top:-7px;display:grid;place-items:center;min-width:21px;height:21px;padding:0 5px;border-radius:999px;background:#ff2f55;color:#fff;border:2px solid #fff;font-size:10px;line-height:1;font-weight:1000;box-shadow:0 4px 12px #0007}.playerChatToggle.hasUnread{animation:chatUnreadPulse .34s ease-out 2}@keyframes chatUnreadPulse{50%{transform:scale(1.09);box-shadow:0 0 0 5px #ff2f5538,0 10px 35px #0008}}.playerChatToggle:focus-visible,.playerPicker button:focus-visible,.playerChatToolButton:focus-visible{outline:3px solid #ffca2f;outline-offset:2px}.concentrationMode .playerChatDock{opacity:.78;transition:opacity .15s}.concentrationMode .playerChatDock:hover,.concentrationMode .playerChatDock:focus-within{opacity:1}
      @media(max-width:720px){.playerChatDock{right:7px;bottom:max(7px,env(safe-area-inset-bottom))}.playerChatPanel{left:6px;right:6px;bottom:58px;width:auto;height:min(690px,calc(100dvh - 70px));border-radius:18px}.playerEmojiMenu{grid-template-columns:repeat(5,1fr)}.playerStickerMenu{grid-template-columns:repeat(3,minmax(0,1fr))}.playerStickerMenu .premiumStickerButton{min-height:82px}.playerChatComposer{grid-template-columns:44px 44px minmax(0,1fr) auto}.playerChatToolButton{width:44px}.playerChatToggle{min-height:43px;padding:9px 12px}}
      @media(orientation:landscape) and (max-height:650px) and (min-width:568px){.playerChatPanel{top:5px;right:5px;bottom:5px;left:auto;width:min(390px,48vw);height:auto;border-radius:16px}.playerChatDock{right:7px;bottom:7px}.playerPicker{max-height:42dvh}.playerChatMessage{padding:6px 8px;font-size:11px}.playerChatPanel header{padding:7px 10px}.playerChatComposer{grid-template-columns:40px 40px minmax(0,1fr) auto}.playerChatToolButton{width:40px;height:44px}.playerChatPanel textarea,.playerChatSend{height:44px;min-height:44px}}
    `;
    document.head.appendChild(style);
    const dock = document.createElement('aside');
    dock.id = 'playerChatDock'; dock.className = 'playerChatDock';
    const stickers = window.BingoEmojiStickers;
    const commonEmojis = stickers?.commonEmojis || ['😀','😁','😂','😉','😊','😎','😮','😭','😤','🤞','🙏','👏','👍','❤️','🔥','🎉','🍀','🎱','⭐','💰'];
    const emojiButtons = commonEmojis.map(emoji => `<button type="button" data-common-emoji="${emoji}" aria-label="Emoji ${emoji}">${emoji}</button>`).join('');
    const stickerButtons = (stickers?.stickers || []).map(item => `<button class="premiumStickerButton" type="button" data-send-sticker="${item.id}" aria-label="Enviar sticker ${item.label}">${stickers.sticker(item.id,{className:'premiumStickerMenuIcon',replay:false})}</button>`).join('');
    dock.innerHTML = `<button id="playerChatToggle" class="playerChatToggle" type="button">💬 CHAT <span id="playerChatBadge" class="playerChatBadge"></span></button><section id="playerChatPanel" class="playerChatPanel" aria-label="Chat público"><header><b>CHAT PÚBLICO</b><button id="playerChatClose" type="button" aria-label="Cerrar">×</button></header><div id="playerChatMessages" class="playerChatMessages"></div><div id="playerChatNotice" class="playerChatNotice hidden"></div><div id="playerEmojiMenu" class="playerPicker playerEmojiMenu" aria-label="Emojis comunes">${emojiButtons}</div><div id="playerStickerMenu" class="playerPicker playerStickerMenu" aria-label="Stickers premium"><div class="playerStickerHint">Los stickers se envían solos con un toque. Tocá un sticker recibido para repetir su animación.</div>${stickerButtons}</div><div class="playerChatComposer"><button id="playerChatEmojiButton" class="playerChatToolButton" type="button" aria-label="Emojis comunes">☺</button><button id="playerChatStickerButton" class="playerChatToolButton" type="button" aria-label="Stickers premium">✦</button><textarea id="playerChatInput" maxlength="160" placeholder="Escribí un mensaje"></textarea><button id="playerChatSend" class="playerChatSend" type="button">ENVIAR</button></div></section>`;
    document.body.appendChild(dock);
    $('playerChatToggle').onclick = () => {
      const opening = !$('playerChatPanel').classList.contains('show');
      if (opening) this.closeOtherPanels('chat');
      $('playerChatPanel').classList.toggle('show', opening);
      if (opening) { this.chatUnreadCount = 0; $('playerChatBadge').textContent = ''; $('playerChatToggle').classList.remove('hasUnread'); }
      this.renderChat();
      if (opening) setTimeout(() => $('playerChatInput').focus({ preventScroll:true }), 80);
    };
    $('playerChatClose').onclick = () => this.closeChat();
    $('playerChatEmojiButton').onclick = () => this.toggleChatPicker('emoji');
    $('playerChatStickerButton').onclick = () => this.toggleChatPicker('sticker');
    $('playerEmojiMenu').querySelectorAll('[data-common-emoji]').forEach(button => button.onclick = () => this.insertChatEmoji(button.dataset.commonEmoji));
    $('playerStickerMenu').querySelectorAll('[data-send-sticker]').forEach(button => button.onclick = () => {
      const preview = button.querySelector('.premiumSticker');
      if (preview) { preview.classList.remove('preview'); void preview.offsetWidth; preview.classList.add('preview'); }
      setTimeout(() => this.sendSticker(button.dataset.sendSticker), 150);
    });
    $('playerChatMessages').addEventListener('click', event => window.BingoEmojiStickers?.replay(event.target));
    $('playerChatSend').onclick = () => this.sendChat();
    $('playerChatInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.sendChat(); } });
  }

  toggleChatPicker(which) {
    const emoji = $('playerEmojiMenu'), sticker = $('playerStickerMenu');
    const showEmoji = which === 'emoji' && !emoji.classList.contains('show');
    const showSticker = which === 'sticker' && !sticker.classList.contains('show');
    emoji.classList.toggle('show', showEmoji); sticker.classList.toggle('show', showSticker);
    $('playerChatEmojiButton').classList.toggle('active', showEmoji);
    $('playerChatStickerButton').classList.toggle('active', showSticker);
  }

  closeChat() {
    $('playerChatPanel')?.classList.remove('show');
    $('playerEmojiMenu')?.classList.remove('show');
    $('playerStickerMenu')?.classList.remove('show');
    $('playerChatEmojiButton')?.classList.remove('active');
    $('playerChatStickerButton')?.classList.remove('active');
  }

  insertChatEmoji(emoji) {
    const input = $('playerChatInput');
    if (!input || input.disabled || !window.BingoEmojiStickers?.commonEmojis.includes(emoji)) return;
    const allowed = window.BingoEmojiStickers.commonEmojis;
    const used = [...input.value].filter(char => allowed.includes(char)).length + (input.value.match(/❤️/g)?.length || 0);
    if (used >= 4) return this.showMessage('Podés agregar hasta 4 emojis del menú por mensaje.', 'error');
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = `${input.value.slice(0,start)}${emoji}${input.value.slice(end)}`.slice(0,160);
    const next = Math.min(input.value.length, start + emoji.length);
    input.focus(); input.setSelectionRange(next,next);
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
    const stickers = window.BingoEmojiStickers;
    const messages = chat.messages || [];
    const freshIds = new Set(messages.filter(message => !this.seenChatMessageIds.has(message.id)).map(message => message.id));
    host.innerHTML = messages.map(message => {
      const animate = Boolean(incoming && freshIds.has(message.id));
      const isSticker = Boolean(stickers?.isStickerMessage(message));
      const body = stickers ? stickers.renderMessage(message, { animate }) : esc(message.text || '');
      return `<article class="playerChatMessage ${message.role === 'admin' ? 'admin' : ''} ${isSticker ? 'stickerMessage' : ''}"><small><b>${esc(message.name)}</b><span>${esc(this.chatTime(message.createdAt))}</span></small><p>${body}</p></article>`;
    }).join('') || '<div style="text-align:center;color:#aeb8cd;padding:25px">Todavía no hay mensajes.</div>';
    messages.forEach(message => this.seenChatMessageIds.add(message.id));
    if (incoming || $('playerChatPanel').classList.contains('show')) host.scrollTop = host.scrollHeight;
    const blocked = chat.enabled === false || chat.locked || chat.muted;
    $('playerChatInput').disabled = blocked;
    $('playerChatSend').disabled = blocked;
    $('playerChatEmojiButton').disabled = blocked;
    $('playerChatStickerButton').disabled = blocked;
    const notice = $('playerChatNotice');
    notice.classList.toggle('hidden', !blocked);
    notice.textContent = chat.enabled === false ? 'El chat está deshabilitado.' : chat.muted ? 'El administrador silenció tu participación.' : chat.locked ? 'El chat está pausado temporalmente.' : '';
    const chatOpen = $('playerChatPanel').classList.contains('show');
    if (chatOpen) { this.chatUnreadCount = 0; $('playerChatBadge').textContent = ''; $('playerChatToggle').classList.remove('hasUnread'); }
    else if (incoming && freshIds.size) {
      const wasEmpty = this.chatUnreadCount === 0;
      this.chatUnreadCount = Math.min(99, this.chatUnreadCount + freshIds.size);
      $('playerChatBadge').textContent = this.chatUnreadCount > 9 ? '9+' : String(this.chatUnreadCount);
      if (wasEmpty) { $('playerChatToggle').classList.remove('hasUnread'); void $('playerChatToggle').offsetWidth; $('playerChatToggle').classList.add('hasUnread'); }
    }
  }

  async sendChat() {
    const input = $('playerChatInput');
    const text = String(input?.value || '').trim();
    if (!text) return;
    try {
      await this.request('/api/player/chat', { method:'POST', body:JSON.stringify({ text }) });
      input.value = '';
      $('playerEmojiMenu').classList.remove('show');
      $('playerChatEmojiButton').classList.remove('active');
    } catch (error) { this.showMessage(error.message, 'error'); }
  }

  async sendSticker(stickerId) {
    if (!$('playerChatStickerButton') || $('playerChatStickerButton').disabled) return;
    if (!window.BingoEmojiStickers?.get(stickerId)) return;
    const now = Date.now();
    this.stickerSendTimes = this.stickerSendTimes.filter(at => now - at < 10000);
    const last = this.stickerSendTimes.at(-1) || 0;
    if (now - last < 1200 || this.stickerSendTimes.length >= 4) return this.showMessage('Esperá un momento antes de enviar otro sticker.', 'error');
    this.stickerSendTimes.push(now);
    try {
      await this.request('/api/player/chat', { method:'POST', body:JSON.stringify({ stickerId }) });
      $('playerStickerMenu').classList.remove('show');
      $('playerChatStickerButton').classList.remove('active');
    } catch (error) {
      this.stickerSendTimes.pop();
      this.showMessage(error.message, 'error');
    }
  }

  closeOtherPanels(except = '') {
    if (except !== 'chat') this.closeChat();
    if (except !== 'settings') this.closeSettings();
    if (except !== 'info') this.closeInfoDrawer();
  }

  openSettings() {
    this.closeOtherPanels('settings');
    this.updateQuickTools();
    $('settingsOverlay').classList.add('show');
  }

  closeSettings() { $('settingsOverlay')?.classList.remove('show'); }

  async requestWakeLock() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || !this.state?.active) return;
    if (this.wakeLock && !this.wakeLock.released) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch {}
  }

  async releaseWakeLock() {
    try { if (this.wakeLock && !this.wakeLock.released) await this.wakeLock.release(); } catch {}
    this.wakeLock = null;
  }

  updateWakeLock() {
    if (this.state?.active && document.visibilityState === 'visible') this.requestWakeLock();
    else this.releaseWakeLock();
  }

  renderSystemTrust() {
    const host = $('systemTrust');
    if (!host || !this.state?.active) { if (host) host.classList.add('hidden'); return; }
    const admin = this.state.adminPresence;
    const integrity = this.state.integrity;
    const messages = [];
    let level = '';
    if (admin && !admin.connected && !['waiting','finished'].includes(this.state.status)) {
      if (admin.autoVerificationActive) {
        messages.push('⚙ VERIFICACIÓN AUTOMÁTICA ACTIVA · El servidor valida los reclamos mientras vuelve el administrador.');
        level = 'warn';
      } else if (admin.activatesAt) {
        const seconds = Math.max(0, Math.ceil((new Date(admin.activatesAt).getTime() - Date.now()) / 1000));
        messages.push(`⚠ Administrador sin conexión · verificación automática en ${seconds} s si no regresa.`);
        level = 'warn';
      }
    }
    if (integrity?.commitment && this.state.status !== 'waiting') {
      if (integrity.revealed) messages.push(integrity.verified ? `✓ Sorteo verificado · sello ${integrity.shortCommitment}` : '⚠ No se pudo verificar el sello del sorteo.');
      else messages.push(`🔒 Sorteo sellado antes de comenzar · ${integrity.shortCommitment}`);
    }
    host.className = `systemTrust ${level}`.trim();
    host.classList.toggle('hidden', !messages.length);
    host.textContent = messages.join(' · ');
  }

  openInfoDrawer(tab = this.drawerTab) {
    if (!this.state?.active) return;
    this.closeOtherPanels('info');
    this.setDrawerTab(tab);
    $('infoDrawer').classList.add('show');
    $('infoDrawer').setAttribute('aria-hidden', 'false');
    $('infoDrawerBackdrop').classList.add('show');
    $('infoDrawerToggle').textContent = '‹';
  }

  closeInfoDrawer() {
    $('infoDrawer')?.classList.remove('show');
    $('infoDrawer')?.setAttribute('aria-hidden', 'true');
    $('infoDrawerBackdrop')?.classList.remove('show');
    if ($('infoDrawerToggle')) $('infoDrawerToggle').textContent = '›';
  }

  toggleInfoDrawer() {
    if ($('infoDrawer').classList.contains('show')) this.closeInfoDrawer();
    else this.openInfoDrawer(this.drawerTab);
  }

  setDrawerTab(tab) {
    this.drawerTab = tab === 'numbers' ? 'numbers' : 'winners';
    $('drawerWinnersTab').classList.toggle('active', this.drawerTab === 'winners');
    $('drawerNumbersTab').classList.toggle('active', this.drawerTab === 'numbers');
    $('drawerWinnersPanel').classList.toggle('hidden', this.drawerTab !== 'winners');
    $('drawerNumbersPanel').classList.toggle('hidden', this.drawerTab !== 'numbers');
    this.renderInfoDrawer();
  }

  renderInfoDrawer() {
    if (!this.state?.active) return;
    $('drawerSummary').textContent = `Sala ${this.state.roomCode} · ${this.state.game.drawn.length} de ${this.state.game.mode} bolillas`;
    this.renderWinnersHistory();
    this.renderSortedNumbers();
    $('drawerResultActions').classList.toggle('hidden', this.state.status !== 'finished');
  }

  confirmedWinners() {
    return (this.state?.publicClaims || []).filter(claim => claim.status === 'confirmed' && claim.winningCard);
  }

  renderWinnersHistory() {
    const host = $('drawerWinnersPanel');
    const winners = this.confirmedWinners();
    if (!winners.length) {
      host.innerHTML = '<div class="emptyDrawer">Todavía no hay premios confirmados.</div>';
      return;
    }
    host.innerHTML = winners.map(claim => `<article class="winnerHistoryItem"><header><div><h3>${esc(String(claim.prizeLabel || this.claimLabel(claim.type)).toUpperCase())}</h3><p>${esc(claim.playerName)} · Cartón ${esc(claim.cardNumber)}</p></div><small>${esc(this.chatTime(claim.resolvedAt || claim.createdAt))}</small></header><button type="button" data-winner-id="${esc(claim.id)}">VER CARTÓN GANADOR</button></article>`).join('');
    host.querySelectorAll('[data-winner-id]').forEach(button => button.onclick = () => this.openWinnerCard(button.dataset.winnerId));
  }

  renderSortedNumbers() {
    const host = $('drawerNumbersPanel');
    const drawn = [...(this.state?.game?.drawn || [])].sort((a,b) => a-b);
    const last = Number(this.state?.game?.lastBall);
    const chips = numbers => `<div class="sortedNumbers">${numbers.map(number => `<span class="${number === last ? 'last' : ''}">${String(number).padStart(2,'0')}</span>`).join('')}</div>`;
    let content = '';
    if (!drawn.length) content = '<div class="emptyDrawer">Todavía no salió ninguna bolilla.</div>';
    else if (Number(this.state.game.mode) === 75) {
      const groups = [['B',1,15],['I',16,30],['N',31,45],['G',46,60],['O',61,75]];
      content = `<div class="drawGroups">${groups.map(([letter,min,max]) => `<div class="drawGroup"><strong>${letter}</strong>${chips(drawn.filter(number => number >= min && number <= max))}</div>`).join('')}</div>`;
    } else content = chips(drawn);
    const integrity = this.state.integrity;
    if (integrity?.commitment) {
      const order = integrity.revealed && Array.isArray(integrity.drawOrder)
        ? `<div class="drawOrderSequence">${integrity.drawOrder.map(number => `<span>${String(number).padStart(2,'0')}</span>`).join('')}</div>` : '';
      const actions = `<div class="integrityActions"><button type="button" data-integrity-download>DESCARGAR SELLO</button>${integrity.revealed ? '<button type="button" data-integrity-verify>VERIFICAR MI SELLO</button><button type="button" data-integrity-order>DESCARGAR ORDEN FINAL</button>' : ''}</div>`;
      content += integrity.revealed
        ? `<section class="integrityBox"><b>${integrity.verified ? '✓ SORTEO VERIFICADO' : '⚠ VERIFICACIÓN NO COINCIDENTE'}</b><small>SHA-256: ${esc(integrity.commitment)}</small>${order}<small class="integrityHelp">Podés comprobarlo con el archivo guardado antes de la primera bolilla.</small>${actions}</section>`
        : `<section class="integrityBox pending"><b>🔒 SORTEO SELLADO</b><small>SHA-256: ${esc(integrity.commitment)}</small><small>El orden completo se revela al finalizar. Si querés verificarlo por tu cuenta, guardá ahora este sello.</small>${actions}</section>`;
    }
    host.innerHTML = content;
    host.querySelector('[data-integrity-download]')?.addEventListener('click', () => this.downloadIntegritySeal());
    host.querySelector('[data-integrity-order]')?.addEventListener('click', () => this.downloadIntegrityOrder());
    host.querySelector('[data-integrity-verify]')?.addEventListener('click', () => this.chooseIntegritySealFile());
  }

  downloadTextFile(filename, text) {
    try {
      const blob = new Blob([text], { type:'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { this.showMessage('No se pudo descargar el archivo.', 'error'); }
  }

  integrityFileStamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

  downloadIntegritySeal() {
    const integrity = this.state?.integrity;
    if (!integrity?.commitment) return this.showMessage('El sorteo todavía no fue sellado.', 'error');
    const text = [
      'BINGO DE LA GORDA - SELLO PREVIO DEL SORTEO',
      `SALA: ${this.state.roomCode || ''}`,
      `FECHA_SELLADO: ${integrity.sealedAt || ''}`,
      `MODALIDAD: ${this.state.game?.mode || ''} bolas`,
      'ALGORITMO: SHA-256',
      `SHA-256: ${integrity.commitment}`,
      '',
      'Este archivo NO contiene el orden de bolillas.',
      'El hash corresponde a la secuencia completa separada por comas y sellada antes de la primera bolilla.',
      'Guardalo y usá VERIFICAR MI SELLO al finalizar la partida.'
    ].join('\n');
    this.downloadTextFile(`SELLO_${this.state.roomCode || 'BINGO'}_${this.integrityFileStamp()}.txt`, text);
    this.showMessage('Sello SHA-256 descargado. Guardalo hasta el final.');
  }

  async integrityHash(text) {
    if (!globalThis.crypto?.subtle) throw new Error('Tu navegador no permite verificar SHA-256.');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,'0')).join('');
  }

  downloadIntegrityOrder() {
    const integrity = this.state?.integrity;
    if (!integrity?.revealed || !Array.isArray(integrity.drawOrder)) return this.showMessage('El orden se revela al finalizar la partida.', 'error');
    const text = [
      'BINGO DE LA GORDA - ORDEN FINAL DEL SORTEO',
      `SALA: ${this.state.roomCode || ''}`,
      `MODALIDAD: ${this.state.game?.mode || ''} bolas`,
      `SHA-256 SELLADO: ${integrity.commitment}`,
      `VERIFICACION DEL SERVIDOR: ${integrity.verified ? 'CORRECTA' : 'NO COINCIDE'}`,
      `ORDEN: ${integrity.drawOrder.join(',')}`
    ].join('\n');
    this.downloadTextFile(`ORDEN_FINAL_${this.state.roomCode || 'BINGO'}_${this.integrityFileStamp()}.txt`, text);
  }

  chooseIntegritySealFile() {
    const integrity = this.state?.integrity;
    if (!integrity?.revealed || !Array.isArray(integrity.drawOrder)) return this.showMessage('La verificación estará disponible al finalizar.', 'error');
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.txt,text/plain';
    input.onchange = () => this.verifyIntegritySealFile(input.files?.[0]); input.click();
  }

  async verifyIntegritySealFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const match = text.match(/SHA-256:\s*([a-f0-9]{64})/i);
      if (!match) throw new Error('El archivo no contiene un sello SHA-256 válido.');
      const uploaded = match[1].toLowerCase();
      const recomputed = await this.integrityHash((this.state.integrity.drawOrder || []).join(','));
      const ok = uploaded === recomputed && uploaded === String(this.state.integrity.commitment || '').toLowerCase();
      this.showMessage(ok ? '✓ Verificación correcta: el orden coincide con tu sello previo.' : 'El sello cargado no coincide con este sorteo.', ok ? '' : 'error');
    } catch (error) { this.showMessage(error.message || 'No se pudo verificar el sello.', 'error'); }
  }

  resultsUrl() {
    return this.state?.roomCode ? `/api/results.pdf?sala=${encodeURIComponent(this.state.roomCode)}` : '';
  }

  async openResultsViewer() {
    if (this.state?.status !== 'finished') return this.showMessage('El acta estará disponible cuando finalice la partida.', 'error');
    this.closeOtherPanels();
    $('resultsViewerOverlay').classList.add('show');
    $('resultsViewerFrame').src = 'about:blank';
    try {
      const response = await fetch(`${this.resultsUrl()}&preview=1`, { cache:'no-store' });
      if (!response.ok) throw new Error((await response.json().catch(()=>({}))).error || 'No se pudo abrir el acta.');
      const blob = await response.blob();
      if (this.resultsViewerObjectUrl) URL.revokeObjectURL(this.resultsViewerObjectUrl);
      this.resultsViewerObjectUrl = URL.createObjectURL(new Blob([blob], { type:'application/pdf' }));
      this.resultsViewerUrl = this.resultsViewerObjectUrl;
      $('resultsViewerFrame').src = this.resultsViewerObjectUrl;
    } catch (error) {
      this.closeResultsViewer();
      this.showMessage(error.message, 'error');
    }
  }

  closeResultsViewer() {
    $('resultsViewerOverlay')?.classList.remove('show');
    if ($('resultsViewerFrame')) $('resultsViewerFrame').src = 'about:blank';
    if (this.resultsViewerObjectUrl) { URL.revokeObjectURL(this.resultsViewerObjectUrl); this.resultsViewerObjectUrl = ''; }
    this.resultsViewerUrl = '';
  }

  openResultsInNewTab() {
    const url = this.resultsViewerUrl || `${this.resultsUrl()}&preview=1`;
    if (url) window.open(url, '_blank', 'noopener');
  }

  beginTicketSwipe(event) {
    const touch = event.changedTouches?.[0];
    if (!touch || event.target.closest('button.cell')) return;
    this.ticketTouchStartX = touch.clientX;
  }

  endTicketSwipe(event) {
    const touch = event.changedTouches?.[0];
    if (this.ticketTouchStartX == null || !touch) return;
    const delta = touch.clientX - this.ticketTouchStartX;
    this.ticketTouchStartX = null;
    if (Math.abs(delta) < 55) return;
    this.switchCard(delta < 0 ? 1 : -1, 'swipe');
  }

  switchCard(direction = 1, source = 'control') {
    const cards = this.state?.player?.cards || [];
    const index = cards.findIndex(card => card.id === this.activeCardId);
    if (index < 0 || cards.length < 2) return false;
    const next = (index + (direction >= 0 ? 1 : -1) + cards.length) % cards.length;
    this.activeCardId = cards[next].id;
    if (!this.adminPreviewMode) storage.setItem('bingoOnlineCard', this.activeCardId);
    this.renderTabs(); this.renderTicket();
    const active = $('ticketPanel')?.querySelector('.ticketInstance.active');
    if (active) {
      active.style.setProperty('--switch-dir', direction >= 0 ? '18px' : '-18px');
      active.classList.add('cardSwitchFlash');
      setTimeout(() => active.classList.remove('cardSwitchFlash'), 240);
    }
    if (source === 'keyboard') this.showMessage(`Cartón ${next + 1} de ${cards.length}.`, 'notice', 1800);
    return true;
  }

  async loadPublicInfo() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch('/api/info', { cache:'no-store', signal:controller.signal });
      const data = await response.json();
      this.lastResult = data.lastResult || null;
      $('lastResultBtn').classList.toggle('hidden', !this.lastResult);
      if (this.lastResult) $('lastResultBtn').textContent = 'DESCARGAR ÚLTIMO RESULTADO';
    } catch { $('lastResultBtn').classList.add('hidden'); }
    finally { clearTimeout(timer); }
  }

  async request(url, options = {}) {
    const { timeoutMs = 0, retries = 0, retryDelayMs = 350, ...fetchOptions } = options;
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = timeoutMs > 0 ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const response = await fetch(url, {
          credentials:'same-origin',
          ...fetchOptions,
          ...(controller ? { signal:controller.signal } : {}),
          headers: { 'Content-Type':'application/json', ...(this.token ? { 'X-Player-Token':this.token } : {}), ...(fetchOptions.headers || {}) }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { const error = new Error(data.error || data.message || 'No se pudo completar la acción.'); error.status = response.status; error.data = data; throw error; }
        this.lastNetworkSuccessAt = Date.now();
        this.setNetworkState('good');
        return data;
      } catch (error) {
        lastError = error;
        if (!error?.status) this.setNetworkState(navigator.onLine === false ? 'bad' : 'warn');
        const canRetry = attempt < retries && !error?.status && navigator.onLine !== false;
        if (!canRetry) break;
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    if (lastError?.name === 'AbortError') {
      const error = new Error('La conexión tardó demasiado en responder.');
      error.code = 'REQUEST_TIMEOUT';
      throw error;
    }
    throw lastError || new Error('No se pudo completar la acción.');
  }

  async login(codeOverride = '', roomOverride = '') {
    const code = String(codeOverride || $('accessCode').value).trim().toUpperCase();
    const queryRoom = String(new URLSearchParams(location.search).get('sala') || '').trim().toUpperCase();
    const roomCode = String(roomOverride || queryRoom).trim().toUpperCase();
    $('loginError').innerHTML = '';
    if (!this.openJoinMode && code.length < 4) return $('loginError').innerHTML = '<div class="error">Escribí el código completo.</div>';
    if (this.openJoinMode && String($('openJoinName')?.value || '').trim().length < 2) return $('loginError').innerHTML = '<div class="error">Escribí tu nombre o apodo.</div>';
    try {
      $('loginBtn').disabled = true;
      $('loginBtn').textContent = 'INGRESANDO…';
      const data = this.openJoinMode
        ? await this.request('/api/player/open-join', { method:'POST', body:JSON.stringify({ roomCode, name:$('openJoinName').value, cardCount:this.openJoinCardCount, deviceId:this.deviceId }) })
        : await this.request('/api/player/login', { method:'POST', body:JSON.stringify({ code, roomCode, deviceId:this.deviceId }) });
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
    storage.setItem('bingoOnlineToken', this.token);
    this.tokenRoom = String(data.state?.roomCode || '').trim().toUpperCase();
    if (this.tokenRoom) storage.setItem('bingoOnlineRoom', this.tokenRoom);
    this.cleanDirectAccessUrl();
    this.applyState(data.state);
    this.connectEvents();
  }

  cleanDirectAccessUrl() {
    const url = new URL(location.href);
    let changed = false;
    ['acceso','codigo','code','demoSession','session'].forEach(key => { if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; } });
    if (changed) history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async resume({ demoBoot = false } = {}) {
    try {
      const data = await this.request('/api/player/state', demoBoot ? { timeoutMs:4500, retries:1, retryDelayMs:350 } : {});
      this.tokenRoom = String(data?.roomCode || '').trim().toUpperCase();
      if (this.tokenRoom) storage.setItem('bingoOnlineRoom', this.tokenRoom);
      this.applyState(data);
      delete document.documentElement.dataset.demoBoot;
      delete document.documentElement.dataset.demoBootError;
      $('demoBootError')?.classList.remove('show');
      if (demoBoot) {
        window.__BINGO_DEMO_BOOT_READY__ = true;
        clearTimeout(window.__bingoDemoBootWatchdog);
      }
      this.connectEvents();
      return true;
    } catch (error) {
      const demoEntry = new URLSearchParams(location.search).get('demo') === '1' || document.documentElement.dataset.demoBoot === '1';
      if (demoEntry || demoBoot) {
        this.showDemoBootError(error);
        return false;
      }
      this.logout(false);
      return false;
    }
  }

  showDemoBootError(error) {
    document.documentElement.dataset.demoBoot = '1';
    document.documentElement.dataset.demoBootError = '1';
    const detail = navigator.onLine === false
      ? 'No hay conexión a Internet. Revisala y tocá REINTENTAR.'
      : error?.code === 'REQUEST_TIMEOUT'
        ? 'El servidor tardó demasiado en responder. Tocá REINTENTAR.'
        : 'No pudimos abrir tu demo. Tocá REINTENTAR.';
    if ($('demoBootErrorText')) $('demoBootErrorText').textContent = detail;
    $('demoBootError')?.classList.add('show');
    if ($('demoBootRetryBtn')) { $('demoBootRetryBtn').disabled = false; $('demoBootRetryBtn').textContent = 'REINTENTAR'; }
  }

  async retryDemoBoot() {
    if (this.demoBootRetrying) return;
    this.demoBootRetrying = true;
    if ($('demoBootRetryBtn')) { $('demoBootRetryBtn').disabled = true; $('demoBootRetryBtn').textContent = 'REINTENTANDO…'; }
    $('demoBootError')?.classList.remove('show');
    delete document.documentElement.dataset.demoBootError;
    try {
      await this.resume({ demoBoot:true });
    } finally {
      this.demoBootRetrying = false;
      if ($('demoBootRetryBtn') && document.documentElement.dataset.demoBoot === '1') { $('demoBootRetryBtn').disabled = false; $('demoBootRetryBtn').textContent = 'REINTENTAR'; }
    }
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

  setNetworkState(level = 'connecting') {
    this.networkState = level;
    const indicator = $('networkIndicator');
    const label = $('networkLabel');
    if (!indicator || !label) return;
    indicator.className = `networkIndicator ${level}`;
    const text = level === 'good' ? 'Internet OK' : level === 'warn' ? 'Inestable' : level === 'bad' ? 'Sin Internet' : 'Conectando';
    label.textContent = text;
    indicator.title = level === 'good' ? 'Conexión estable con la sala' : level === 'warn' ? 'La conexión está inestable. Evitá cerrar la página.' : level === 'bad' ? 'Sin conexión. El juego intentará reconectarse.' : 'Conectando con la sala';
    indicator.setAttribute('aria-label', indicator.title);
  }

  refreshNetworkIndicator() {
    if (navigator.onLine === false) return this.setNetworkState('bad');
    if (!(this.token || this.cookieSession) || !this.state?.active) return this.setNetworkState('connecting');
    if (this.events?.readyState === EventSource.OPEN) return this.setNetworkState('good');
    if (this.events?.readyState === EventSource.CONNECTING) return this.setNetworkState('warn');
    if (this.lastNetworkSuccessAt && Date.now() - this.lastNetworkSuccessAt < 10000) return this.setNetworkState('warn');
    this.setNetworkState('bad');
  }

  connectionIsRisky() {
    return navigator.onLine === false || this.networkState === 'bad';
  }

  connectEvents() {
    this.events?.close();
    clearTimeout(this.reconnectRefreshTimer);
    const eventUrl = this.token ? `/api/events?role=player&token=${encodeURIComponent(this.token)}` : '/api/events?role=player';
    this.events = new EventSource(eventUrl);
    this.setNetworkState('connecting');
    this.events.addEventListener('open', () => { this.lastNetworkSuccessAt = Date.now(); this.setNetworkState('good'); });
    this.events.addEventListener('state', event => {
      clearTimeout(this.reconnectRefreshTimer);
      this.reconnectAttempts = 0;
      this.lastNetworkSuccessAt = Date.now();
      this.setNetworkState('good');
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
      this.setNetworkState(navigator.onLine === false ? 'bad' : 'warn');
      $('connectionMask').classList.add('show');
      this.scheduleReconnectRefresh();
    };
  }

  scheduleReconnectRefresh(immediate = false) {
    clearTimeout(this.reconnectRefreshTimer);
    if (!(this.token || this.cookieSession)) return;
    const delays = [1200, 2000, 3000, 5000, 8000];
    const delay = immediate ? 50 : delays[Math.min(this.reconnectAttempts, delays.length - 1)];
    this.reconnectAttempts += 1;
    this.reconnectRefreshTimer = setTimeout(async () => {
      if (!(this.token || this.cookieSession)) return;
      try {
        const data = await this.request('/api/player/state');
        this.reconnectAttempts = 0;
        this.lastNetworkSuccessAt = Date.now();
        this.setNetworkState('good');
        this.applyState(data);
        $('connectionMask').classList.remove('show');
        if (!this.events || this.events.readyState === EventSource.CLOSED) this.connectEvents();
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) return this.logout(false);
        this.scheduleReconnectRefresh();
      }
    }, delay);
  }

  applyState(data) {
    if (!data?.active) { this.showRoomClosed(); return; }
    const previous = this.state;
    const previousCount = previous?.game?.drawn?.length;
    const previousConfirmed = Boolean(previous?.player?.selectionConfirmed);
    this.state = data;
    if (data.demo?.active && data.player?.demoHuman) this.cookieSession = true;
    if (data.roomCode && this.token && !this.adminPreviewMode) {
      this.tokenRoom = String(data.roomCode).trim().toUpperCase();
      storage.setItem('bingoOnlineRoom', this.tokenRoom);
    }
    if (data.status === 'waiting' && !data.player.selectionConfirmed) this.selectedOffers = new Set(data.player.reservedCardIds || []);
    else this.selectedOffers.clear();
    const cards = data.player.cards || [];
    if (!cards.some(card => card.id === this.activeCardId)) this.activeCardId = cards[0]?.id || '';
    storage.setItem('bingoOnlineCard', this.activeCardId);
    if (!this.audioPreferenceLoaded) { this.audioEnabled = Boolean(data.roomSettings?.playerAudioDefault); this.audioPreferenceLoaded = true; storage.setItem('bingoPlayerSound', String(this.audioEnabled)); }
    $('loginView').classList.add('hidden'); $('gameView').classList.remove('hidden');
    document.body.classList.add('playerLogged');
    $('infoDrawerToggle').classList.remove('hidden');
    this.render(); this.renderDemoUi(); this.renderChat(); this.renderPublicClaim(); if (!this.adminPreviewMode) this.ensureMarkingModeChoice(); this.handleOwnPrizeReadiness(); if (!this.adminPreviewMode) this.trackManualLag(); this.handleTestEvent(); this.handleSequence(previous); this.renderInfoDrawer();
    this.renderSystemTrust(); this.updateWakeLock();
    const justConfirmedSelection = !Boolean(previous?.player?.selectionConfirmed) && Boolean(data.player?.selectionConfirmed && data.player?.nameSet);
    if (this.guideOpen && this.guideStage === 'selection' && justConfirmedSelection) {
      this.setGuideProgress('selection');
      this.saveGuideMemory('in_progress', 'controls', 0);
      this.closeGuide(false);
    }
    if (previous && ['waiting','starting'].includes(previous.status) && !['waiting','starting'].includes(data.status) && this.guideOpen) this.closeGuide(false);
    if (!this.adminPreviewMode) this.maybeAutoStartGuide(previous);
    if (data.status !== 'waiting') this.cancelDemoAutoStart({ keepFailure:true });
    else if (data.demo?.active && data.player?.demoHuman) queueMicrotask(() => this.ensureDemoAutoStart());
    if ($('winnerOverlay').classList.contains('show')) this.renderWinnerCard(this.selectedWinnerId);
    const currentCount = data.game.drawn.length;
    if (previousCount !== undefined && data.status === 'playing' && currentCount > previousCount && data.game.lastBall != null) this.speakBall(data.game.lastBall);
    if (!previousConfirmed && data.player.selectionConfirmed) this.showGreetingOnce();
  }

  render() {
    const data = this.state;
    $('playerName').textContent = data.player.name;
    $('roomInfo').textContent = `Sala ${data.roomCode} · Juego ${String(data.game.number).padStart(4,'0')} · ${data.game.mode} bolas`;
    $('connectionStatus').className = `status ${data.status === 'waiting' || data.status === 'paused' ? 'wait' : 'on'}`; $('connectionStatus').textContent = data.status === 'waiting' ? 'EN ESPERA' : data.status === 'verifying' ? 'VERIFICANDO' : data.status === 'paused' ? 'PAUSADO' : data.status === 'finalizing' ? 'CIERRE FINAL' : data.status === 'starting' || data.status === 'resuming' ? 'PREPARANDO' : data.status === 'finished' ? 'FINALIZADO' : 'EN JUEGO';
    $('connectionStatus').title = `Estado de la partida: ${$('connectionStatus').textContent}`;
    this.renderPresenter();
    document.body.classList.toggle('isPlaying', ['playing','verifying','paused','resuming','finalizing','finished'].includes(data.status));
    document.body.classList.toggle('concentrationMode', ['playing','verifying','paused','resuming','finalizing'].includes(data.status));
    document.body.classList.toggle('isPaused', data.status === 'paused');
    document.body.classList.toggle('isTransitioning', ['starting','resuming'].includes(data.status));
    if (data.status === 'waiting' || data.status === 'starting') this.renderWaiting(); else this.renderPlaying();
    $('playerEssentialTools').classList.toggle('hidden', !Boolean(data.player.selectionConfirmed));
    if (data.status !== 'finished') { this.finalOverlayDismissedFor = ''; $('finalResultsOverlay').classList.remove('show'); }
    else $('finalResultsOverlay').classList.toggle('show', this.finalOverlayDismissedFor !== data.roomCode);
    this.renderNotice(); this.updateQuickTools(); this.renderInfoDrawer();
  }

  personalPresenterId() { return 'vero'; }

  renderPresenter() {
    const presenter = PRESENTERS.vero || { name:'Vero', phrase:'Mucha suerte.' };
    $('presenterImage').src = 'assets/vero.png';
    $('presenterImage').alt = 'Vero';
    $('presenterName').textContent = 'Vero te acompaña';
    $('presenterPhrase').textContent = presenter.phrase;
    const autoVisual = this.autoMarkVisualState();
    $('autoMarkToggle').classList.toggle('active', autoVisual);
    $('autoMarkToggle').disabled = false;
    $('autoMarkToggle').title = 'Cambiar entre Manual y Automarcado';
    $('autoMarkHint').textContent = 'AUTO recupera aciertos anteriores. Los premios siempre se reclaman manualmente.';
    this.renderAdminMessage();
  }

  renderAdminMessage() {
    const bubble = $('adminSpeechBubble'), message = this.state?.adminMessage;
    if (!message?.text) { bubble.classList.add('hidden'); this.lastAdminMessageId = ''; return; }
    $('adminSpeechAuthor').textContent = 'Vero dice:';
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
        $('waitingPanel').innerHTML = `${timerHtml}<h2>Confirmá tu nombre</h2><div class="waitingLead">Tus cartones ya están asignados. Solo falta indicar quién va a jugar.</div>${nameSection}<button id="confirmAssignedName" class="btn primary" disabled>CONFIRMAR NOMBRE</button>${this.waitingMiniGameHtml()}`;
        this.bindPlayerNameInput('confirmAssignedName');
        $('confirmAssignedName').onclick = () => this.savePlayerName();
        this.bindWaitingMiniGame();
        return;
      }
      const isDemoHuman = Boolean(this.state?.demo?.active && player.demoHuman);
      const canChange = this.state.status === 'waiting' && !this.state.assignmentTimer?.selectionClosed && !this.demoAutoStartDeadline && !this.demoStartBusy;
      const demoStart = isDemoHuman ? this.demoAutoStartHtml() : '';
      $('waitingPanel').innerHTML = `${timerHtml}<div class="waitingConfirmed waitingStateHero"><b>${isDemoHuman ? 'LISTO PARA LA DEMO' : 'ESPERANDO SORTEO'}</b><div>${isDemoHuman ? 'Tus cartones están listos. Terminá o saltá el tutorial y la partida arrancará sola.' : 'Tus cartones están confirmados y reservados para vos.'}</div><div class="chosenList">${player.cards.map(card => `<span class="chosenBadge">Cartón ${esc(card.number)}</span>`).join('')}</div>${canChange ? '<button id="changeChoice" class="btn secondary" style="margin-top:10px">CAMBIAR CARTONES</button>' : ''}${demoStart}</div>${this.waitingMiniGameHtml()}`;
      if ($('changeChoice')) $('changeChoice').onclick = () => { this.cancelDemoAutoStart(); this.releaseChoice(); };
      if ($('demoStartRetryBtn')) $('demoStartRetryBtn').onclick = () => this.retryDemoAutoStart();
      this.bindWaitingMiniGame();
      this.renderPregamePreview();
      if (isDemoHuman) queueMicrotask(() => this.ensureDemoAutoStart());
      return;
    }
    const offers = player.offeredCards || [], valid = new Set(offers.map(card => card.id));
    this.selectedOffers = new Set([...this.selectedOffers].filter(id => valid.has(id)));
    const exactSelection = this.state.roomSettings?.roomType === 'test';
    const ready = exactSelection
      ? this.selectedOffers.size === player.allowedCardCount
      : this.selectedOffers.size > 0 && this.selectedOffers.size <= player.allowedCardCount;
    const canContinue = ready && (player.nameSet || this.validPlayerNameDraft());
    const confirmation = ready
      ? `<div class="regulationBlock"><div class="regulationActions single"><button id="readRules" class="btn secondary" type="button">LEER REGLAMENTO</button></div><button id="continueChoice" class="btn primary" style="margin:0" ${canContinue ? '' : 'disabled'}>CONFIRMAR CARTONES</button><small>Al confirmar, aceptás el reglamento general y las condiciones de la partida.</small></div>`
      : '<button id="continueChoice" class="btn primary" disabled>CONFIRMAR CARTONES</button>';
    const selectionTitle = exactSelection ? `Elegí ${player.allowedCardCount} cartón${player.allowedCardCount === 1 ? '' : 'es'}` : `Elegí hasta ${player.allowedCardCount} cartón${player.allowedCardCount === 1 ? '' : 'es'}`;
    $('waitingPanel').innerHTML = `${timerHtml}<h2>${selectionTitle}</h2><div class="waitingLead">Tenés ${offers.length} vistas previas. Podés recargarlas; los cartones que ya elegiste se conservan. Si comienza la partida antes de confirmar, el sistema completará tu asignación automáticamente.</div>${nameSection}<div class="choiceCounter">Seleccionados: <span id="choiceCount">${this.selectedOffers.size}</span> de ${player.allowedCardCount}</div><div id="offerGrid" class="offers">${offers.map(card => this.offerHtml(card)).join('')}</div><div class="choiceActions"><button id="clearChoice" class="btn secondary">LIMPIAR</button><button id="renewChoice" class="btn secondary">RECARGAR CARTONES</button></div>${confirmation}${this.waitingMiniGameHtml()}`;
    this.bindPlayerNameInput('continueChoice');
    $('offerGrid').querySelectorAll('[data-offer]').forEach(button => button.onclick = () => this.toggleOffer(button.dataset.offer));
    $('clearChoice').onclick = () => this.clearReservations();
    $('renewChoice').onclick = () => this.renewOffers();
    $('continueChoice').onclick = () => this.confirmChoice();
    if ($('readRules')) $('readRules').onclick = () => window.open('/reglamento.html', '_blank', 'noopener,noreferrer');
    this.bindWaitingMiniGame();
  }

  renderPregamePreview() {
    $('playPanel').classList.remove('hidden');
    const ballHost = $('lastBall');
    ballHost.className = 'lastBall';
    ballHost.textContent = '—';
    $('ballCount').textContent = 'Esperando la primera bolilla';
    $('recent').innerHTML = '';
    this.renderTabs();
    this.renderTicket();
    this.renderInfoDrawer();
  }

  waitingMiniGameHtml() {
    if (this.state?.status !== 'waiting' || this.state?.demo?.active) return '';
    const type = ['red_black','higher_lower'].includes(this.waitingMini.activeType) ? this.waitingMini.activeType : 'red_black';
    const title = type === 'red_black' ? 'ROJO O NEGRO' : 'MAYOR O MENOR';
    const leaders = this.state.waitingGame?.leaderboards?.[type] || this.state.waitingGame?.leaderboard || [];
    const serverBest = Number(leaders.find(item => item.playerId === this.state.player.id)?.bestScore) || 0;
    this.waitingMini.best = Math.max(Number(this.waitingMini.bestByType?.[type]) || 0, this.waitingMini.best, serverBest);
    this.waitingMini.bestByType[type] = this.waitingMini.best;
    const defaultMessage = type === 'red_black'
      ? 'Elegí el color de la próxima carta.'
      : this.waitingMini.current
        ? `Carta actual: ${this.waitingMini.current.rank}${this.waitingMini.current.symbol}. ¿La próxima será mayor o menor?`
        : 'Preparando la primera carta…';
    const result = this.waitingMini.message || defaultMessage;
    const choicesClass = `miniGameChoices${this.waitingMini.ended ? ' hidden' : ''}`;
    const restartClass = `btn secondary${this.waitingMini.ended ? '' : ' hidden'}`;
    return `<section id="waitMiniGame" class="waitMiniGame"><div class="miniGameTabs"><button type="button" data-mini-game="red_black" class="${type === 'red_black' ? 'active' : ''}">ROJO O NEGRO</button><button type="button" data-mini-game="higher_lower" class="${type === 'higher_lower' ? 'active' : ''}">MAYOR O MENOR</button></div><h3>${title}</h3><div class="muted">Los dos juegos están siempre disponibles durante la espera. Cambiá de juego cuando quieras. No afectan el bingo.</div><div class="miniGameLayout"><div id="miniPlayingCard" class="playingCard back"></div><div class="miniGameControls"><div class="miniScore">Racha: <span id="miniScore">${this.waitingMini.score}</span> · Mejor: <span id="miniBest">${this.waitingMini.best}</span></div><div id="miniResult" class="miniResult">${result}</div><div id="miniChoices" class="${choicesClass}">${type === 'red_black' ? '<button type="button" class="redChoice" data-mini="red">ROJO</button><button type="button" class="blackChoice" data-mini="black">NEGRO</button>' : '<button type="button" class="higherChoice" data-mini="higher">MAYOR</button><button type="button" class="lowerChoice" data-mini="lower">MENOR</button>'}</div><button id="miniRestart" class="${restartClass}" type="button">VOLVER A JUGAR</button></div></div><div class="miniLeaderboard"><b>Mejores rachas en ${title.toLowerCase()}:</b> ${leaders.length ? leaders.map((item,index)=>`${index+1}. ${esc(item.name)} ${Number(item.bestScore)||0}`).join(' · ') : 'todavía no hay puntajes'}</div></section>`;
  }

  randomMiniCard() {
    const suits = [{key:'heart',symbol:'♥',color:'red',face:'corazon'},{key:'diamond',symbol:'♦',color:'red',face:'diamante'},{key:'spade',symbol:'♠',color:'black',face:'pica'},{key:'club',symbol:'♣',color:'black',face:'trebol'}];
    const suit = suits[Math.floor(Math.random()*suits.length)];
    const value = 1 + Math.floor(Math.random()*13);
    return { ...suit, value, rank: value===1?'A':value===11?'J':value===12?'Q':value===13?'K':String(value) };
  }

  showMiniCard(card, hidden = false) {
    const host = $('miniPlayingCard'); if (!host) return;
    if (hidden || !card) { host.className='playingCard back'; host.style.backgroundImage=''; host.innerHTML=''; return; }
    host.className='playingCard'; host.style.backgroundImage=`url('/assets/cards/${card.face}.webp')`;
    host.innerHTML=`<div class="cardIndex top ${card.color}">${esc(card.rank)}<small>${card.symbol}</small></div><div class="cardIndex bottom ${card.color}">${esc(card.rank)}<small>${card.symbol}</small></div>`;
  }

  setWaitingMiniButtonsDisabled(disabled) {
    $('miniChoices')?.querySelectorAll('[data-mini]').forEach(button => { button.disabled = Boolean(disabled); });
  }

  bindWaitingMiniGame() {
    const type = this.waitingMini.activeType;
    if (!['red_black','higher_lower'].includes(type) || !$('miniChoices')) return;
    document.querySelectorAll('[data-mini-game]').forEach(button => button.onclick = () => this.switchWaitingMini(button.dataset.miniGame));
    if (type === 'higher_lower' && !this.waitingMini.current && !this.waitingMini.ended) {
      this.waitingMini.current = this.randomMiniCard();
      this.waitingMini.message = `Carta actual: ${this.waitingMini.current.rank}${this.waitingMini.current.symbol}. ¿La próxima será mayor o menor?`;
    }
    if (this.waitingMini.current) this.showMiniCard(this.waitingMini.current);
    else this.showMiniCard(null, true);
    if ($('miniResult')) $('miniResult').textContent = this.waitingMini.message || (type === 'red_black' ? 'Elegí el color de la próxima carta.' : `Carta actual: ${this.waitingMini.current.rank}${this.waitingMini.current.symbol}. ¿La próxima será mayor o menor?`);
    $('miniChoices').classList.toggle('hidden', this.waitingMini.ended);
    $('miniRestart')?.classList.toggle('hidden', !this.waitingMini.ended);
    this.setWaitingMiniButtonsDisabled(this.waitingMini.busy);
    $('miniChoices').querySelectorAll('[data-mini]').forEach(button => button.onclick = () => this.playWaitingMini(button.dataset.mini));
    if ($('miniRestart')) $('miniRestart').onclick = () => this.restartWaitingMini();
  }

  async playWaitingMini(choice) {
    if (this.waitingMini.ended || this.waitingMini.busy) return;
    const type = this.waitingMini.activeType;
    if (!['red_black','higher_lower'].includes(type)) return;
    this.waitingMini.busy = true;
    this.setWaitingMiniButtonsDisabled(true);
    const next = this.randomMiniCard();
    let correct = false, tie = false;
    if (type === 'red_black') correct = choice === next.color;
    else {
      const current = this.waitingMini.current || this.randomMiniCard(); this.waitingMini.current = current;
      tie = next.value === current.value;
      correct = tie || (choice === 'higher' ? next.value > current.value : next.value < current.value);
    }
    this.showMiniCard(next);
    if (tie) {
      this.waitingMini.current = next;
      this.waitingMini.message = `Empate: salió ${next.rank}${next.symbol}. La racha sigue igual.`;
      $('miniResult').textContent = this.waitingMini.message;
      await new Promise(resolve => setTimeout(resolve, 500));
      this.waitingMini.message = `Carta actual: ${next.rank}${next.symbol}. Elegí mayor o menor.`;
      if (this.state?.status === 'waiting' && $('miniResult')) $('miniResult').textContent = this.waitingMini.message;
      this.waitingMini.busy = false;
      this.setWaitingMiniButtonsDisabled(false);
      return;
    }
    if (correct) {
      this.waitingMini.score += 1;
      this.waitingMini.best = Math.max(this.waitingMini.best, this.waitingMini.score);
      this.waitingMini.bestByType[type] = this.waitingMini.best;
      this.waitingMini.current = next;
      this.waitingMini.message = type === 'red_black'
        ? `¡Correcto! Salió ${next.rank}${next.symbol}. Elegí otra vez.`
        : `¡Correcto! Salió ${next.rank}${next.symbol}. Elegí mayor o menor.`;
      $('miniScore').textContent = this.waitingMini.score;
      $('miniBest').textContent = this.waitingMini.best;
      $('miniResult').textContent = this.waitingMini.message;
      this.waitingMini.busy = false;
      this.setWaitingMiniButtonsDisabled(false);
      this.submitWaitingScore(this.waitingMini.best);
      return;
    }
    this.waitingMini.ended = true;
    this.waitingMini.current = next;
    this.waitingMini.message = `Te equivocaste: salió ${next.rank}${next.symbol}. Racha final: ${this.waitingMini.score}.`;
    $('miniResult').innerHTML = `Te equivocaste: salió <b>${next.rank}${next.symbol}</b>. Racha final: <b>${this.waitingMini.score}</b>.`;
    $('miniChoices').classList.add('hidden');
    $('miniRestart').classList.remove('hidden');
    this.waitingMini.busy = false;
    this.submitWaitingScore(this.waitingMini.score);
  }

  restartWaitingMini() {
    this.waitingMini.score = 0;
    this.waitingMini.ended = false;
    this.waitingMini.busy = false;
    this.waitingMini.current = null;
    this.waitingMini.message = this.waitingMini.activeType === 'red_black' ? 'Elegí el color de la próxima carta.' : '';
    this.renderWaiting();
  }

  switchWaitingMini(type) {
    if (!['red_black','higher_lower'].includes(type) || type === this.waitingMini.activeType || this.state?.status !== 'waiting') return;
    this.waitingMini.bestByType[this.waitingMini.activeType] = Math.max(Number(this.waitingMini.bestByType[this.waitingMini.activeType]) || 0, Number(this.waitingMini.best) || 0);
    this.waitingMini.activeType = type;
    this.waitingMini.score = 0;
    this.waitingMini.best = Number(this.waitingMini.bestByType[type]) || 0;
    this.waitingMini.current = null;
    this.waitingMini.ended = false;
    this.waitingMini.busy = false;
    this.waitingMini.message = type === 'red_black' ? 'Elegí el color de la próxima carta.' : '';
    storage.setItem('bingoWaitingMiniGame', type);
    this.renderWaiting();
  }

  async submitWaitingScore(score) {
    try {
      const gameType = this.waitingMini.activeType;
      const data = await this.request('/api/player/waiting-game/score', { method:'POST', body:JSON.stringify({ score, gameType }) });
      if (data.waitingGame) this.state.waitingGame = data.waitingGame;
    } catch {}
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
    const button = $('renewChoice');
    if (button?.disabled) return;
    if (button) { button.disabled = true; button.textContent = 'RECARGANDO…'; }
    try { this.applyState(await this.request('/api/player/renew-offers', { method:'POST', body:'{}' })); }
    catch (error) { this.showMessage(error.message, 'error'); }
    finally { if (button && document.contains(button)) { button.disabled = false; button.textContent = 'RECARGAR CARTONES'; } }
  }

  async confirmChoice(force = false) {
    const selected = this.selectedOffers.size;
    const maximum = Number(this.state?.player?.allowedCardCount || 1);
    if (selected < 1 || selected > maximum) return;
    if (this.state?.roomSettings?.roomType === 'test' && selected !== maximum) return this.showMessage(`Elegí exactamente ${maximum} cartón${maximum === 1 ? '' : 'es'} o esperá la asignación automática al iniciar.`, 'error');
    const name = this.requireValidPlayerName();
    if (name === null) return;
    if (!force && selected < maximum && this.state?.roomSettings?.roomType !== 'test') {
      const remaining = maximum - selected;
      $('partialChoiceText').textContent = `Todavía podés elegir ${remaining} cartón${remaining === 1 ? '' : 'es'} más. ¿Seguro que querés continuar?`;
      $('partialChoiceOverlay').classList.add('show');
      return;
    }
    const button = $('continueChoice');
    if (button?.dataset.busy === '1') return;
    if (button) { button.dataset.busy = '1'; button.disabled = true; button.textContent = 'CONFIRMANDO…'; }
    try {
      this.applyState(await this.request('/api/player/choose', { method:'POST', body:JSON.stringify({ cardIds:[...this.selectedOffers], ...(name ? { name } : {}) }) }));
      this.pendingPlayerName = '';
    } catch (error) {
      this.showMessage(error.message, 'error');
      if (button && document.contains(button)) { button.dataset.busy = '0'; button.disabled = false; button.textContent = 'CONFIRMAR CARTONES'; }
    }
  }

  async releaseChoice() {
    this.cancelDemoAutoStart();
    try { this.applyState(await this.request('/api/player/release', { method:'POST', body:'{}' })); }
    catch (error) { this.showMessage(error.message, 'error'); }
  }

  demoTutorialResolved() {
    const serverResolved = Boolean(this.state?.demo?.startFlow?.tutorialResolved);
    const progress = this.guideProgress();
    const memory = this.guideMemory();
    return serverResolved || ['complete','skipped'].includes(progress) || ['complete','skipped'].includes(memory?.status);
  }

  demoAutoStartHtml() {
    const flow = this.state?.demo?.startFlow || {};
    const phase = String(flow.phase || 'tutorial');
    const error = String(flow.error || this.demoStartFailure || '');
    if (phase === 'error' || error) return `<div id="demoAutoStart" class="demoAutoStart error"><strong>No pudimos iniciar la demo</strong><small>${esc(error || 'El servidor no pudo iniciar la partida.')}</small><button id="demoStartRetryBtn" class="btn primary" type="button">REINTENTAR</button></div>`;
    if (this.state?.status === 'starting' || phase === 'starting') return '<div id="demoAutoStart" class="demoAutoStart"><strong>Iniciando partida…</strong><div class="demoCountdown">●</div><small>El servidor ya tomó el control. Enseguida sale la primera bolilla.</small></div>';
    if (!flow.tutorialResolved) return '<div id="demoAutoStart" class="demoAutoStart waitingTutorial"><strong>Primero terminá el tutorial</strong><div class="demoCountdown">?</div><small>Podés completarlo o saltarlo. Después el servidor inicia la cuenta automáticamente.</small></div>';
    if (phase === 'countdown' && flow.countdownEndsAt) {
      const remaining = Math.max(0, Math.ceil((new Date(flow.countdownEndsAt).getTime() - Date.now()) / 1000));
      return `<div id="demoAutoStart" class="demoAutoStart"><strong>La demo comienza en</strong><div id="demoStartCountdown" class="demoCountdown">${remaining}</div><small>La cuenta la controla el servidor. Podés cerrar o recargar y no se pierde.</small></div>`;
    }
    return '<div id="demoAutoStart" class="demoAutoStart"><strong>Listo para iniciar</strong><div class="demoCountdown">●</div><small>Sincronizando el inicio con el servidor…</small></div>';
  }

  updateDemoAutoStartDisplay() {
    const host = $('demoStartCountdown');
    const end = new Date(this.state?.demo?.startFlow?.countdownEndsAt || 0).getTime();
    if (!host || !Number.isFinite(end)) return;
    host.textContent = String(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
  }

  cancelDemoAutoStart({ keepFailure = false } = {}) {
    if (this.demoAutoStartTimer) clearInterval(this.demoAutoStartTimer);
    this.demoAutoStartTimer = null;
    this.demoAutoStartDeadline = 0;
    if (!keepFailure) this.demoStartFailure = '';
  }

  ensureDemoAutoStart() {
    if (!this.state?.demo?.active || !this.state?.player?.demoHuman || this.state.status !== 'waiting') {
      this.cancelDemoAutoStart({ keepFailure:true });
      return;
    }
    const flow = this.state.demo.startFlow || {};
    // Compatibilidad con usuarios que terminaron el tutorial antes de esta versión:
    // si la memoria local lo recuerda pero el servidor todavía no, se sincroniza una sola vez.
    if (!flow.tutorialResolved && this.demoTutorialResolved() && !this.guideOpen && !this.demoStartBusy) {
      const skipped = this.guideProgress() === 'skipped' || this.guideMemory()?.status === 'skipped';
      queueMicrotask(() => this.notifyDemoTutorialResolved(skipped));
      return;
    }
    if (flow.phase !== 'countdown' || !flow.countdownEndsAt) {
      this.cancelDemoAutoStart({ keepFailure:true });
      return;
    }
    if (!this.demoAutoStartTimer) {
      this.demoAutoStartTimer = setInterval(() => this.updateDemoAutoStartDisplay(), 200);
    }
    this.updateDemoAutoStartDisplay();
  }

  async notifyDemoTutorialResolved(skipped = false) {
    if (!this.state?.demo?.active || !this.state?.player?.demoHuman || this.state.status !== 'waiting' || this.demoStartBusy) return;
    if (this.state?.demo?.startFlow?.tutorialResolved) { this.ensureDemoAutoStart(); return; }
    this.demoStartBusy = true;
    this.demoStartFailure = '';
    try {
      const next = await this.request('/api/player/demo/tutorial', { method:'POST', body:JSON.stringify({ skipped:Boolean(skipped) }), timeoutMs:6500, retries:1, retryDelayMs:450 });
      this.demoStartBusy = false;
      this.applyState(next);
    } catch (error) {
      this.demoStartBusy = false;
      this.demoStartFailure = error?.message || 'No pudimos avisar al servidor que terminaste el tutorial.';
      this.renderWaiting();
      this.showMessage('No pudimos preparar el inicio de la demo. Tocá REINTENTAR.', 'error');
    }
  }

  async startDemoFromPlayer() {
    return this.retryDemoAutoStart();
  }

  async retryDemoAutoStart() {
    if (this.demoStartBusy || !this.state?.demo?.active || !this.state?.player?.demoHuman) return;
    if (!this.state?.demo?.startFlow?.tutorialResolved && this.demoTutorialResolved()) {
      const skipped = this.guideProgress() === 'skipped' || this.guideMemory()?.status === 'skipped';
      this.demoStartFailure = '';
      return this.notifyDemoTutorialResolved(skipped);
    }
    this.demoStartBusy = true;
    this.demoStartFailure = '';
    try {
      const next = await this.request('/api/player/demo/retry', { method:'POST', body:'{}', timeoutMs:6500, retries:1, retryDelayMs:450 });
      this.demoStartBusy = false;
      this.applyState(next);
    } catch (error) {
      this.demoStartBusy = false;
      this.demoStartFailure = error?.message || 'La partida no respondió a tiempo.';
      this.renderWaiting();
      this.showMessage('La demo no pudo iniciar. Tocá REINTENTAR.', 'error');
    }
  }

  async restartDemo() {
    this.cancelDemoAutoStart();
    if (!this.state?.demo?.active || !this.state?.player?.demoHuman) return;
    const button = $('demoResetBtn');
    if (button) { button.disabled = true; button.textContent = 'REINICIANDO…'; }
    try {
      const next = await this.request('/api/player/demo/reset', { method:'POST', body:'{}' });
      this.events?.close();
      this.releaseWakeLock();
      storage.removeItem('bingoOnlineToken');
      storage.removeItem('bingoOnlineRoom');
      storage.removeItem('bingoOnlineCard');
      location.href = next.playerUrl || '/demo';
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = 'REINICIAR DEMO'; }
      this.showMessage(error.message, 'error');
    }
  }

  showGreetingOnce() {
    if (!this.state) return;
    const key = `bingoGreeting:${this.state.roomCode}:${this.state.player.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const demoNames = (this.state.demo?.participants || []).filter(item => item.virtual && ['Zoe','Mateo','Owen'].includes(item.name)).map(item => item.name);
    const joinedNames = demoNames.length <= 1 ? (demoNames[0] || '') : demoNames.length === 2 ? `${demoNames[0]} y ${demoNames[1]}` : `${demoNames.slice(0,-1).join(', ')} y ${demoNames.at(-1)}`;
    const greeting = joinedNames ? this.phrases.event('vero', 'demoIntro', { names: joinedNames }) : ((PRESENTERS.vero || {}).greeting || 'Hola, soy Vero. Te acompaño durante toda la partida. Mucha suerte.');
    this.speak(greeting, true);
  }

  guideStorageKey() {
    if (!this.state?.roomCode) return 'bingoPlayerGuide:unknown';
    return `bingoPlayerGuide:${this.state.roomCode}:${this.state.game?.number || 0}`;
  }

  guideProgress() {
    return storage.getItem(this.guideStorageKey()) || this.guideSessionStatus || '';
  }

  setGuideProgress(value) {
    this.guideSessionStatus = String(value || '');
    storage.setItem(this.guideStorageKey(), this.guideSessionStatus);
  }

  guideMemoryKey() { return `${this.guideStorageKey()}:position`; }

  guideMemory() {
    try {
      const raw = storage.getItem(this.guideMemoryKey());
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return null;
      return { stage: parsed.stage === 'selection' ? 'selection' : 'controls', step: Math.max(0, Number(parsed.step) || 0), status: String(parsed.status || 'in_progress') };
    } catch { return null; }
  }

  saveGuideMemory(status = 'in_progress', stage = this.guideStage, step = this.guideStep) {
    if (!this.state?.roomCode || !stage) return;
    try { storage.setItem(this.guideMemoryKey(), JSON.stringify({ status, stage, step:Math.max(0,Number(step)||0), at:Date.now() })); } catch {}
  }

  deviceProfile() {
    const ua = navigator.userAgent || '';
    const tv = /SMART-TV|SmartTV|Tizen|Web0S|NetCast|HbbTV|CrKey|AFT[A-Z]|BRAVIA/i.test(ua);
    const touch = !tv && (window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0);
    return { tv, touch, desktop: !tv && !touch };
  }

  actionVerb() { return this.deviceProfile().touch ? 'Tocá' : this.deviceProfile().tv ? 'Seleccioná' : 'Hacé clic en'; }

  openTutorialChoice() {
    if (!this.state) return;
    this.closeOtherPanels();
    const memory = this.guideMemory();
    const currentStage = this.state.player?.selectionConfirmed && this.state.player?.nameSet ? 'controls' : 'selection';
    const canContinue = Boolean(memory && memory.status !== 'complete' && (memory.stage === currentStage || currentStage === 'controls'));
    $('tutorialContinueBtn').classList.toggle('hidden', !canContinue);
    $('tutorialChoiceText').textContent = canContinue
      ? `Quedaste en el paso ${Number(memory.step || 0) + 1}. Podés continuar o empezar esta parte de nuevo.`
      : 'Podés volver a recorrer el tutorial desde el comienzo de esta pantalla.';
    $('tutorialChoiceOverlay').classList.add('show');
  }

  continueGuideFromMemory() {
    const memory = this.guideMemory();
    this.closeModal('tutorialChoiceOverlay');
    const currentStage = this.state.player?.selectionConfirmed && this.state.player?.nameSet ? 'controls' : 'selection';
    if (!memory) return this.openGuide(true, currentStage, 0);
    const stage = currentStage === 'controls' && memory.stage === 'selection' ? 'controls' : memory.stage;
    this.openGuide(true, stage, stage === memory.stage ? memory.step : 0);
  }

  restartGuide() {
    this.closeModal('tutorialChoiceOverlay');
    const stage = this.state.player?.selectionConfirmed && this.state.player?.nameSet ? 'controls' : 'selection';
    this.saveGuideMemory('in_progress', stage, 0);
    this.openGuide(true, stage, 0);
  }

  guideElementVisible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 3 && rect.height > 3;
  }

  guideStepsFor(stage) {
    const device = this.deviceProfile();
    const tap = device.touch ? 'Tocá' : device.tv ? 'Seleccioná' : 'Hacé clic en';
    const switchText = device.touch
      ? 'Si tenés varios, cambiá desde estas pestañas o deslizá el cartón hacia los costados.'
      : device.tv
        ? 'Si tenés varios, movete entre estas pestañas para elegir cuál mirar.'
        : 'Si tenés varios, cambiá desde estas pestañas o usá las flechas izquierda/derecha del teclado.';
    const markText = `${tap} un número para marcarlo. ${tap} el mismo número otra vez para desmarcarlo.`;
    const steps = stage === 'selection' ? [
      { target:'#selectionPlayerName', when:()=>!this.state?.player?.nameSet, title:'Primero, tu nombre', text:'Escribí tu nombre o apodo. Así aparecés en tus cartones, el chat y los resultados.' },
      { target:'#waitMiniGame', when:()=>!device.tv && !this.state?.demo?.active, title:'Jugá mientras esperás', text:'Tenés minijuegos para pasar el rato. No cambian el Bingo ni tus posibilidades de ganar.' },
      { target:'.choiceCounter', title:'Cuántos podés elegir', text:`Acá ves cuántos cartones llevás elegidos y cuántos tenés disponibles: <strong>${Number(this.state?.player?.allowedCardCount || 1)}</strong>.` },
      { target:'#offerGrid .offer', title:'Elegí tus cartones', text:`${tap} un cartón para elegirlo. Repetí sobre el mismo para soltarlo.` },
      { target:'#renewChoice', title:'Podés recargar', text:'Si no te gustan, usá <strong>Recargar cartones</strong>. Los que ya elegiste se conservan.' },
      { target:'#continueChoice', title:'Confirmá tu elección', text:'Cuando completes tu selección, confirmala. Después el tutorial sigue en tu pantalla de juego.' }
    ] : [
      { target:'#cardTabs', when:()=>Number(this.state?.player?.cards?.length || 0) > 1, title:'Tus cartones', text:switchText },
      { target:'#ticketPanel .cell.number', demo:'mark', title:'Marcar y desmarcar', text:markText },
      { target:'#quickMarkingMode', title:'Manual o Automarcado', text:'Elegís uno antes de la primera bolilla y podés cambiar en cualquier momento. AUTO recupera también los aciertos anteriores.' },
      { target:'#claimBar', title:'Los premios se reclaman', text:'Aunque uses Automarcado, el premio <strong>no se reclama solo</strong>. Línea, Bingo y cualquier premio activo se reclaman desde acá.' },
      { target:'#firstClaimReminder', title:'La regla más importante', text:'<strong>Gana el primer reclamo válido.</strong> No alcanza con completar el premio: hay que reclamarlo antes que los demás.' },
      { target:'#lastBall', title:'Última bolilla', text:'Esta es la referencia principal: la última bolilla aparece grande y hace una animación breve cuando cambia.' },
      { target:'#infoDrawerToggle', title:'Ganadores y números salidos', text:'Esta flecha abre el panel lateral. Ahí podés ver cartones ganadores y todos los números que ya salieron.' },
      { target:'#networkIndicator', title:'Tu conexión', text:'Verde: todo bien. Amarillo: conexión inestable. Rojo: sin Internet. Si falla, la sala intenta reconectarse sola.' },
      { target:'#quickSoundBtn', title:'Sonidos', text:`${tap} este icono para activar o silenciar rápidamente los sonidos del juego.` },
      { target:'#quickVoiceBtn', title:'Voz del cantador', text:`${tap} acá para escuchar o silenciar la voz que canta las bolillas.` },
      { target:'#fullScreenBtn', when:()=>Boolean(document.documentElement.requestFullscreen), title:'Pantalla completa', text:'Usá este botón para aprovechar toda la pantalla del celular, tablet, PC o TV.' },
      { target:'#watchBtn', title:'Ver partida / TV', text:'Desde acá podés abrir o compartir el modo espectador y enviarlo a una TV compatible.' },
      { target:'#playerChatToggle', title:'Chat público', text:'El chat queda apartado del cartón. Podés escribir, usar emojis y mandar stickers sin tapar el juego.' },
      { target:'#settingsToggle', title:'Más ajustes', text:'La tuerca guarda volumen, tamaño de números, tema y otras preferencias menos frecuentes.' },
      { target:'#demoResetBtn', when:()=>Boolean(this.state?.demo?.active), title:'Reiniciar la demo', text:'En una demostración podés volver a empezar desde la sala de espera para repetir todo el recorrido.' },
      { target:'#helpBtn', title:'¿Lo saltaste?', text:'Este <strong>?</strong> queda siempre disponible. Guarda tu avance para continuar donde quedaste o reiniciar el tutorial.' }
    ];
    return steps.filter(step => (!step.when || step.when()) && this.guideElementVisible(document.querySelector(step.target)));
  }

  maybeAutoStartGuide(previous) {
    if (!this.state || this.guideOpen || !['waiting','starting'].includes(this.state.status)) return;
    const progress = this.guideProgress();
    const memory = this.guideMemory();
    if (['complete','skipped'].includes(progress) || memory?.status === 'complete' || memory?.status === 'skipped') return;
    const confirmed = Boolean(this.state.player?.selectionConfirmed && this.state.player?.nameSet);
    if (confirmed && !this.state.player?.markingModeChosen) return;
    const currentStage = confirmed ? 'controls' : 'selection';
    if (memory?.status === 'in_progress' && memory.stage === currentStage) {
      if (this.guideAutoTimer) return;
      this.guideAutoTimer = setTimeout(() => { this.guideAutoTimer = null; this.openGuide(false, currentStage, memory.step); }, 350);
      return;
    }
    if (!confirmed && !progress) {
      if (this.guideAutoTimer) return;
      this.guideAutoTimer = setTimeout(() => { this.guideAutoTimer = null; this.openGuide(false, 'selection', 0); }, 350);
      return;
    }
    const justConfirmed = !Boolean(previous?.player?.selectionConfirmed) && confirmed;
    if (confirmed && (progress === 'selection' || (!previous && !progress) || justConfirmed)) {
      if (this.guideAutoTimer) clearTimeout(this.guideAutoTimer);
      this.saveGuideMemory('in_progress', 'controls', 0);
      this.guideAutoTimer = setTimeout(() => { this.guideAutoTimer = null; this.openGuide(false, 'controls', 0); }, 500);
    }
  }

  openGuide(manual = true, requestedStage = '', requestedStep = 0) {
    if (!this.state) return;
    if (this.state?.demo?.active && this.state?.status === 'waiting') this.cancelDemoAutoStart({ keepFailure:true });
    this.closeOtherPanels();
    const stage = requestedStage || (this.state.player?.selectionConfirmed && this.state.player?.nameSet ? 'controls' : 'selection');
    const steps = this.guideStepsFor(stage);
    if (!steps.length) return;
    this.guideManual = Boolean(manual);
    this.guideStage = stage;
    this.guideSteps = steps;
    this.guideStep = Math.max(0, Math.min(Number(requestedStep) || 0, steps.length - 1));
    this.guideOpen = true;
    $('guideOverlay').classList.add('show');
    $('guideOverlay').setAttribute('aria-hidden', 'false');
    this.renderGuideStep();
  }

  clearGuideTarget() {
    document.querySelectorAll('.guideTargetPulse,.guideDemoMark').forEach(el => el.classList.remove('guideTargetPulse','guideDemoMark'));
    this.guideTarget = null;
  }

  renderGuideStep() {
    if (!this.guideOpen) return;
    this.clearGuideTarget();
    let step = this.guideSteps[this.guideStep];
    let target = step ? document.querySelector(step.target) : null;
    if (!step || !this.guideElementVisible(target)) {
      this.guideSteps = this.guideStepsFor(this.guideStage);
      if (!this.guideSteps.length) return this.closeGuide(false);
      this.guideStep = Math.min(this.guideStep, this.guideSteps.length - 1);
      step = this.guideSteps[this.guideStep];
      target = document.querySelector(step.target);
    }
    this.guideTarget = target;
    this.saveGuideMemory('in_progress', this.guideStage, this.guideStep);
    target.classList.add(step.demo === 'mark' ? 'guideDemoMark' : 'guideTargetPulse');
    $('guideStepContent').innerHTML = `<div class="guideStepTitle">${esc(step.title)}</div><div class="guideStepText">${step.text}</div>`;
    $('guideProgress').textContent = `${this.guideStep + 1}/${this.guideSteps.length}`;
    $('guidePrevBtn').disabled = this.guideStep === 0;
    $('guideNextBtn').textContent = this.guideStep === this.guideSteps.length - 1 ? 'LISTO' : 'SIGUIENTE';
    try { target.scrollIntoView({ behavior:'smooth', block:'center', inline:'nearest' }); } catch {}
    clearTimeout(this.guidePositionTimer);
    this.guidePositionTimer = setTimeout(() => this.positionGuide(), 180);
  }

  positionGuide() {
    if (!this.guideOpen || !this.guideTarget || !this.guideElementVisible(this.guideTarget)) return;
    const rect = this.guideTarget.getBoundingClientRect();
    const pad = 6;
    const spot = $('guideSpotlight');
    spot.style.left = `${Math.max(3, rect.left - pad)}px`;
    spot.style.top = `${Math.max(3, rect.top - pad)}px`;
    spot.style.width = `${Math.min(innerWidth - 6, rect.width + pad * 2)}px`;
    spot.style.height = `${Math.min(innerHeight - 6, rect.height + pad * 2)}px`;
    const bubble = $('guideBubble');
    const gap = 14;
    const bubbleRect = bubble.getBoundingClientRect();
    const roomBelow = innerHeight - rect.bottom;
    const placeBelow = roomBelow >= bubbleRect.height + gap || rect.top < bubbleRect.height + gap;
    bubble.classList.toggle('below', placeBelow);
    bubble.classList.toggle('above', !placeBelow);
    const top = placeBelow ? rect.bottom + gap : rect.top - bubbleRect.height - gap;
    const left = Math.max(8, Math.min(innerWidth - bubbleRect.width - 8, rect.left + rect.width / 2 - bubbleRect.width / 2));
    bubble.style.top = `${Math.max(8, Math.min(innerHeight - bubbleRect.height - 8, top))}px`;
    bubble.style.left = `${left}px`;
    const arrowLeft = Math.max(18, Math.min(bubbleRect.width - 30, rect.left + rect.width / 2 - left - 7));
    bubble.style.setProperty('--guide-arrow-left', `${arrowLeft}px`);
  }

  nextGuideStep() {
    if (!this.guideOpen) return;
    if (this.guideStep < this.guideSteps.length - 1) {
      this.guideStep += 1;
      this.renderGuideStep();
      return;
    }
    if (!this.guideManual) this.setGuideProgress(this.guideStage === 'selection' ? 'selection' : 'complete');
    this.saveGuideMemory(this.guideStage === 'selection' ? 'in_progress' : 'complete', this.guideStage === 'selection' ? 'controls' : this.guideStage, 0);
    this.closeGuide(false);
    if (this.guideStage === 'controls' && this.state?.demo?.active && this.state?.status === 'waiting') { this.showMessage('Tutorial listo. El servidor inicia la cuenta.', 'success'); this.notifyDemoTutorialResolved(false); }
  }

  skipGuide() {
    this.setGuideProgress('skipped');
    this.saveGuideMemory('skipped', this.guideStage, this.guideStep);
    this.closeGuide(false);
    if (this.state?.demo?.active && this.state?.status === 'waiting') { this.showMessage('Tutorial salteado. El servidor inicia la cuenta.', 'success'); this.notifyDemoTutorialResolved(true); }
  }

  closeGuide(markSkipped = false) {
    if (markSkipped) {
      this.setGuideProgress('skipped');
      this.saveGuideMemory('skipped', this.guideStage, this.guideStep);
    }
    clearTimeout(this.guidePositionTimer);
    this.clearGuideTarget();
    this.guideOpen = false;
    $('guideOverlay').classList.remove('show');
    $('guideOverlay').setAttribute('aria-hidden', 'true');
  }

  renderPlaying() {
    $('waitingPanel').classList.add('hidden'); $('playPanel').classList.remove('hidden');
    const drawn = this.state.game.drawn || [];
    const last = this.state.game.lastBall;
    const ballHost = $('lastBall');
    const drawCountChanged = drawn.length > this.lastDrawCount;
    ballHost.className = 'lastBall';
    if (last == null) ballHost.textContent = '—';
    else if (Number(this.state.game.mode) === 75) {
      const info = this.ballInfo75(last);
      ballHost.classList.add(info.className);
      ballHost.innerHTML = `<span class="ballLetter">${info.letter}</span><strong>${last}</strong>`;
    } else ballHost.innerHTML = `<strong>${last}</strong>`;
    $('ballCount').textContent = `${drawn.length} de ${this.state.game.mode} sorteadas`;
    if (drawCountChanged && last != null) {
      ballHost.classList.add('newBall');
      clearTimeout(this.lastBallAnimationTimer);
      this.lastBallAnimationTimer = setTimeout(() => ballHost.classList.remove('newBall'), 850);
    }
    this.lastDrawCount = drawn.length;
    $('recent').innerHTML = [...drawn].reverse().slice(0,7).map(number => {
      if (Number(this.state.game.mode) !== 75) return `<i>${number}</i>`;
      const info = this.ballInfo75(number);
      return `<i class="${info.className}" title="${info.letter} ${number}">${number}</i>`;
    }).join('');
    $('resultsBtn').disabled = this.state.status !== 'finished'; $('showWinnerBtn').disabled = !this.latestConfirmedWinner();
    this.renderTabs(); this.renderTicket(); this.renderInfoDrawer();
  }

  renderTabs() {
    const cards = this.state.player.cards || [];
    $('cardTabs').innerHTML = cards.map((card,index) => {
      const ready = this.readinessFor(card.id);
      const anyIntermediate = ready?.tripleLineEligible || ready?.doubleLineEligible || ready?.cornersEligible || ready?.lineEligible || ready?.amboEligible;
      const cls = [card.id === this.activeCardId ? 'active' : '', ready?.bingoEligible ? 'readyBingo' : anyIntermediate ? 'readyLine' : ''].filter(Boolean).join(' ');
      const alert = ready?.bingoEligible ? ' · BINGO' : anyIntermediate ? ' · PREMIO' : '';
      return `<button type="button" role="tab" aria-selected="${card.id === this.activeCardId}" data-card="${esc(card.id)}" class="${cls}">C${index+1} · ${esc(card.number)}${alert}</button>`;
    }).join('');
    $('cardTabs').querySelectorAll('button').forEach(button => button.onclick = () => { this.activeCardId = button.dataset.card; storage.setItem('bingoOnlineCard', this.activeCardId); this.renderTabs(); this.renderTicket(); });
  }

  readinessFor(cardId) { return (this.state?.readiness || []).find(item => item.cardId === cardId) || null; }
  eligibleCard(type) { const key = `${type}Eligible`; return (this.state?.readiness || []).find(item => item[key]) || null; }
  ballInfo75(number) {
    const letter = number <= 15 ? 'B' : number <= 30 ? 'I' : number <= 45 ? 'N' : number <= 60 ? 'G' : 'O';
    return { letter, className: `bingo-col-${letter.toLowerCase()}` };
  }
  claimLabel(type) {
    if (type === 'ambo') return 'AMBOCABEZA';
    if (type === 'corners') return '4 ESQUINAS';
    if (type === 'doubleLine') return 'DOBLE LÍNEA';
    if (type === 'tripleLine') return 'TRIPLE LÍNEA';
    if (type === 'bingo') return 'BINGO';
    if (Number(this.state?.game?.mode) === 90 && Number(this.state?.prizeStatus?.line?.awarded || 0) > 0 && !this.state?.prizeStatus?.line?.closed) return 'SEGUNDA LÍNEA';
    return 'LÍNEA';
  }

  claimInputOpen() {
    if (this.state?.status === 'playing') return true;
    const window = this.state?.claimWindow;
    return this.state?.status === 'verifying'
      && window
      && Number(window.drawnCount) === Number(this.state?.game?.drawn?.length || 0)
      && Date.now() <= Number(window.expiresAtMs || 0);
  }

  ticketMarkup(card) {
    const marks = new Set((this.state.player.marks?.[card.id] || []).map(Number));
    const auto = Boolean(this.state.player.autoMark);
    const markLocked = this.state.status !== 'playing';
    const cells = card.grid.flat().map(value => value === null
      ? '<div class="cell blank">·</div>'
      : value === 'LIBRE'
        ? '<div class="cell free"><img src="assets/celebrations/la-gorda-festejando.png" alt="La Gorda"><span>LIBRE</span></div>'
        : `<button class="cell number ${marks.has(value) ? 'marked' : ''}" data-card-id="${esc(card.id)}" data-number="${value}" aria-pressed="${marks.has(value)}" aria-label="Número ${value}, ${marks.has(value) ? 'marcado' : 'sin marcar'}" ${auto || markLocked ? 'disabled' : ''}>${value}</button>`).join('');
    const readyInfo = this.readinessFor(card.id);
    const progress = Number(card.mode) === 75 ? ` · ${readyInfo?.lineCount || 0} líneas completas` : '';
    const bingoHead = Number(card.mode) === 75 ? '<div class="bingoLetters" aria-hidden="true"><span class="bingo-col-b">B</span><span class="bingo-col-i">I</span><span class="bingo-col-n">N</span><span class="bingo-col-g">G</span><span class="bingo-col-o">O</span></div>' : '';
    return `<article class="ticketInstance ${card.id === this.activeCardId ? 'active' : ''}" data-ticket-card="${esc(card.id)}"><div class="ticketHead"><div class="ticketMetaMain"><span class="ticketNumberBadge">${esc(card.number)}</span><div><b>Tu cartón</b><br><small>${esc(this.state.player.name)}</small></div></div><small class="ticketHeadStatus">${marks.size} marcados${progress}<br>${auto ? 'AUTOMÁTICO' : 'MANUAL'}</small></div>${bingoHead}<div class="grid mode${card.mode}">${cells}</div></article>`;
  }

  renderTicket() {
    const cards = this.state.player.cards || [];
    const card = cards.find(item => item.id === this.activeCardId) || cards[0];
    const buttons = {
      ambo:$('claimAmbo'), corners:$('claimCorners'), line:$('claimLine'), doubleLine:$('claimDoubleLine'), tripleLine:$('claimTripleLine'), bingo:$('claimBingo')
    };
    const allButtons = Object.values(buttons);
    $('ticketPanel').classList.toggle('mode75Card', Number(card?.mode) === 75);
    if (!card) { $('ticketPanel').innerHTML = '<div class="error">No hay un cartón elegido.</div>'; allButtons.forEach(button => button.disabled = true); return; }
    const auto = Boolean(this.state.player.autoMark), locked = !this.claimInputOpen();
    $('ticketPanel').innerHTML = `<div class="desktopTickets">${cards.map(item => this.ticketMarkup(item)).join('')}</div>`;
    if (!auto && this.state.status === 'playing') $('ticketPanel').querySelectorAll('[data-number]').forEach(button => button.onclick = () => this.toggleMark(button.dataset.cardId, Number(button.dataset.number), !button.classList.contains('marked')));
    $('ticketPanel').querySelectorAll('[data-ticket-card]').forEach(ticket => ticket.onclick = event => {
      if (event.target.closest('[data-number]')) return;
      this.activeCardId = ticket.dataset.ticketCard;
      storage.setItem('bingoOnlineCard', this.activeCardId);
      this.renderTabs(); this.renderTicket();
    });

    const prizes = this.state.prizeStatus || {};
    const ownCardNumbers = new Set(cards.map(item => String(item.number)));
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
      const localPending = this.pendingClaims.has(item.type);
      item.button.classList.toggle('claimSending', localPending);
      if (localPending) item.button.textContent = 'RECLAMO ENVIADO…';
      const ready = this.eligibleCard(item.type);
      const alreadyWon = (item.prize.winners || []).some(winner => winner.cardId === card.id);
      const ownPending = (this.state.publicClaims || []).some(claim => claim.status === 'pending' && claim.type === item.type && ownCardNumbers.has(String(claim.cardNumber)));
      item.button.disabled = localPending || locked || ownPending || item.prize.closed || (alreadyWon && !ready);
      item.button.classList.toggle('prizeReady', Boolean(ready) && !item.button.disabled);
      if (ready && !item.button.disabled) item.button.textContent = `¡TENÉS ${label}! TOCÁ ACÁ`;
    });
    $('claimBar').classList.toggle('urgentClaimBar', definitions.some(item => Boolean(this.eligibleCard(item.type)) && item.enabled && !item.button.disabled));
  }

  async toggleMark(cardId, number, marked) {
    if (this.state?.player.autoMark || this.pendingMark.has(`${cardId}:${number}`)) return;
    const key = `${cardId}:${number}`; this.pendingMark.add(key);
    try { this.applyState(await this.request('/api/player/mark', { method:'POST', body:JSON.stringify({ cardId, number, marked }) })); }
    catch (error) { this.showMessage(error.message, 'error'); }
    finally { this.pendingMark.delete(key); }
  }

  autoMarkVisualState() {
    return this.autoMarkDesired == null ? Boolean(this.state?.player?.autoMark) : Boolean(this.autoMarkDesired);
  }

  countRecoverableAutoMarks() {
    if (!this.state?.player?.cards?.length) return 0;
    const drawn = new Set((this.state.game?.drawn || []).map(Number));
    let count = 0;
    for (const card of this.state.player.cards) {
      const marks = new Set((this.state.player.marks?.[card.id] || []).map(Number));
      for (const value of card.grid.flat()) if (Number.isFinite(Number(value)) && drawn.has(Number(value)) && !marks.has(Number(value))) count += 1;
    }
    return count;
  }

  queueAutoMark(enabled) {
    if (!this.state?.active || !this.state?.player?.selectionConfirmed) return;
    const desired = Boolean(enabled);
    if (this.state.player.markingModeChosen && Boolean(this.state.player.autoMark) === desired) { this.autoMarkDesired = null; this.updateQuickTools(); return; }
    this.autoMarkFeedback = { desired, recoverable: desired ? this.countRecoverableAutoMarks() : 0 };
    this.autoMarkDesired = desired;
    this.updateQuickTools();
    this.syncAutoMark();
  }

  chooseInitialMarkingMode(enabled) {
    if (this.markingModeChoosing) return;
    this.markingModeChoosing = true;
    $('markingModeManual').disabled = true; $('markingModeAuto').disabled = true;
    this.queueAutoMark(Boolean(enabled));
  }

  ensureMarkingModeChoice() {
    const mustChoose = Boolean(this.state?.player?.selectionConfirmed && !this.state?.player?.markingModeChosen && ['waiting','starting','playing'].includes(this.state?.status));
    $('markingModeOverlay').classList.toggle('show', mustChoose);
    if (!mustChoose) {
      this.markingModeChoosing = false;
      $('markingModeManual').disabled = false; $('markingModeAuto').disabled = false;
    }
  }

  pendingManualHits() {
    if (!this.state?.player?.selectionConfirmed || this.autoMarkVisualState()) return 0;
    const drawn = new Set((this.state?.game?.drawn || []).map(Number));
    let total = 0;
    for (const card of this.state.player.cards || []) {
      const marks = new Set((this.state.player.marks?.[card.id] || []).map(Number));
      for (const value of card.grid.flat()) { const n = Number(value); if (Number.isFinite(n) && drawn.has(n) && !marks.has(n)) total += 1; }
    }
    return total;
  }

  trackManualLag() {
    if (!this.state || this.state.status !== 'playing' || this.autoMarkVisualState()) { this.manualLagStartDrawCount = null; this.manualLagPrompted = false; this.lastManualPending = 0; this.closeModal('autoAssistOverlay'); return; }
    const pending = this.pendingManualHits(); this.lastManualPending = pending;
    if (pending <= 4) { this.manualLagStartDrawCount = null; this.manualLagPrompted = false; this.closeModal('autoAssistOverlay'); return; }
    const drawCount = Number(this.state.game?.drawn?.length || 0);
    if (this.manualLagStartDrawCount == null) this.manualLagStartDrawCount = drawCount;
    if (!this.manualLagPrompted && drawCount - this.manualLagStartDrawCount >= 5) {
      this.manualLagPrompted = true;
      $('autoAssistText').textContent = `Tenés ${pending} aciertos sin marcar desde hace varias bolillas. Automarcado puede ponerte al día ahora.`;
      $('autoAssistOverlay').classList.add('show');
    }
  }

  async syncAutoMark() {
    if (this.autoMarkSyncing || this.autoMarkDesired == null) return;
    this.autoMarkSyncing = true;
    try {
      while (this.autoMarkDesired != null && (!this.state?.player?.markingModeChosen || Boolean(this.state?.player?.autoMark) !== Boolean(this.autoMarkDesired))) {
        const requested = Boolean(this.autoMarkDesired);
        const response = await this.request('/api/player/automark', { method:'POST', body:JSON.stringify({ enabled:requested }) });
        this.applyState(response);
        if (this.autoMarkDesired === requested && Boolean(this.state?.player?.markingModeChosen) && Boolean(this.state?.player?.autoMark) === requested) {
          const feedback = this.autoMarkFeedback;
          this.autoMarkDesired = null;
          this.autoMarkFeedback = null;
          if (requested) {
            const recovered = Number(feedback?.recoverable || 0);
            this.showMessage(recovered > 0 ? `AUTO ACTIVADO · ${recovered} número${recovered === 1 ? '' : 's'} recuperado${recovered === 1 ? '' : 's'}.` : 'AUTO ACTIVADO · Todo al día.', 'notice', 2600);
          } else this.showMessage('AUTO DESACTIVADO · Marcado manual.', 'notice', 2200);
        }
      }
    } catch (error) {
      this.autoMarkDesired = null;
      this.autoMarkFeedback = null;
      this.showMessage(error.message, 'error');
    } finally {
      this.autoMarkSyncing = false;
      this.updateQuickTools();
      if (this.autoMarkDesired != null && (!this.state?.player?.markingModeChosen || Boolean(this.state?.player?.autoMark) !== Boolean(this.autoMarkDesired))) this.syncAutoMark();
    }
  }

  async claim(type) {
    if (!this.claimInputOpen() || this.pendingClaims.has(type)) return;
    const now = Date.now();
    if (now - Number(this.claimClickGuard.get(type) || 0) < 900) return;
    this.claimClickGuard.set(type, now);
    const ready = this.eligibleCard(type);
    if (ready) { this.activeCardId = ready.cardId; storage.setItem('bingoOnlineCard', this.activeCardId); this.renderTabs(); this.renderTicket(); }
    const card = this.state?.player.cards.find(item => item.id === this.activeCardId); if (!card) return;
    const label = this.claimLabel(type);
    this.pendingClaims.add(type);
    this.renderTicket();
    this.showMessage(`RECLAMO ENVIADO · ${label}. Esperando recepción del servidor…`, 'notice', 5000);
    if (this.connectionIsRisky()) this.showMessage('Conexión débil: el reclamo quedó enviado y el sistema está intentando confirmarlo.', 'error', 5200);
    try {
      const claim = await this.request('/api/player/claim', { method:'POST', body:JSON.stringify({ cardId:card.id, type }) });
      const receiptTime = claim.receivedAt ? new Date(claim.receivedAt).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', second:'2-digit', fractionalSecondDigits:3 }) : '';
      const receipt = claim.receivedSequence ? ` · Recepción #${claim.receivedSequence}` : '';
      this.showMessage(`${label} RECIBIDO${receipt}${receiptTime ? ` · ${receiptTime}` : ''}.`, 'notice', 5200);
      if (!claim.officialValid) this.showMessage(`El control oficial todavía no detecta ${label}.`, 'error', 5200);
    } catch (error) {
      const duplicate = /ya reclamó|pendiente|entregado/i.test(error.message || '');
      this.showMessage(duplicate ? `${label}: el reclamo ya estaba registrado.` : error.message, duplicate ? 'notice' : 'error', 5200);
    } finally {
      this.pendingClaims.delete(type);
      setTimeout(() => this.claimClickGuard.delete(type), 1000);
      this.renderTicket();
    }
  }

  handleOwnPrizeReadiness() {
    if (!this.state || !this.claimInputOpen()) return;
    const order = ['bingo','tripleLine','doubleLine','corners','line','ambo'];
    let type = null, ready = null;
    for (const candidate of order) { ready = this.eligibleCard(candidate); if (ready) { type = candidate; break; } }
    if (!ready || !type) { this.lastPrizeReadyKey = ''; return; }
    const awarded = Number(this.state.prizeStatus?.[type]?.awarded || 0);
    const key = `${type}:${ready.cardId}:${this.state.game.drawn.length}:${awarded}`; if (key === this.lastPrizeReadyKey) return;
    this.lastPrizeReadyKey = key; const changedCard = this.activeCardId !== ready.cardId; this.activeCardId = ready.cardId; storage.setItem('bingoOnlineCard', ready.cardId);
    this.renderTabs(); this.renderTicket();
    if (changedCard) { const panel=$('ticketPanel'); panel.classList.remove('beta2PrizeFocus'); void panel.offsetWidth; panel.classList.add('beta2PrizeFocus'); }
    this.playAlertSound(type); if (this.alertsEnabled && navigator.vibrate) navigator.vibrate(type === 'bingo' ? [180,80,180,80,260] : [150,70,150]);
    const label = this.claimLabel(type);
    this.showMessage(`¡TENÉS ${label} EN EL CARTÓN ${ready.cardNumber}! Cambiamos al cartón correcto. RECLAMÁ AHORA.`, 'notice', 5200);
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
          this.showSequence('EXTRACCIÓN FINAL DE BOLILLAS', 'Se completa el bolillero para habilitar el acta oficial.', '');
          this.speakSequenceOnce(`${key}:remaining`, 'finalExtractionStart', {});
        }, 3400);
      }
    } else if (status === 'finished' && previous?.status === 'finalizing') {
      clearInterval(this.sequenceTimer); clearTimeout(this.finalSequenceTimer); $('sequenceOverlay').classList.remove('show');
      this.speakSequenceOnce(`${this.state.roomCode}:final-complete`, 'finalExtractionDone', {});
    } else if (status === 'starting' && transition) this.runStartSequence(transition);
    else if (status === 'resuming' && transition) this.runResumeSequence(transition);
    else { clearInterval(this.sequenceTimer); clearTimeout(this.finalSequenceTimer); $('sequenceOverlay').classList.remove('show'); }
    this.lastStatus = status;
  }

  runStartSequence(transition) {
    const key = transition.id || transition.startedAt;
    clearInterval(this.sequenceTimer);
    const update = () => {
      const start = new Date(transition.startedAt).getTime(), end = new Date(transition.endsAt).getTime(), now = Date.now();
      const noticeMs = transition.largeRoomNotice ? Math.max(0, Number(transition.noticeDurationMs) || 0) : 0;
      const elapsed = now - start;
      if (transition.largeRoomNotice && transition.priorityNotice && elapsed < noticeMs) {
        this.showSequence(transition.priorityNotice.title || 'CRITERIO DE ADJUDICACIÓN DE PREMIOS', transition.priorityNotice.text || '', '', true);
        return;
      }
      const sequenceElapsed = now - (start + noticeMs), remaining = Math.max(0, end - now);
      if (sequenceElapsed < 3300) {
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

  showSequence(title, text, count, notice = false) {
    $('sequencePresenter').src = 'assets/vero.png'; $('sequenceTitle').textContent = title; $('sequenceText').textContent = text; $('sequenceCount').textContent = count; $('sequenceCard')?.classList.toggle('noticeMode', Boolean(notice)); $('sequenceOverlay').classList.add('show');
  }

  speakSequenceOnce(key, event, replacements) { if (sessionStorage.getItem(`spoken:${key}`)) return; sessionStorage.setItem(`spoken:${key}`,'1'); this.speakEvent(event, replacements, true); }
  speakTextOnce(key, text) { if (sessionStorage.getItem(`spoken:${key}`)) return; sessionStorage.setItem(`spoken:${key}`,'1'); this.speak(text, true); }

  refreshVoices() { this.voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }
  preferredVoice() {
    const spanish = this.voices.filter(voice => /^es([-_]|$)/i.test(voice.lang) || /spanish|español|espanol/i.test(voice.name));
    return spanish.find(voice => /female|femen|mujer|sofia|paulina|paloma|ximena|laura|lucia|mar[ií]a|camila|valentina|monica|m[oó]nica|sabina/i.test(voice.name)) || spanish[0] || this.voices[0];
  }
  speak(text, priority = false) {
    if (!this.voiceEnabled || this.state?.roomSettings?.playerAudioAllowed === false || !window.speechSynthesis || !text) return;
    const profile = PRESENTERS.vero || { rate:1,pitch:1 };
    const utterance = new SpeechSynthesisUtterance(text), voice = this.preferredVoice();
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = 'es-AR';
    utterance.rate = profile.rate || 1; utterance.pitch = profile.pitch || 1; utterance.volume = this.audioVolume;
    if (priority) window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  }
  speakBall(number) { if (this.state?.bingoConfirmed || ['finalizing','finished'].includes(this.state?.status)) return; this.speak(this.phrases.ball('vero', number, this.state.game.drawn.length, this.state.game.mode)); }
  speakEvent(name, replacements = {}, priority = true) { this.speak(this.phrases.event('vero', name, replacements), priority); }

  setAudioEnabled(enabled) {
    this.audioEnabled = Boolean(enabled);
    storage.setItem('bingoPlayerSound', String(this.audioEnabled));
    this.updateQuickTools();
    if (this.audioEnabled) this.playAlertSound('line');
  }

  setVoiceEnabled(enabled) {
    this.voiceEnabled = Boolean(enabled);
    storage.setItem('bingoPlayerVoice', String(this.voiceEnabled));
    if (!this.voiceEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
    this.updateQuickTools();
    if (this.voiceEnabled && this.state) this.speak((PRESENTERS.vero || {}).preview || 'Hola, soy Vero.', true);
  }

  setVolume(value, persist = true) {
    this.audioVolume = Math.max(0, Math.min(1, Number(value) || 0));
    if (persist) storage.setItem('bingoPlayerVolume', String(this.audioVolume));
    if ($('volumeRange')) $('volumeRange').value = String(Math.round(this.audioVolume * 100));
    if ($('volumeValue')) $('volumeValue').textContent = `${Math.round(this.audioVolume * 100)}%`;
  }

  setLargeNumbers(enabled, persist = true) {
    this.largeNumbers = Boolean(enabled);
    if (persist) storage.setItem('bingoPlayerLargeNumbers', String(this.largeNumbers));
    document.body.classList.toggle('largeNumbers', this.largeNumbers);
    this.updateQuickTools();
  }

  setAlertsEnabled(enabled) { this.alertsEnabled = Boolean(enabled); storage.setItem('bingoPlayerAlerts', String(this.alertsEnabled)); this.updateQuickTools(); }

  updateQuickTools() {
    const update = (id, active, on, off) => {
      const button = $(id); if (!button) return;
      button.classList.toggle('active', Boolean(active));
      button.setAttribute('aria-pressed', String(Boolean(active)));
      button.textContent = active ? on : off;
    };
    update('soundToggle', this.audioEnabled, 'ACTIVADOS', 'DESACTIVADOS');
    update('voiceToggle', this.voiceEnabled, 'ACTIVADA', 'DESACTIVADA');
    update('numberSizeToggle', this.largeNumbers, 'GRANDES', 'NORMAL');
    const autoVisual = this.autoMarkVisualState();
    update('autoMarkToggle', autoVisual, 'ACTIVADO', 'DESACTIVADO');
    const autoQuick = $('quickAutoMarkBtn'), manualQuick = $('quickManualMarkBtn');
    const chosen = Boolean(this.state?.player?.markingModeChosen);
    if (autoQuick) { autoQuick.classList.toggle('active', chosen && autoVisual); autoQuick.classList.toggle('auto', chosen && autoVisual); autoQuick.setAttribute('aria-pressed', String(chosen && autoVisual)); autoQuick.disabled = false; autoQuick.title = 'Usar Automarcado'; }
    if (manualQuick) { manualQuick.classList.toggle('active', chosen && !autoVisual); manualQuick.setAttribute('aria-pressed', String(chosen && !autoVisual)); manualQuick.disabled = false; manualQuick.title = 'Usar marcado Manual'; }
    const quickSound = $('quickSoundBtn');
    if (quickSound) { quickSound.textContent = this.audioEnabled ? '🔊' : '🔇'; quickSound.classList.toggle('active', this.audioEnabled); quickSound.setAttribute('aria-label', this.audioEnabled ? 'Desactivar sonidos' : 'Activar sonidos'); }
    const quickVoice = $('quickVoiceBtn');
    if (quickVoice) { quickVoice.textContent = this.voiceEnabled ? '🎙' : '🔕'; quickVoice.classList.toggle('active', this.voiceEnabled); quickVoice.setAttribute('aria-label', this.voiceEnabled ? 'Desactivar voz' : 'Activar voz'); }
    $('alertsToggle')?.classList.toggle('active', this.alertsEnabled);
    this.setVolume(this.audioVolume, false);
  }

  renderPublicClaim() {
    const claim = (this.state?.publicClaims || []).at(-1); if (!claim) return;
    const key = `${claim.id}:${claim.status}`; if (key === this.lastPublicClaimKey) return; this.lastPublicClaimKey = key;
    const label = String(claim.prizeLabel || this.claimLabel(claim.type)).toUpperCase();
    if (claim.status === 'pending') {
      this.showClaimOverlay({ kind:claim.type, icon:'', title:`${claim.playerName} cantó ${label}`, text:`Cartón ${claim.cardNumber}. Esperando verificación del administrador.`, duration:6500, badge:'assets/celebrations/verificando-jugada.png', force:true });
      this.playAlertSound(claim.type);
      const demoRival = Boolean(this.state?.demo?.active && ['Zoe','Mateo','Owen'].includes(claim.playerName));
      if (demoRival) this.speakEvent('demoClaim', { name: claim.playerName, prize: label });
      else {
        const claimEvent = ({ ambo:'claimAmbo', doubleLine:'claimDoubleLine', tripleLine:'claimTripleLine', corners:'claimCorners', bingo:'claimBingo' })[claim.type] || 'claimLine';
        this.speakEvent(claimEvent);
      }
      return;
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
      this.playAlertSound('confirmed');
      const demoRival = Boolean(this.state?.demo?.active && ['Zoe','Mateo','Owen'].includes(claim.playerName));
      if (demoRival) this.speakEvent('demoWinner', { name: claim.playerName, prize: label, card: claim.cardNumber || '' });
      else {
        const confirmedEvent = ({ ambo:'amboConfirmed', doubleLine:'doubleLineConfirmed', tripleLine:'tripleLineConfirmed', corners:'cornersConfirmed', bingo:'bingoConfirmed' })[claim.type] || 'lineConfirmed';
        this.speakEvent(confirmedEvent, { name: claim.playerName || 'el ganador', card: claim.cardNumber || '' });
      }
      return;
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
    if (!this.audioEnabled || this.audioVolume <= 0) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext; if (!AudioCtx) return; const ctx = new AudioCtx();
      const seq = kind === 'bingo' || kind === 'confirmed' ? [523,659,784,1047] : kind === 'rejected' ? [330,247] : [660,880];
      seq.forEach((frequency,index) => { const osc=ctx.createOscillator(), gain=ctx.createGain(), start=ctx.currentTime+index*.13; osc.frequency.value=frequency; gain.gain.setValueAtTime(.0001,start); gain.gain.exponentialRampToValueAtTime(Math.max(.001,.13*this.audioVolume),start+.025); gain.gain.exponentialRampToValueAtTime(.0001,start+.18); osc.connect(gain).connect(ctx.destination); osc.start(start); osc.stop(start+.2); });
      setTimeout(() => ctx.close().catch(()=>{}), 1200);
    } catch {}
  }

  handleTestEvent() {
    const event = this.state?.testEvent; if (!event?.id || event.id === this.lastTestEventId || new Date(event.expiresAt || 0).getTime() <= Date.now()) return;
    this.lastTestEventId = event.id;
    if (event.type === 'ball') return this.speakBall(event.number || 42);
    this.showClaimOverlay({ kind:event.type, icon:'🔔', title:`PRUEBA DE ${String(event.type).toUpperCase()}`, text:event.text || 'Prueba del administrador.', duration:4200 }); this.playAlertSound(event.type);
  }

  latestConfirmedWinner() { return [...this.confirmedWinners()].reverse()[0] || null; }
  openDrawnNumbers() { this.openInfoDrawer('numbers'); }
  renderDrawnNumbers() { this.renderSortedNumbers(); }
  openWinnerCard(claimId = '') {
    this.selectedWinnerId = claimId || this.latestConfirmedWinner()?.id || '';
    this.renderWinnerCard(this.selectedWinnerId);
    $('winnerOverlay').classList.add('show');
  }
  renderWinnerCard(claimId = '') {
    const claim = this.confirmedWinners().find(item => item.id === claimId) || this.latestConfirmedWinner();
    if (!claim?.winningCard) return $('winnerContent').innerHTML = '<div class="notice">Todavía no hay un ganador confirmado.</div>';
    this.selectedWinnerId = claim.id;
    const card=claim.winningCard, official=new Set((claim.officialMarked||[]).map(Number)), winning=new Set((claim.winningNumbers||[]).map(Number));
    const cells=card.grid.flat().map(value=>value===null?'<div class="winnerCell blank">·</div>':value==='LIBRE'?`<div class="winnerCell free${claim.type==='bingo'?' winning':''}">LIBRE</div>`:`<div class="winnerCell ${official.has(value)?'official':''} ${winning.has(value)?'winning':''}">${value}</div>`).join('');
    const resolved = claim.resolvedAt || claim.createdAt;
    $('winnerContent').innerHTML=`<div class="winnerSummary"><b>${esc(String(claim.prizeLabel||'PREMIO').toUpperCase())} CONFIRMADO</b><br>${esc(claim.playerName)} · Cartón ${esc(claim.cardNumber)}<br><small>${esc(this.chatTime(resolved))}</small></div><div class="winnerGrid mode${card.mode}">${cells}</div>`;
  }

  async downloadResults() { if (this.state?.status !== 'finished') return; this.downloadFile(`/api/results.pdf?sala=${encodeURIComponent(this.state.roomCode)}`, `LA_GORDA_BINGO_ONLINE_Resultados_${this.state.roomCode}.pdf`); }
  async downloadLastPublicResult() { if (this.lastResult?.roomCode) this.downloadFile(`/api/results.pdf?sala=${encodeURIComponent(this.lastResult.roomCode)}`, this.lastResult.filename || 'LA_GORDA_BINGO_ONLINE_Resultados.pdf'); }
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
    this.tokenRoom = '';
    storage.removeItem('bingoOnlineToken');
    storage.removeItem('bingoOnlineRoom');
    storage.removeItem('bingoOnlineCard');
    $('connectionMask').classList.remove('show');
    $('finalResultsOverlay').classList.remove('show');
    $('roomClosedOverlay').classList.add('show');
  }

  renderNotice() {
    const latest=(this.state?.player?.notices||[]).at(-1); if(!latest) return; const key=`noticeSeen:${latest.id}`; if(sessionStorage.getItem(key)) return; sessionStorage.setItem(key,'1'); this.showMessage(latest.text,latest.result==='confirmed'?'notice':'error');
  }
  showMessage(text,kind='notice',duration=8000) { $('playerNotice').innerHTML=`<div class="${kind}">${esc(text)}</div>`; clearTimeout(this.messageTimer); this.messageTimer=setTimeout(()=>{$('playerNotice').innerHTML='';},Math.max(900,Number(duration)||8000)); }
  closeModal(id) { $(id)?.classList.remove('show'); }
  openWatchPanel() {
    if(!this.state?.broadcastUrl) return this.showMessage('El modo espectador todavía no está disponible.','error');
    $('watchLinkText').textContent=this.state.broadcastUrl;
    $('castWatchBtn').disabled=false;
    $('watchOverlay').classList.add('show');
  }
  async copyWatchLink() {
    const url=this.state?.broadcastUrl;if(!url)return;
    try{await navigator.clipboard.writeText(url);this.showMessage('Link de la transmisión copiado.','notice')}catch{prompt('Copiá este enlace:',url)}
  }
  async castWatch() {
    const url=this.state?.broadcastUrl;if(!url)return;
    try{await window.LaGordaCast.castUrl(url,this.state?.castAppId);this.showMessage('Elegí tu Chromecast o TV compatible.','notice')}catch(e){this.showMessage(e.message,'error')}
  }

  toggleTheme() { this.theme=this.theme==='day'?'night':'day'; storage.setItem('bingoPlayerTheme',this.theme); this.applyTheme(); }
  applyTheme() {
    document.documentElement.dataset.theme=this.theme;
    $('themeToggle').textContent=this.theme==='day'?'CLARO':'OSCURO';
    $('themeToggle').classList.toggle('active', this.theme === 'day');
    $('themeToggle').title=this.theme==='day'?'Activar modo nocturno':'Activar modo claro';
  }

  updateFullscreenButton() {
    const button = $('fullScreenBtn'); if (!button) return;
    button.textContent = '⛶';
    button.classList.toggle('active', this.focusMode);
    button.title = this.focusMode ? 'Salir de pantalla completa' : 'Pantalla completa';
    button.setAttribute('aria-label', button.title);
  }

  async setFocusMode(enabled) {
    this.focusMode=Boolean(enabled);
    document.body.classList.toggle('focusMode',this.focusMode);
    this.updateFullscreenButton();
    if(this.focusMode){
      try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement){await document.documentElement.requestFullscreen();this.fullscreenApiActive=true;}}catch{}
      window.scrollTo({top:0});
      return;
    }
    if(document.fullscreenElement&&document.exitFullscreen)try{await document.exitFullscreen();}catch{}
    this.fullscreenApiActive=false;
    this.updateFullscreenButton();
  }

  logout(reload=true) {
    this.releaseWakeLock();
    this.events?.close(); clearTimeout(this.reconnectRefreshTimer); clearInterval(this.sequenceTimer); this.setFocusMode(false); this.closeOtherPanels(); this.closeResultsViewer(); this.token=''; this.cookieSession=false; this.tokenRoom=''; this.state=null; this.roomClosedShown=false; storage.removeItem('bingoOnlineToken'); storage.removeItem('bingoOnlineRoom'); storage.removeItem('bingoOnlineCard');
    document.body.classList.remove('playerLogged'); $('infoDrawerToggle').classList.add('hidden');
    if(reload) location.reload(); else { $('gameView').classList.add('hidden'); $('loginView').classList.remove('hidden'); }
  }
}

window.addEventListener('DOMContentLoaded', () => new PlayerApp().init());
})();
