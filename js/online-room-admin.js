(() => {
'use strict';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

class LocalRoomAdmin {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.claimOpen = false;
    this.serverState = null;
    this.eventSource = null;
    this.currentClaim = null;
    this.claimQueue = [];
    this.assignments = [];
    this.syncTimer = null;
    this.backupTimer = null;
    this.adminToken = sessionStorage.getItem('bingoOnlineAdminToken') || '';
    this.originalSave = app.save.bind(app);
    this.originalExitGame = app.exitGame.bind(app);
    this.originalRequestDraw = app.requestDraw.bind(app);
    this.originalStartAutomatic = app.startAutomatic.bind(app);
    this.originalProcessSpecificBall = app.processSpecificBall.bind(app);
    this.originalRenderRanking = app.renderRanking.bind(app);
    this.originalCardNames = new Map();
    this.originalCardNamesGameId = null;
    this.messageDraft = null;
    app.localRoom = this;
  }

  async init() {
    this.injectStyles();
    this.injectUi();
    this.patchApp();
    await this.ensureAdminAuth();
    this.keepAliveTimer = setInterval(() => { if (this.active) fetch('/api/ping', { cache: 'no-store' }).catch(() => {}); }, 5 * 60 * 1000);
    this.uiClockTimer = setInterval(() => this.updateLiveCountdown(), 1000);
  }

  patchApp() {
    this.app.save = (...args) => {
      const result = this.originalSave(...args);
      this.scheduleSync();
      return result;
    };
    this.app.requestDraw = (...args) => {
      if (this.active && this.serverState?.status !== 'playing') {
        alert(this.serverState?.status === 'finished' ? 'El sorteo ya fue finalizado.' : 'La sala está esperando jugadores. Presioná INICIAR SORTEO antes de cantar la primera bolilla.');
        return false;
      }
      return this.originalRequestDraw(...args);
    };
    this.app.processSpecificBall = (...args) => {
      if (this.active && this.serverState?.status !== 'playing') return false;
      return this.originalProcessSpecificBall(...args);
    };
    this.app.startAutomatic = (...args) => {
      if (this.active && this.serverState?.status !== 'playing') {
        alert(this.serverState?.status === 'finished' ? 'El sorteo ya fue finalizado.' : 'Primero presioná INICIAR SORTEO desde SALA ONLINE.');
        return;
      }
      return this.originalStartAutomatic(...args);
    };
    this.app.exitGame = () => {
      if (this.active && !confirm('La sala online seguirá abierta aunque salgas del juego. ¿Continuar?')) return;
      this.originalExitGame();
    };
    this.app.renderRanking = () => this.renderParticipatingRanking();
  }

  injectUi() {
    const footer = document.querySelector('#game .bottom');
    const button = document.createElement('button');
    button.id = 'localRoomBtn';
    button.className = 'tool localRoomTool';
    button.textContent = '🌐 SALA ONLINE';
    button.onclick = () => this.openMainModal();
    footer?.insertBefore(button, $('cardsBtn'));

    const shell = document.createElement('div');
    shell.innerHTML = `
      <section class="localModal" id="localRoomModal" aria-hidden="true">
        <div class="localPanel localPanelWide">
          <div class="localHead"><div><b>SALA ONLINE</b><small>Sala de espera · de 2 a 60 jugadores y hasta 100 cartones</small></div><button id="localRoomClose">CERRAR</button></div>
          <div id="localRoomBody"></div>
        </div>
      </section>
      <section class="localModal" id="localClaimModal" aria-hidden="true">
        <div class="localPanel localClaimPanel">
          <div class="localHead"><div><b id="localClaimTitle">RECLAMO</b><small id="localClaimSubtitle"></small></div><button id="localClaimClose">OCULTAR</button></div>
          <div id="localClaimBody"></div>
          <div class="localActions">
            <button class="secondary" id="localClaimReject">RECHAZAR RECLAMO</button>
            <button class="primary" id="localClaimConfirm">CONFIRMAR PREMIO</button>
          </div>
        </div>
      </section>
      <section class="localModal show" id="onlineAdminLogin" aria-hidden="false">
        <div class="localPanel onlineLoginPanel">
          <div class="localHead"><div><b>ACCESO DEL ADMINISTRADOR</b><small>Esta contraseña se configura en Render.</small></div></div>
          <div class="onlineLoginBody">
            <label>CONTRASEÑA DE ADMINISTRADOR</label>
            <input id="onlineAdminPassword" type="password" autocomplete="current-password" placeholder="Tu contraseña">
            <button class="localPrimary" id="onlineAdminLoginBtn">ENTRAR AL PANEL</button>
            <div id="onlineAdminLoginError"></div>
          </div>
        </div>
      </section>
      <input id="localBackupFile" type="file" accept="application/json,.json" hidden>
      <div id="localCopyToast" class="localCopyToast">Enlace copiado</div>`;
    document.body.append(...shell.children);
    $('localRoomClose').onclick = () => this.closeMainModal();
    $('localClaimClose').onclick = () => $('localClaimModal').classList.remove('show');
    $('localClaimReject').onclick = () => this.resolveCurrentClaim('rejected');
    $('localClaimConfirm').onclick = () => this.resolveCurrentClaim('confirmed');
    $('onlineAdminLoginBtn').onclick = () => this.loginAdmin();
    $('onlineAdminPassword').addEventListener('keydown', event => { if (event.key === 'Enter') this.loginAdmin(); });
    $('localBackupFile').onchange = event => this.restoreBackupFile(event.target.files?.[0]);
  }

  injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .localRoomTool{background:linear-gradient(135deg,#047857,#10b981)!important;color:#fff!important}
      .localModal{position:fixed;inset:0;background:#050816dc;display:none;align-items:center;justify-content:center;padding:18px;z-index:80}
      .localModal.show{display:flex}.localPanel{width:min(980px,96vw);max-height:94vh;overflow:auto;background:#10172b;border:1px solid #ffffff2b;border-radius:20px;box-shadow:0 28px 80px #0009;color:#fff}
      .localPanelWide{width:min(1240px,97vw)}.localClaimPanel{width:min(1180px,97vw)}.onlineLoginPanel{width:min(470px,94vw)}.onlineLoginBody{display:grid;gap:12px;padding:20px}.onlineLoginBody label{font-weight:900;color:#a9b7d3}.onlineLoginBody input{padding:14px;border-radius:11px;border:1px solid #ffffff31;background:#080d19;color:#fff;font-size:18px}.onlineLoginBody button{border:0;border-radius:11px;padding:13px;font-weight:900;cursor:pointer}
      .localHead{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:16px;align-items:center;padding:16px 18px;background:#151f39;border-bottom:1px solid #ffffff20}
      .localHead b{font-size:19px}.localHead small{display:block;color:#a9b7d3;margin-top:3px}.localHead button,.localActions button{border:0;border-radius:11px;padding:11px 15px;font-weight:900;cursor:pointer}
      #localRoomBody,#localClaimBody{padding:18px}.localIntro{display:grid;gap:14px}.localNotice{padding:13px 15px;border-radius:13px;background:#0b3550;border:1px solid #1c6f9f;color:#dff5ff}
      .localError{padding:12px 14px;border-radius:12px;background:#50141d;border:1px solid #ad3948;color:#ffd9df;margin:10px 0}.localSuccess{background:#0e3c2c;border-color:#238d68;color:#d9fff1}
      .localGrid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.localCardBox{background:#0b1121;border:1px solid #ffffff1f;border-radius:16px;padding:15px}
      .localCardBox h3{margin:0 0 10px}.localUrl{font:800 17px Consolas,monospace;word-break:break-all;background:#070b15;padding:12px;border-radius:10px;border:1px solid #ffffff1c}
      .localPlayersEditor{display:grid;gap:10px;margin-top:12px}.localPlayerRow{display:grid;grid-template-columns:minmax(180px,1fr) minmax(190px,.7fr) auto;gap:8px;background:#0a1020;padding:10px;border-radius:13px;border:1px solid #ffffff18}
      .localPlayerRow input,.localPlayerRow select{min-width:0;padding:10px;border-radius:9px;border:1px solid #ffffff27;background:#151d31;color:#fff}.localPlayerRow button{border:0;border-radius:9px;background:#5f1723;color:#fff;font-weight:900;padding:8px 12px}
      .localToolbar{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}.localToolbar button{border:0;border-radius:11px;padding:11px 15px;font-weight:900;cursor:pointer}.localPrimary{background:#ffca2f;color:#17120a}.localSecondary{background:#273553;color:#fff}.localDanger{background:#8b2434;color:#fff}
      .localMessageEditor{width:100%;min-height:88px;resize:vertical;border-radius:12px;border:1px solid #ffffff2b;background:#080d19;color:#fff;padding:12px;font:700 15px/1.4 Segoe UI,Arial,sans-serif}.localMessageMeta{display:flex;justify-content:space-between;gap:10px;margin-top:7px;color:#aab5cc;font-size:12px}.localMessageActive{margin-top:10px;padding:11px 13px;border-radius:12px;background:#2c2250;border:1px solid #aa83ff;color:#f4efff;white-space:pre-wrap}.localMessageActive b{display:block;color:#d8c2ff;margin-bottom:4px}

      .localWaitingHero{display:grid;grid-template-columns:110px 1fr;gap:14px;align-items:center;padding:14px;border-radius:16px;background:linear-gradient(135deg,#271454,#101b39);border:1px solid #9d72ff66;margin-bottom:14px}
      .localWaitingHero img{width:110px;height:110px;object-fit:cover;border-radius:16px;border:2px solid #ffffff42}
      .localWaitingHero h3{margin:0 0 5px;font-size:22px}.localWaitingHero p{margin:0;color:#c9d3ea}
      .localStartBox{padding:16px;border-radius:15px;background:#332708;border:1px solid #99751a;margin-top:14px}.localStartBox.ready{background:#0d3a2a;border-color:#25855f}
      .localStartBox button{width:100%;margin-top:11px;border:0;border-radius:12px;padding:15px;font-size:17px;font-weight:1000;cursor:pointer;background:#ffca2f;color:#1d1505}.localStartBox button:disabled{opacity:.4;cursor:not-allowed}
      .localChoiceState{font-weight:900}.localChoiceState.ready{color:#6ef0b7}.localChoiceState.waiting{color:#ffd66c}
      .localToggleRow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0}.localToggleRow input{width:22px;height:22px}
      .localCodes button.release{background:#5c2633;color:#fff;border:0;border-radius:8px;padding:7px 9px;font-weight:900;cursor:pointer}
      .localAccessActions{display:flex;flex-wrap:wrap;gap:6px}.localAccessActions button{border:0;border-radius:8px;padding:7px 9px;font-size:11px;font-weight:900;cursor:pointer;background:#253858;color:#fff}.localAccessActions button.direct{background:#126746}.localCompactAccess{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.localCompactAccess .localCode{font-size:22px}.localCopyToast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,20px);background:#0f5138;color:#e8fff6;border:1px solid #36a77c;border-radius:11px;padding:11px 16px;font-weight:900;z-index:120;opacity:0;pointer-events:none;transition:.18s}.localCopyToast.show{opacity:1;transform:translate(-50%,0)}

      .localCodes{width:100%;border-collapse:collapse;margin-top:10px}.localCodes th,.localCodes td{padding:10px;border-bottom:1px solid #ffffff18;text-align:left}.localCode{font:900 17px Consolas,monospace;color:#ffdc69;letter-spacing:1px}
      .localMonitorWrap{max-height:52vh;overflow:auto;border:1px solid #ffffff17;border-radius:12px}.localMonitor{width:100%;border-collapse:collapse;font-size:13px}.localMonitor th{position:sticky;top:67px;background:#17223d;z-index:1}.localMonitor th,.localMonitor td{padding:9px 8px;border-bottom:1px solid #ffffff14;text-align:left}.localMonitor tr.alertLine{background:#5e430f55}.localMonitor tr.alertBingo{background:#651a2b77}.localMonitor button{border:0;border-radius:8px;padding:7px 9px;font-weight:900;cursor:pointer}
      .localStatus{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 8px;font-weight:900}.localStatus.on{background:#0e4e37;color:#bfffe5}.localStatus.off{background:#3b4253;color:#d6d9e1}.localStatus.warn{background:#63460f;color:#ffe19a}.localStatus.danger{background:#741d31;color:#ffd3dc}
      .localSummary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:12px 0}.localMetric{padding:12px;border-radius:12px;background:#0b1121;border:1px solid #ffffff17}.localMetric b{display:block;font-size:24px;color:#ffcf3f}.localMetric span{color:#a9b7d3;font-size:12px}
      .localCompare{display:grid;grid-template-columns:1fr 1fr;gap:16px}.localCompareBox{background:#0a1020;border:1px solid #ffffff1e;border-radius:16px;padding:14px}.localCompareBox h3{margin:0 0 5px}.localCompareLegend{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;font-size:12px}.localCompareLegend span{display:inline-flex;align-items:center;gap:5px}.localSwatch{width:14px;height:14px;border-radius:4px;background:#303a50}.localSwatch.ok{background:#1fa66c}.localSwatch.missed{background:#d29a19}.localSwatch.wrong{background:#ca3c56}
      .localTicket{display:grid;gap:4px;margin-top:10px}.localTicket.mode90{grid-template-columns:repeat(9,1fr)}.localTicket.mode75{grid-template-columns:repeat(5,1fr)}.localTicket .cell{aspect-ratio:1.15;display:flex;align-items:center;justify-content:center;border-radius:7px;background:#202a40;border:1px solid #ffffff16;font-weight:900;min-width:0}.localTicket .blank{background:#080c15;color:transparent}.localTicket .free{background:#6a4b11;color:#ffdf76}.localTicket .marked{background:#1fa66c}.localTicket .missed{background:#d29a19;color:#17120a}.localTicket .wrong{background:#ca3c56}.localDiffList{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.localDiffList b{padding:6px 9px;border-radius:8px;background:#26324a}.localActions{display:flex;justify-content:flex-end;gap:10px;padding:15px 18px;border-top:1px solid #ffffff1b}.localActions .primary{background:#23a66c;color:#fff}.localActions .secondary{background:#8a2637;color:#fff}
      .localClaimValid{padding:14px;border-radius:13px;background:#0d4a32;border:1px solid #26a270;color:#d9ffed;font-weight:900;margin-bottom:12px}.localClaimInvalid{background:#531824;border-color:#ba4055;color:#ffdce3}.localClaimPending{position:fixed;right:18px;bottom:74px;z-index:70;background:#9d253d;color:#fff;border:2px solid #ff8aa0;border-radius:14px;padding:12px 15px;box-shadow:0 12px 35px #0008;font-weight:900;cursor:pointer;display:none}.localClaimPending.show{display:block}
      .localTimerBox{padding:15px;border-radius:15px;background:#172341;border:1px solid #46649d;margin-top:14px}.localTimerTop{display:flex;justify-content:space-between;align-items:center;gap:12px}.localCountdown{font:1000 34px Consolas,monospace;color:#ffcf3f}.localTimerActions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.localTimerActions button{border:0;border-radius:9px;padding:9px 11px;font-weight:900;cursor:pointer;background:#283958;color:#fff}.localTimerActions .primary{background:#ffca2f;color:#211600}.localTimerActions .danger{background:#8b2434}
      .localPrizeBar{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.localPrizeItem{padding:12px;border-radius:13px;background:#0b1121;border:1px solid #ffffff1f}.localPrizeItem b{display:block;color:#ffcf3f;font-size:18px}.localPrizeItem.closed{background:#26303e;color:#b9c0cc}.localPrizeItem.closed b{color:#b9c0cc}
      .localActaWrap{max-height:48vh;overflow:auto;border:1px solid #ffffff1f;border-radius:12px;margin-top:10px}.localActa{width:100%;border-collapse:collapse}.localActa th,.localActa td{padding:9px;border-bottom:1px solid #ffffff17;text-align:left}.localActa th{position:sticky;top:0;background:#17223d}.localFinishedBox{padding:16px;border-radius:15px;background:#392912;border:1px solid #b58a31;margin-top:14px}
      @media(max-width:760px){.localGrid2,.localCompare,.localPrizeBar{grid-template-columns:1fr}.localPlayerRow{grid-template-columns:1fr}.localSummary{grid-template-columns:1fr 1fr}.localMonitor{font-size:12px}.localMonitor th,.localMonitor td{padding:7px 5px}.localTimerTop{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);

    const pending = document.createElement('button');
    pending.id = 'localClaimPending';
    pending.className = 'localClaimPending';
    pending.onclick = () => this.showNextClaim();
    document.body.appendChild(pending);
  }

  async request(url, options = {}, useAuth = true) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(useAuth && this.adminToken ? { 'X-Admin-Token': this.adminToken } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && useAuth) this.showAdminLogin();
      throw new Error(data.error || 'No se pudo completar la acción.');
    }
    return data;
  }

  async ensureAdminAuth() {
    if (this.adminToken) {
      try {
        await this.refreshState();
        this.hideAdminLogin();
        this.connectEvents();
        return;
      } catch { this.adminToken = ''; }
    }
    try {
      const local = await this.request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: '' }) }, false);
      this.adminToken = local.token;
      sessionStorage.setItem('bingoOnlineAdminToken', this.adminToken);
      this.hideAdminLogin();
      await this.refreshState();
      this.connectEvents();
    } catch {
      this.showAdminLogin();
    }
  }

  showAdminLogin(message = '') {
    this.eventSource?.close();
    $('onlineAdminLogin').classList.add('show');
    $('onlineAdminLoginError').innerHTML = message ? `<div class="localError">${esc(message)}</div>` : '';
    setTimeout(() => $('onlineAdminPassword')?.focus(), 50);
  }

  hideAdminLogin() {
    $('onlineAdminLogin').classList.remove('show');
    $('onlineAdminPassword').value = '';
    $('onlineAdminLoginError').innerHTML = '';
  }

  async loginAdmin() {
    const password = $('onlineAdminPassword').value;
    try {
      $('onlineAdminLoginBtn').disabled = true;
      const data = await this.request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }, false);
      this.adminToken = data.token;
      sessionStorage.setItem('bingoOnlineAdminToken', this.adminToken);
      this.hideAdminLogin();
      await this.refreshState();
      this.connectEvents();
    } catch (error) {
      this.showAdminLogin(error.message);
    } finally {
      $('onlineAdminLoginBtn').disabled = false;
    }
  }

  async refreshState() {
    const data = await this.request('/api/admin/state');
    this.applyState(data);
    return data;
  }

  connectEvents() {
    this.eventSource?.close();
    this.eventSource = new EventSource(`/api/events?role=admin&adminToken=${encodeURIComponent(this.adminToken)}`);
    this.eventSource.addEventListener('state', event => {
      const data = JSON.parse(event.data);
      this.applyState(data);
      this.handlePendingClaims(data.claims || []);
    });
    this.eventSource.addEventListener('logout', () => { this.adminToken = ''; sessionStorage.removeItem('bingoOnlineAdminToken'); this.showAdminLogin('La sesión venció. Volvé a ingresar.'); });
    this.eventSource.onerror = () => {
      $('localRoomBtn').textContent = '⚠ SERVIDOR DESCONECTADO';
      clearTimeout(this.reconnectCheckTimer);
      this.reconnectCheckTimer = setTimeout(() => this.refreshState().catch(() => {}), 1200);
    };
  }

  applyState(data) {
    this.serverState = data;
    this.active = Boolean(data.active);
    this.syncParticipantNames(data);
    const button = $('localRoomBtn');
    if (button) {
      button.textContent = this.active ? `🌐 SALA ${data.roomCode}` : '🌐 SALA ONLINE';
      button.classList.toggle('activeRoom', this.active);
    }
    if (this.active) this.scheduleAutoBackup();
    if (this.app.game) this.app.renderRanking();
    if ($('localRoomModal')?.classList.contains('show')) this.renderMainModal();
  }

  syncParticipantNames(data) {
    if (!this.app.game) return;
    if (this.originalCardNamesGameId !== this.app.game.id) {
      this.originalCardNames.clear();
      this.originalCardNamesGameId = this.app.game.id;
    }
    for (const card of this.app.game.cards) {
      if (!this.originalCardNames.has(card.id)) this.originalCardNames.set(card.id, card.name);
    }
    const ownerByCard = new Map((data?.cardStatus || []).map(card => [card.cardId, card.playerName]));
    for (const card of this.app.game.cards) {
      card.name = data?.active ? (ownerByCard.get(card.id) || this.originalCardNames.get(card.id) || card.name) : (this.originalCardNames.get(card.id) || card.name);
    }
  }

  participatingGame() {
    if (!this.app.game || !this.active) return this.app.game;
    const activeIds = new Set((this.serverState?.cardStatus || []).map(card => card.cardId));
    return { ...this.app.game, cards: this.app.game.cards.filter(card => activeIds.has(card.id)) };
  }

  renderParticipatingRanking() {
    if (!this.active || !this.serverState?.active) return this.originalRenderRanking();
    const host = $('rankList');
    if (!host || !this.app.game) return;
    host.innerHTML = '';
    const statuses = (this.serverState.cardStatus || []).filter(card => card.playerName);
    if (!statuses.length) {
      host.innerHTML = '<div style="color:var(--muted);padding:10px">Todavía no hay cartones confirmados en juego.</div>';
      return;
    }
    const cardsById = new Map(this.app.game.cards.map(card => [card.id, card]));
    const set = new Set(this.app.game.drawn);
    const sorted = [...statuses].sort((a, b) => Number(b.hasBingo) - Number(a.hasBingo) || Number(b.hasLine) - Number(a.hasLine) || b.markedCount - a.markedCount || a.lineMissing - b.lineMissing || a.bingoMissing - b.bingoMissing);
    sorted.slice(0, 6).forEach(status => {
      const card = cardsById.get(status.cardId);
      if (!card) return;
      host.appendChild(this.app.miniCard({ ...card, name: status.playerName }, set));
    });
  }

  playerPageUrl() {
    const base = this.serverState?.playerUrl || `${location.origin}/jugador`;
    const url = new URL(base, location.origin);
    if (this.serverState?.roomCode) url.searchParams.set('sala', this.serverState.roomCode);
    return url.toString();
  }

  playerDirectUrl(playerCode) {
    const url = new URL(this.playerPageUrl());
    url.searchParams.set('acceso', playerCode);
    return url.toString();
  }

  async copyText(text, message = 'Enlace copiado') {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard');
      await navigator.clipboard.writeText(text);
      this.showCopyToast(message);
    } catch {
      prompt('Copiá este enlace:', text);
    }
  }

  showCopyToast(message) {
    const toast = $('localCopyToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this.copyToastTimer);
    this.copyToastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  handlePendingClaims(claims) {
    const pending = claims.filter(claim => claim.status === 'pending');
    for (const claim of pending) {
      if (this.currentClaim?.id === claim.id || this.claimQueue.some(item => item.id === claim.id)) continue;
      this.claimQueue.push(claim);
    }
    if (!this.currentClaim && this.claimQueue.length) this.showNextClaim();
    this.updateClaimBadge();
  }

  updateClaimBadge() {
    const badge = $('localClaimPending');
    const count = this.claimQueue.length + (this.currentClaim ? 1 : 0);
    badge.textContent = count === 1 ? '🚨 HAY UN RECLAMO' : `🚨 ${count} RECLAMOS`;
    badge.classList.toggle('show', count > 0);
  }

  openMainModal() {
    if (!this.app.game) {
      alert('Primero creá o cargá una partida.');
      return;
    }
    $('localRoomModal').classList.add('show');
    this.renderMainModal();
  }

  closeMainModal() { $('localRoomModal').classList.remove('show'); }

  renderMainModal() {
    const body = $('localRoomBody');
    if (!this.app.game) {
      body.innerHTML = '<div class="localError">No hay una partida cargada.</div>';
      return;
    }
    if (this.app.game.cards.length > 100) {
      body.innerHTML = `<div class="localError">Esta partida tiene ${this.app.game.cards.length} cartones. La sala online admite un máximo de 100.</div>`;
      return;
    }
    if (!this.active) this.renderSetup(body);
    else this.renderLive(body);
  }

  defaultAssignments() {
    return Array.from({ length: 2 }, (_, index) => ({
      id: crypto.randomUUID?.() || Math.random().toString(36),
      name: `Jugador ${index + 1}`,
      allowedCardCount: 1
    }));
  }

  setPlayerCount(rawCount) {
    const count = Math.max(2, Math.min(60, Number(rawCount) || 2));
    while (this.assignments.length < count) {
      const index = this.assignments.length;
      this.assignments.push({ id: crypto.randomUUID?.() || Math.random().toString(36), name: `Jugador ${index + 1}`, allowedCardCount: 1 });
    }
    if (this.assignments.length > count) this.assignments.length = count;
    this.renderAssignmentRows();
  }

  updateAssignmentSummary() {
    const host = $('localAssignmentSummary');
    if (!host) return;
    const authorized = this.assignments.reduce((sum, item) => sum + Math.max(1, Math.min(4, Number(item.allowedCardCount) || 1)), 0);
    const available = this.app.game?.cards?.length || 0;
    host.className = authorized > available ? 'localError' : 'localNotice localSuccess';
    host.textContent = `${this.assignments.length} jugadores · ${authorized} cartones autorizados de ${available} disponibles.`;
  }

  renderSetup(body) {
    if (!this.assignments.length) this.assignments = this.defaultAssignments();
    const presenter = this.presenterInfo(this.app.game.presenter);
    body.innerHTML = `
      <div class="localIntro">
        <div class="localWaitingHero"><img src="assets/${esc(this.app.game.presenter)}.png" alt="${esc(presenter.name)}"><div><h3>${esc(presenter.name)} acompañará esta partida</h3><p>La sala se abrirá en modo espera. Los jugadores elegirán sus cartones y el sorteo solo comenzará cuando presiones INICIAR SORTEO.</p></div></div>
        <div class="localGrid2">
          <div class="localCardBox"><h3>Partida actual</h3><div>Juego ${String(this.app.game.number).padStart(4, '0')} · Bingo ${this.app.game.mode}</div><div>${this.app.game.cards.length} cartones disponibles · Jugadores configurables: 2 a 60</div></div>
          <div class="localCardBox"><h3>Elección de cartones</h3><div>Definí si cada jugador puede elegir entre 1 y 4 cartones. Al entrar recibirá hasta diez opciones disponibles.</div></div>
        </div>
        <div class="localCardBox">
          <h3>Jugadores autorizados</h3>
          <div class="localToggleRow"><div><b>Cantidad de jugadores</b><br><small>Elegí entre 2 y 60. Esta cantidad es independiente de los cartones generados.</small></div><input id="localPlayerCount" type="number" min="2" max="60" value="${this.assignments.length}" style="width:92px;padding:10px;border-radius:9px;border:1px solid #ffffff27;background:#151d31;color:#fff;font-weight:900"></div>
          <div id="localAssignmentSummary"></div>
          <div id="localPlayersEditor" class="localPlayersEditor"></div>
          <div class="localGrid2" style="margin-top:14px">
            <div class="localCardBox">
              <h3>Premios de línea</h3>
              <label style="display:grid;gap:7px"><b>Cantidad de líneas ganadoras</b><select id="localLinePrizeCount" style="padding:10px;border-radius:9px;border:1px solid #ffffff27;background:#151d31;color:#fff"><option value="1">Una línea</option><option value="2">Primera y segunda línea</option></select></label>
              <label class="localToggleRow"><span><b>Permitir que el mismo jugador gane ambas líneas</b><br><small>Solo con cartones diferentes.</small></span><input id="localSamePlayerSecondLine" type="checkbox"></label>
            </div>
            <div class="localCardBox">
              <h3>Asignación automática</h3>
              <label class="localToggleRow"><span><b>Usar cuenta regresiva</b><br><small>El conteo se inicia manualmente después de compartir la sala.</small></span><input id="localAutoAssignEnabled" type="checkbox"></label>
              <label style="display:grid;grid-template-columns:1fr 90px;gap:10px;align-items:center"><span><b>Tiempo para elegir</b><br><small>Entre 1 y 30 minutos.</small></span><input id="localAutoAssignMinutes" type="number" min="1" max="30" value="10" style="padding:10px;border-radius:9px;border:1px solid #ffffff27;background:#151d31;color:#fff;font-weight:900"></label>
            </div>
          </div>
          <div class="localToggleRow"><div><b>Permitir canto de números en celulares</b><br><small>Cada jugador podrá activarlo o silenciarlo.</small></div><input id="localPlayerAudioAllowed" type="checkbox" checked></div>
          <div id="localSetupError"></div>
          <div class="localToolbar"><button class="localSecondary" id="localRestoreBrowser">RESTAURAR ÚLTIMA COPIA</button><button class="localSecondary" id="localRestoreFile">RESTAURAR ARCHIVO</button><button class="localPrimary" id="localOpenRoom">ABRIR SALA DE ESPERA</button></div>
        </div>
      </div>`;
    this.renderAssignmentRows();
    $('localPlayerCount').onchange = event => this.setPlayerCount(event.target.value);
    $('localPlayerCount').oninput = event => { const value = Math.max(2, Math.min(60, Number(event.target.value) || 2)); if (value !== this.assignments.length) this.setPlayerCount(value); };
    $('localOpenRoom').onclick = () => this.openRoom();
    $('localRestoreBrowser').onclick = () => this.restoreBrowserBackup();
    $('localRestoreFile').onclick = () => $('localBackupFile').click();
  }

  renderAssignmentRows() {
    const host = $('localPlayersEditor');
    if (!host) return;
    host.innerHTML = '';
    this.assignments.forEach((assignment, index) => {
      const row = document.createElement('div');
      row.className = 'localPlayerRow';
      row.innerHTML = `<input class="localName" value="${esc(assignment.name)}" placeholder="Nombre o alias"><select class="localAllowed"><option value="1" ${Number(assignment.allowedCardCount) === 1 ? 'selected' : ''}>Puede elegir 1 cartón</option><option value="2" ${Number(assignment.allowedCardCount) === 2 ? 'selected' : ''}>Puede elegir 2 cartones</option><option value="3" ${Number(assignment.allowedCardCount) === 3 ? 'selected' : ''}>Puede elegir 3 cartones</option><option value="4" ${Number(assignment.allowedCardCount) === 4 ? 'selected' : ''}>Puede elegir 4 cartones</option></select><button>ELIMINAR</button>`;
      row.querySelector('.localName').oninput = event => { assignment.name = event.target.value; };
      row.querySelector('.localAllowed').onchange = event => { assignment.allowedCardCount = Number(event.target.value); this.updateAssignmentSummary(); };
      row.querySelector('button').onclick = () => { if (this.assignments.length <= 2) return alert('La sala necesita al menos 2 jugadores.'); this.assignments.splice(index, 1); this.renderAssignmentRows(); };
      host.appendChild(row);
    });
    if ($('localPlayerCount')) $('localPlayerCount').value = String(this.assignments.length);
    this.updateAssignmentSummary();
  }

  validateAssignments() {
    const cleaned = this.assignments
      .map(item => ({ name: item.name.trim(), allowedCardCount: Math.max(1, Math.min(4, Number(item.allowedCardCount) || 1)) }))
      .filter(item => item.name);
    if (cleaned.length < 2) throw new Error('Agregá al menos 2 jugadores.');
    if (cleaned.length > 60) throw new Error('La sala admite como máximo 60 jugadores.');
    for (const player of cleaned) if (!player.name) throw new Error('Todos los jugadores deben tener nombre o alias.');
    const total = cleaned.reduce((sum, player) => sum + player.allowedCardCount, 0);
    if (total > this.app.game.cards.length) throw new Error(`Autorizaste ${total} cartones, pero la partida solo tiene ${this.app.game.cards.length}.`);
    return cleaned;
  }

  serializeGame() {
    return JSON.parse(JSON.stringify({ ...this.app.game, phase: this.app.phase }));
  }

  async openRoom() {
    const errorBox = $('localSetupError');
    try {
      errorBox.innerHTML = '';
      if (this.app.game.drawn.length) throw new Error('Reiniciá la ronda antes de abrir la sala. No debe haber bolillas sorteadas.');
      this.app.stopAutomatic(false);
      this.app.setPhase(window.BingoV8Engine.PHASE.READY);
      this.app.renderAutoControls();
      const players = this.validateAssignments();
      const roomSettings = {
        playerAudioAllowed: $('localPlayerAudioAllowed')?.checked !== false,
        playerAudioDefault: false,
        linePrizeCount: Number($('localLinePrizeCount')?.value || 1),
        bingoPrizeCount: 1,
        allowSamePlayerSecondLine: Boolean($('localSamePlayerSecondLine')?.checked)
      };
      const assignmentTimer = {
        enabled: Boolean($('localAutoAssignEnabled')?.checked),
        durationMinutes: Math.max(1, Math.min(30, Number($('localAutoAssignMinutes')?.value) || 10))
      };
      const data = await this.request('/api/admin/configure', { method: 'POST', body: JSON.stringify({ game: this.serializeGame(), players, roomSettings, assignmentTimer }) });
      this.applyState(data);
      this.renderMainModal();
    } catch (error) {
      errorBox.innerHTML = `<div class="localError">${esc(error.message)}</div>`;
    }
  }

  presenterInfo(id) {
    const profiles = {
      vero: { name: 'Vero', phrase: 'Revisá bien tus cartones y mucha suerte.' },
      vivi: { name: 'Vivi', phrase: 'Vamos a divertirnos en esta partida.' },
      josu: { name: 'Josu', phrase: '¿Listos para jugar?' },
      daia: { name: 'Daia', phrase: 'Mucha suerte para todos.' }
    };
    return profiles[id] || profiles.vero;
  }

  async startRoom() {
    if (!this.serverState?.readyToStart) {
      alert('Todavía hay jugadores que no confirmaron sus cartones. El sorteo seguirá detenido.');
      return;
    }
    if (!confirm('¿INICIAR EL SORTEO ahora? Desde este momento se bloquean las elecciones de cartones.')) return;
    try {
      const data = await this.request('/api/admin/start', { method: 'POST', body: '{}' });
      this.applyState(data);
      this.app.setPhase(window.BingoV8Engine.PHASE.READY);
      this.app.renderGame();
      if (this.app.game.drawMode === 'automatic') setTimeout(() => this.app.startAutomatic(), 700);
      this.renderMainModal();
    } catch (error) {
      alert(error.message);
    }
  }

  async releaseSelection(playerId) {
    if (!confirm('¿Liberar los cartones elegidos por este jugador? Tendrá que volver a elegir.')) return;
    try {
      const data = await this.request('/api/admin/release-selection', { method: 'POST', body: JSON.stringify({ playerId }) });
      this.applyState(data);
      this.renderMainModal();
    } catch (error) { alert(error.message); }
  }

  async updateAudioSetting(allowed) {
    try {
      const data = await this.request('/api/admin/settings', { method: 'POST', body: JSON.stringify({ playerAudioAllowed: allowed, playerAudioDefault: false }) });
      this.applyState(data);
    } catch (error) { alert(error.message); }
  }

  async publishAdminMessage() {
    const text = String($('localAdminMessage')?.value || '').trim();
    if (!text) {
      alert('Escribí un mensaje antes de publicarlo.');
      return;
    }
    try {
      const data = await this.request('/api/admin/message', { method: 'POST', body: JSON.stringify({ action: 'publish', text }) });
      this.messageDraft = null;
      this.applyState(data);
      this.showCopyToast('Mensaje publicado');
    } catch (error) { alert(error.message); }
  }

  async clearAdminMessage() {
    if (!this.serverState?.adminMessage) return;
    if (!confirm('¿Borrar el mensaje visible en los celulares?')) return;
    try {
      const data = await this.request('/api/admin/message', { method: 'POST', body: JSON.stringify({ action: 'clear' }) });
      this.messageDraft = null;
      this.applyState(data);
      this.showCopyToast('Mensaje borrado');
    } catch (error) { alert(error.message); }
  }

  assignmentRemainingSeconds() {
    const timer = this.serverState?.assignmentTimer;
    if (!timer) return null;
    if (timer.status === 'running' && timer.endsAt) return Math.max(0, Math.ceil((new Date(timer.endsAt).getTime() - Date.now()) / 1000));
    if (timer.remainingSeconds != null) return Math.max(0, Number(timer.remainingSeconds) || 0);
    return null;
  }

  formatCountdown(seconds) {
    if (seconds == null) return '—';
    const safe = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safe / 60);
    const rest = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }

  updateLiveCountdown() {
    const host = $('localAssignmentCountdown');
    if (!host) return;
    host.textContent = this.formatCountdown(this.assignmentRemainingSeconds());
  }

  async controlAssignmentTimer(action, extra = {}) {
    try {
      if (action === 'assign-now' && !confirm('¿Asignar ahora los cartones pendientes y cerrar la elección?')) return;
      const data = await this.request('/api/admin/assignment-timer', { method: 'POST', body: JSON.stringify({ action, ...extra }) });
      this.applyState(data);
      this.renderMainModal();
    } catch (error) { alert(error.message); }
  }

  async finishRoom() {
    if (!confirm('¿FINALIZAR EL SORTEO? Se bloquearán nuevas bolillas y reclamos.')) return;
    try {
      this.app.stopAutomatic(false);
      const data = await this.request('/api/admin/finish', { method: 'POST', body: '{}' });
      this.applyState(data);
      this.app.setPhase(window.BingoV8Engine.PHASE.ROUND_END);
      this.app.renderGame();
      this.renderMainModal();
    } catch (error) { alert(error.message); }
  }

  async downloadAdminFile(path, filename) {
    const response = await fetch(path, { headers: { 'X-Admin-Token': this.adminToken } });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'No se pudo descargar el archivo.');
    }
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1200);
  }

  async downloadActa(format) {
    try {
      const room = this.serverState?.roomCode || 'sala';
      await this.downloadAdminFile(`/api/admin/acta.${format}`, `Bingo_Acta_${room}.${format}`);
    } catch (error) { alert(error.message); }
  }

  actaTable(data) {
    const events = (data.eventLog || []).filter(event => event.type === 'ball_drawn');
    const rows = (data.game?.drawn || []).map((number, index) => {
      const event = [...events].reverse().find(item => Number(item.number) === Number(number));
      const time = event?.at ? new Date(event.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
      return `<tr><td>${index + 1}</td><td><b>${number}</b></td><td>${esc(time)}</td></tr>`;
    }).join('');
    return `<div class="localActaWrap"><table class="localActa"><thead><tr><th>Orden</th><th>Bolilla</th><th>Hora</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No se sortearon bolillas.</td></tr>'}</tbody></table></div>`;
  }

  renderLive(body) {
    const data = this.serverState;
    const connectedCount = (data.players || []).filter(player => player.connected).length;
    const selectedCount = (data.players || []).filter(player => player.selectionConfirmed).length;
    const prizeStatus = data.prizeStatus || { line: { total: 1, awarded: 0, closed: false }, bingo: { total: 1, awarded: 0, closed: false } };
    const lineAlerts = prizeStatus.line.closed ? 0 : (data.cardStatus || []).filter(card => card.hasLine && card.lineClaim === 'none').length;
    const bingoAlerts = prizeStatus.bingo.closed ? 0 : (data.cardStatus || []).filter(card => card.hasBingo && card.bingoClaim === 'none').length;
    const playerPageUrl = this.playerPageUrl();
    const waiting = data.status === 'waiting';
    const playing = data.status === 'playing';
    const finished = data.status === 'finished';
    const presenter = this.presenterInfo(data.game.presenter);
    const activeMessage = String(data.adminMessage?.text || '');
    const messageDraft = this.messageDraft === null ? activeMessage : this.messageDraft;
    const timer = data.assignmentTimer || {};
    const timerEnabled = Boolean(timer.enabled);
    const timerStatus = timer.status || 'idle';
    const timerStatusLabel = timerStatus === 'running' ? 'EN MARCHA' : timerStatus === 'paused' ? 'PAUSADO' : timerStatus === 'completed' ? 'FINALIZADO' : 'SIN INICIAR';
    const statusTitle = waiting ? 'SALA DE ESPERA' : playing ? 'SORTEO EN CURSO' : 'SORTEO FINALIZADO';
    const statusDescription = waiting
      ? 'Compartí el enlace y los códigos. El sorteo no comenzará hasta que lo ordenes.'
      : playing ? presenter.phrase : 'La secuencia oficial quedó cerrada. Ya podés descargar el acta.';
    const cardsLabel = player => player.cardIds.length
      ? player.cardIds.map(id => `#${esc(data.game.cards.find(card => card.id === id)?.number || '?')}`).join(' · ')
      : (player.reservedCardIds?.length
        ? `Reservando ${player.reservedCardIds.map(id => `#${esc(data.game.cards.find(card => card.id === id)?.number || '?')}`).join(' · ')}`
        : 'Todavía no eligió');
    const choiceState = player => player.selectionConfirmed
      ? 'CONFIRMADO'
      : player.reservedCardIds?.length
        ? `RESERVANDO ${player.reservedCardIds.length}/${player.allowedCardCount}`
        : player.connected ? 'ELIGIENDO' : 'SIN INGRESAR';

    const timerControls = !waiting || !timerEnabled ? '' : timerStatus === 'idle'
      ? `<div class="localTimerActions"><input id="localLiveTimerMinutes" type="number" min="1" max="30" value="${Number(timer.durationMinutes) || 10}" style="width:92px;padding:9px;border-radius:9px;border:1px solid #ffffff27;background:#10182b;color:#fff;font-weight:900"><button class="primary" id="localTimerStart">INICIAR CUENTA REGRESIVA</button><button class="danger" id="localAssignNow">ASIGNAR PENDIENTES AHORA</button></div>`
      : timerStatus === 'running'
        ? `<div class="localTimerActions"><button id="localTimerPause">PAUSAR</button><button id="localTimerExtend">+ 5 MINUTOS</button><button class="danger" id="localAssignNow">FINALIZAR Y ASIGNAR AHORA</button></div>`
        : timerStatus === 'paused'
          ? `<div class="localTimerActions"><button class="primary" id="localTimerResume">REANUDAR</button><button id="localTimerExtend">+ 5 MINUTOS</button><button class="danger" id="localAssignNow">FINALIZAR Y ASIGNAR AHORA</button></div>`
          : '<div class="localNotice localSuccess" style="margin-top:10px">La elección quedó cerrada. Los jugadores pendientes ya recibieron sus cartones automáticamente.</div>';

    body.innerHTML = `
      <div class="localWaitingHero"><img src="assets/${esc(data.game.presenter)}.png" alt="${esc(presenter.name)}"><div><h3>${statusTitle} · ${esc(presenter.name)}</h3><p>${statusDescription}</p></div></div>
      <div class="localSummary">
        <div class="localMetric"><b>${connectedCount}</b><span>jugadores conectados</span></div>
        <div class="localMetric"><b>${selectedCount}/${data.players?.length || 0}</b><span>elecciones confirmadas</span></div>
        <div class="localMetric"><b>${lineAlerts}</b><span>líneas sin cantar</span></div>
        <div class="localMetric"><b>${bingoAlerts}</b><span>bingos sin cantar</span></div>
      </div>
      <div class="localPrizeBar">
        <div class="localPrizeItem ${prizeStatus.line.closed ? 'closed' : ''}"><b>Líneas: ${prizeStatus.line.awarded}/${prizeStatus.line.total}</b><span>${prizeStatus.line.closed ? 'Premio cerrado' : `Disponible: ${esc(prizeStatus.line.nextLabel || 'Línea')}`}</span></div>
        <div class="localPrizeItem ${prizeStatus.bingo.closed ? 'closed' : ''}"><b>Bingo: ${prizeStatus.bingo.awarded}/1</b><span>${prizeStatus.bingo.closed ? 'Premio cerrado' : 'Premio disponible'}</span></div>
      </div>
      <div class="localGrid2" style="margin-top:14px">
        <div class="localCardBox"><h3>Ingreso de jugadores</h3><div class="localCompactAccess"><div><small>Página general</small><div class="localCode">SALA ${esc(data.roomCode)}</div></div><button class="localSecondary" id="localCopyPlayerPage">COPIAR PÁGINA PARA JUGADORES</button></div><small>El enlace largo no se muestra. Quien lo reciba escribe su código privado.</small></div>
        <div class="localCardBox"><h3>Código de sala</h3><div class="localUrl">${esc(data.roomCode)}</div><small>Estado: ${waiting ? 'esperando jugadores' : playing ? 'sorteo iniciado' : 'sorteo finalizado'}.</small></div>
      </div>
      ${waiting && timerEnabled ? `<div class="localTimerBox"><div class="localTimerTop"><div><b>Asignación automática · ${timerStatusLabel}</b><br><small>Al finalizar, conserva elecciones confirmadas y completa a quienes falten.</small></div><div id="localAssignmentCountdown" class="localCountdown">${this.formatCountdown(this.assignmentRemainingSeconds())}</div></div>${timerControls}</div>` : ''}
      ${waiting && !timerEnabled ? `<div class="localTimerBox"><div class="localTimerTop"><div><b>Asignación manual</b><br><small>No hay cuenta regresiva configurada. Podés cerrar la elección y asignar pendientes cuando quieras.</small></div></div><div class="localTimerActions"><button class="danger" id="localAssignNow">ASIGNAR PENDIENTES AHORA</button></div></div>` : ''}
      <div class="localCardBox" style="margin-top:14px">
        <div class="localToggleRow"><div><b>Canto de números en celulares</b><br><small>El jugador decide si lo activa en su teléfono.</small></div><input id="localLiveAudioAllowed" type="checkbox" ${data.roomSettings?.playerAudioAllowed !== false ? 'checked' : ''}></div>
      </div>
      <div class="localCardBox" style="margin-top:14px">
        <h3>Mensaje para todos los jugadores</h3>
        <textarea id="localAdminMessage" class="localMessageEditor" maxlength="300" placeholder="Ejemplo: Esperamos dos minutos porque falta ingresar un jugador.">${esc(messageDraft)}</textarea>
        <div class="localMessageMeta"><span>Se mostrará como un globo desde la presentadora.</span><span id="localAdminMessageCount">${messageDraft.length}/300</span></div>
        <div class="localToolbar"><button class="localPrimary" id="localPublishMessage">PUBLICAR / ACTUALIZAR</button><button class="localDanger" id="localClearMessage" ${activeMessage ? '' : 'disabled'}>BORRAR MENSAJE</button></div>
        ${activeMessage ? `<div class="localMessageActive"><b>MENSAJE ACTIVO</b>${esc(activeMessage)}</div>` : '<div class="localNotice">No hay un mensaje activo. El globo permanece oculto en los celulares.</div>'}
      </div>
      <div class="localCardBox" style="margin-top:14px"><h3>Códigos privados y elección</h3><table class="localCodes"><thead><tr><th>Jugador</th><th>Autorizado</th><th>Cartones elegidos</th><th>Código</th><th>Estado</th><th>Accesos</th>${waiting && timerStatus !== 'completed' ? '<th></th>' : ''}</tr></thead><tbody>${(data.players || []).map(player => `<tr><td>${esc(player.name)}</td><td>${player.allowedCardCount}</td><td>${cardsLabel(player)}</td><td class="localCode">${esc(player.code)}</td><td><span class="localChoiceState ${player.selectionConfirmed ? 'ready' : 'waiting'}">${choiceState(player)}</span></td><td><div class="localAccessActions"><button class="direct" data-copy-direct="${esc(player.code)}">COPIAR INGRESO DIRECTO</button><button data-copy-page>COPIAR PÁGINA DE ACCESO</button></div></td>${waiting && timerStatus !== 'completed' ? `<td>${player.selectionConfirmed ? `<button class="release" data-release-player="${esc(player.id)}">LIBERAR</button>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>
      ${waiting ? `<div class="localStartBox ${data.readyToStart ? 'ready' : ''}"><b>${data.readyToStart ? 'Todos los jugadores tienen sus cartones.' : 'Todavía hay jugadores pendientes.'}</b><br><small>El sorteo NO comenzará solo. Debés presionar INICIAR SORTEO.</small><button id="localStartGame" ${data.readyToStart ? '' : 'disabled'}>▶ INICIAR SORTEO</button></div>` : ''}
      ${playing || finished ? `<div class="localCardBox" style="margin-top:14px"><h3>Control de todos los cartones</h3><div class="localMonitorWrap">${this.monitorTable(data.cardStatus || [])}</div></div>` : ''}
      ${playing ? `<div class="localFinishedBox"><b>Cuando termine la partida, cerrá la secuencia oficial.</b><br><small>Después podrás descargar el orden exacto de las bolillas.</small><button class="localDanger" id="localFinishGame" style="margin-top:10px;border:0;border-radius:10px;padding:11px 15px;font-weight:900;cursor:pointer">FINALIZAR SORTEO</button></div>` : ''}
      ${finished ? `<div class="localFinishedBox"><h3 style="margin-top:0">Acta final del sorteo</h3><div class="localToolbar"><button class="localPrimary" id="localDownloadActaPdf">DESCARGAR PDF</button><button class="localSecondary" id="localDownloadActaCsv">DESCARGAR CSV</button></div>${this.actaTable(data)}</div>` : ''}
      <div class="localToolbar"><button class="localSecondary" id="localCopyLink">COPIAR PÁGINA PARA JUGADORES</button><button class="localSecondary" id="localDownloadBackup">DESCARGAR COPIA</button><button class="localSecondary" id="localRestoreFile">RESTAURAR ARCHIVO</button><button class="localSecondary" id="localRefresh">ACTUALIZAR</button><button class="localDanger" id="localCloseRoom">CERRAR SALA</button></div>`;

    $('localCopyLink').onclick = () => this.copyText(playerPageUrl);
    if ($('localCopyPlayerPage')) $('localCopyPlayerPage').onclick = () => this.copyText(playerPageUrl);
    body.querySelectorAll('[data-copy-direct]').forEach(button => button.onclick = () => this.copyText(this.playerDirectUrl(button.dataset.copyDirect), 'Ingreso directo copiado'));
    body.querySelectorAll('[data-copy-page]').forEach(button => button.onclick = () => this.copyText(playerPageUrl));
    $('localDownloadBackup').onclick = () => this.downloadBackup();
    $('localRestoreFile').onclick = () => $('localBackupFile').click();
    $('localRefresh').onclick = () => this.refreshState().catch(error => alert(error.message));
    $('localCloseRoom').onclick = () => this.closeRoom();
    if ($('localStartGame')) $('localStartGame').onclick = () => this.startRoom();
    if ($('localFinishGame')) $('localFinishGame').onclick = () => this.finishRoom();
    if ($('localTimerStart')) $('localTimerStart').onclick = () => this.controlAssignmentTimer('start', { durationMinutes: Number($('localLiveTimerMinutes')?.value || timer.durationMinutes || 10) });
    if ($('localTimerPause')) $('localTimerPause').onclick = () => this.controlAssignmentTimer('pause');
    if ($('localTimerResume')) $('localTimerResume').onclick = () => this.controlAssignmentTimer('resume');
    if ($('localTimerExtend')) $('localTimerExtend').onclick = () => this.controlAssignmentTimer('extend', { extraMinutes: 5 });
    if ($('localAssignNow')) $('localAssignNow').onclick = () => this.controlAssignmentTimer('assign-now');
    if ($('localDownloadActaPdf')) $('localDownloadActaPdf').onclick = () => this.downloadActa('pdf');
    if ($('localDownloadActaCsv')) $('localDownloadActaCsv').onclick = () => this.downloadActa('csv');
    if ($('localLiveAudioAllowed')) $('localLiveAudioAllowed').onchange = event => this.updateAudioSetting(event.target.checked);
    if ($('localAdminMessage')) $('localAdminMessage').oninput = event => {
      this.messageDraft = event.target.value;
      if ($('localAdminMessageCount')) $('localAdminMessageCount').textContent = `${event.target.value.length}/300`;
    };
    if ($('localPublishMessage')) $('localPublishMessage').onclick = () => this.publishAdminMessage();
    if ($('localClearMessage')) $('localClearMessage').onclick = () => this.clearAdminMessage();
    body.querySelectorAll('[data-release-player]').forEach(button => button.onclick = () => this.releaseSelection(button.dataset.releasePlayer));
    body.querySelectorAll('[data-card-detail]').forEach(button => button.onclick = () => this.openCardDetail(button.dataset.cardDetail));
    this.updateLiveCountdown();
  }


  monitorTable(cards) {
    const sorted = [...cards].sort((a, b) => Number(b.hasBingo) - Number(a.hasBingo) || Number(b.hasLine) - Number(a.hasLine) || a.bingoMissing - b.bingoMissing || a.lineMissing - b.lineMissing);
    const lineClosed = Boolean(this.serverState?.prizeStatus?.line?.closed);
    const bingoClosed = Boolean(this.serverState?.prizeStatus?.bingo?.closed);
    return `<table class="localMonitor"><thead><tr><th>Jugador</th><th>Cartón</th><th>Conexión</th><th>Falta línea</th><th>Falta bingo</th><th>Modo</th><th>Marcas jugador</th><th>Diferencias</th><th></th></tr></thead><tbody>${sorted.map(card => {
      const rowClass = !bingoClosed && card.hasBingo && card.bingoClaim === 'none' ? 'alertBingo' : !lineClosed && card.hasLine && card.lineClaim === 'none' ? 'alertLine' : '';
      const prize = !bingoClosed && card.hasBingo ? '<span class="localStatus danger">BINGO SIN CANTAR</span>' : !lineClosed && card.hasLine ? '<span class="localStatus warn">LÍNEA SIN CANTAR</span>' : '';
      return `<tr class="${rowClass}"><td><b>${esc(card.playerName)}</b><br>${prize}</td><td>#${esc(card.cardNumber)}</td><td><span class="localStatus ${card.connected ? 'on' : 'off'}">${card.connected ? 'Sí' : 'No'}</span></td><td><b>${card.lineMissing}</b></td><td><b>${card.bingoMissing}</b></td><td>${card.autoMark ? '<span class="localStatus on">AUTO</span>' : 'Manual'}</td><td>${card.playerMarkedCount}/${card.totalNumbers}</td><td>${card.missed.length ? `Olvidó: ${card.missed.join(', ')}` : ''}${card.wrong.length ? `${card.missed.length ? '<br>' : ''}Mal marcados: ${card.wrong.join(', ')}` : (!card.missed.length ? 'Sin diferencias' : '')}</td><td><button data-card-detail="${esc(card.cardId)}">VER</button></td></tr>`;
    }).join('')}</tbody></table>`;
  }

  scheduleAutoBackup() {
    clearTimeout(this.backupTimer);
    this.backupTimer = setTimeout(async () => {
      try {
        const backup = await this.request('/api/admin/backup');
        localStorage.setItem('bingoV10OnlineLastBackup', JSON.stringify(backup));
      } catch (error) {
        console.warn('No se pudo guardar la copia automática:', error);
      }
    }, 900);
  }

  async downloadBackup() {
    try {
      const backup = await this.request('/api/admin/backup');
      localStorage.setItem('bingoV10OnlineLastBackup', JSON.stringify(backup));
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Bingo_V10_Sala_${backup.state?.roomCode || 'copia'}_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) { alert(error.message); }
  }

  async restoreBrowserBackup() {
    const raw = localStorage.getItem('bingoV10OnlineLastBackup');
    if (!raw) { alert('No hay una copia automática guardada en este navegador.'); return; }
    try { await this.restoreBackup(JSON.parse(raw)); }
    catch (error) { alert(error.message); }
  }

  async restoreBackupFile(file) {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      await this.restoreBackup(backup);
    } catch (error) { alert(`No se pudo restaurar la copia: ${error.message}`); }
    finally { $('localBackupFile').value = ''; }
  }

  async restoreBackup(backup) {
    if (!confirm('¿Restaurar esta sala? Reemplazará el estado online actual.')) return;
    const data = await this.request('/api/admin/restore', { method: 'POST', body: JSON.stringify({ backup }) });
    this.restoreClientGame(data.game);
    this.applyState(data);
    this.renderMainModal();
    alert('Sala restaurada. Los jugadores deben volver a ingresar con sus mismos códigos.');
  }

  restoreClientGame(game) {
    if (!game) return;
    this.app.stopAutomatic(false);
    this.app.game = window.BingoV8Engine.GameStore.normalizeGame(game);
    this.app.setPhase(game.drawn?.length ? window.BingoV8Engine.PHASE.PAUSED : window.BingoV8Engine.PHASE.READY);
    this.app.game = this.app.store.save(this.app.game);
    this.app.showScreen('game');
    this.app.applyTheme(this.app.game.theme || 'clasico');
    this.app.renderGame();
  }

  async closeRoom() {
    if (!confirm('¿Cerrar la sala online? Los celulares perderán el acceso.')) return;
    await this.request('/api/admin/close', { method: 'POST', body: '{}' });
    this.applyState({ active: false, status: 'closed' });
    this.assignments = [];
    this.renderMainModal();
  }

  scheduleSync() {
    if (!this.active || !this.app.game) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.syncGame(), 80);
  }

  async syncGame() {
    if (!this.active || !this.app.game || this.serverState?.status !== 'playing') return;
    try {
      const data = await this.request('/api/admin/game', { method: 'POST', body: JSON.stringify({ game: this.serializeGame() }) });
      this.applyState(data);
    } catch (error) {
      console.error('No se pudo sincronizar la sala online:', error);
    }
  }

  openCardDetail(cardId) {
    const cardStatus = this.serverState?.cardStatus?.find(item => item.cardId === cardId);
    const card = this.serverState?.game?.cards?.find(item => item.id === cardId);
    if (!cardStatus || !card) return;
    this.currentClaim = null;
    $('localClaimTitle').textContent = `CONTROL · ${cardStatus.playerName}`;
    $('localClaimSubtitle').textContent = `Cartón ${cardStatus.cardNumber} · seguimiento en vivo`;
    $('localClaimBody').innerHTML = this.comparisonHtml(card, cardStatus.playerMarked, cardStatus.officialMarked, cardStatus, null);
    $('localClaimConfirm').style.display = 'none';
    $('localClaimReject').style.display = 'none';
    $('localClaimModal').classList.add('show');
  }

  playClaimSound(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = type === 'bingo' ? [523, 659, 784, 1047] : [660, 880];
      notes.forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + index * .12);
        gain.gain.exponentialRampToValueAtTime(.15, ctx.currentTime + index * .12 + .02);
        gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + index * .12 + .16);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(ctx.currentTime + index * .12);
        oscillator.stop(ctx.currentTime + index * .12 + .18);
      });
      setTimeout(() => ctx.close().catch(() => {}), 1200);
    } catch {}
  }

  showNextClaim() {
    if (this.currentClaim) {
      $('localClaimModal').classList.add('show');
      return;
    }
    const claim = this.claimQueue.shift();
    if (!claim) { this.updateClaimBadge(); return; }
    this.currentClaim = claim;
    this.claimOpen = true;
    this.playClaimSound(claim.type);
    this.app.stopAutomatic(false);
    this.app.setPhase(window.BingoV8Engine.PHASE.PAUSED);
    this.app.renderAutoControls();
    const card = this.serverState?.game?.cards?.find(item => item.id === claim.cardId);
    $('localClaimTitle').textContent = `${claim.prizeLabel || (claim.type === 'line' ? 'LÍNEA' : 'BINGO')} CANTADO`;
    $('localClaimSubtitle').textContent = `${claim.playerName} · Cartón ${claim.cardNumber}`;
    $('localClaimBody').innerHTML = this.comparisonHtml(card, claim.playerMarksAtClaim, claim.drawnAtClaim, claim.comparison, claim);
    $('localClaimConfirm').style.display = '';
    $('localClaimReject').style.display = '';
    $('localClaimConfirm').disabled = !claim.officialValid;
    $('localClaimConfirm').textContent = claim.officialValid ? 'CONFIRMAR PREMIO' : 'NO PUEDE CONFIRMARSE';
    $('localClaimModal').classList.add('show');
    this.updateClaimBadge();
  }

  comparisonHtml(card, playerMarks, officialMarks, analysis, claim) {
    if (!card) return '<div class="localError">No se encontró el cartón.</div>';
    const title = claim ? (claim.officialValid ? `RECLAMO VÁLIDO SEGÚN EL SISTEMA` : `RECLAMO INVÁLIDO SEGÚN EL SISTEMA`) : 'COMPARACIÓN EN VIVO';
    const className = claim?.officialValid ? 'localClaimValid' : claim ? 'localClaimValid localClaimInvalid' : 'localNotice';
    return `<div class="${className}">${title}${claim ? `<br><small>${claim.type === 'line' ? (analysis.completeLines?.map(line => line.label).join(' · ') || 'No hay línea completa') : `Faltan ${analysis.bingoMissing} números para bingo`}</small>` : ''}</div>
      <div class="localCompareLegend"><span><i class="localSwatch ok"></i> Marcado correcto</span><span><i class="localSwatch missed"></i> Salió y el jugador no lo marcó</span><span><i class="localSwatch wrong"></i> Marcado sin haber salido</span></div>
      <div class="localCompare">
        <div class="localCompareBox"><h3>Marcado por el jugador</h3><small>Lo que tocó en su celular.</small>${this.ticketHtml(card, playerMarks, officialMarks, 'player')}</div>
        <div class="localCompareBox"><h3>Marcado oficial del sistema</h3><small>Calculado con las bolillas realmente sorteadas.</small>${this.ticketHtml(card, officialMarks, playerMarks, 'official')}</div>
      </div>
      <div class="localGrid2" style="margin-top:14px"><div class="localCardBox"><b>Números olvidados</b><div class="localDiffList">${analysis.missed?.length ? analysis.missed.map(n => `<b>${n}</b>`).join('') : '<span>Ninguno</span>'}</div></div><div class="localCardBox"><b>Números marcados por error</b><div class="localDiffList">${analysis.wrong?.length ? analysis.wrong.map(n => `<b>${n}</b>`).join('') : '<span>Ninguno</span>'}</div></div></div>`;
  }

  ticketHtml(card, primaryValues, comparisonValues, view) {
    const primary = new Set((primaryValues || []).map(Number));
    const comparison = new Set((comparisonValues || []).map(Number));
    const cells = card.grid.flat().map(value => {
      if (value === null) return '<div class="cell blank">·</div>';
      if (value === 'LIBRE') return '<div class="cell free">LIBRE</div>';
      let cls = '';
      if (view === 'player') {
        if (primary.has(value) && comparison.has(value)) cls = 'marked';
        else if (primary.has(value) && !comparison.has(value)) cls = 'wrong';
        else if (!primary.has(value) && comparison.has(value)) cls = 'missed';
      } else if (primary.has(value)) cls = comparison.has(value) ? 'marked' : 'missed';
      return `<div class="cell ${cls}">${value}</div>`;
    }).join('');
    return `<div class="localTicket mode${card.mode}">${cells}</div>`;
  }

  async resolveCurrentClaim(resolution) {
    const claim = this.currentClaim;
    if (!claim) return;
    if (resolution === 'confirmed' && !claim.officialValid) return;
    try {
      const resolved = await this.request('/api/admin/resolve', { method: 'POST', body: JSON.stringify({ claimId: claim.id, resolution }) });
      if (resolution === 'confirmed') this.applyConfirmedPrize(resolved);
      $('localClaimModal').classList.remove('show');
      this.currentClaim = null;
      this.claimOpen = false;
      this.app.setPhase(window.BingoV8Engine.PHASE.PAUSED);
      this.app.renderAutoControls();
      this.updateClaimBadge();
      setTimeout(() => this.showNextClaim(), 150);
    } catch (error) {
      alert(error.message);
    }
  }

  applyConfirmedPrize(claim) {
    const type = claim.type;
    const prize = this.app.game?.prizes?.[type];
    const card = this.app.game?.cards?.find(item => item.id === claim.cardId);
    if (!prize || !card) return;
    const totalPrizes = type === 'line' ? Math.max(1, Number(this.serverState?.roomSettings?.linePrizeCount) || 1) : 1;
    prize.status = Number(claim.prizeNumber || 1) >= totalPrizes ? 'confirmed' : 'active';
    if (!prize.winners.some(winner => winner.cardId === card.id)) {
      prize.winners.push({
        cardId: card.id,
        name: claim.playerName,
        number: card.number,
        ball: this.app.game.drawn.at(-1),
        details: claim.comparison.completeLines || [],
        prizeNumber: claim.prizeNumber || 1,
        prizeLabel: claim.prizeLabel || (type === 'line' ? 'Línea' : 'Bingo'),
        confirmedAt: new Date().toISOString(),
        source: 'online-room'
      });
    }
    this.app.save();
    this.app.renderGame();
    this.app.celebrate(type);
    const profile = this.app.voice.profiles[this.app.game.presenter] || this.app.voice.profiles.vero;
    this.app.voice.speak(type === 'line' ? profile.line : profile.bingo, this.app.game.presenter);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const app = window.__BINGO_V8__;
    if (!app) return;
    const version = $('versionBadge');
    if (version) version.textContent = 'V10.6 ONLINE';
    new LocalRoomAdmin(app).init().catch(error => console.error('No se inició la sala online:', error));
  }, 0);
});

})();
