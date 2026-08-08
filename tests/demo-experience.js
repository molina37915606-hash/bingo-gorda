'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const port = 50650 + Math.floor(Math.random() * 250);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-demo-flow-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(port), BINGO_TEST_MODE: 'true', BINGO_DATA_DIR: dataDir, BINGO_START_SEQUENCE_MS: '100' },
  stdio: ['ignore', 'pipe', 'pipe']
});

async function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function json(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function waitServer() {
  for (let i = 0; i < 120; i++) {
    try { const out = await json('/healthz'); if (out.response.ok) return; } catch {}
    await wait(50);
  }
  throw new Error('El servidor no inició.');
}

(async () => {
  try {
    await waitServer();
    const created = await json('/api/demo/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 75, aiCount: 3, playerCardCount: 2, autoSeconds: 4 })
    });
    assert.equal(created.response.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.participants[0].cardCount, 0);

    const login = await json('/api/player/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: created.data.roomCode, code: created.data.playerCode, deviceId: 'demo-player-test' })
    });
    assert.equal(login.response.status, 200, JSON.stringify(login.data));
    assert.equal(login.data.state.status, 'waiting');
    assert.equal(login.data.state.player.nameSet, false);
    assert.equal(login.data.state.player.selectionConfirmed, false);
    assert.equal(login.data.state.player.allowedCardCount, 2);
    assert(login.data.state.player.offeredCards.length >= 2);
    assert.equal(login.data.state.player.autoMarkForced, false);
    assert.equal(login.data.state.player.demoHuman, true);
    assert((login.data.state.chat?.messages || []).some(message => message.role === 'player'), 'Debe haber chat IA visible desde la espera.');

    const playerHeaders = { 'Content-Type': 'application/json', 'X-Player-Token': login.data.token };
    const chosenIds = login.data.state.player.offeredCards.slice(0, 2).map(card => card.id);
    const choose = await json('/api/player/choose', {
      method: 'POST', headers: playerHeaders,
      body: JSON.stringify({ name: 'Invitado Demo', cardIds: chosenIds })
    });
    assert.equal(choose.response.status, 200, JSON.stringify(choose.data));
    assert.equal(choose.data.player.selectionConfirmed, true);
    assert.equal(choose.data.player.cards.length, 2);

    const start = await json('/api/player/demo/start', { method: 'POST', headers: playerHeaders, body: '{}' });
    assert.equal(start.response.status, 200, JSON.stringify(start.data));
    assert.equal(start.data.status, 'starting');
    await wait(180);
    const playerState = await json('/api/player/state', { headers: playerHeaders });
    assert.equal(playerState.response.status, 200);
    assert(['playing', 'starting'].includes(playerState.data.status));

    const playerJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'online-room-player.js'), 'utf8');
    const adminJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-simplificado.js'), 'utf8');
    const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert(playerJs.includes("target:'#selectionPlayerName'"));
    assert(playerJs.includes("target:'#waitMiniGame'"));
    assert(playerJs.includes("target:'.choiceCounter'"));
    assert(playerJs.includes("'/api/player/demo/start'"));
    assert(playerJs.includes("params.get('simcontrol') === '1'"));
    assert(adminHtml.includes('id="simulationViewBtn"'));
    assert(adminHtml.includes('id="simulationPlayerModal"'));
    assert(adminJs.includes('openSimulationPlayerView()'));

    console.log('PRUEBA EXPERIENCIA DEMO Y VISTA JUGADOR IA: OK');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
