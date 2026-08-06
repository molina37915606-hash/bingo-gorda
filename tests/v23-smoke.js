'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const port = 47000 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-v23-'));
const password = 'clave-prueba-2.3';
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    ONLINE_MODE: 'true',
    MASTER_ADMIN_PASSWORD: password,
    PUBLIC_URL: base,
    BINGO_DATA_DIR: dataDir,
    BINGO_START_SEQUENCE_MS: '120',
    BINGO_RESUME_SEQUENCE_MS: '120',
    BINGO_FINAL_BALLS_SEQUENCE_MS: '180'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function json(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(base + '/healthz')).ok) return; } catch {}
    await sleep(50);
  }
  throw new Error(`El servidor no inició.\n${logs}`);
}
async function waitForStatus(headers, expected) {
  for (let i = 0; i < 150; i++) {
    const result = await json('/api/admin/state', { headers });
    if (result.data.status === expected) return result.data;
    await sleep(30);
  }
  throw new Error(`No llegó al estado ${expected}`);
}
function card(index) {
  return {
    id: `c${index}`,
    number: String(index).padStart(3, '0'),
    name: `Cartón ${index}`,
    mode: 90,
    grid: [
      [1, 2, 3, 4, 5, null, null, null, null],
      [null, 11, 22, 33, 44, 55, null, null, null],
      [7, null, null, 37, 48, null, 67, 78, 89]
    ],
    bets: { ambocabeza: true, line: true, bingo: true }
  };
}

(async () => {
  try {
    await waitForServer();
    let result = await json('/healthz');
    assert.equal(result.data.version, '2.3');

    const ownerHtml = await (await fetch(base + '/admin-principal')).text();
    assert(ownerHtml.includes('CREAR SALA'));
    assert(!ownerHtml.toLowerCase().includes('administrador temporal'));

    result = await json('/api/master/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
    });
    assert(result.data.adminToken);
    const masterHeaders = { 'Content-Type': 'application/json', 'X-Master-Token': result.data.token };
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': result.data.adminToken };

    result = await json('/api/master/operators', { method: 'POST', headers: masterHeaders, body: '{}' });
    assert.equal(result.response.status, 410);

    const game = {
      id: 'g23', number: 23, mode: 90,
      rules: { ambocabeza: true, line: true, bingo: true },
      drawMode: 'automatic', autoSeconds: 10, presenter: 'daia', phase: 'READY', drawn: [],
      cards: Array.from({ length: 6 }, (_, index) => card(index + 1))
    };
    result = await json('/api/admin/configure', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        game,
        players: [{ allowedCardCount: 4 }, { allowedCardCount: 1 }],
        roomSettings: { linePrizeCount: 1, gameType: 'test' }
      })
    });
    assert.equal(result.response.status, 200);
    let state = result.data;
    assert.equal(state.version, '2.3');
    assert.equal(state.players[0].nameSet, false);
    assert.equal(state.players[0].name, 'Acceso 1');
    assert(state.broadcastUrl);

    const broadcastToken = decodeURIComponent(state.broadcastUrl.split('/').filter(Boolean).at(-1));
    const broadcast = await json(`/api/broadcast/state?token=${encodeURIComponent(broadcastToken)}`);
    assert.equal(broadcast.data.version, '2.3');

    // El nombre es obligatorio y no acepta valores genéricos.
    result = await json('/api/player/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: state.players[0].code, roomCode: state.roomCode, deviceId: 'device-a' })
    });
    assert.equal(result.response.status, 400);
    result = await json('/api/player/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: state.players[0].code, roomCode: state.roomCode, deviceId: 'device-a', name: 'Jugador 1' })
    });
    assert.equal(result.response.status, 400);

    // Primer jugador: autorizado a 4, confirma solo 1.
    result = await json('/api/player/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: state.players[0].code, roomCode: state.roomCode, deviceId: 'device-a', name: 'Ana' })
    });
    assert.equal(result.response.status, 200);
    const tokenA = result.data.token;
    const playerAHeaders = { 'Content-Type': 'application/json', 'X-Player-Token': tokenA };
    const chosenA = result.data.state.player.offeredCards[0].id;
    await json('/api/player/reserve', { method: 'POST', headers: playerAHeaders, body: JSON.stringify({ cardId: chosenA, reserve: true }) });
    result = await json('/api/player/choose', { method: 'POST', headers: playerAHeaders, body: JSON.stringify({ cardIds: [chosenA] }) });
    assert.equal(result.response.status, 200);
    assert.equal(result.data.player.cards.length, 1);
    assert.equal(result.data.player.allowedCardCount, 4);
    assert.equal(result.data.player.selectionConfirmed, true);

    // Segundo jugador: nombre duplicado rechazado y luego válido.
    result = await json('/api/player/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: state.players[1].code, roomCode: state.roomCode, deviceId: 'device-b', name: 'Ana' })
    });
    assert.equal(result.response.status, 400);
    result = await json('/api/player/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: state.players[1].code, roomCode: state.roomCode, deviceId: 'device-b', name: 'Bruno' })
    });
    assert.equal(result.response.status, 200);
    const tokenB = result.data.token;
    const playerBHeaders = { 'Content-Type': 'application/json', 'X-Player-Token': tokenB };
    const chosenB = result.data.state.player.offeredCards[0].id;
    await json('/api/player/reserve', { method: 'POST', headers: playerBHeaders, body: JSON.stringify({ cardId: chosenB, reserve: true }) });
    result = await json('/api/player/choose', { method: 'POST', headers: playerBHeaders, body: JSON.stringify({ cardIds: [chosenB] }) });
    assert.equal(result.data.player.selectionConfirmed, true);

    // Cambiar mi suerte solo para ese jugador.
    result = await json('/api/player/presenter', { method: 'POST', headers: playerAHeaders, body: JSON.stringify({ presenter: 'vero' }) });
    assert.equal(result.data.player.personalPresenter, 'vero');
    const stateB = await json('/api/player/state', { headers: playerBHeaders });
    assert.equal(stateB.data.player.personalPresenter, 'daia');

    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.equal(state.readyToStart, true);
    assert.equal(state.preflight.activeCards, 2);

    await json('/api/admin/start', { method: 'POST', headers: adminHeaders, body: '{}' });
    state = await waitForStatus(adminHeaders, 'playing');

    // Cambiar intervalo durante la partida.
    let updatedGame = state.game;
    updatedGame.autoSeconds = 17;
    updatedGame.drawn = [1, 2, 3, 4, 5];
    state = (await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game: updatedGame }) })).data;
    assert.equal(state.game.autoSeconds, 17);

    // Línea: al resolver queda en el bolillero pausado hasta decisión del admin.
    let claim = await json('/api/player/claim', { method: 'POST', headers: playerAHeaders, body: JSON.stringify({ cardId: chosenA, type: 'line' }) });
    assert.equal(claim.response.status, 200);
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.equal(state.status, 'verifying');
    assert.equal(state.pauseReason, 'claim');
    await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: claim.data.id, resolution: 'confirmed' }) });
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.equal(state.status, 'paused');
    assert.equal(state.pauseReason, 'claim');
    result = await json('/api/admin/resume', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ mode: 'manual' }) });
    assert.equal(result.data.game.drawMode, 'manual');
    state = await waitForStatus(adminHeaders, 'playing');

    // Bingo confirmado, retiro final, PDF y cierre manual de sala.
    updatedGame = state.game;
    updatedGame.drawn = [1, 2, 3, 4, 5, 11, 22, 33, 44, 55, 7, 37, 48, 67, 78, 89];
    state = (await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game: updatedGame }) })).data;
    claim = await json('/api/player/claim', { method: 'POST', headers: playerBHeaders, body: JSON.stringify({ cardId: chosenB, type: 'bingo' }) });
    assert.equal(claim.response.status, 200);
    await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: claim.data.id, resolution: 'confirmed' }) });
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.equal(state.status, 'finalizing');
    state = await waitForStatus(adminHeaders, 'finished');
    assert.equal(state.game.drawn.length, 90);

    const acta = (await json('/api/admin/acta', { headers: adminHeaders })).data;
    assert.equal(acta.version, '2.3');
    assert.equal(acta.categories.line2.enabled, false);
    assert.equal(acta.categories.line2.status, 'not_drawn');
    const pdf = await fetch(base + `/api/results.pdf?sala=${state.roomCode}`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');

    // La sala sigue abierta tras finalizar; solo sale al pulsar Finalizar sala.
    result = await json('/api/player/state', { headers: playerAHeaders });
    assert.equal(result.data.active, true);
    assert.equal(result.data.status, 'finished');
    await json('/api/admin/close', { method: 'POST', headers: adminHeaders, body: '{}' });
    result = await json('/api/player/state', { headers: playerAHeaders });
    assert.equal(result.data.active, false);

    console.log('PRUEBAS BINGO DE LA GORDA 2.3: OK');
  } catch (error) {
    console.error(error);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
})();
