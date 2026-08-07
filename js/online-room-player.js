(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
const Scripts = window.BingoPresenterScripts || {};
const PRESENTERS = Scripts.profiles || {};

class PlayerApp {
  constructor() {
    this.token = localStorage.getItem('bingoOnlineToken') || '';
    this.tokenRoom = String(localStorage.getItem('bingoOnlineRoom') || '').trim().toUpperCase();
    this.deviceId = localStorage.getItem('bingoPlayerDeviceId') || this.makeDeviceId();
    localStorage.setItem('bingoPlayerDeviceId', this.deviceId);
    this.state = null;
    this.activeCardId = localStorage.getItem('bingoOnlineCard') || '';
    this.events = null;
    this.reconnectRefreshTimer = null;
    this.selectedOffers = new Set();
    this.pendingReservation = new Set();
    this.pendingMark = new Set();
    this.voices = [];
    this.phrases = Scripts.PhraseEngine ? new Scripts.PhraseEngine() : { ball:(id,n)=>`Número ${n}`, event:()=>'' };
    this.audioPreferenceLoaded = localStorage.getItem('bingoPlayerSound') !== null;
    this.audioEnabled = localStorage.getItem('bingoPlayerSound') !== 'false';
    this.voiceEnabled = localStorage.getItem('bingoPlayerVoice') !== 'false';
    this.alertsEnabled = localStorage.getItem('bingoPlayerAlerts') !== 'false';
    this.audioVolume = Math.max(0, Math.min(1, Number(localStorage.getItem('bingoPlayerVolume') ?? .92)));
    this.largeNumbers = localStorage.getItem('bingoPlayerLargeNumbers') === 'true';
    this.lastPublicClaimKey = '';
    this.lastAdminMessageId = '';
    this.seenChatMessageIds = new Set();
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
    this.drawerTab = 'winners';
    this.selectedWinnerId = '';
    this.resultsViewerUrl = '';
    this.resultsViewerObjectUrl = '';
    this.stickerSendTimes = [];
    this.openJoinMode = false;
    this.openJoinCardCount = 2;
    this.waitingMini = {
      activeType: ['red_black','higher_lower'].includes(localStorage.getItem('bingoWaitingMiniGame')) ? localStorage.getItem('bingoWaitingMiniGame') : 'red_black',
      score: 0, best: 0, bestByType: { red_black: 0, higher_lower: 0 }, current: null, ended: false, busy: false, message: ''
    };
    this.ticketTouchStartX = null;
    this.guideSteps = [
      { icon:'🧾', title:'Tus cartones', text:'Usá las pestañas para cambiar de cartón. Las marcas oficiales se conservan en todos.' },
      { icon:'⚙', title:'Ajustes', text:'Desde la tuerca podés controlar sonido, voz, tamaño de números, automarcado y tu cantador de la suerte.' },
      { icon:'›', title:'Ganadores y números', text:'La flecha lateral muestra los premios confirmados y los números salidos ordenados de menor a mayor.' },
      { icon:'💬', title:'Chat público', text:'El chat separa emojis comunes para el texto y 12 stickers premium de envío directo. Tocá un sticker recibido para repetir su animación.' },
      { icon:'🏆', title:'Tenés que cantar', text:'Aunque el sistema marque solo, el premio se reclama tocando manualmente el botón correspondiente.' },
      { icon:'📄', title:'Acta oficial', text:'Al terminar la partida podés ver el PDF completo dentro del juego y descargarlo solo si lo necesitás.' }
    ];
  }

  makeDeviceId() {
    return `device_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  }

  async init() {
    this.injectDemoUi();
    this.injectChatUi();
    $('loginBtn').onclick = () => this.login();
    $('lastResultBtn').onclick = () => this.downloadLastPublicResult();
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
    $('volumeRange').oninput = event => this.setVolume(Number(event.target.value) / 100);
    $('numberSizeToggle').onclick = () => this.setLargeNumbers(!this.largeNumbers);
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
    $('closePresenterChoiceBtn').onclick = () => this.closeModal('presenterChoiceOverlay');
    $('roomClosedBtn').onclick = () => this.logout(true);
    $('closeWinnerBtn').onclick = () => this.closeModal('winnerOverlay');
    $('fullScreenBtn').onclick = () => this.setFocusMode(!this.focusMode);
    ['winnerOverlay','partialChoiceOverlay','presenterChoiceOverlay'].forEach(id => $(id)?.addEventListener('click', event => { if (event.target === $(id)) this.closeModal(id); }));
    $('ticketPanel').addEventListener('touchstart', event => this.beginTicketSwipe(event), { passive:true });
    $('ticketPanel').addEventListener('touchend', event => this.endTicketSwipe(event), { passive:true });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if ($('resultsViewerOverlay').classList.contains('show')) return this.closeResultsViewer();
      if ($('settingsOverlay').classList.contains('show')) return this.closeSettings();
      if ($('infoDrawer').classList.contains('show')) return this.closeInfoDrawer();
      if ($('playerChatPanel')?.classList.contains('show')) return this.closeChat();
      this.closeModal('winnerOverlay'); this.closeModal('partialChoiceOverlay'); this.closeModal('presenterChoiceOverlay'); this.closeGuide();
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
    await this.loadPublicInfo();
    this.refreshVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => this.refreshVoices();

    const params = new URLSearchParams(location.search);
    const directCode = String(params.get('acceso') || params.get('codigo') || params.get('code') || '').trim().toUpperCase();
    const roomCode = String(params.get('sala') || '').trim().toUpperCase();
    this.openJoinMode = params.get('prueba') === '1' && Boolean(roomCode);
    if (this.openJoinMode) {
      $('codeLoginFields')?.classList.add('hidden');
      $('openJoinFields')?.classList.add('show');
      $('loginIntro').textContent = 'Escribí tu nombre, elegí tus cartones y entrá directamente a la sala de prueba.';
      $('loginBtn').textContent = 'ENTRAR A LA SALA';
    }
    if (directCode) {
      $('accessCode').value = directCode;
      await this.login(directCode, roomCode);
    } else if (this.token && (!roomCode || (this.tokenRoom && this.tokenRoom === roomCode))) {
      await this.resume();
    } else if (roomCode && this.token && this.tokenRoom !== roomCode) {
      this.token = '';
      this.tokenRoom = '';
      this.activeCardId = '';
      localStorage.removeItem('bingoOnlineToken');
      localStorage.removeItem('bingoOnlineRoom');
      localStorage.removeItem('bingoOnlineCard');
    }

    this.keepAliveTimer = setInterval(() => { if (this.state?.active) fetch('/api/ping', { cache:'no-store' }).catch(() => {}); }, 5 * 60 * 1000);
    this.assignmentClockTimer = setInterval(() => this.updateAssignmentCountdown(), 1000);
  }

  injectDemoUi() {
    if ($('demoPlayerBanner')) return;
    const style = document.createElement('style');
    style.textContent = `
      .demoPlayerBanner{display:none;margin:0 0 14px;padding:12px 14px;border-radius:15px;background:linear-gradient(135deg,#4b1764,#7e1f73);border:1px solid #d79de6;color:#fff;box-shadow:0 12px 34px #0005}.demoPlayerBanner.show{display:grid;gap:9px}.demoPlayerBannerTop{display:flex;justify-content:space-between;align-items:center;gap:12px}.demoPlayerBanner strong{font-size:14px;letter-spacing:.04em}.demoPlayerBanner small{color:#f2dff5}.demoParticipants{display:flex;flex-wrap:wrap;gap:7px}.demoParticipant{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;background:#ffffff14;border:1px solid #ffffff22;font-size:12px;font-weight:800}.demoParticipant.you{background:#ffca2f;color:#241805;border-color:#ffdf78}.demoAiTag{font-size:9px;padding:2px 5px;border-radius:999px;background:#17243a;color:#d9ebff}html[data-theme="day"] .demoPlayerBanner{background:linear-gradient(135deg,#efe1f3,#f6e8f2);color:#32153d;border-color:#b98ac4}html[data-theme="day"] .demoPlayerBanner small{color:#6f4e75}html[data-theme="day"] .demoParticipant{background:#fff8;border-color:#80588a33}html[data-theme="day"] .demoParticipant.you{background:#ffca2f;color:#241805}
    `;
    document.head.appendChild(style);
    const host = $('gameView') || document.body;
    const banner = document.createElement('section');
    banner.id = 'demoPlayerBanner'; banner.className = 'demoPlayerBanner';
    banner.innerHTML = `<div class="demoPlayerBannerTop"><div><strong>DEMOSTRACIÓN · SIN VALIDEZ OFICIAL</strong><br><small id="demoPlayerSummary"></small></div><span id="demoPlayerSpeed"></span></div><div id="demoParticipants" class="demoParticipants"></div>`;
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
    $('demoPlayerSummary').textContent = `${this.state.game.mode} bolas · ${rivals} rival${rivals === 1 ? '' : 'es'} IA · automarcado obligatorio`;
    $('demoPlayerSpeed').textContent = `${Number(demo.autoSeconds) || 4} s por bolilla`;
    $('demoParticipants').innerHTML = participants.map(item => `<span class="demoParticipant ${item.virtual ? '' : 'you'}">${esc(item.name)}${item.virtual ? '<span class="demoAiTag">IA</span>' : ''} · ${Number(item.cardCount) || 0} cartón${Number(item.cardCount) === 1 ? '' : 'es'}</span>`).join('');
  }

  injectChatUi() {
    if ($('playerChatDock')) return;
    const style = document.createElement('style');
    style.textContent = `
      .playerChatDock{position:fixed;right:9px;bottom:9px;z-index:105}.playerChatToggle{min-height:44px;border:0;border-radius:999px;padding:10px 14px;background:#5a167b;color:#fff;font-weight:1000;box-shadow:0 10px 35px #0008}.playerChatPanel{display:none;position:fixed;left:50%;bottom:8px;transform:translateX(-50%);width:min(540px,calc(100vw - 16px));height:min(620px,80dvh);background:var(--panel);border:1px solid var(--border);border-radius:20px;overflow:hidden;box-shadow:0 25px 70px #000b}.playerChatPanel.show{display:grid;grid-template-rows:auto 1fr auto auto}.playerChatPanel header{display:flex;justify-content:space-between;align-items:center;padding:11px 13px;background:linear-gradient(135deg,#5a167b,#7b2494);color:#fff}.playerChatPanel header button{border:0;background:transparent;color:#fff;font-size:24px}.playerChatMessages{overflow:auto;padding:10px;display:grid;align-content:start;gap:8px;background:var(--panel3)}.playerChatMessage{padding:9px 10px;border-radius:11px;background:var(--panel2);color:var(--text);border:1px solid var(--border)}.playerChatMessage.admin{background:#3b2454;color:#fff;border-color:#9867b2}.playerChatMessage small{display:flex;justify-content:space-between;gap:8px;color:var(--muted);margin-bottom:4px}.playerChatMessage.admin small{color:#e3cdeb}.playerChatMessage p{margin:0;word-break:break-word}.playerChatMessage.stickerMessage{background:transparent;border-color:transparent;padding:5px 8px}.playerChatMessage.stickerMessage small{margin-bottom:1px}.playerChatMessage.stickerMessage p{display:flex;align-items:center;min-height:104px}.playerChatComposer{display:grid;grid-template-columns:46px 46px minmax(0,1fr) auto;align-items:end;border-top:1px solid var(--border);background:var(--panel)}.playerChatToolButton{width:46px;height:52px;border:0;border-right:1px solid var(--border);background:var(--panel2);color:var(--text);font-size:22px;font-weight:900;cursor:pointer}.playerChatToolButton.active{background:#5a167b;color:#fff}.playerChatPanel textarea{resize:none;min-height:52px;max-height:94px;padding:10px;border:0;background:var(--panel);color:var(--text);outline:none}.playerChatSend{height:52px;border:0;padding:0 14px;background:#ffca2f;color:#1b1405;font-weight:1000}.playerChatNotice{padding:8px 10px;background:#3f2c0a;color:#ffe39a;font-size:12px}.playerPicker{display:none;padding:9px;border-top:1px solid var(--border);background:var(--panel2);max-height:260px;overflow:auto}.playerPicker.show{display:grid}.playerEmojiMenu{grid-template-columns:repeat(5,1fr);gap:5px}.playerEmojiMenu button{height:48px;border:1px solid var(--border);border-radius:11px;background:var(--panel3);color:var(--text);font-size:25px;cursor:pointer}.playerEmojiMenu button:active{transform:scale(.92)}.playerStickerMenu{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.playerStickerMenu .premiumStickerButton{min-height:88px}.playerStickerHint{grid-column:1/-1;color:var(--muted);font-size:11px;line-height:1.35;padding:2px 3px 5px}.playerChatBadge:not(:empty){display:inline-grid;place-items:center;min-width:20px;height:20px;border-radius:999px;background:#e83e87;margin-left:5px}.playerChatToggle:focus-visible,.playerPicker button:focus-visible,.playerChatToolButton:focus-visible{outline:3px solid #ffca2f;outline-offset:2px}
      @media(max-width:620px){.playerChatDock{right:7px;bottom:7px}.playerChatPanel{bottom:0;width:100%;height:min(690px,84dvh);border-radius:20px 20px 0 0}.playerEmojiMenu{grid-template-columns:repeat(5,1fr)}.playerStickerMenu{grid-template-columns:repeat(3,minmax(0,1fr))}.playerStickerMenu .premiumStickerButton{min-height:82px}.playerChatComposer{grid-template-columns:44px 44px minmax(0,1fr) auto}.playerChatToolButton{width:44px}}
      @media(min-width:1100px){.playerLogged .playerChatDock{position:fixed;right:10px;top:10px;bottom:10px;width:340px;z-index:60}.playerLogged .playerChatToggle{display:none}.playerLogged .playerChatPanel,.playerLogged .playerChatPanel.show{display:grid;position:static;transform:none;width:100%;height:100%;grid-template-rows:auto minmax(0,1fr) auto auto auto auto;border-radius:18px}.playerLogged .playerChatPanel header button{display:none}.playerLogged .playerChatMessages{min-height:0}.playerLogged .playerChatPanel textarea{min-width:0}.playerLogged .playerChatSend{padding:0 10px;font-size:11px}}
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
      $('playerChatBadge').textContent = '';
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
    if (incoming && !$('playerChatPanel').classList.contains('show')) $('playerChatBadge').textContent = String(Math.min(99, Number($('playerChatBadge').textContent || 0) + 1));
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
    if (!drawn.length) {
      host.innerHTML = '<div class="emptyDrawer">Todavía no salió ninguna bolilla.</div>';
      return;
    }
    const chips = numbers => `<div class="sortedNumbers">${numbers.map(number => `<span class="${number === last ? 'last' : ''}">${String(number).padStart(2,'0')}</span>`).join('')}</div>`;
    if (Number(this.state.game.mode) === 75) {
      const groups = [['B',1,15],['I',16,30],['N',31,45],['G',46,60],['O',61,75]];
      host.innerHTML = `<div class="drawGroups">${groups.map(([letter,min,max]) => `<div class="drawGroup"><strong>${letter}</strong>${chips(drawn.filter(number => number >= min && number <= max))}</div>`).join('')}</div>`;
    } else host.innerHTML = chips(drawn);
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
    const cards = this.state?.player?.cards || [];
    const index = cards.findIndex(card => card.id === this.activeCardId);
    if (index < 0 || cards.length < 2) return;
    const next = delta < 0 ? Math.min(cards.length - 1, index + 1) : Math.max(0, index - 1);
    if (next === index) return;
    this.activeCardId = cards[next].id;
    localStorage.setItem('bingoOnlineCard', this.activeCardId);
    this.renderTabs(); this.renderTicket();
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
    localStorage.setItem('bingoOnlineToken', this.token);
    this.tokenRoom = String(data.state?.roomCode || '').trim().toUpperCase();
    if (this.tokenRoom) localStorage.setItem('bingoOnlineRoom', this.tokenRoom);
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
    clearTimeout(this.reconnectRefreshTimer);
    this.events = new EventSource(`/api/events?role=player&token=${encodeURIComponent(this.token)}`);
    this.events.addEventListener('state', event => {
      clearTimeout(this.reconnectRefreshTimer);
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
      clearTimeout(this.reconnectRefreshTimer);
      this.reconnectRefreshTimer = setTimeout(async () => {
        if (!this.token) return;
        try {
          const data = await this.request('/api/player/state');
          this.applyState(data);
          $('connectionMask').classList.remove('show');
          if (this.events?.readyState === EventSource.CLOSED) this.connectEvents();
        } catch (error) {
          if (error?.status === 401 || error?.status === 403) this.logout(false);
        }
      }, 1200);
    };
  }

  applyState(data) {
    if (!data?.active) { this.showRoomClosed(); return; }
    const previous = this.state;
    const previousCount = previous?.game?.drawn?.length;
    const previousConfirmed = Boolean(previous?.player?.selectionConfirmed);
    this.state = data;
    if (data.roomCode && this.token) {
      this.tokenRoom = String(data.roomCode).trim().toUpperCase();
      localStorage.setItem('bingoOnlineRoom', this.tokenRoom);
    }
    if (data.status === 'waiting' && !data.player.selectionConfirmed) this.selectedOffers = new Set(data.player.reservedCardIds || []);
    else this.selectedOffers.clear();
    const cards = data.player.cards || [];
    if (!cards.some(card => card.id === this.activeCardId)) this.activeCardId = cards[0]?.id || '';
    localStorage.setItem('bingoOnlineCard', this.activeCardId);
    if (!this.audioPreferenceLoaded) { this.audioEnabled = Boolean(data.roomSettings?.playerAudioDefault); this.audioPreferenceLoaded = true; localStorage.setItem('bingoPlayerSound', String(this.audioEnabled)); }
    $('loginView').classList.add('hidden'); $('gameView').classList.remove('hidden');
    document.body.classList.add('playerLogged');
    $('infoDrawerToggle').classList.remove('hidden');
    this.render(); this.renderDemoUi(); this.renderChat(); this.renderPublicClaim(); this.handleOwnPrizeReadiness(); this.handleTestEvent(); this.handleSequence(previous); this.renderInfoDrawer();
    if ($('winnerOverlay').classList.contains('show')) this.renderWinnerCard(this.selectedWinnerId);
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
    this.renderNotice(); this.updateQuickTools(); this.renderInfoDrawer();
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
    $('autoMarkHint').textContent = this.state.markingPolicy?.automaticRequired ? this.state.markingPolicy.reason : 'Marca las bolillas oficiales';
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
        $('waitingPanel').innerHTML = `${timerHtml}<h2>Confirmá tu nombre</h2><div class="waitingLead">Tus cartones ya están asignados. Solo falta indicar quién va a jugar.</div>${nameSection}<button id="confirmAssignedName" class="btn primary" disabled>CONFIRMAR NOMBRE</button>${this.waitingMiniGameHtml()}`;
        this.bindPlayerNameInput('confirmAssignedName');
        $('confirmAssignedName').onclick = () => this.savePlayerName();
        this.bindWaitingMiniGame();
        return;
      }
      const canChange = this.state.status === 'waiting' && !this.state.assignmentTimer?.selectionClosed;
      $('waitingPanel').innerHTML = `${timerHtml}<div class="waitingConfirmed waitingStateHero"><b>ESPERANDO SORTEO</b><div>Tus cartones están confirmados y reservados para vos.</div><div class="chosenList">${player.cards.map(card => `<span class="chosenBadge">Cartón ${esc(card.number)}</span>`).join('')}</div>${canChange ? '<button id="changeChoice" class="btn secondary" style="margin-top:10px">CAMBIAR CARTONES</button>' : ''}</div>${this.waitingMiniGameHtml()}`;
      if ($('changeChoice')) $('changeChoice').onclick = () => this.releaseChoice();
      this.bindWaitingMiniGame();
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
      ? `<div class="regulationBlock"><div class="regulationActions"><button id="readRules" class="btn secondary" type="button">LEER REGLAMENTO</button><button id="downloadRules" class="btn secondary" type="button">DESCARGAR PDF</button></div><button id="continueChoice" class="btn primary" style="margin:0" ${canContinue ? '' : 'disabled'}>CONFIRMAR CARTONES</button><small>Al confirmar, aceptás el reglamento general y las condiciones de la partida.</small></div>`
      : '<button id="continueChoice" class="btn primary" disabled>CONFIRMAR CARTONES</button>';
    const selectionTitle = exactSelection ? `Elegí ${player.allowedCardCount} cartón${player.allowedCardCount === 1 ? '' : 'es'}` : `Elegí hasta ${player.allowedCardCount} cartón${player.allowedCardCount === 1 ? '' : 'es'}`;
    $('waitingPanel').innerHTML = `${timerHtml}<h2>${selectionTitle}</h2><div class="waitingLead">Tenés ${offers.length} vistas previas. Podés recargarlas; los cartones que ya elegiste se conservan. Si comienza la partida antes de confirmar, el sistema completará tu asignación automáticamente.</div>${nameSection}<div class="choiceCounter">Seleccionados: <span id="choiceCount">${this.selectedOffers.size}</span> de ${player.allowedCardCount}</div><div id="offerGrid" class="offers">${offers.map(card => this.offerHtml(card)).join('')}</div><div class="choiceActions"><button id="clearChoice" class="btn secondary">LIMPIAR</button><button id="renewChoice" class="btn secondary">RECARGAR CARTONES</button></div>${confirmation}${this.waitingMiniGameHtml()}`;
    this.bindPlayerNameInput('continueChoice');
    $('offerGrid').querySelectorAll('[data-offer]').forEach(button => button.onclick = () => this.toggleOffer(button.dataset.offer));
    $('clearChoice').onclick = () => this.clearReservations();
    $('renewChoice').onclick = () => this.renewOffers();
    $('continueChoice').onclick = () => this.confirmChoice();
    if ($('readRules')) $('readRules').onclick = () => window.open('/reglamento.html', '_blank', 'noopener,noreferrer');
    if ($('downloadRules')) $('downloadRules').onclick = () => this.downloadRules();
    this.bindWaitingMiniGame();
  }

  waitingMiniGameHtml() {
    if (this.state?.status !== 'waiting') return '';
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
    return `<section class="waitMiniGame"><div class="miniGameTabs"><button type="button" data-mini-game="red_black" class="${type === 'red_black' ? 'active' : ''}">ROJO O NEGRO</button><button type="button" data-mini-game="higher_lower" class="${type === 'higher_lower' ? 'active' : ''}">MAYOR O MENOR</button></div><h3>${title}</h3><div class="muted">Los dos juegos están siempre disponibles durante la espera. Cambiá de juego cuando quieras. No afectan el bingo.</div><div class="miniGameLayout"><div id="miniPlayingCard" class="playingCard back"></div><div class="miniGameControls"><div class="miniScore">Racha: <span id="miniScore">${this.waitingMini.score}</span> · Mejor: <span id="miniBest">${this.waitingMini.best}</span></div><div id="miniResult" class="miniResult">${result}</div><div id="miniChoices" class="${choicesClass}">${type === 'red_black' ? '<button type="button" class="redChoice" data-mini="red">ROJO</button><button type="button" class="blackChoice" data-mini="black">NEGRO</button>' : '<button type="button" class="higherChoice" data-mini="higher">MAYOR</button><button type="button" class="lowerChoice" data-mini="lower">MENOR</button>'}</div><button id="miniRestart" class="${restartClass}" type="button">VOLVER A JUGAR</button></div></div><div class="miniLeaderboard"><b>Mejores rachas en ${title.toLowerCase()}:</b> ${leaders.length ? leaders.map((item,index)=>`${index+1}. ${esc(item.name)} ${Number(item.bestScore)||0}`).join(' · ') : 'todavía no hay puntajes'}</div></section>`;
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
    localStorage.setItem('bingoWaitingMiniGame', type);
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
    try { this.applyState(await this.request('/api/player/renew-offers', { method:'POST', body:'{}' })); }
    catch (error) { this.showMessage(error.message, 'error'); }
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
      link.href = URL.createObjectURL(blob); link.download = 'Reglamento_LA_GORDA_BINGO_ONLINE.pdf'; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) { this.showMessage(error.message, 'error'); }
  }

  showGreetingOnce() {
    if (!this.state) return;
    const key = `bingoGreeting:${this.state.roomCode}:${this.state.player.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  }

  openGuide(manual = true) {
    if (!this.state) return;
    this.closeOtherPanels();
    const id = this.personalPresenterId(), profile = PRESENTERS[id] || PRESENTERS.vero;
    $('guidePresenter').src = `assets/${id}.png`;
    $('guideGreeting').textContent = 'Guía rápida';
    $('guideIntro').textContent = 'Lo esencial para jugar sin llenar la pantalla de controles.';
    $('guideQuestion').classList.add('hidden');
    $('guideSteps').classList.remove('hidden');
    $('guideOverlay').classList.add('show');
    this.guideStep = 0;
    this.renderGuideStep();
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
    const last = this.state.game.lastBall;
    const ballHost = $('lastBall');
    ballHost.className = 'lastBall';
    if (last == null) ballHost.textContent = '—';
    else if (Number(this.state.game.mode) === 75) {
      const info = this.ballInfo75(last);
      ballHost.classList.add(info.className);
      ballHost.innerHTML = `<span class="ballLetter">${info.letter}</span><strong>${last}</strong>`;
    } else ballHost.innerHTML = `<strong>${last}</strong>`;
    $('ballCount').textContent = `${drawn.length} de ${this.state.game.mode} sorteadas`;
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
    $('cardTabs').querySelectorAll('button').forEach(button => button.onclick = () => { this.activeCardId = button.dataset.card; localStorage.setItem('bingoOnlineCard', this.activeCardId); this.renderTabs(); this.renderTicket(); });
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
        : `<button class="cell number ${marks.has(value) ? 'marked' : ''}" data-card-id="${esc(card.id)}" data-number="${value}" ${auto || markLocked ? 'disabled' : ''}>${value}</button>`).join('');
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
      localStorage.setItem('bingoOnlineCard', this.activeCardId);
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
      const ready = this.eligibleCard(item.type);
      const alreadyWon = (item.prize.winners || []).some(winner => winner.cardId === card.id);
      const ownPending = (this.state.publicClaims || []).some(claim => claim.status === 'pending' && claim.type === item.type && ownCardNumbers.has(String(claim.cardNumber)));
      item.button.disabled = locked || ownPending || item.prize.closed || (alreadyWon && !ready);
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
    if (!this.claimInputOpen()) return;
    const ready = this.eligibleCard(type);
    if (ready) { this.activeCardId = ready.cardId; localStorage.setItem('bingoOnlineCard', this.activeCardId); this.renderTabs(); this.renderTicket(); }
    const card = this.state?.player.cards.find(item => item.id === this.activeCardId); if (!card) return;
    const label = this.claimLabel(type);
    [$('claimAmbo'),$('claimCorners'),$('claimLine'),$('claimDoubleLine'),$('claimTripleLine'),$('claimBingo')].forEach(button => button.disabled = true);
    try {
      const claim = await this.request('/api/player/claim', { method:'POST', body:JSON.stringify({ cardId:card.id, type }) });
      const receiptTime = claim.receivedAt ? new Date(claim.receivedAt).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', second:'2-digit', fractionalSecondDigits:3 }) : '';
      const receipt = claim.receivedSequence ? ` · Recepción #${claim.receivedSequence}` : '';
      this.showMessage(`${label} recibido${receipt}${receiptTime ? ` · ${receiptTime}` : ''}.`, 'notice');
      if (!claim.officialValid) this.showMessage(`El control oficial todavía no detecta ${label}.`, 'error');
    } catch (error) { this.showMessage(error.message, 'error'); }
    finally { this.renderTicket(); }
  }

  handleOwnPrizeReadiness() {
    if (!this.state || !this.claimInputOpen()) return;
    const order = ['bingo','tripleLine','doubleLine','corners','line','ambo'];
    let type = null, ready = null;
    for (const candidate of order) { ready = this.eligibleCard(candidate); if (ready) { type = candidate; break; } }
    if (!ready || !type) { this.lastPrizeReadyKey = ''; return; }
    const awarded = Number(this.state.prizeStatus?.[type]?.awarded || 0);
    const key = `${type}:${ready.cardId}:${this.state.game.drawn.length}:${awarded}`; if (key === this.lastPrizeReadyKey) return;
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
    $('sequencePresenter').src = `assets/${this.personalPresenterId()}.png`; $('sequenceTitle').textContent = title; $('sequenceText').textContent = text; $('sequenceCount').textContent = count; $('sequenceCard')?.classList.toggle('noticeMode', Boolean(notice)); $('sequenceOverlay').classList.add('show');
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
    if (!this.voiceEnabled || this.state?.roomSettings?.playerAudioAllowed === false || !window.speechSynthesis || !text) return;
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
    this.closeSettings();
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

  setAudioEnabled(enabled) {
    this.audioEnabled = Boolean(enabled);
    localStorage.setItem('bingoPlayerSound', String(this.audioEnabled));
    this.updateQuickTools();
    if (this.audioEnabled) this.playAlertSound('line');
  }

  setVoiceEnabled(enabled) {
    this.voiceEnabled = Boolean(enabled);
    localStorage.setItem('bingoPlayerVoice', String(this.voiceEnabled));
    if (!this.voiceEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
    this.updateQuickTools();
    if (this.voiceEnabled && this.state) this.speak((PRESENTERS[this.personalPresenterId()] || PRESENTERS.vero).preview, true);
  }

  setVolume(value, persist = true) {
    this.audioVolume = Math.max(0, Math.min(1, Number(value) || 0));
    if (persist) localStorage.setItem('bingoPlayerVolume', String(this.audioVolume));
    if ($('volumeRange')) $('volumeRange').value = String(Math.round(this.audioVolume * 100));
    if ($('volumeValue')) $('volumeValue').textContent = `${Math.round(this.audioVolume * 100)}%`;
  }

  setLargeNumbers(enabled, persist = true) {
    this.largeNumbers = Boolean(enabled);
    if (persist) localStorage.setItem('bingoPlayerLargeNumbers', String(this.largeNumbers));
    document.body.classList.toggle('largeNumbers', this.largeNumbers);
    this.updateQuickTools();
  }

  setAlertsEnabled(enabled) { this.alertsEnabled = Boolean(enabled); localStorage.setItem('bingoPlayerAlerts', String(this.alertsEnabled)); this.updateQuickTools(); }

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
    update('autoMarkToggle', Boolean(this.state?.player?.autoMark), 'ACTIVADO', 'DESACTIVADO');
    $('alertsToggle')?.classList.toggle('active', this.alertsEnabled);
    this.setVolume(this.audioVolume, false);
  }

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
    localStorage.removeItem('bingoOnlineToken');
    localStorage.removeItem('bingoOnlineRoom');
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
  applyTheme() {
    document.documentElement.dataset.theme=this.theme;
    $('themeToggle').textContent=this.theme==='day'?'☾':'☀';
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
    this.events?.close(); clearTimeout(this.reconnectRefreshTimer); clearInterval(this.sequenceTimer); this.setFocusMode(false); this.closeOtherPanels(); this.closeResultsViewer(); this.token=''; this.tokenRoom=''; this.state=null; this.roomClosedShown=false; localStorage.removeItem('bingoOnlineToken'); localStorage.removeItem('bingoOnlineRoom'); localStorage.removeItem('bingoOnlineCard');
    document.body.classList.remove('playerLogged'); $('infoDrawerToggle').classList.add('hidden');
    if(reload) location.reload(); else { $('gameView').classList.add('hidden'); $('loginView').classList.remove('hidden'); }
  }
}

window.addEventListener('DOMContentLoaded', () => new PlayerApp().init());
})();
