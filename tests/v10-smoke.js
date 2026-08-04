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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-v10-3-test-'));
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
    assert.strictEqual(health.data.version, '10.3');
    const rootResponse = await fetch(`${base}/`, { redirect: 'manual' });
    assert.strictEqual(rootResponse.status, 302);
    assert.strictEqual(rootResponse.headers.get('location'), '/jugador');
    assert.strictEqual((await fetch(`${base}/admin`)).status, 200);
    assert.strictEqual((await fetch(`${base}/jugador`)).status, 200);
    assert.strictEqual((await fetch(`${base}/js/online-room-admin.js`)).status, 200);
    assert.strictEqual((await fetch(`${base}/js/online-room-player.js`)).status, 200);
    const adminJsText = await (await fetch(`${base}/js/online-room-admin.js`)).text();
    const playerJsText = await (await fetch(`${base}/js/online-room-player.js`)).text();
    assert.ok(adminJsText.includes('renderParticipatingRanking'));
    assert.ok(adminJsText.includes('data-copy-direct'));
    assert.ok(playerJsText.includes("params.get('acceso')"));

    let result = await json('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'prueba-segura' }) });
    assert.strictEqual(result.response.status, 200);
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': result.data.token };

    const cards = Array.from({ length: 50 }, (_, i) => card(i + 1));
    const game = {
      id: 'game-online-test', number: 1, mode: 90,
      rules: { ambocabeza: false, line: true, bingo: true },
      drawMode: 'manual', autoSeconds: 6, presenter: 'daia', theme: 'clasico',
      phase: 'READY', drawn: [], cards
    };

    // El máximo de jugadores es independiente del total de cartones.
    const fiftyPlayers = Array.from({ length: 50 }, (_, i) => ({ name: `Jugador ${i + 1}`, allowedCardCount: 1 }));
    result = await json('/api/admin/configure', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game, players: fiftyPlayers }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.players.length, 50);
    assert.strictEqual(result.data.maxPlayers, 50);
    assert.strictEqual(result.data.status, 'waiting');

    const tooMany = Array.from({ length: 51 }, (_, i) => ({ name: `Extra ${i + 1}`, allowedCardCount: 1 }));
    result = await json('/api/admin/configure', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game, players: tooMany }) });
    assert.strictEqual(result.response.status, 400);

    // Sala real de prueba: 50 cartones disponibles, pero solamente 10 jugadores autorizados.
    const players = Array.from({ length: 10 }, (_, i) => ({ name: `Jugador ${i + 1}`, allowedCardCount: 2 }));
    result = await json('/api/admin/configure', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game, players, roomSettings: { playerAudioAllowed: true, playerAudioDefault: false } }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'waiting');
    assert.strictEqual(result.data.readyToStart, false);
    assert.strictEqual(result.data.players.length, 10);
    assert.strictEqual(result.data.game.cards.length, 50);
    assert.strictEqual(result.data.cardStatus.length, 0);

    // No puede salir una bolilla mientras la sala está en espera.
    game.drawn = [1];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 400);
    game.drawn = [];

    // Dos jugadores entran. El primero reserva un cartón y el segundo deja de verlo.
    let state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    const wrongRoomLogin = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[0].code, roomCode: 'XXXXX' }) });
    assert.strictEqual(wrongRoomLogin.response.status, 400);
    const login1 = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[0].code, roomCode: state.roomCode }) });
    const login2 = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[1].code }) });
    assert.strictEqual(login1.response.status, 200);
    assert.strictEqual(login2.response.status, 200);
    const h1 = { 'Content-Type': 'application/json', 'X-Player-Token': login1.data.token };
    const h2 = { 'Content-Type': 'application/json', 'X-Player-Token': login2.data.token };
    const reservedId = login1.data.state.player.offeredCards[0].id;
    result = await json('/api/player/reserve', { method: 'POST', headers: h1, body: JSON.stringify({ cardId: reservedId, reserve: true }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.ok(result.data.player.reservedCardIds.includes(reservedId));
    const state2 = (await json('/api/player/state', { headers: h2 })).data;
    assert.ok(!state2.player.offeredCards.some(item => item.id === reservedId), 'El cartón reservado no debe aparecerle a otro jugador.');
    result = await json('/api/player/reserve', { method: 'POST', headers: h2, body: JSON.stringify({ cardId: reservedId, reserve: true }) });
    assert.strictEqual(result.response.status, 400, 'Otro jugador no debe poder reservar el mismo cartón.');

    // Liberamos la reserva inicial para ejecutar la selección completa desde cero.
    await json('/api/player/release', { method: 'POST', headers: h1, body: '{}' });

    const sessions = [];
    for (let i = 0; i < 10; i++) {
      state = (await json('/api/admin/state', { headers: adminHeaders })).data;
      let login;
      if (i === 0) login = { data: { token: login1.data.token, state: (await json('/api/player/state', { headers: h1 })).data } };
      else if (i === 1) login = { data: { token: login2.data.token, state: (await json('/api/player/state', { headers: h2 })).data } };
      else login = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[i].code }) });
      const headers = { 'Content-Type': 'application/json', 'X-Player-Token': login.data.token };
      let playerState = login.data.state;
      const selected = [];
      while (selected.length < 2) {
        const option = playerState.player.offeredCards.find(item => !selected.includes(item.id));
        assert.ok(option, `Faltó una opción para el jugador ${i + 1}`);
        result = await json('/api/player/reserve', { method: 'POST', headers, body: JSON.stringify({ cardId: option.id, reserve: true }) });
        assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
        playerState = result.data;
        selected.push(option.id);
      }
      result = await json('/api/player/choose', { method: 'POST', headers, body: JSON.stringify({ cardIds: selected }) });
      assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
      assert.strictEqual(result.data.player.selectionConfirmed, true);
      sessions.push({ headers, cardIds: selected });
    }

    result = await json('/api/admin/state', { headers: adminHeaders });
    assert.strictEqual(result.data.readyToStart, true);
    assert.strictEqual(result.data.status, 'waiting', 'Aunque todos estén listos, no debe iniciarse automáticamente.');
    assert.strictEqual(result.data.cardStatus.length, 20);
    assert.strictEqual(new Set(result.data.players.flatMap(player => player.cardIds)).size, 20);

    result = await json('/api/player/mark', { method: 'POST', headers: sessions[0].headers, body: JSON.stringify({ cardId: sessions[0].cardIds[0], number: 1, marked: true }) });
    assert.strictEqual(result.response.status, 400, 'No se puede marcar antes de INICIAR SORTEO.');

    result = await json('/api/admin/start', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'playing');
    assert.ok(result.data.startedAt);

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

    result = await json('/api/admin/backup', { headers: adminHeaders });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.format, 'el-bingo-de-la-gorda-v10-3-backup');
    assert.strictEqual(result.data.state.players[0].sessionToken, null);

    // Ejemplo solicitado: 30 cartones generados, pero solo 5 en juego entre 3 jugadores.
    const game30 = { ...game, id: 'game-online-30', drawn: [], cards: cards.slice(0, 30) };
    const players3 = [
      { name: 'Jugador Uno', allowedCardCount: 2 },
      { name: 'Jugador Dos', allowedCardCount: 2 },
      { name: 'Jugador Tres', allowedCardCount: 1 }
    ];
    result = await json('/api/admin/configure', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game: game30, players: players3 }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    const chosenIds = [];
    for (let i = 0; i < players3.length; i++) {
      state = (await json('/api/admin/state', { headers: adminHeaders })).data;
      const login = await json('/api/player/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: state.players[i].code, roomCode: state.roomCode }) });
      assert.strictEqual(login.response.status, 200);
      const headers = { 'Content-Type': 'application/json', 'X-Player-Token': login.data.token };
      let playerState = login.data.state;
      const selected = [];
      while (selected.length < players3[i].allowedCardCount) {
        const option = playerState.player.offeredCards.find(item => !selected.includes(item.id));
        assert.ok(option);
        const reserved = await json('/api/player/reserve', { method: 'POST', headers, body: JSON.stringify({ cardId: option.id, reserve: true }) });
        assert.strictEqual(reserved.response.status, 200, JSON.stringify(reserved.data));
        playerState = reserved.data;
        selected.push(option.id);
      }
      const chosen = await json('/api/player/choose', { method: 'POST', headers, body: JSON.stringify({ cardIds: selected }) });
      assert.strictEqual(chosen.response.status, 200, JSON.stringify(chosen.data));
      chosenIds.push(...selected);
    }
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.strictEqual(state.game.cards.length, 30);
    assert.strictEqual(state.cardStatus.length, 5);
    assert.strictEqual(new Set(state.cardStatus.map(item => item.cardId)).size, 5);
    assert.deepStrictEqual(new Set(state.cardStatus.map(item => item.playerName)), new Set(['Jugador Uno', 'Jugador Dos', 'Jugador Tres']));
    assert.ok(state.cardStatus.every(item => chosenIds.includes(item.cardId)));
    assert.ok(!state.cardStatus.some(item => !chosenIds.includes(item.cardId)));

    assert.strictEqual((await fetch(`${base}/data/sala-online.json`)).status, 404);
    assert.ok([403, 404].includes(await rawStatus('/assets/%2e%2e/server.js')));
    assert.ok([403, 404].includes(await rawStatus('/js/%2e%2e/data/sala-online.json')));

    console.log('PRUEBAS V10.3: OK');
  } catch (error) {
    console.error(error.stack || error);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
