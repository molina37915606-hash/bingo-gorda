'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const port = 44800 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-v2-test-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    ONLINE_MODE: 'true',
    ADMIN_PASSWORD: 'prueba-segura',
    RENDER_EXTERNAL_URL: 'https://bingo-prueba.onrender.com',
    BINGO_DATA_DIR: dataDir,
    BINGO_START_SEQUENCE_MS: '350',
    BINGO_RESUME_SEQUENCE_MS: '300'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function json(url, options = {}) {
  const response = await fetch(`${base}${url}`, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch {}
    await sleep(80);
  }
  throw new Error(`El servidor no inició.\n${logs}`);
}

async function waitForStatus(adminHeaders, status, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await json('/api/admin/state', { headers: adminHeaders });
    if (result.data.status === status) return result.data;
    await sleep(50);
  }
  throw new Error(`La sala no llegó al estado ${status}.`);
}

function card(index) {
  return {
    id: `card-${index}`,
    number: String(index).padStart(3, '0'),
    name: `Cartón ${String(index).padStart(3, '0')}`,
    originalName: `Cartón ${String(index).padStart(3, '0')}`,
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
    assert.strictEqual(result.data.version, '2.0');

    const adminJs = await (await fetch(`${base}/js/online-room-admin.js`)).text();
    const playerJs = await (await fetch(`${base}/js/online-room-player.js`)).text();
    const presenterJs = await (await fetch(`${base}/js/presenter-scripts.js`)).text();
    const appJs = await (await fetch(`${base}/js/app-v8.js`)).text();
    const adminHtml = await (await fetch(`${base}/admin`)).text();
    const playerHtml = await (await fetch(`${base}/jugador`)).text();
    assert.ok(adminHtml.includes('VERSIÓN 2.0'));
    assert.ok(adminHtml.includes('CREAR SALA'));
    assert.ok(adminHtml.includes('INGRESAR A SALA'));
    assert.ok(appJs.includes('length: 250'));
    assert.ok(appJs.includes('CONFIGURAR SALA'));
    assert.ok(playerHtml.includes('claimAmbo'));
    assert.ok(playerHtml.includes('soundToggle'));
    assert.ok(playerHtml.includes('alertsToggle'));
    assert.ok(playerJs.includes('RENOVAR CARTONES'));
    assert.ok(playerJs.includes('Al continuar, aceptás el reglamento interno.'));
    assert.ok(playerJs.includes('EL ADMINISTRADOR PAUSÓ LA PARTIDA'));
    assert.ok(playerJs.includes('LA PARTIDA CONTINÚA EN'));
    assert.ok(playerJs.includes('SOLICITAR CAMBIO DE DISPOSITIVO') || playerHtml.includes('SOLICITAR CAMBIO DE DISPOSITIVO'));
    assert.ok(presenterJs.includes('class PhraseEngine'));
    assert.ok((presenterJs.match(/'[^']*\{n\}[^']*'/g) || []).length >= 120);
    assert.ok(adminJs.includes('Solicitudes de cambio de dispositivo'));

    const rulesResponse = await fetch(`${base}/reglamento.pdf`);
    assert.strictEqual(rulesResponse.status, 404);

    result = await json('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'prueba-segura' })
    });
    assert.strictEqual(result.response.status, 200);
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': result.data.token };

    const cards = Array.from({ length: 250 }, (_, i) => card(i + 1));
    const game = {
      id: 'game-v2', number: 20, mode: 90,
      rules: { ambocabeza: true, line: true, bingo: true },
      drawMode: 'manual', autoSeconds: 10, presenter: 'daia', theme: 'clasico',
      phase: 'READY', drawn: [], cards
    };
    const players = Array.from({ length: 6 }, (_, i) => ({ name: `Jugador ${i + 1}`, allowedCardCount: 2 }));
    result = await json('/api/admin/configure', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        game, players,
        roomSettings: { playerAudioAllowed: true, linePrizeCount: 1, allowSamePlayerSecondLine: false, tiePolicy: 'first_claim' },
        assignmentTimer: { enabled: true, durationMinutes: 10 }
      })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    let state = result.data;
    assert.strictEqual(state.maxCards, 250);
    assert.strictEqual(state.maxActiveCards, 250);
    assert.strictEqual(state.status, 'waiting');

    const sessions = [];
    for (let i = 0; i < players.length; i++) {
      const deviceId = `device-${i + 1}`;
      const login = await json('/api/player/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: state.players[i].code, roomCode: state.roomCode, deviceId })
      });
      assert.strictEqual(login.response.status, 200, JSON.stringify(login.data));
      sessions.push({ deviceId, token: login.data.token, headers: { 'Content-Type': 'application/json', 'X-Player-Token': login.data.token } });
    }

    // Renovar opciones conserva los cartones ya elegidos.
    let p2 = (await json('/api/player/state', { headers: sessions[1].headers })).data;
    const firstOfferIds = p2.player.offeredCards.map(item => item.id);
    const reservedP2 = firstOfferIds[0];
    result = await json('/api/player/reserve', {
      method: 'POST', headers: sessions[1].headers,
      body: JSON.stringify({ cardId: reservedP2, reserve: true })
    });
    assert.strictEqual(result.response.status, 200);
    result = await json('/api/player/renew-offers', { method: 'POST', headers: sessions[1].headers, body: '{}' });
    assert.strictEqual(result.response.status, 200);
    assert.ok(result.data.player.offeredCards.some(item => item.id === reservedP2));
    assert.ok(result.data.player.reservedCardIds.includes(reservedP2));
    assert.ok(result.data.player.offeredCards.some(item => !firstOfferIds.includes(item.id)));

    // El mismo acceso no puede funcionar en dos dispositivos sin autorización.
    const duplicateLogin = await json('/api/player/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: state.players[1].code, roomCode: state.roomCode, deviceId: 'device-nuevo' })
    });
    assert.strictEqual(duplicateLogin.response.status, 409);
    assert.strictEqual(duplicateLogin.data.conflict, true);
    const transfer = await json('/api/player/request-transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: state.players[1].code, roomCode: state.roomCode, deviceId: 'device-nuevo' })
    });
    assert.strictEqual(transfer.response.status, 200);
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.ok(state.deviceTransferRequests.some(item => item.id === transfer.data.requestId));
    result = await json('/api/admin/resolve-device-transfer', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ requestId: transfer.data.requestId, resolution: 'approved' })
    });
    assert.strictEqual(result.response.status, 200);
    const transferStatus = await json('/api/player/transfer-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: transfer.data.requestId, deviceId: 'device-nuevo' })
    });
    assert.strictEqual(transferStatus.data.status, 'approved');
    assert.ok(transferStatus.data.state.player.reservedCardIds.includes(reservedP2));
    const oldSession = await json('/api/player/state', { headers: sessions[1].headers });
    assert.strictEqual(oldSession.response.status, 401);
    sessions[1] = { deviceId: 'device-nuevo', token: transferStatus.data.token, headers: { 'Content-Type': 'application/json', 'X-Player-Token': transferStatus.data.token } };

    // Asignación automática completa la selección y conserva la reserva.
    result = await json('/api/admin/assignment-timer', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ action: 'assign-now' })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    state = result.data;
    assert.strictEqual(state.readyToStart, true);
    assert.strictEqual(state.preflight.activeCards, 12);
    assert.ok(state.players[1].cardIds.includes(reservedP2));
    assert.strictEqual(new Set(state.cardStatus.map(item => item.cardId)).size, 12);

    // Inicio con estado intermedio y cuenta regresiva.
    result = await json('/api/admin/start', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'starting');
    assert.strictEqual(result.data.transition.type, 'start');
    assert.match(result.data.transition.officialTime, /^\d{2}:\d{2}$/);
    state = await waitForStatus(adminHeaders, 'playing');

    // Pausa total y reanudación con cuenta regresiva.
    result = await json('/api/admin/pause', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.data.status, 'paused');
    const pausedClaim = await json('/api/player/claim', {
      method: 'POST', headers: sessions[0].headers,
      body: JSON.stringify({ cardId: state.players[0].cardIds[0], type: 'line' })
    });
    assert.strictEqual(pausedClaim.response.status, 400);
    result = await json('/api/admin/resume', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.data.status, 'resuming');
    assert.strictEqual(result.data.transition.type, 'resume');
    state = await waitForStatus(adminHeaders, 'playing');

    // AmboCabeza: extremos marcados y centro limpio.
    game.drawn = [1, 5];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    state = result.data;
    const p1Ambo = (await json('/api/player/state', { headers: sessions[0].headers })).data;
    assert.ok(p1Ambo.readiness.some(item => item.amboEligible));
    result = await json('/api/player/claim', {
      method: 'POST', headers: sessions[0].headers,
      body: JSON.stringify({ cardId: state.players[0].cardIds[0], type: 'ambo' })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.type, 'ambo');
    assert.strictEqual(result.data.officialValid, true);
    result = await json('/api/admin/resolve', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ claimId: result.data.id, resolution: 'confirmed' })
    });
    assert.strictEqual(result.response.status, 200);

    // Línea y Bingo siguen funcionando.
    game.drawn = [1, 2, 3, 4, 5];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 200);
    state = result.data;
    result = await json('/api/player/claim', {
      method: 'POST', headers: sessions[2].headers,
      body: JSON.stringify({ cardId: state.players[2].cardIds[0], type: 'line' })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    result = await json('/api/admin/resolve', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ claimId: result.data.id, resolution: 'confirmed' })
    });
    assert.strictEqual(result.response.status, 200);

    game.drawn = [1, 2, 3, 4, 5, 11, 22, 33, 44, 55, 7, 37, 48, 67, 78, 89];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    state = result.data;
    result = await json('/api/player/claim', {
      method: 'POST', headers: sessions[3].headers,
      body: JSON.stringify({ cardId: state.players[3].cardIds[0], type: 'bingo' })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    result = await json('/api/admin/resolve', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ claimId: result.data.id, resolution: 'confirmed' })
    });
    assert.strictEqual(result.response.status, 200);
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.strictEqual(state.bingoConfirmed, true);

    result = await json('/api/admin/finish', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'finished');

    const acta = await json('/api/admin/acta', { headers: adminHeaders });
    assert.strictEqual(acta.data.version, '2.0');
    assert.ok(acta.data.winners.some(item => item.type === 'ambo'));
    const amboWinner = acta.data.winners.find(item => item.type === 'ambo');
    assert.deepStrictEqual(amboWinner.winningNumbers, [1, 5]);
    assert.ok(acta.data.winners.some(item => item.type === 'line'));
    assert.ok(acta.data.winners.some(item => item.type === 'bingo'));

    const pdfResponse = await fetch(`${base}/api/results.pdf?sala=${state.roomCode}`);
    assert.strictEqual(pdfResponse.status, 200);
    const pdf = Buffer.from(await pdfResponse.arrayBuffer());
    assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 50000);

    result = await json('/api/admin/backup', { headers: adminHeaders });
    assert.strictEqual(result.data.format, 'el-bingo-de-la-gorda-2.0-backup');

    console.log('PRUEBAS BINGO DE LA GORDA 2.0: OK');
  } catch (error) {
    console.error(error.stack || error);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
