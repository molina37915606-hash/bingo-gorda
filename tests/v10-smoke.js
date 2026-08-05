'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const port = 44100 + Math.floor(Math.random() * 800);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-v10-6-test-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), ONLINE_MODE: 'true', ADMIN_PASSWORD: 'prueba-segura', RENDER_EXTERNAL_URL: 'https://bingo-prueba.onrender.com', BINGO_DATA_DIR: dataDir },
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
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error(`El servidor no inició.\n${logs}`);
}

function card(index) {
  return {
    id: `card-${index}`,
    number: String(index).padStart(3, '0'),
    name: `Cartón disponible ${index}`,
    mode: 90,
    grid: [
      [1, 2, 3, 4, 5, null, null, null, null],
      [null, 11, 22, 33, 44, 55, null, null, null],
      [7, null, null, 37, 48, null, 67, 78, 89]
    ],
    bets: { ambocabeza: false, line: true, bingo: true }
  };
}

(async () => {
  try {
    await waitForServer();
    const health = await json('/healthz');
    assert.strictEqual(health.data.version, '10.6');

    const adminJsText = await (await fetch(`${base}/js/online-room-admin.js`)).text();
    const playerJsText = await (await fetch(`${base}/js/online-room-player.js`)).text();
    const playerHtmlText = await (await fetch(`${base}/jugador`)).text();
    assert.ok(adminJsText.includes('INICIAR CUENTA REGRESIVA'));
    assert.ok(adminJsText.includes('DESCARGAR PDF'));
    assert.ok(adminJsText.includes('Primera y segunda línea'));
    assert.ok(playerJsText.includes('playerAssignmentCountdown'));
    assert.ok(playerJsText.includes('CANTAR SEGUNDA LÍNEA'));
    assert.ok(playerHtmlText.includes('waitingTimer'));

    let result = await json('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'prueba-segura' }) });
    assert.strictEqual(result.response.status, 200);
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': result.data.token };

    const cards = Array.from({ length: 100 }, (_, i) => card(i + 1));
    const game = {
      id: 'game-online-test', number: 12, mode: 90,
      rules: { ambocabeza: false, line: true, bingo: true },
      drawMode: 'manual', autoSeconds: 6, presenter: 'vero', theme: 'clasico',
      phase: 'READY', drawn: [], cards
    };

    // Admite 60 jugadores independientemente de los 100 cartones.
    const sixtyPlayers = Array.from({ length: 60 }, (_, i) => ({ name: `Jugador ${i + 1}`, allowedCardCount: 1 }));
    result = await json('/api/admin/configure', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game, players: sixtyPlayers }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.maxPlayers, 60);

    // Sala real de prueba: seis jugadores, dos cartones cada uno, segunda línea y temporizador preparado.
    const players = Array.from({ length: 6 }, (_, i) => ({ name: `Jugador ${i + 1}`, allowedCardCount: 2 }));
    result = await json('/api/admin/configure', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        game, players,
        roomSettings: { playerAudioAllowed: true, linePrizeCount: 2, allowSamePlayerSecondLine: false },
        assignmentTimer: { enabled: true, durationMinutes: 10 }
      })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'waiting');
    assert.strictEqual(result.data.assignmentTimer.status, 'idle');
    assert.strictEqual(result.data.prizeStatus.line.total, 2);

    let state = result.data;
    const sessions = [];
    for (let i = 0; i < 3; i++) {
      const login = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[i].code, roomCode: state.roomCode }) });
      assert.strictEqual(login.response.status, 200, JSON.stringify(login.data));
      const headers = { 'Content-Type': 'application/json', 'X-Player-Token': login.data.token };
      sessions.push({ headers });
    }

    // Jugador 1 confirma; Jugador 2 deja una reserva. El sistema debe respetarla al autoasignar.
    let p1 = (await json('/api/player/state', { headers: sessions[0].headers })).data;
    const p1ids = p1.player.offeredCards.slice(0, 2).map(item => item.id);
    for (const cardId of p1ids) await json('/api/player/reserve', { method: 'POST', headers: sessions[0].headers, body: JSON.stringify({ cardId, reserve: true }) });
    result = await json('/api/player/choose', { method: 'POST', headers: sessions[0].headers, body: JSON.stringify({ cardIds: p1ids }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));

    let p2 = (await json('/api/player/state', { headers: sessions[1].headers })).data;
    const reservedP2 = p2.player.offeredCards[0].id;
    result = await json('/api/player/reserve', { method: 'POST', headers: sessions[1].headers, body: JSON.stringify({ cardId: reservedP2, reserve: true }) });
    assert.strictEqual(result.response.status, 200);

    result = await json('/api/admin/assignment-timer', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ action: 'start', durationMinutes: 10 }) });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.assignmentTimer.status, 'running');
    result = await json('/api/admin/assignment-timer', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ action: 'pause' }) });
    assert.strictEqual(result.data.assignmentTimer.status, 'paused');
    result = await json('/api/admin/assignment-timer', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ action: 'resume' }) });
    assert.strictEqual(result.data.assignmentTimer.status, 'running');
    result = await json('/api/admin/assignment-timer', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ action: 'assign-now' }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.assignmentTimer.status, 'completed');
    assert.strictEqual(result.data.readyToStart, true);
    assert.strictEqual(result.data.cardStatus.length, 12);
    const player2 = result.data.players[1];
    assert.ok(player2.cardIds.includes(reservedP2), 'La asignación automática debe conservar la reserva válida del jugador.');
    assert.strictEqual(new Set(result.data.cardStatus.map(item => item.cardId)).size, 12);

    // Selección cerrada después de la asignación automática.
    result = await json('/api/player/release', { method: 'POST', headers: sessions[0].headers, body: '{}' });
    assert.strictEqual(result.response.status, 400);

    result = await json('/api/admin/start', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.status, 'playing');

    // Recuperar sesiones para jugadores autoasignados.
    state = result.data;
    for (let i = 3; i < 6; i++) {
      const login = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[i].code, roomCode: state.roomCode }) });
      sessions.push({ headers: { 'Content-Type': 'application/json', 'X-Player-Token': login.data.token } });
    }

    // Primera línea.
    game.drawn = [1, 2, 3, 4, 5];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    const p1Card = result.data.players[0].cardIds[0];
    result = await json('/api/player/claim', { method: 'POST', headers: sessions[0].headers, body: JSON.stringify({ cardId: p1Card, type: 'line' }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.prizeNumber, 1);
    result = await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: result.data.id, resolution: 'confirmed' }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.strictEqual(state.prizeStatus.line.awarded, 1);
    assert.strictEqual(state.prizeStatus.line.closed, false);
    assert.strictEqual(state.prizeStatus.line.nextLabel, 'Segunda línea');

    // Mismo jugador no puede llevarse la segunda línea si se configuró así.
    const p1OtherCard = state.players[0].cardIds[1];
    result = await json('/api/player/claim', { method: 'POST', headers: sessions[0].headers, body: JSON.stringify({ cardId: p1OtherCard, type: 'line' }) });
    assert.strictEqual(result.response.status, 400);

    // Segunda línea de otro jugador.
    const p2Card = state.players[1].cardIds[0];
    result = await json('/api/player/claim', { method: 'POST', headers: sessions[1].headers, body: JSON.stringify({ cardId: p2Card, type: 'line' }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.prizeNumber, 2);
    result = await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: result.data.id, resolution: 'confirmed' }) });
    assert.strictEqual(result.response.status, 200);
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.strictEqual(state.prizeStatus.line.closed, true);
    const thirdLine = await json('/api/player/claim', { method: 'POST', headers: sessions[2].headers, body: JSON.stringify({ cardId: state.players[2].cardIds[0], type: 'line' }) });
    assert.strictEqual(thirdLine.response.status, 400);

    // Bingo y cierre definitivo del botón.
    game.drawn = [1, 2, 3, 4, 5, 11, 22, 33, 44, 55, 7, 37, 48, 67, 78, 89];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    const p3Card = result.data.players[2].cardIds[0];
    result = await json('/api/player/claim', { method: 'POST', headers: sessions[2].headers, body: JSON.stringify({ cardId: p3Card, type: 'bingo' }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    result = await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: result.data.id, resolution: 'confirmed' }) });
    assert.strictEqual(result.response.status, 200);
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.strictEqual(state.prizeStatus.bingo.closed, true);
    const secondBingo = await json('/api/player/claim', { method: 'POST', headers: sessions[3].headers, body: JSON.stringify({ cardId: state.players[3].cardIds[0], type: 'bingo' }) });
    assert.strictEqual(secondBingo.response.status, 400);

    // Finalizar y descargar el acta ordenada.
    result = await json('/api/admin/finish', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'finished');
    assert.ok(result.data.endedAt);
    const acta = await json('/api/admin/acta', { headers: adminHeaders });
    assert.strictEqual(acta.response.status, 200);
    assert.deepStrictEqual(acta.data.balls.map(row => row.number), game.drawn);
    assert.strictEqual(acta.data.balls[0].order, 1);
    assert.strictEqual(acta.data.winners.length, 3);

    const csvResponse = await fetch(`${base}/api/admin/acta.csv`, { headers: { 'X-Admin-Token': adminHeaders['X-Admin-Token'] } });
    assert.strictEqual(csvResponse.status, 200);
    const csv = await csvResponse.text();
    assert.ok(csv.includes('ORDEN'));
    assert.ok(csv.includes('Primera línea'));

    const pdfResponse = await fetch(`${base}/api/admin/acta.pdf`, { headers: { 'X-Admin-Token': adminHeaders['X-Admin-Token'] } });
    assert.strictEqual(pdfResponse.status, 200);
    const pdf = Buffer.from(await pdfResponse.arrayBuffer());
    assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 1000);

    // El sorteo finalizado ya no admite modificaciones ni reclamos.
    game.drawn.push(90);
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 400);
    result = await json('/api/player/claim', { method: 'POST', headers: sessions[4].headers, body: JSON.stringify({ cardId: state.players[4].cardIds[0], type: 'line' }) });
    assert.strictEqual(result.response.status, 400);

    result = await json('/api/admin/backup', { headers: adminHeaders });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.format, 'el-bingo-de-la-gorda-v10-6-backup');

    console.log('PRUEBAS V10.6: OK');
  } catch (error) {
    console.error(error.stack || error);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
