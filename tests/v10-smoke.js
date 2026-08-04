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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-v10-4-test-'));
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
    const health = await json('/healthz');
    assert.strictEqual(health.data.version, '10.4');
    const rootResponse = await fetch(`${base}/`, { redirect: 'manual' });
    assert.strictEqual(rootResponse.status, 302);
    assert.strictEqual(rootResponse.headers.get('location'), '/jugador');
    assert.strictEqual((await fetch(`${base}/admin`)).status, 200);
    assert.strictEqual((await fetch(`${base}/jugador`)).status, 200);
    const adminJsText = await (await fetch(`${base}/js/online-room-admin.js`)).text();
    const playerJsText = await (await fetch(`${base}/js/online-room-player.js`)).text();
    const playerHtmlText = await (await fetch(`${base}/jugador`)).text();
    assert.ok(adminJsText.includes('Puede elegir 4 cartones'));
    assert.ok(playerJsText.includes('/api/player/automark'));
    assert.ok(playerJsText.includes('renderPublicClaim'));
    assert.ok(playerHtmlText.includes('publicClaimOverlay'));
    assert.ok(playerHtmlText.includes('autoMarkOn'));
    assert.ok(playerHtmlText.includes('adminSpeechBubble'));
    assert.ok(adminJsText.includes('/api/admin/message'));

    let result = await json('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'prueba-segura' }) });
    assert.strictEqual(result.response.status, 200);
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': result.data.token };

    const cards = Array.from({ length: 100 }, (_, i) => card(i + 1));
    const game = {
      id: 'game-online-test', number: 1, mode: 90,
      rules: { ambocabeza: false, line: true, bingo: true },
      drawMode: 'manual', autoSeconds: 6, presenter: 'daia', theme: 'clasico',
      phase: 'READY', drawn: [], cards
    };

    // Máximos: 100 cartones, 50 jugadores, 4 por jugador y 10 opciones.
    const fiftyPlayers = Array.from({ length: 50 }, (_, i) => ({ name: `Jugador ${i + 1}`, allowedCardCount: 2 }));
    result = await json('/api/admin/configure', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game, players: fiftyPlayers }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.maxCards, 100);
    assert.strictEqual(result.data.maxPlayers, 50);
    assert.strictEqual(result.data.maxCardsPerPlayer, 4);
    assert.strictEqual(result.data.maxCardOptions, 10);

    const impossible = Array.from({ length: 26 }, (_, i) => ({ name: `Cuatro ${i + 1}`, allowedCardCount: 4 }));
    result = await json('/api/admin/configure', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game, players: impossible }) });
    assert.strictEqual(result.response.status, 400);

    // Partida de prueba con 10 jugadores y 4 cartones cada uno.
    const players = Array.from({ length: 10 }, (_, i) => ({ name: `Jugador ${i + 1}`, allowedCardCount: 4 }));
    result = await json('/api/admin/configure', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game, players, roomSettings: { playerAudioAllowed: true, playerAudioDefault: false } }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'waiting');
    assert.strictEqual(result.data.cardStatus.length, 0);

    // Mensaje global persistente desde la presentadora.
    result = await json('/api/admin/message', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ action: 'publish', text: 'Esperamos dos minutos antes de comenzar.' }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.adminMessage.text, 'Esperamos dos minutos antes de comenzar.');

    let state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    const sessions = [];
    for (let i = 0; i < players.length; i++) {
      const login = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[i].code, roomCode: state.roomCode }) });
      assert.strictEqual(login.response.status, 200, JSON.stringify(login.data));
      const headers = { 'Content-Type': 'application/json', 'X-Player-Token': login.data.token };
      let playerState = login.data.state;
      assert.strictEqual(playerState.adminMessage.text, 'Esperamos dos minutos antes de comenzar.');
      assert.ok(playerState.player.offeredCards.length <= 10);
      assert.ok(playerState.player.offeredCards.length >= 4);
      const selected = [];
      while (selected.length < 4) {
        const option = playerState.player.offeredCards.find(item => !selected.includes(item.id));
        assert.ok(option, `Faltó una opción para ${players[i].name}`);
        const reserved = await json('/api/player/reserve', { method: 'POST', headers, body: JSON.stringify({ cardId: option.id, reserve: true }) });
        assert.strictEqual(reserved.response.status, 200, JSON.stringify(reserved.data));
        playerState = reserved.data;
        selected.push(option.id);
      }
      const chosen = await json('/api/player/choose', { method: 'POST', headers, body: JSON.stringify({ cardIds: selected }) });
      assert.strictEqual(chosen.response.status, 200, JSON.stringify(chosen.data));
      sessions.push({ headers, cardIds: selected });
      state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    }

    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.strictEqual(state.readyToStart, true);
    assert.strictEqual(state.status, 'waiting');
    assert.strictEqual(state.cardStatus.length, 40);
    assert.strictEqual(new Set(state.cardStatus.map(item => item.cardId)).size, 40);

    result = await json('/api/admin/start', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'playing');

    // Automarcado: al activarlo completa todas las bolillas ya sorteadas y sigue sincronizado.
    const autoCardId = sessions[0].cardIds[0];
    result = await json('/api/player/automark', { method: 'POST', headers: sessions[0].headers, body: JSON.stringify({ enabled: true }) });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.player.autoMark, true);
    game.drawn = [1, 2, 3, 4, 5];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    const autoStatus = result.data.cardStatus.find(item => item.cardId === autoCardId);
    assert.strictEqual(autoStatus.autoMark, true);
    assert.deepStrictEqual(autoStatus.playerMarked.slice(0, 5), [1, 2, 3, 4, 5]);
    assert.deepStrictEqual(autoStatus.missed, []);
    result = await json('/api/player/mark', { method: 'POST', headers: sessions[0].headers, body: JSON.stringify({ cardId: autoCardId, number: 1, marked: false }) });
    assert.strictEqual(result.response.status, 400, 'No debe permitirse marcar manualmente con automarcado activo.');

    // Reclamo público para todos los jugadores.
    result = await json('/api/player/claim', { method: 'POST', headers: sessions[0].headers, body: JSON.stringify({ cardId: autoCardId, type: 'line' }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.officialValid, true);
    const otherState = (await json('/api/player/state', { headers: sessions[1].headers })).data;
    assert.strictEqual(otherState.publicClaims.at(-1).status, 'pending');
    assert.strictEqual(otherState.publicClaims.at(-1).playerName, 'Jugador 1');
    assert.strictEqual(otherState.publicClaims.at(-1).type, 'line');
    const blockedClaim = await json('/api/player/claim', { method: 'POST', headers: sessions[1].headers, body: JSON.stringify({ cardId: sessions[1].cardIds[0], type: 'line' }) });
    assert.strictEqual(blockedClaim.response.status, 400);

    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    const pendingClaim = state.claims.find(item => item.status === 'pending');
    result = await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: pendingClaim.id, resolution: 'confirmed' }) });
    assert.strictEqual(result.response.status, 200);
    const resolvedState = (await json('/api/player/state', { headers: sessions[2].headers })).data;
    assert.strictEqual(resolvedState.publicClaims.at(-1).status, 'confirmed');

    result = await json('/api/admin/message', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ action: 'clear' }) });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.adminMessage, null);
    const clearedPlayerState = (await json('/api/player/state', { headers: sessions[0].headers })).data;
    assert.strictEqual(clearedPlayerState.adminMessage, null);

    result = await json('/api/admin/backup', { headers: adminHeaders });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.format, 'el-bingo-de-la-gorda-v10-4-backup');
    assert.strictEqual(result.data.state.players[0].sessionToken, null);
    assert.strictEqual(result.data.state.players[0].autoMark, true);

    assert.strictEqual((await fetch(`${base}/data/sala-online.json`)).status, 404);
    assert.ok([403, 404].includes(await rawStatus('/assets/%2e%2e/server.js')));
    assert.ok([403, 404].includes(await rawStatus('/js/%2e%2e/data/sala-online.json')));

    console.log('PRUEBAS V10.4: OK');
  } catch (error) {
    console.error(error.stack || error);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
