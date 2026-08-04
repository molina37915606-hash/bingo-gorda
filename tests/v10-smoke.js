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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-v10-test-'));
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
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`El servidor no inició.\n${logs}`);
}

function card(index) {
  return {
    id: `card-${index}`,
    number: String(index).padStart(3, '0'),
    name: `Titular original ${index}`,
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
    assert.strictEqual((await fetch(`${base}/js/app-v8.js`)).status, 200);

    let result = await json('/api/admin/state');
    assert.strictEqual(result.response.status, 401, 'El panel debe requerir autenticación.');
    assert.strictEqual((await fetch(`${base}/api/events?role=admin&adminToken=invalido`)).status, 401);

    result = await json('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'incorrecta' }) });
    assert.strictEqual(result.response.status, 401, 'La contraseña incorrecta debe rechazarse.');

    result = await json('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'prueba-segura' }) });
    assert.strictEqual(result.response.status, 200);
    const adminToken = result.data.token;
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken };
    const adminEventsAbort = new AbortController();
    const adminEvents = await fetch(`${base}/api/events?role=admin&adminToken=${encodeURIComponent(adminToken)}`, { signal: adminEventsAbort.signal });
    assert.strictEqual(adminEvents.status, 200);
    adminEventsAbort.abort();

    const cards = Array.from({ length: 50 }, (_, i) => card(i + 1));
    const players = Array.from({ length: 25 }, (_, i) => ({
      name: `Jugador ${i + 1}`,
      cardIds: [`card-${i * 2 + 1}`, `card-${i * 2 + 2}`]
    }));
    const game = {
      id: 'game-online-test', number: 1, mode: 90,
      rules: { ambocabeza: false, line: true, bingo: true },
      drawMode: 'manual', autoSeconds: 6, presenter: 'vero', theme: 'clasico',
      phase: 'PAUSED', drawn: [], cards
    };

    result = await json('/api/admin/configure', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game, players }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.players.length, 25);
    assert.strictEqual(result.data.cardStatus.length, 50);
    assert.strictEqual(result.data.maxCards, 50);
    assert.strictEqual(result.data.maxPlayers, 25);
    assert.strictEqual(result.data.playerUrl, 'https://bingo-prueba.onrender.com/jugador');
    assert.strictEqual(new Set(result.data.players.map(player => player.code)).size, 25, 'Los códigos deben ser únicos.');
    assert.strictEqual(result.data.game.cards[0].name, 'Jugador 1', 'El nombre del cartón debe coincidir con el jugador asignado.');

    const firstCode = result.data.players[0].code;
    const roomCode = result.data.roomCode;
    result = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: firstCode, roomCode }) });
    assert.strictEqual(result.response.status, 200);
    const playerToken = result.data.token;
    assert.strictEqual(result.data.state.player.cards.length, 2);
    const playerEventsAbort = new AbortController();
    const playerEvents = await fetch(`${base}/api/events?role=player&token=${encodeURIComponent(playerToken)}`, { signal: playerEventsAbort.signal });
    assert.strictEqual(playerEvents.status, 200);
    playerEventsAbort.abort();

    const playerHeaders = { 'Content-Type': 'application/json', 'X-Player-Token': playerToken };
    result = await json('/api/player/mark', { method: 'POST', headers: playerHeaders, body: JSON.stringify({ cardId: 'card-1', number: 1, marked: true }) });
    assert.strictEqual(result.response.status, 200);

    game.drawn = [1, 2, 3, 4, 5];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 200);
    const firstStatus = result.data.cardStatus.find(item => item.cardId === 'card-1');
    assert.strictEqual(firstStatus.hasLine, true);
    assert.deepStrictEqual(firstStatus.missed, [2, 3, 4, 5]);

    result = await json('/api/player/claim', { method: 'POST', headers: playerHeaders, body: JSON.stringify({ cardId: 'card-1', type: 'line' }) });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.officialValid, true);
    assert.deepStrictEqual(result.data.comparison.missed, [2, 3, 4, 5]);

    result = await json('/api/admin/backup', { headers: adminHeaders });
    assert.strictEqual(result.response.status, 200);
    const backup = result.data;
    assert.strictEqual(backup.state.players[0].sessionToken, null);

    result = await json('/api/admin/close', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200);

    result = await json('/api/admin/restore', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ backup }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.players[0].code, firstCode);
    assert.strictEqual(result.data.cardStatus.length, 50);

    const exposed = await fetch(`${base}/data/sala-online.json`);
    assert.strictEqual(exposed.status, 404, 'Los datos privados no deben servirse como archivo estático.');
    assert.ok([403, 404].includes(await rawStatus('/assets/%2e%2e/server.js')), 'No debe poder atravesarse la ruta assets.');
    assert.ok([403, 404].includes(await rawStatus('/js/%2e%2e/data/sala-online.json')), 'No debe poder atravesarse la ruta js.');

    console.log('PRUEBAS V10: OK');
  } catch (error) {
    console.error(error.stack || error);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
