'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const port = 52500 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-alfa-core-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    PORT: String(port),
    BINGO_TEST_MODE: 'true',
    BINGO_DATA_DIR: dataDir,
    BINGO_START_SEQUENCE_MS: '100',
    BINGO_CLAIM_WINDOW_MS: '200',
    BINGO_CLAIM_AUTO_VERIFY_MS: '600'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function waitServer() {
  for (let i = 0; i < 100; i++) {
    try { const out = await request('/api/ping'); if (out.response.ok) return; } catch {}
    await wait(40);
  }
  throw new Error('Servidor ALFA no disponible.');
}
function jsonHeaders(extra = {}) { return { 'Content-Type': 'application/json', ...extra }; }
async function post(url, body, headers = {}) {
  const out = await request(url, { method: 'POST', headers: jsonHeaders(headers), body: JSON.stringify(body || {}) });
  assert.equal(out.response.status, 200, `${url}: ${JSON.stringify(out.data)}`);
  return out.data;
}
async function get(url, headers = {}) {
  const out = await request(url, { headers });
  assert.equal(out.response.status, 200, `${url}: ${JSON.stringify(out.data)}`);
  return out.data;
}

(async () => {
  try {
    await waitServer();
    const login = await post('/api/admin/login', {});
    const adminHeaders = { 'X-Admin-Token': login.token };

    // 1) Sala gratis: clave compartida + sesiones privadas + cartones exclusivos.
    let state = await post('/api/admin/create-simple-room', {
      mode: 75, cardCount: 100, autoSeconds: 60,
      rules: { line: true, corners: true, bingo: true },
      paymentMode: 'free', markingMode: 'normal', accessKey: 'ALFAFREE', maxCardsPerPlayer: 4
    }, adminHeaders);
    assert.equal(state.roomSettings.accessKey, 'ALFAFREE');
    assert.equal(state.roomSettings.paymentMode, 'free');
    assert.match(state.joinUrl, /sala=/);
    assert.match(state.joinUrl, /directo=1/);
    assert.equal(state.roomSettings.linePrizeCount, 1);

    const ana = await post('/api/player/alpha-join', { accessKey: 'ALFAFREE', name: 'Ana', cardCount: 2, deviceId: 'alfa-ana' });
    const beto = await post('/api/player/alpha-join', { accessKey: 'ALFAFREE', name: 'Beto', cardCount: 2, deviceId: 'alfa-beto' });
    const ciro = await post('/api/player/open-join', { roomCode: state.roomCode, name: 'Ciro', cardCount: 1, deviceId: 'alfa-ciro' });
    assert.equal(ciro.state.player.name, 'Ciro', 'El enlace directo debe permitir entrar sin escribir la clave.');
    assert.notEqual(ana.token, beto.token, 'Dos jugadores con la misma clave deben tener sesiones privadas distintas.');
    assert.equal(ana.state.player.paymentStatus, 'not_required');
    const anaHeaders = { 'X-Player-Token': ana.token };
    const betoHeaders = { 'X-Player-Token': beto.token };
    const anaCards = ana.state.player.offeredCards.slice(0, 2).map(card => card.id);
    let playerState = await post('/api/player/choose', { cardIds: anaCards, name: 'Ana' }, anaHeaders);
    assert.equal(playerState.player.selectionConfirmed, true);
    playerState = await get('/api/player/state', betoHeaders);
    const betoCards = playerState.player.offeredCards.slice(0, 2).map(card => card.id);
    assert.equal(anaCards.some(id => betoCards.includes(id)), false, 'Un cartón confirmado no puede seguir disponible para otro jugador.');
    await post('/api/player/choose', { cardIds: betoCards, name: 'Beto' }, betoHeaders);
    playerState = await post('/api/player/automark', { enabled: true }, anaHeaders);
    assert.equal(playerState.player.autoMark, true);

    // Recuperación con token privado, independiente de la clave compartida.
    state = await get('/api/admin/state', adminHeaders);
    const anaAdmin = state.players.find(player => player.name === 'Ana');
    const recoveryLink = await post('/api/admin/player-recovery-link', { playerId: anaAdmin.id }, adminHeaders);
    const recoveryToken = new URL(recoveryLink.url).searchParams.get('recuperar');
    assert(recoveryToken);
    const recovered = await post('/api/player/recover', { recoveryToken, deviceId: 'alfa-ana-segundo' });
    assert.equal(recovered.state.player.name, 'Ana');
    assert.equal(recovered.state.player.cards.length, 2);
    const reused = await request('/api/player/recover', { method:'POST', headers:jsonHeaders(), body:JSON.stringify({ recoveryToken, deviceId:'alfa-ana-tercero' }) });
    assert.notEqual(reused.response.status, 200, 'El link de recuperación debe ser de un solo uso.');
    await post('/api/admin/close', {}, adminHeaders);

    // 2) Sala paga: no hay cartones antes del OK; admin ajusta cantidad y confirma.
    state = await post('/api/admin/create-simple-room', {
      mode: 90, cardCount: 120, autoSeconds: 60,
      rules: { line: true, bingo: true }, paymentMode: 'paid', markingMode: 'normal',
      accessKey: 'ALFAPAGA', maxCardsPerPlayer: 4, cardPrice: 1000, whatsapp: '3757624388', linePrizeCount: 1
    }, adminHeaders);
    assert.equal(state.roomSettings.linePrizeCount, 1, 'Bingo 90 debe permitir una sola línea.');
    const carla = await post('/api/player/alpha-join', { accessKey: 'ALFAPAGA', name: 'Carla', cardCount: 4, deviceId: 'alfa-carla' });
    const carlaHeaders = { 'X-Player-Token': carla.token };
    assert.equal(carla.state.player.paymentStatus, 'pending');
    assert.equal(carla.state.player.offeredCards.length, 0, 'No debe elegir cartones antes de confirmar el pago.');
    let denied = await request('/api/player/renew-offers', { method: 'POST', headers: jsonHeaders(carlaHeaders), body: '{}' });
    assert.equal(denied.response.status, 400);
    state = await get('/api/admin/state', adminHeaders);
    const carlaAdmin = state.players.find(player => player.name === 'Carla');
    assert.equal(carlaAdmin.requestedCardCount, 4);
    state = await post('/api/admin/player-approval', { playerId: carlaAdmin.id, allowedCardCount: 2, confirmPayment: true }, adminHeaders);
    const carlaApproved = state.players.find(player => player.id === carlaAdmin.id);
    assert.equal(carlaApproved.allowedCardCount, 2);
    assert.equal(carlaApproved.paymentStatus, 'confirmed');
    playerState = await get('/api/player/state', carlaHeaders);
    assert.equal(playerState.player.allowedCardCount, 2);
    assert(playerState.player.offeredCards.length >= 2);
    await post('/api/player/choose', { cardIds: playerState.player.offeredCards.slice(0, 2).map(card => card.id), name: 'Carla' }, carlaHeaders);
    await post('/api/admin/close', {}, adminHeaders);

    // 3) Solo Manual: tope absoluto de 2 cartones y Automarcado bloqueado.
    await post('/api/admin/create-simple-room', {
      mode: 75, cardCount: 60, autoSeconds: 60, rules: { line: true, bingo: true },
      paymentMode: 'free', markingMode: 'manual_only', accessKey: 'MANUAL2', maxCardsPerPlayer: 4
    }, adminHeaders);
    const diego = await post('/api/player/alpha-join', { accessKey: 'MANUAL2', name: 'Diego', cardCount: 4, deviceId: 'alfa-diego' });
    const diegoHeaders = { 'X-Player-Token': diego.token };
    assert.equal(diego.state.player.allowedCardCount, 2);
    playerState = await post('/api/player/choose', { cardIds: diego.state.player.offeredCards.slice(0, 2).map(card => card.id), name: 'Diego' }, diegoHeaders);
    assert.equal(playerState.player.markingModeChosen, true);
    assert.equal(playerState.player.autoMark, false);
    denied = await request('/api/player/automark', { method: 'POST', headers: jsonHeaders(diegoHeaders), body: JSON.stringify({ enabled: true }) });
    assert.equal(denied.response.status, 400);

    // 4) Moderación: bloquear y ocultar el mensaje en una sola acción.
    await post('/api/player/chat', { text: 'mensaje indebido de prueba' }, diegoHeaders);
    state = await get('/api/admin/state', adminHeaders);
    const badMessage = [...state.chat.messages].reverse().find(message => message.playerId === diego.state.player.id);
    assert(badMessage);
    state = await post('/api/admin/chat/moderate', { action: 'mute', playerId: diego.state.player.id, messageId: badMessage.id }, adminHeaders);
    assert(state.chat.mutedPlayerIds.includes(diego.state.player.id));
    assert.equal(state.chat.messages.some(message => message.id === badMessage.id), false);

    // 5) Visor: sesión read-only.
    const preview = await post('/api/admin/player-view-session', { playerId: diego.state.player.id }, adminHeaders);
    assert.equal(preview.readOnly, true);
    const previewState = await get(`/api/admin-player-preview/state?token=${encodeURIComponent(preview.token)}`);
    assert.equal(previewState.adminPreview, true);
    denied = await request(`/api/player/automark?token=${encodeURIComponent(preview.token)}`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ enabled: true }) });
    assert.equal(denied.response.status, 403);
    await post('/api/admin/close', {}, adminHeaders);

    // 6) Reclamo automático: en producción son 10 s; aquí se acelera a 600 ms.
    await post('/api/admin/create-simple-room', {
      mode: 90, cardCount: 60, autoSeconds: 60, rules: { line: true, bingo: true },
      paymentMode: 'free', markingMode: 'normal', accessKey: 'CLAIM90', maxCardsPerPlayer: 1, linePrizeCount: 1
    }, adminHeaders);
    const linePlayer = await post('/api/player/alpha-join', { accessKey: 'CLAIM90', name: 'Linea', cardCount: 1, deviceId: 'alfa-linea' });
    const lineHeaders = { 'X-Player-Token': linePlayer.token };
    const lineCard = linePlayer.state.player.offeredCards[0];
    await post('/api/player/choose', { cardIds: [lineCard.id], name: 'Linea' }, lineHeaders);
    await post('/api/player/automark', { enabled: false }, lineHeaders);
    const lineNumbers = lineCard.grid[0].filter(Number.isFinite);
    await post('/api/admin/test/draw-order', { sequence: lineNumbers }, adminHeaders);
    await post('/api/admin/start', {}, adminHeaders);
    await wait(220);
    for (const _ of lineNumbers) await post('/api/admin/draw', { source: 'alfa-test' }, adminHeaders);
    const claim = await post('/api/player/claim', { type: 'line', cardId: lineCard.id }, lineHeaders);
    assert.equal(claim.officialValid, true);
    await wait(900);
    state = await get('/api/admin/state', adminHeaders);
    const resolved = state.claims.find(item => item.id === claim.id);
    assert.equal(resolved.status, 'confirmed');
    assert.equal(resolved.resolutionReason, 'automatic_verified');
    await post('/api/admin/close', {}, adminHeaders);

    // 7) Línea 2 no nace antes de resolver Línea 1.
    await post('/api/admin/create-simple-room', {
      mode: 90, cardCount: 90, autoSeconds: 60, rules: { line: true, bingo: true },
      paymentMode: 'free', markingMode: 'normal', accessKey: 'LINESEQ', maxCardsPerPlayer: 1, linePrizeCount: 2
    }, adminHeaders);
    state = await get('/api/admin/state', adminHeaders);
    assert.equal(state.roomSettings.linePrizeCount, 2, 'Bingo 90 debe permitir dos líneas.');
    const linePlayers = [];
    for (const [name, deviceId] of [['Uno', 'alfa-u'], ['Dos', 'alfa-d']]) {
      const entry = await post('/api/player/alpha-join', { accessKey: 'LINESEQ', name, cardCount: 1, deviceId });
      const headers = { 'X-Player-Token': entry.token };
      const card = entry.state.player.offeredCards[0];
      await post('/api/player/choose', { cardIds: [card.id], name }, headers);
      await post('/api/player/automark', { enabled: false }, headers);
      linePlayers.push({ entry, headers, card });
    }
    const sequence = [];
    for (const item of linePlayers) for (const number of item.card.grid[0].filter(Number.isFinite)) if (!sequence.includes(number)) sequence.push(number);
    await post('/api/admin/test/draw-order', { sequence }, adminHeaders);
    await post('/api/admin/start', {}, adminHeaders);
    await wait(220);
    for (const _ of sequence) await post('/api/admin/draw', { source: 'alfa-test' }, adminHeaders);
    const firstClaim = await post('/api/player/claim', { type: 'line', cardId: linePlayers[0].card.id }, linePlayers[0].headers);
    const secondClaim = await post('/api/player/claim', { type: 'line', cardId: linePlayers[1].card.id }, linePlayers[1].headers);
    assert.equal(firstClaim.prizeNumber, 1);
    assert.equal(secondClaim.prizeNumber, 1, 'Un reclamo simultáneo no puede convertirse en Línea 2 antes de adjudicar Línea 1.');
    await wait(900);
    state = await get('/api/admin/state', adminHeaders);
    const c1 = state.claims.find(item => item.id === firstClaim.id);
    const c2 = state.claims.find(item => item.id === secondClaim.id);
    assert.equal(c1.status, 'confirmed');
    assert.equal(c1.prizeNumber, 1);
    assert.equal(c2.status, 'rejected');
    assert.equal(c2.resolutionReason, 'valid_but_received_later');
    assert.equal(c2.prizeNumber, 1);
    assert.equal(state.prizeStatus.line.nextNumber, 2);
    await post('/api/admin/close', {}, adminHeaders);

    // 8) Flujo completo de acceso directo hasta INICIAR PARTIDA.
    state = await post('/api/admin/create-simple-room', {
      mode: 90, cardCount: 60, autoSeconds: 60, rules: { line: true, bingo: true },
      paymentMode: 'free', markingMode: 'manual_only', accessKey: 'ARRANQUE', maxCardsPerPlayer: 2, linePrizeCount: 1
    }, adminHeaders);
    const direct = await post('/api/player/open-join', { roomCode: state.roomCode, name: 'Prueba Inicio', cardCount: 1, deviceId: 'alfa-start-direct' });
    const directHeaders = { 'X-Player-Token': direct.token };
    await post('/api/player/choose', { cardIds: [direct.state.player.offeredCards[0].id], name: 'Prueba Inicio' }, directHeaders);
    state = await get('/api/admin/state', adminHeaders);
    assert.equal(state.preflight.ok, true, `La partida debería estar lista: ${JSON.stringify(state.preflight.errors)}`);
    state = await post('/api/admin/start', {}, adminHeaders);
    assert(['starting','playing'].includes(state.status), 'El administrador debe poder iniciar una sala creada con acceso directo.');

    console.log('PRUEBA ALFA CORE: OK');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
