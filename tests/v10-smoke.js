'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const root = path.resolve(__dirname, '..');
const port = 43210 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-v10-1-test-'));
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

function rawStatus(rawPath) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.end();
  });
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
    const rootResponse = await fetch(`${base}/`, { redirect: 'manual' });
    assert.strictEqual(rootResponse.status, 302);
    assert.strictEqual(rootResponse.headers.get('location'), '/jugador');
    assert.strictEqual((await fetch(`${base}/admin`)).status, 200);
    assert.strictEqual((await fetch(`${base}/jugador`)).status, 200);
    assert.strictEqual((await fetch(`${base}/js/online-room-admin.js`)).status, 200);
    assert.strictEqual((await fetch(`${base}/js/online-room-player.js`)).status, 200);
    assert.strictEqual((await fetch(`${base}/assets/vero.png`)).status, 200);

    let result = await json('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'prueba-segura' }) });
    assert.strictEqual(result.response.status, 200);
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': result.data.token };

    const cards = Array.from({ length: 50 }, (_, i) => card(i + 1));
    const players = Array.from({ length: 25 }, (_, i) => ({ name: `Jugador ${i + 1}`, allowedCardCount: 2 }));
    const game = {
      id: 'game-online-test', number: 1, mode: 90,
      rules: { ambocabeza: false, line: true, bingo: true },
      drawMode: 'manual', autoSeconds: 6, presenter: 'daia', theme: 'clasico',
      phase: 'READY', drawn: [], cards
    };

    result = await json('/api/admin/configure', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game, players, roomSettings: { playerAudioAllowed: true, playerAudioDefault: false } }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'waiting');
    assert.strictEqual(result.data.readyToStart, false);
    assert.strictEqual(result.data.players.length, 25);
    assert.strictEqual(result.data.cardStatus.length, 0);
    assert.strictEqual(result.data.game.presenter, 'daia');
    assert.strictEqual(result.data.maxCardOptions, 5);
    assert.strictEqual(result.data.players[0].offeredCardIds.length, 5);

    game.drawn = [1];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 400, 'No debe poder sortearse durante la sala de espera.');
    game.drawn = [];

    const sessions = [];
    for (let i = 0; i < 25; i++) {
      let state = (await json('/api/admin/state', { headers: adminHeaders })).data;
      const code = state.players[i].code;
      result = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, roomCode: state.roomCode }) });
      assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
      assert.strictEqual(result.data.state.status, 'waiting');
      assert.strictEqual(result.data.state.game.presenter, 'daia');
      assert.ok(result.data.state.player.offeredCards.length >= 2 && result.data.state.player.offeredCards.length <= 5);
      const token = result.data.token;
      const headers = { 'Content-Type': 'application/json', 'X-Player-Token': token };
      const selected = result.data.state.player.offeredCards.slice(0, 2).map(item => item.id);
      result = await json('/api/player/choose', { method: 'POST', headers, body: JSON.stringify({ cardIds: selected }) });
      assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
      assert.strictEqual(result.data.player.selectionConfirmed, true);
      assert.strictEqual(result.data.player.cards.length, 2);
      sessions.push({ token, headers, cardIds: selected });
    }

    result = await json('/api/admin/state', { headers: adminHeaders });
    assert.strictEqual(result.data.readyToStart, true);
    assert.strictEqual(result.data.cardStatus.length, 50);
    assert.strictEqual(new Set(result.data.players.flatMap(player => player.cardIds)).size, 50);

    result = await json('/api/player/mark', { method: 'POST', headers: sessions[0].headers, body: JSON.stringify({ cardId: sessions[0].cardIds[0], number: 1, marked: true }) });
    assert.strictEqual(result.response.status, 400, 'No se puede marcar antes del inicio manual.');

    result = await json('/api/admin/start', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'playing');
    assert.ok(result.data.startedAt);

    result = await json('/api/admin/settings', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ playerAudioAllowed: false, playerAudioDefault: false }) });
    assert.strictEqual(result.data.roomSettings.playerAudioAllowed, false);
    result = await json('/api/admin/settings', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ playerAudioAllowed: true, playerAudioDefault: false }) });
    assert.strictEqual(result.data.roomSettings.playerAudioAllowed, true);

    const firstCardId = sessions[0].cardIds[0];
    result = await json('/api/player/mark', { method: 'POST', headers: sessions[0].headers, body: JSON.stringify({ cardId: firstCardId, number: 1, marked: true }) });
    assert.strictEqual(result.response.status, 200);

    game.drawn = [1, 2, 3, 4, 5];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    const firstStatus = result.data.cardStatus.find(item => item.cardId === firstCardId);
    assert.strictEqual(firstStatus.hasLine, true);
    assert.deepStrictEqual(firstStatus.missed, [2, 3, 4, 5]);

    result = await json('/api/player/claim', { method: 'POST', headers: sessions[0].headers, body: JSON.stringify({ cardId: firstCardId, type: 'line' }) });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.officialValid, true);
    assert.deepStrictEqual(result.data.comparison.missed, [2, 3, 4, 5]);

    result = await json('/api/admin/backup', { headers: adminHeaders });
    assert.strictEqual(result.response.status, 200);
    const backup = result.data;
    assert.strictEqual(backup.format, 'el-bingo-de-la-gorda-v10-1-backup');
    assert.strictEqual(backup.state.players[0].sessionToken, null);

    result = await json('/api/admin/close', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200);
    result = await json('/api/admin/restore', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ backup }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'playing');
    assert.strictEqual(result.data.cardStatus.length, 50);

    assert.strictEqual((await fetch(`${base}/data/sala-online.json`)).status, 404);
    assert.ok([403, 404].includes(await rawStatus('/assets/%2e%2e/server.js')));
    assert.ok([403, 404].includes(await rawStatus('/js/%2e%2e/data/sala-online.json')));

    console.log('PRUEBAS V10.1: OK');
  } catch (error) {
    console.error(error.stack || error);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
