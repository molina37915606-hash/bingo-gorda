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
    const rules = { ambocabeza: false, line: true, doubleLine: false, tripleLine: true, corners: false, bingo: true };
    const created = await json('/api/demo/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 75, rules, aiCount: 3, playerCardCount: 2, autoSeconds: 4 })
    });
    assert.equal(created.response.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.participants[0].cardCount, 0);
    const firstCookie = (created.response.headers.get('set-cookie') || '').split(';')[0];
    assert(firstCookie.includes('bingo_demo_session='), 'La demo debe crear una cookie temporal de sesión.');
    assert(!created.data.playerSessionToken && !created.data.demoSessionToken, 'La demo no debe exponer el token de sesión en JSON.');
    assert(created.data.playerUrl.startsWith('/demo/jugar/demoentry_') && created.data.playerUrl.endsWith('/partida?demo=1'), created.data.playerUrl);
    assert(!/codigo=|demoSession=|code=|acceso=/i.test(created.data.playerUrl), 'La URL de demo no debe exponer ni pedir credenciales.');
    assert.deepEqual(created.data.rules, rules);

    const secondDemo = await json('/api/demo/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 90, rules: { ambocabeza: true, line: false, bingo: true }, linePrizeCount: 1, aiCount: 2, playerCardCount: 1, autoSeconds: 4 })
    });
    assert.equal(secondDemo.response.status, 200, JSON.stringify(secondDemo.data));
    assert.notEqual(secondDemo.data.roomCode, created.data.roomCode, 'Cada apertura debe crear una demo independiente.');
    const secondCookie = (secondDemo.response.headers.get('set-cookie') || '').split(';')[0];
    assert.notEqual(secondCookie, firstCookie, 'Las demos no deben compartir sesión.');
    assert.equal(secondDemo.data.rules.line, false);
    assert.equal(secondDemo.data.rules.ambocabeza, true);
    assert.equal(secondDemo.data.linePrizeCount, 1);

    const playerHeaders = { 'Content-Type': 'application/json', 'Cookie': firstCookie };
    const playerState = await json('/api/player/state', { headers: playerHeaders });
    assert.equal(playerState.response.status, 200, JSON.stringify(playerState.data));
    const initial = playerState.data;
    assert.equal(initial.status, 'waiting');
    assert.equal(initial.player.nameSet, false);
    assert.equal(initial.player.selectionConfirmed, false);
    assert.equal(initial.player.allowedCardCount, 2);
    assert(initial.player.offeredCards.length >= 2);
    assert.equal(initial.player.autoMarkForced, false);
    assert.equal(initial.player.demoHuman, true);
    assert((initial.chat?.messages || []).some(message => message.role === 'player'), 'Debe haber chat IA visible desde la espera.');

    const chosenIds = initial.player.offeredCards.slice(0, 2).map(card => card.id);
    const choose = await json('/api/player/choose', {
      method: 'POST', headers: playerHeaders,
      body: JSON.stringify({ name: 'Invitado Demo', cardIds: chosenIds })
    });
    assert.equal(choose.response.status, 200, JSON.stringify(choose.data));
    assert.equal(choose.data.player.selectionConfirmed, true);
    assert.equal(choose.data.player.cards.length, 2);
    const modeChoice = await json('/api/player/automark', { method:'POST', headers:playerHeaders, body:JSON.stringify({ enabled:false }) });
    assert.equal(modeChoice.response.status, 200, JSON.stringify(modeChoice.data));

    const tutorialDone = await json('/api/player/demo/tutorial', { method: 'POST', headers: playerHeaders, body: JSON.stringify({ skipped:false }) });
    assert.equal(tutorialDone.response.status, 200, JSON.stringify(tutorialDone.data));
    assert.equal(tutorialDone.data.status, 'waiting');
    assert.equal(tutorialDone.data.demo.startFlow.phase, 'countdown');
    assert.equal(tutorialDone.data.demo.startFlow.tutorialResolved, true);
    await wait(420);
    const liveState = await json('/api/player/state', { headers: playerHeaders });
    assert.equal(liveState.response.status, 200);
    assert(['playing', 'starting'].includes(liveState.data.status), `Estado inesperado: ${liveState.data.status}`);

    const playerJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'online-room-player.js'), 'utf8');
    const adminJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-simplificado.js'), 'utf8');
    const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert(playerJs.includes("target:'#selectionPlayerName'"));
    assert(playerJs.includes("when:()=>!device.tv && !this.state?.demo?.active"), 'El tutorial no debe enseñar minijuegos dentro de la demo.');
    assert(playerJs.includes("if (this.state?.status !== 'waiting' || this.state?.demo?.active) return '';"), 'La demo no debe renderizar minijuegos.');
    assert(playerJs.includes("const demoEntry = params.get('demo') === '1'"), 'El jugador debe iniciar la demo mediante la sesión del servidor.');
    assert(playerJs.includes('window.__BINGO_DEMO_DIRECT_TOKEN__'), 'La DEMO debe usar el token temporal embebido por su ruta propia.');
    assert(playerJs.includes("target:'.choiceCounter'"));
    assert(playerJs.includes("'/api/player/demo/tutorial'"));
    assert(playerJs.includes("params.get('adminpreview') === '1'"));
    assert(playerJs.includes('/api/admin-player-preview/state?token='));
    assert(adminHtml.includes('id="simulationViewBtn"'));
    assert(adminHtml.includes('VISTA PREVIA DEL JUGADOR'));
    assert(!adminHtml.includes('id="simulationPlayerModal"'));
    assert(adminJs.includes('openMobilePreview(true)'));

    console.log('PRUEBA EXPERIENCIA DEMO Y VISTA PREVIA IA: OK');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
