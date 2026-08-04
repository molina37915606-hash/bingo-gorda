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
    app.localRoom = this;
  }

  async init() {
    this.injectStyles();
    this.injectUi();
    this.patchApp();
    await this.ensureAdminAuth();
    this.keepAliveTimer = setInterval(() => { if (this.active) fetch('/api/ping', { cache: 'no-store' }).catch(() => {}); }, 5 * 60 * 1000);
  }

  patchApp() {
    this.app.save = (...args) => {
      const result = this.originalSave(...args);
      this.scheduleSync();
      return result;
    };
    this.app.exitGame = () => {
      if (this.active && !confirm('La sala online seguirá abierta aunque salgas del juego. ¿Continuar?')) return;
      this.originalExitGame();
    };
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
          <div class="localHead"><div><b>SALA ONLINE</b><small>Hasta 25 jugadores y 50 cartones desde cualquier lugar</small></div><button id="localRoomClose">CERRAR</button></div>
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
      <input id="localBackupFile" type="file" accept="application/json,.json" hidden>`;
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
      .localPlayersEditor{display:grid;gap:10px;margin-top:12px}.localPlayerRow{display:grid;grid-template-columns:minmax(150px,1fr) minmax(160px,1fr) minmax(160px,1fr) auto;gap:8px;background:#0a1020;padding:10px;border-radius:13px;border:1px solid #ffffff18}
      .localPlayerRow input,.localPlayerRow select{min-width:0;padding:10px;border-radius:9px;border:1px solid #ffffff27;background:#151d31;color:#fff}.localPlayerRow button{border:0;border-radius:9px;background:#5f1723;color:#fff;font-weight:900;padding:8px 12px}
      .localToolbar{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}.localToolbar button{border:0;border-radius:11px;padding:11px 15px;font-weight:900;cursor:pointer}.localPrimary{background:#ffca2f;color:#17120a}.localSecondary{background:#273553;color:#fff}.localDanger{background:#8b2434;color:#fff}
      .localCodes{width:100%;border-collapse:collapse;margin-top:10px}.localCodes th,.localCodes td{padding:10px;border-bottom:1px solid #ffffff18;text-align:left}.localCode{font:900 17px Consolas,monospace;color:#ffdc69;letter-spacing:1px}
      .localMonitorWrap{max-height:52vh;overflow:auto;border:1px solid #ffffff17;border-radius:12px}.localMonitor{width:100%;border-collapse:collapse;font-size:13px}.localMonitor th{position:sticky;top:67px;background:#17223d;z-index:1}.localMonitor th,.localMonitor td{padding:9px 8px;border-bottom:1px solid #ffffff14;text-align:left}.localMonitor tr.alertLine{background:#5e430f55}.localMonitor tr.alertBingo{background:#651a2b77}.localMonitor button{border:0;border-radius:8px;padding:7px 9px;font-weight:900;cursor:pointer}
      .localStatus{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 8px;font-weight:900}.localStatus.on{background:#0e4e37;color:#bfffe5}.localStatus.off{background:#3b4253;color:#d6d9e1}.localStatus.warn{background:#63460f;color:#ffe19a}.localStatus.danger{background:#741d31;color:#ffd3dc}
      .localSummary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:12px 0}.localMetric{padding:12px;border-radius:12px;background:#0b1121;border:1px solid #ffffff17}.localMetric b{display:block;font-size:24px;color:#ffcf3f}.localMetric span{color:#a9b7d3;font-size:12px}
      .localCompare{display:grid;grid-template-columns:1fr 1fr;gap:16px}.localCompareBox{background:#0a1020;border:1px solid #ffffff1e;border-radius:16px;padding:14px}.localCompareBox h3{margin:0 0 5px}.localCompareLegend{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;font-size:12px}.localCompareLegend span{display:inline-flex;align-items:center;gap:5px}.localSwatch{width:14px;height:14px;border-radius:4px;background:#303a50}.localSwatch.ok{background:#1fa66c}.localSwatch.missed{background:#d29a19}.localSwatch.wrong{background:#ca3c56}
      .localTicket{display:grid;gap:4px;margin-top:10px}.localTicket.mode90{grid-template-columns:repeat(9,1fr)}.localTicket.mode75{grid-template-columns:repeat(5,1fr)}.localTicket .cell{aspect-ratio:1.15;display:flex;align-items:center;justify-content:center;border-radius:7px;background:#202a40;border:1px solid #ffffff16;font-weight:900;min-width:0}.localTicket .blank{background:#080c15;color:transparent}.localTicket .free{background:#6a4b11;color:#ffdf76}.localTicket .marked{background:#1fa66c}.localTicket .missed{background:#d29a19;color:#17120a}.localTicket .wrong{background:#ca3c56}.localDiffList{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.localDiffList b{padding:6px 9px;border-radius:8px;background:#26324a}.localActions{display:flex;justify-content:flex-end;gap:10px;padding:15px 18px;border-top:1px solid #ffffff1b}.localActions .primary{background:#23a66c;color:#fff}.localActions .secondary{background:#8a2637;color:#fff}
      .localClaimValid{padding:14px;border-radius:13px;background:#0d4a32;border:1px solid #26a270;color:#d9ffed;font-weight:900;margin-bottom:12px}.localClaimInvalid{background:#531824;border-color:#ba4055;color:#ffdce3}.localClaimPending{position:fixed;right:18px;bottom:74px;z-index:70;background:#9d253d;color:#fff;border:2px solid #ff8aa0;border-radius:14px;padding:12px 15px;box-shadow:0 12px 35px #0008;font-weight:900;cursor:pointer;display:none}.localClaimPending.show{display:block}
      @media(max-width:760px){.localGrid2,.localCompare{grid-template-columns:1fr}.localPlayerRow{grid-template-columns:1fr}.localSummary{grid-template-columns:1fr 1fr}.localMonitor{font-size:12px}.localMonitor th,.localMonitor td{padding:7px 5px}}
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
    const button = $('localRoomBtn');
    if (button) {
      button.textContent = this.active ? `🌐 SALA ${data.roomCode}` : '🌐 SALA ONLINE';
      button.classList.toggle('activeRoom', this.active);
    }
    if (this.active) this.scheduleAutoBackup();
    if ($('localRoomModal')?.classList.contains('show')) this.renderMainModal();
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
    if (this.app.game.cards.length > 50) {
      body.innerHTML = `<div class="localError">Esta partida tiene ${this.app.game.cards.length} cartones. La sala online admite un máximo de 50.</div>`;
      return;
    }
    if (!this.active) this.renderSetup(body);
    else this.renderLive(body);
  }

  defaultAssignments() {
    const assignments = [];
    for (const card of this.app.game.cards) {
      let target = assignments.find(item => item.name === (card.name || '') && item.cardIds.length < 2);
      if (!target && assignments.length < 25) {
        target = { id: crypto.randomUUID?.() || Math.random().toString(36), name: card.name || `Jugador ${assignments.length + 1}`, cardIds: [] };
        assignments.push(target);
      }
      if (!target) target = assignments.find(item => item.cardIds.length < 2);
      if (target) target.cardIds.push(card.id);
    }
    return assignments;
  }

  renderSetup(body) {
    if (!this.assignments.length) this.assignments = this.defaultAssignments();
    body.innerHTML = `
      <div class="localIntro">
        <div class="localNotice"><b>Cómo funciona:</b> vos administrás desde esta dirección y los jugadores entran desde cualquier lugar usando internet y su código privado.</div>
        <div class="localGrid2">
          <div class="localCardBox"><h3>Partida actual</h3><div>Juego ${String(this.app.game.number).padStart(4, '0')} · Bingo ${this.app.game.mode}</div><div>${this.app.game.cards.length} cartones · Máximo 25 jugadores · 2 cartones por jugador</div></div>
          <div class="localCardBox"><h3>Antes de abrir</h3><div>Asigná todos los cartones. El servidor generará un código privado distinto para cada jugador.</div></div>
        </div>
        <div class="localCardBox"><h3>Jugadores y cartones</h3><div id="localPlayersEditor" class="localPlayersEditor"></div><div id="localSetupError"></div><div class="localToolbar"><button class="localSecondary" id="localAddPlayer">+ AGREGAR JUGADOR</button><button class="localSecondary" id="localRestoreBrowser">RESTAURAR ÚLTIMA COPIA</button><button class="localSecondary" id="localRestoreFile">RESTAURAR ARCHIVO</button><button class="localPrimary" id="localOpenRoom">ABRIR SALA ONLINE</button></div></div>
      </div>`;
    this.renderAssignmentRows();
    $('localAddPlayer').onclick = () => {
      if (this.assignments.length >= 25) { alert('El máximo es de 25 jugadores.'); return; }
      this.assignments.push({ id: Math.random().toString(36), name: `Jugador ${this.assignments.length + 1}`, cardIds: [] });
      this.renderAssignmentRows();
    };
    $('localOpenRoom').onclick = () => this.openRoom();
    $('localRestoreBrowser').onclick = () => this.restoreBrowserBackup();
    $('localRestoreFile').onclick = () => $('localBackupFile').click();
  }

  renderAssignmentRows() {
    const host = $('localPlayersEditor');
    if (!host) return;
    host.innerHTML = '';
    const options = selected => `<option value="">Sin cartón</option>${this.app.game.cards.map(card => `<option value="${esc(card.id)}" ${selected === card.id ? 'selected' : ''}>Cartón ${esc(card.number)} · ${esc(card.name)}</option>`).join('')}`;
    this.assignments.forEach((assignment, index) => {
      const row = document.createElement('div');
      row.className = 'localPlayerRow';
      row.innerHTML = `<input class="localName" value="${esc(assignment.name)}" placeholder="Nombre o alias"><select class="localCard1">${options(assignment.cardIds[0])}</select><select class="localCard2">${options(assignment.cardIds[1])}</select><button>ELIMINAR</button>`;
      row.querySelector('.localName').oninput = event => { assignment.name = event.target.value; };
      row.querySelector('.localCard1').onchange = event => { assignment.cardIds[0] = event.target.value; assignment.cardIds = assignment.cardIds.filter(Boolean); };
      row.querySelector('.localCard2').onchange = event => {
        if (assignment.cardIds.length < 1) assignment.cardIds[0] = '';
        assignment.cardIds[1] = event.target.value;
        assignment.cardIds = assignment.cardIds.filter(Boolean);
      };
      row.querySelector('button').onclick = () => { this.assignments.splice(index, 1); this.renderAssignmentRows(); };
      host.appendChild(row);
    });
  }

  validateAssignments() {
    const cleaned = this.assignments.map(item => ({ name: item.name.trim(), cardIds: [...new Set(item.cardIds.filter(Boolean))] })).filter(item => item.name || item.cardIds.length);
    if (!cleaned.length) throw new Error('Agregá al menos un jugador.');
    if (cleaned.length > 25) throw new Error('La sala admite como máximo 25 jugadores.');
    const used = new Set();
    for (const player of cleaned) {
      if (!player.name) throw new Error('Todos los jugadores deben tener nombre o alias.');
      if (player.cardIds.length < 1 || player.cardIds.length > 2) throw new Error(`${player.name} debe tener uno o dos cartones.`);
      for (const cardId of player.cardIds) {
        if (used.has(cardId)) throw new Error('Un mismo cartón está asignado a dos jugadores.');
        used.add(cardId);
      }
    }
    if (used.size !== this.app.game.cards.length) throw new Error('Todos los cartones deben estar asignados una sola vez.');
    return cleaned;
  }

  serializeGame() {
    return JSON.parse(JSON.stringify({ ...this.app.game, phase: this.app.phase }));
  }

  async openRoom() {
    const errorBox = $('localSetupError');
    try {
      errorBox.innerHTML = '';
      const players = this.validateAssignments();
      const data = await this.request('/api/admin/configure', { method: 'POST', body: JSON.stringify({ game: this.serializeGame(), players }) });
      this.applyState(data);
      this.renderMainModal();
    } catch (error) {
      errorBox.innerHTML = `<div class="localError">${esc(error.message)}</div>`;
    }
  }

  renderLive(body) {
    const data = this.serverState;
    const connectedCount = (data.players || []).filter(player => player.connected).length;
    const lineAlerts = (data.cardStatus || []).filter(card => card.hasLine && card.lineClaim === 'none').length;
    const bingoAlerts = (data.cardStatus || []).filter(card => card.hasBingo && card.bingoClaim === 'none').length;
    const playerUrl = data.playerUrl || `${location.origin}/jugador`;
    body.innerHTML = `
      <div class="localNotice localSuccess"><b>Sala ${esc(data.roomCode)} abierta en internet.</b> Mantené esta pestaña abierta durante la partida.</div>
      <div class="localSummary">
        <div class="localMetric"><b>${connectedCount}</b><span>jugadores conectados</span></div>
        <div class="localMetric"><b>${data.cardStatus?.length || 0}</b><span>cartones controlados</span></div>
        <div class="localMetric"><b>${lineAlerts}</b><span>líneas sin cantar</span></div>
        <div class="localMetric"><b>${bingoAlerts}</b><span>bingos sin cantar</span></div>
      </div>
      <div class="localGrid2">
        <div class="localCardBox"><h3>Dirección para celulares</h3><div class="localUrl">${esc(playerUrl)}</div><small>Compartí este enlace con los jugadores. Cada uno entra con su código privado.</small></div>
        <div class="localCardBox"><h3>Código de sala</h3><div class="localUrl">${esc(data.roomCode)}</div><small>El código privado de cada jugador aparece abajo.</small></div>
      </div>
      <div class="localCardBox" style="margin-top:14px"><h3>Códigos privados</h3><table class="localCodes"><thead><tr><th>Jugador</th><th>Cartones</th><th>Código</th><th>Estado</th></tr></thead><tbody>${(data.players || []).map(player => `<tr><td>${esc(player.name)}</td><td>${player.cardIds.map(id => `#${esc(data.game.cards.find(card => card.id === id)?.number || '?')}`).join(' · ')}</td><td class="localCode">${esc(player.code)}</td><td><span class="localStatus ${player.connected ? 'on' : 'off'}">${player.connected ? 'CONECTADO' : 'SIN CONEXIÓN'}</span></td></tr>`).join('')}</tbody></table></div>
      <div class="localCardBox" style="margin-top:14px"><h3>Control de todos los cartones</h3><div class="localMonitorWrap">${this.monitorTable(data.cardStatus || [])}</div></div>
      <div class="localToolbar"><button class="localSecondary" id="localCopyLink">COPIAR ENLACE</button><button class="localSecondary" id="localDownloadBackup">DESCARGAR COPIA</button><button class="localSecondary" id="localRestoreFile">RESTAURAR ARCHIVO</button><button class="localSecondary" id="localRefresh">ACTUALIZAR</button><button class="localDanger" id="localCloseRoom">CERRAR SALA</button></div>`;
    $('localCopyLink').onclick = async () => { try { await navigator.clipboard.writeText(playerUrl); alert('Enlace copiado.'); } catch { prompt('Copiá este enlace:', playerUrl); } };
    $('localDownloadBackup').onclick = () => this.downloadBackup();
    $('localRestoreFile').onclick = () => $('localBackupFile').click();
    $('localRefresh').onclick = () => this.refreshState().catch(error => alert(error.message));
    $('localCloseRoom').onclick = () => this.closeRoom();
    body.querySelectorAll('[data-card-detail]').forEach(button => button.onclick = () => this.openCardDetail(button.dataset.cardDetail));
  }

  monitorTable(cards) {
    const sorted = [...cards].sort((a, b) => Number(b.hasBingo) - Number(a.hasBingo) || Number(b.hasLine) - Number(a.hasLine) || a.bingoMissing - b.bingoMissing || a.lineMissing - b.lineMissing);
    return `<table class="localMonitor"><thead><tr><th>Jugador</th><th>Cartón</th><th>Conexión</th><th>Falta línea</th><th>Falta bingo</th><th>Marcas jugador</th><th>Diferencias</th><th></th></tr></thead><tbody>${sorted.map(card => {
      const rowClass = card.hasBingo && card.bingoClaim === 'none' ? 'alertBingo' : card.hasLine && card.lineClaim === 'none' ? 'alertLine' : '';
      const prize = card.hasBingo ? '<span class="localStatus danger">BINGO SIN CANTAR</span>' : card.hasLine ? '<span class="localStatus warn">LÍNEA SIN CANTAR</span>' : '';
      return `<tr class="${rowClass}"><td><b>${esc(card.playerName)}</b><br>${prize}</td><td>#${esc(card.cardNumber)}</td><td><span class="localStatus ${card.connected ? 'on' : 'off'}">${card.connected ? 'Sí' : 'No'}</span></td><td><b>${card.lineMissing}</b></td><td><b>${card.bingoMissing}</b></td><td>${card.playerMarkedCount}/${card.totalNumbers}</td><td>${card.missed.length ? `Olvidó: ${card.missed.join(', ')}` : ''}${card.wrong.length ? `${card.missed.length ? '<br>' : ''}Mal marcados: ${card.wrong.join(', ')}` : (!card.missed.length ? 'Sin diferencias' : '')}</td><td><button data-card-detail="${esc(card.cardId)}">VER</button></td></tr>`;
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
    this.app.setPhase(window.BingoV8Engine.PHASE.PAUSED);
    this.app.game = this.app.store.save(this.app.game);
    this.app.showScreen('game');
    this.app.applyTheme(this.app.game.theme || 'clasico');
    this.app.renderGame();
  }

  async closeRoom() {
    if (!confirm('¿Cerrar la sala online? Los celulares perderán el acceso.')) return;
    await this.request('/api/admin/close', { method: 'POST', body: '{}' });
    this.active = false;
    this.serverState = { active: false };
    this.assignments = [];
    this.renderMainModal();
  }

  scheduleSync() {
    if (!this.active || !this.app.game) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.syncGame(), 80);
  }

  async syncGame() {
    if (!this.active || !this.app.game) return;
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

  showNextClaim() {
    if (this.currentClaim) {
      $('localClaimModal').classList.add('show');
      return;
    }
    const claim = this.claimQueue.shift();
    if (!claim) { this.updateClaimBadge(); return; }
    this.currentClaim = claim;
    this.claimOpen = true;
    this.app.stopAutomatic(false);
    this.app.setPhase(window.BingoV8Engine.PHASE.PAUSED);
    this.app.renderAutoControls();
    const card = this.serverState?.game?.cards?.find(item => item.id === claim.cardId);
    $('localClaimTitle').textContent = `${claim.type === 'line' ? 'LÍNEA' : 'BINGO'} CANTADO`;
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
      await this.request('/api/admin/resolve', { method: 'POST', body: JSON.stringify({ claimId: claim.id, resolution }) });
      if (resolution === 'confirmed') this.applyConfirmedPrize(claim);
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
    prize.status = 'confirmed';
    if (!prize.winners.some(winner => winner.cardId === card.id)) {
      prize.winners.push({
        cardId: card.id,
        name: claim.playerName,
        number: card.number,
        ball: this.app.game.drawn.at(-1),
        details: claim.comparison.completeLines || [],
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
    if (version) version.textContent = 'V10 ONLINE';
    new LocalRoomAdmin(app).init().catch(error => console.error('No se inició la sala online:', error));
  }, 0);
});

})();
