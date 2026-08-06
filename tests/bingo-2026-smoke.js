'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const port = 47000 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-2026-'));
const password = 'clave-prueba-2026';
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    ONLINE_MODE: 'true',
    MASTER_ADMIN_PASSWORD: password,
    PUBLIC_URL: base,
    BINGO_DATA_DIR: dataDir,
    BINGO_START_SEQUENCE_MS: '100',
    BINGO_RESUME_SEQUENCE_MS: '100',
    BINGO_FINAL_BALLS_SEQUENCE_MS: '140'
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
  for (let i = 0; i < 160; i++) {
    try { if ((await fetch(base + '/healthz')).ok) return; } catch {}
    await sleep(40);
  }
  throw new Error(`El servidor no inició.\n${logs}`);
}
async function waitForStatus(headers, expected) {
  for (let i = 0; i < 180; i++) {
    const result = await json('/api/admin/state', { headers });
    if (result.data.status === expected) return result.data;
    await sleep(25);
  }
  throw new Error(`No llegó al estado ${expected}`);
}
function card90(index) {
  return {
    id: `c90-${index}`,
    number: String(index).padStart(3, '0'),
    name: `Cartón ${index}`,
    mode: 90,
    grid: [
      [1, 2, 3, 4, 5, null, null, null, null],
      [null, 11, 22, 33, 44, 55, null, null, null],
      [7, null, null, 37, 48, null, 67, 78, 89]
    ],
    bets: { ambocabeza: true, line: true, doubleLine: false, tripleLine: false, corners: false, bingo: true }
  };
}
function card75(id, number) {
  return {
    id,
    number,
    name: `Cartón ${number}`,
    mode: 75,
    grid: [
      [1, 16, 31, 46, 61],
      [2, 17, 32, 47, 62],
      [3, 18, 'LIBRE', 48, 63],
      [4, 19, 34, 49, 64],
      [5, 20, 35, 50, 65]
    ],
    bets: { ambocabeza: false, line: true, doubleLine: true, tripleLine: true, corners: true, bingo: true }
  };
}
async function setDrawn(adminHeaders, state, drawn) {
  const game = { ...state.game, drawn };
  return (await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) })).data;
}
async function claimAndResolve(playerHeaders, adminHeaders, cardId, type, resolution = 'confirmed') {
  const claim = await json('/api/player/claim', { method: 'POST', headers: playerHeaders, body: JSON.stringify({ cardId, type }) });
  assert.equal(claim.response.status, 200, `${type}: ${JSON.stringify(claim.data)}`);
  const verifying = (await json('/api/admin/state', { headers: adminHeaders })).data;
  assert.equal(verifying.status, 'verifying');
  const resolved = await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: claim.data.id, resolution }) });
  assert.equal(resolved.response.status, 200, `${type}: ${JSON.stringify(resolved.data)}`);
  return resolved.data;
}
async function resume(adminHeaders) {
  const result = await json('/api/admin/resume', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ mode: 'manual' }) });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  return waitForStatus(adminHeaders, 'playing');
}

(async () => {
  try {
    await waitForServer();
    let result = await json('/healthz');
    assert.equal(result.data.version, '2026');

    const ownerHtml = await (await fetch(base + '/admin-principal')).text();
    const playerHtml = await (await fetch(base + '/jugador')).text();
    const playerJs = await (await fetch(base + '/js/online-room-player.js')).text();
    assert(ownerHtml.includes('BINGO GORDA 2026'));
    assert(playerHtml.includes('claimDoubleLine'));
    assert(playerHtml.includes('claimTripleLine'));
    assert(playerHtml.includes('claimCorners'));
    assert(playerHtml.includes('.ticketCard.mode75Card{width:min(480px,100%)}'));
    assert(!playerHtml.includes('id="playerAlias"'));
    assert(playerHtml.includes('Tu nombre se pedirá al momento de confirmar los cartones.'));
    assert(playerJs.includes('await this.login(directCode, roomCode)'));
    assert(playerJs.includes("'/api/player/name'"));

    result = await json('/api/master/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
    });
    assert(result.data.adminToken);
    const masterHeaders = { 'Content-Type': 'application/json', 'X-Master-Token': result.data.token };
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': result.data.adminToken };
    result = await json('/api/master/operators', { method: 'POST', headers: masterHeaders, body: '{}' });
    assert.equal(result.response.status, 410);

    // MODO 90: Primera y Segunda línea son premios consecutivos.
    const game90 = {
      id: 'g90', number: 90, mode: 90,
      rules: { ambocabeza: true, line: true, doubleLine: false, tripleLine: false, corners: false, bingo: true },
      drawMode: 'automatic', autoSeconds: 10, presenter: 'daia', phase: 'READY', drawn: [],
      cards: Array.from({ length: 6 }, (_, index) => card90(index + 1))
    };
    result = await json('/api/admin/configure', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        game: game90,
        players: [{ allowedCardCount: 4 }, { allowedCardCount: 1 }, { allowedCardCount: 1, cardIds: ['c90-6'] }],
        roomSettings: { linePrizeCount: 2, allowSamePlayerSecondLine: true, gameType: 'test' }
      })
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    let state = result.data;
    assert.equal(state.version, '2026');
    assert.equal(state.preflight.mode, 90);
    assert.equal(state.preflight.linePrizeCount, 2);
    const broadcastToken = decodeURIComponent(state.broadcastUrl.split('/').filter(Boolean).at(-1));
    const broadcast = await json(`/api/broadcast/state?token=${encodeURIComponent(broadcastToken)}`);
    assert.equal(broadcast.data.version, '2026');

    result = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[0].code, roomCode: state.roomCode, deviceId: 'device-90-a' }) });
    assert.equal(result.response.status, 200);
    const p90a = { 'Content-Type': 'application/json', 'X-Player-Token': result.data.token };
    const chosen90a = result.data.state.player.offeredCards[0].id;
    await json('/api/player/reserve', { method: 'POST', headers: p90a, body: JSON.stringify({ cardId: chosen90a, reserve: true }) });
    assert.equal((await json('/api/player/choose', { method: 'POST', headers: p90a, body: JSON.stringify({ cardIds: [chosen90a] }) })).response.status, 400);
    assert.equal((await json('/api/player/choose', { method: 'POST', headers: p90a, body: JSON.stringify({ cardIds: [chosen90a], name: 'Ana' }) })).response.status, 200);

    result = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[1].code, roomCode: state.roomCode, deviceId: 'device-90-b' }) });
    const p90b = { 'Content-Type': 'application/json', 'X-Player-Token': result.data.token };
    const chosen90b = result.data.state.player.offeredCards[0].id;
    await json('/api/player/reserve', { method: 'POST', headers: p90b, body: JSON.stringify({ cardId: chosen90b, reserve: true }) });
    assert.equal((await json('/api/player/choose', { method: 'POST', headers: p90b, body: JSON.stringify({ cardIds: [chosen90b], name: 'Ana' }) })).response.status, 400);
    assert.equal((await json('/api/player/choose', { method: 'POST', headers: p90b, body: JSON.stringify({ cardIds: [chosen90b], name: 'Bruno' }) })).response.status, 200);

    result = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[2].code, roomCode: state.roomCode, deviceId: 'device-90-c' }) });
    const p90c = { 'Content-Type': 'application/json', 'X-Player-Token': result.data.token };
    assert.equal((await json('/api/player/name', { method: 'POST', headers: p90c, body: JSON.stringify({ name: 'Carla' }) })).response.status, 200);

    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.equal(state.readyToStart, true);
    await json('/api/admin/start', { method: 'POST', headers: adminHeaders, body: '{}' });
    state = await waitForStatus(adminHeaders, 'playing');
    state = await setDrawn(adminHeaders, state, [1, 2, 3, 4, 5]);

    let resolved = await claimAndResolve(p90a, adminHeaders, chosen90a, 'line');
    assert.equal(resolved.prizeLabel, 'Primera línea');
    state = await resume(adminHeaders);
    resolved = await claimAndResolve(p90b, adminHeaders, chosen90b, 'line');
    assert.equal(resolved.prizeLabel, 'Segunda línea');
    state = await resume(adminHeaders);

    state = await setDrawn(adminHeaders, state, [1, 2, 3, 4, 5, 11, 22, 33, 44, 55, 7, 37, 48, 67, 78, 89]);
    await claimAndResolve(p90b, adminHeaders, chosen90b, 'bingo');
    state = await waitForStatus(adminHeaders, 'finished');
    assert.equal(state.game.drawn.length, 90);
    let acta = (await json('/api/admin/acta', { headers: adminHeaders })).data;
    assert.equal(acta.version, '2026');
    assert.equal(acta.categories.line1.status, 'confirmed');
    assert.equal(acta.categories.line2.status, 'confirmed');
    let pdf = await fetch(base + `/api/results.pdf?sala=${state.roomCode}`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    await json('/api/admin/close', { method: 'POST', headers: adminHeaders, body: '{}' });

    // MODO 75: Línea, Doble y Triple línea se validan dentro del mismo cartón.
    const game75 = {
      id: 'g75', number: 75, mode: 75,
      rules: { ambocabeza: false, line: true, doubleLine: true, tripleLine: true, corners: true, bingo: true },
      drawMode: 'manual', autoSeconds: 10, presenter: 'vero', phase: 'READY', drawn: [],
      cards: [card75('c75-a', '075-A'), card75('c75-b', '075-B')]
    };
    result = await json('/api/admin/configure', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        game: game75,
        players: [{ allowedCardCount: 1, cardIds: ['c75-a'] }, { allowedCardCount: 1, cardIds: ['c75-b'] }],
        roomSettings: {
          gameType: 'test', tiePolicy: 'first_claim',
          prizeAmounts: { ambo: 0, line: 1000, doubleLine: 2000, tripleLine: 3000, corners: 1500, bingo: 5000 }
        }
      })
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    state = result.data;
    assert.equal(state.preflight.mode, 75);
    assert.deepEqual(state.preflight.enabledPrizes, ['Línea', 'Doble línea', 'Triple línea', '4 esquinas', 'Bingo']);

    result = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[0].code, roomCode: state.roomCode, deviceId: 'device-75-a' }) });
    const p75a = { 'Content-Type': 'application/json', 'X-Player-Token': result.data.token };
    assert.equal(result.data.state.player.selectionConfirmed, true);
    assert.equal((await json('/api/player/name', { method: 'POST', headers: p75a, body: JSON.stringify({ name: 'Dora' }) })).response.status, 200);
    result = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[1].code, roomCode: state.roomCode, deviceId: 'device-75-b' }) });
    const p75b = { 'Content-Type': 'application/json', 'X-Player-Token': result.data.token };
    assert.equal((await json('/api/player/name', { method: 'POST', headers: p75b, body: JSON.stringify({ name: 'Ema' }) })).response.status, 200);

    await json('/api/admin/start', { method: 'POST', headers: adminHeaders, body: '{}' });
    state = await waitForStatus(adminHeaders, 'playing');

    const row1 = [1, 16, 31, 46, 61];
    const row2 = [2, 17, 32, 47, 62];
    const row3 = [3, 18, 48, 63];
    state = await setDrawn(adminHeaders, state, row1);
    resolved = await claimAndResolve(p75a, adminHeaders, 'c75-a', 'line');
    assert.equal(resolved.prizeLabel, 'Línea');
    state = await resume(adminHeaders);

    // Un canto anticipado de doble línea es rechazable y luego puede volver a cantarse correctamente.
    const invalidDouble = await json('/api/player/claim', { method: 'POST', headers: p75a, body: JSON.stringify({ cardId: 'c75-a', type: 'doubleLine' }) });
    assert.equal(invalidDouble.response.status, 200);
    assert.equal(invalidDouble.data.officialValid, false);
    await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: invalidDouble.data.id, resolution: 'rejected' }) });
    state = await resume(adminHeaders);

    state = await setDrawn(adminHeaders, state, [...row1, ...row2]);
    resolved = await claimAndResolve(p75a, adminHeaders, 'c75-a', 'doubleLine');
    assert.equal(resolved.prizeLabel, 'Doble línea');
    assert.equal(resolved.comparison.lineCount, 2);
    state = await resume(adminHeaders);

    state = await setDrawn(adminHeaders, state, [...row1, ...row2, ...row3]);
    resolved = await claimAndResolve(p75a, adminHeaders, 'c75-a', 'tripleLine');
    assert.equal(resolved.prizeLabel, 'Triple línea');
    assert.equal(resolved.comparison.lineCount, 3);
    state = await resume(adminHeaders);

    state = await setDrawn(adminHeaders, state, [...row1, ...row2, ...row3, 5, 65]);
    resolved = await claimAndResolve(p75a, adminHeaders, 'c75-a', 'corners');
    assert.equal(resolved.prizeLabel, '4 esquinas');
    assert.equal(resolved.comparison.hasCorners, true);
    state = await resume(adminHeaders);

    const prefix75 = [...row1, ...row2, ...row3, 5, 65];
    const allCard75 = [1,16,31,46,61,2,17,32,47,62,3,18,48,63,4,19,34,49,64,5,20,35,50,65];
    const full75 = [...prefix75, ...allCard75.filter(number => !prefix75.includes(number))];
    state = await setDrawn(adminHeaders, state, full75);
    await claimAndResolve(p75a, adminHeaders, 'c75-a', 'bingo');
    state = await waitForStatus(adminHeaders, 'finished');
    acta = (await json('/api/admin/acta', { headers: adminHeaders })).data;
    assert.equal(acta.mode, 75);
    assert.equal(acta.categories.line.status, 'confirmed');
    assert.equal(acta.categories.doubleLine.status, 'confirmed');
    assert.equal(acta.categories.tripleLine.status, 'confirmed');
    assert.equal(acta.categories.corners.status, 'confirmed');
    assert.equal(acta.categories.bingo.status, 'confirmed');
    assert(!('line1' in acta.categories));
    assert(!('line2' in acta.categories));
    pdf = await fetch(base + `/api/results.pdf?sala=${state.roomCode}`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');

    console.log('PRUEBAS BINGO GORDA 2026: OK');
  } catch (error) {
    console.error(error);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
})();
