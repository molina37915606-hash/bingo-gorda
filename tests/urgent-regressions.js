'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const port = 49000 + Math.floor(Math.random() * 800);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-urgent-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    PORT: String(port),
    BINGO_TEST_MODE: 'true',
    BINGO_DATA_DIR: dataDir,
    BINGO_START_SEQUENCE_MS: '100',
    BINGO_RESUME_SEQUENCE_MS: '100',
    BINGO_CLAIM_WINDOW_MS: '150',
    BINGO_FINAL_BALLS_SEQUENCE_MS: '250',
    BINGO_FINAL_CLAIM_GRACE_MS: '1200'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

async function json(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitServer() {
  for (let i = 0; i < 100; i++) {
    try { const x = await json('/healthz'); if (x.response.ok) return; } catch {}
    await wait(50);
  }
  throw new Error('El servidor no inició.');
}
function headers(token, kind = 'admin') {
  return { 'Content-Type': 'application/json', [kind === 'admin' ? 'X-Admin-Token' : 'X-Player-Token']: token };
}
async function createOfficialRoom(admin, mode = 90, players = ['A', 'B']) {
  let out = await json('/api/admin/create-simple-room', { method: 'POST', headers: headers(admin), body: JSON.stringify({ roomType: 'official', mode, cardCount: 40, rules: { line: true, bingo: true } }) });
  assert.equal(out.response.status, 200, JSON.stringify(out.data));
  const roomCode = out.data.roomCode;
  const joined = [];
  for (const name of players) {
    const added = await json('/api/admin/add-official-player', { method: 'POST', headers: headers(admin), body: JSON.stringify({ name, cardCount: 1 }) });
    assert.equal(added.response.status, 200, JSON.stringify(added.data));
    const login = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomCode, code: added.data.player.code, deviceId: `dev-${name}-${Math.random()}` }) });
    assert.equal(login.response.status, 200, JSON.stringify(login.data));
    joined.push(login.data);
  }
  const state = (await json('/api/admin/state', { headers: headers(admin) })).data;
  return { roomCode, joined, state };
}
function cardFor(state, playerName) {
  const player = state.players.find(item => item.name === playerName);
  assert(player, `Falta jugador ${playerName}`);
  const card = state.game.cards.find(item => item.id === player.cardIds[0]);
  assert(card, `Falta cartón de ${playerName}`);
  return card;
}
function rowNumbers(card, row = 0) { return card.grid[row].filter(Number.isFinite); }
function cardNumbers(card) { return card.grid.flat().filter(Number.isFinite); }
async function setOrderAndStart(admin, sequence) {
  let out = await json('/api/admin/test/draw-order', { method: 'POST', headers: headers(admin), body: JSON.stringify({ sequence }) });
  assert.equal(out.response.status, 200, JSON.stringify(out.data));
  out = await json('/api/admin/start', { method: 'POST', headers: headers(admin), body: '{}' });
  assert.equal(out.response.status, 200, JSON.stringify(out.data));
  await wait(130);
}
async function drawMany(admin, count) {
  let out;
  for (let i = 0; i < count; i++) {
    out = await json('/api/admin/draw', { method: 'POST', headers: headers(admin), body: JSON.stringify({ source: 'regression' }) });
    assert.equal(out.response.status, 200, `Bolilla ${i + 1}: ${JSON.stringify(out.data)}`);
  }
  return out.data;
}

(async () => {
  try {
    await waitServer();
    const login = await json('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(login.response.status, 200, JSON.stringify(login.data));
    const admin = login.data.token;

    // 1) Dos líneas válidas en la misma ventana deben ocupar Primera y Segunda línea.
    let room = await createOfficialRoom(admin, 90, ['Linea A', 'Linea B']);
    let cardA = cardFor(room.state, 'Linea A');
    let cardB = cardFor(room.state, 'Linea B');
    const lineSequence = [...new Set([...rowNumbers(cardA), ...rowNumbers(cardB)])];
    await setOrderAndStart(admin, lineSequence);
    await drawMany(admin, lineSequence.length);
    let claimA = await json('/api/player/claim', { method: 'POST', headers: headers(room.joined[0].token, 'player'), body: JSON.stringify({ cardId: cardA.id, type: 'line' }) });
    assert.equal(claimA.response.status, 200, JSON.stringify(claimA.data));
    let claimB = await json('/api/player/claim', { method: 'POST', headers: headers(room.joined[1].token, 'player'), body: JSON.stringify({ cardId: cardB.id, type: 'line' }) });
    assert.equal(claimB.response.status, 200, JSON.stringify(claimB.data));
    // Una recarga/reconexión durante la ventana debe reconstruir el reclamo desde el estado persistido.
    let reconnectAdmin = (await json('/api/admin/state', { headers: headers(admin) })).data;
    let reconnectPlayer = (await json('/api/player/state', { headers: headers(room.joined[1].token, 'player') })).data;
    assert.equal(reconnectAdmin.status, 'verifying');
    assert(reconnectAdmin.claims.some(item => item.id === claimB.data.id && item.status === 'pending'), 'El administrador debe recuperar el reclamo pendiente al reconectar.');
    assert.equal(reconnectPlayer.status, 'verifying');
    assert.equal(reconnectPlayer.claimWindow?.id, claimB.data.claimWindowId, 'El jugador debe recuperar la ventana de reclamo al reconectar.');
    await wait(180);
    let resolved = await json('/api/admin/resolve', { method: 'POST', headers: headers(admin), body: JSON.stringify({ claimId: claimA.data.id, resolution: 'confirmed' }) });
    assert.equal(resolved.response.status, 200, JSON.stringify(resolved.data));
    let adminState = (await json('/api/admin/state', { headers: headers(admin) })).data;
    const pendingSecond = adminState.claims.find(item => item.id === claimB.data.id);
    assert.equal(pendingSecond.status, 'pending', 'El segundo reclamo válido no debe rechazarse al confirmar la Primera línea.');
    assert.equal(pendingSecond.prizeNumber, 2, 'El segundo reclamo debe convertirse en Segunda línea.');
    reconnectPlayer = (await json('/api/player/state', { headers: headers(room.joined[1].token, 'player') })).data;
    assert.equal(reconnectPlayer.status, 'verifying');
    assert.equal(reconnectPlayer.prizeStatus.line.awarded, 1);
    assert.equal(reconnectPlayer.prizeStatus.line.remaining, 1, 'Tras reconectar debe conservarse que falta adjudicar la Segunda línea.');
    resolved = await json('/api/admin/resolve', { method: 'POST', headers: headers(admin), body: JSON.stringify({ claimId: claimB.data.id, resolution: 'confirmed' }) });
    assert.equal(resolved.response.status, 200, JSON.stringify(resolved.data));
    adminState = (await json('/api/admin/state', { headers: headers(admin) })).data;
    assert.equal(adminState.prizeStatus.line.awarded, 2);
    assert.equal(adminState.prizeStatus.line.closed, true);

    await json('/api/admin/new-room', { method: 'POST', headers: headers(admin), body: '{}' });

    // 2) Línea y Bingo de la misma bolilla deben poder registrarse en una única ventana.
    room = await createOfficialRoom(admin, 90, ['Linea C', 'Bingo D']);
    cardA = cardFor(room.state, 'Linea C');
    cardB = cardFor(room.state, 'Bingo D');
    const mixedSequence = [...new Set([...cardNumbers(cardB), ...rowNumbers(cardA)])];
    await setOrderAndStart(admin, mixedSequence);
    await drawMany(admin, mixedSequence.length);
    claimA = await json('/api/player/claim', { method: 'POST', headers: headers(room.joined[0].token, 'player'), body: JSON.stringify({ cardId: cardA.id, type: 'line' }) });
    assert.equal(claimA.response.status, 200, JSON.stringify(claimA.data));
    claimB = await json('/api/player/claim', { method: 'POST', headers: headers(room.joined[1].token, 'player'), body: JSON.stringify({ cardId: cardB.id, type: 'bingo' }) });
    assert.equal(claimB.response.status, 200, 'Bingo no debe quedar bloqueado por una Línea de la misma bolilla.');
    assert.equal(claimA.data.claimWindowId, claimB.data.claimWindowId, 'Ambos premios deben compartir la ventana de la misma bolilla.');
    await wait(180);
    resolved = await json('/api/admin/resolve', { method: 'POST', headers: headers(admin), body: JSON.stringify({ claimId: claimA.data.id, resolution: 'confirmed' }) });
    assert.equal(resolved.response.status, 200, JSON.stringify(resolved.data));
    resolved = await json('/api/admin/resolve', { method: 'POST', headers: headers(admin), body: JSON.stringify({ claimId: claimB.data.id, resolution: 'confirmed' }) });
    assert.equal(resolved.response.status, 200, JSON.stringify(resolved.data));
    adminState = (await json('/api/admin/state', { headers: headers(admin) })).data;
    assert.equal(adminState.status, 'finalizing', 'Al resolver el último reclamo debe respetarse el Bingo ya confirmado.');

    await json('/api/admin/new-room', { method: 'POST', headers: headers(admin), body: '{}' });

    // 3) La bolilla 90 no puede cerrar antes de que el jugador tenga oportunidad de cantar Bingo.
    room = await createOfficialRoom(admin, 90, ['Final E']);
    cardA = cardFor(room.state, 'Final E');
    const lastNumber = cardNumbers(cardA)[0];
    const fullOrder = Array.from({ length: 90 }, (_, index) => index + 1).filter(number => number !== lastNumber).concat(lastNumber);
    await setOrderAndStart(admin, fullOrder);
    const finalDrawState = await drawMany(admin, 90);
    assert.equal(finalDrawState.status, 'playing', 'La última bolilla debe abrir una ventana final, no finalizar instantáneamente.');
    assert.equal(finalDrawState.game.phase, 'FINAL_CLAIM_WINDOW');
    const finalClaim = await json('/api/player/claim', { method: 'POST', headers: headers(room.joined[0].token, 'player'), body: JSON.stringify({ cardId: cardA.id, type: 'bingo' }) });
    assert.equal(finalClaim.response.status, 200, JSON.stringify(finalClaim.data));
    await wait(180);
    resolved = await json('/api/admin/resolve', { method: 'POST', headers: headers(admin), body: JSON.stringify({ claimId: finalClaim.data.id, resolution: 'confirmed' }) });
    assert.equal(resolved.response.status, 200, JSON.stringify(resolved.data));

    // 4) Guardas estáticas de los dos arreglos de interfaz/sesión más urgentes.
    const playerJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'online-room-player.js'), 'utf8');
    const playerHtml = fs.readFileSync(path.join(__dirname, '..', 'jugador.html'), 'utf8');
    assert(playerJs.includes("bingoOnlineRoom"), 'La sesión debe quedar asociada al código de sala.');
    assert(playerJs.includes('this.tokenRoom !== roomCode'), 'Un token de otra sala no debe reanudarse sobre un enlace nuevo.');
    assert(playerHtml.includes('desktopTickets') && playerHtml.includes('@media(min-width:1100px)'), 'Escritorio debe tener grilla multi-cartón.');
    assert(playerHtml.includes('repeat(2,minmax(0,520px))'), 'Los cartones de escritorio deben conservar un ancho máximo fijo.');
    assert(playerHtml.includes('.ticketInstance:last-child:nth-child(odd){grid-column:1/-1;justify-self:center}'), 'Un cartón solo o el tercero deben centrarse sin estirarse.');
    assert(playerJs.includes('@media(min-width:1100px)') && playerJs.includes('.playerLogged .playerChatDock'), 'El chat debe quedar lateral en escritorio.');
    assert(playerJs.includes("await this.request('/api/player/state')") && playerJs.includes('reconnectRefreshTimer'), 'El jugador debe recuperar el estado completo después de una reconexión.');
    const adminJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-simplificado.js'), 'utf8');
    assert(adminJs.includes('this.reconnectTimer') && adminJs.includes('await this.refresh()'), 'El administrador debe recuperar el estado completo al reconectar.');
    assert(adminJs.includes("await this.req('/api/admin/resolve'") && adminJs.includes('});await this.refresh()'), 'Después de resolver un premio el panel debe refrescar el estado completo.');

    console.log('PRUEBAS URGENTES DE REGRESIÓN: OK');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
