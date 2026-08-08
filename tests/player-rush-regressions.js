'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const html = fs.readFileSync(path.join(__dirname, '..', 'jugador.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'online-room-player.js'), 'utf8');
assert(html.includes('id="networkIndicator"'), 'falta indicador de conexión independiente');
assert(html.includes('id="tutorialChoiceOverlay"'), 'falta continuar/reiniciar tutorial');
assert(html.includes('concentrationMode'), 'falta modo concentración');
assert(js.includes('pendingClaims = new Set()'), 'falta protección local contra doble reclamo');
assert(js.includes('RECLAMO ENVIADO'), 'falta feedback inmediato al reclamar');
assert(js.includes('countRecoverableAutoMarks()'), 'falta conteo de números recuperados por AUTO');
assert(js.includes('guideMemory()'), 'falta memoria exacta del tutorial');
assert(js.includes('deviceProfile()'), 'falta tutorial adaptado al dispositivo');
assert(js.includes("switchCard(direction = 1"), 'falta cambio rápido/circular de cartón');
assert(js.includes("'/api/player/demo/reset'"), 'falta reinicio del demo');
assert(js.includes("aria-pressed=\"${marks.has(value)}\""), 'los números no exponen estado marcado accesible');

const port = 51200 + Math.floor(Math.random() * 250);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-rush-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(port), BINGO_TEST_MODE: 'true', BINGO_DATA_DIR: dataDir, BINGO_START_SEQUENCE_MS: '60' },
  stdio: ['ignore', 'pipe', 'pipe']
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function json(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function waitServer() {
  for (let i = 0; i < 120; i++) {
    try { const out = await json('/healthz'); if (out.response.ok) return; } catch {}
    await wait(40);
  }
  throw new Error('El servidor no inició.');
}

(async () => {
  try {
    await waitServer();
    const created = await json('/api/demo/create', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ mode:75, aiCount:2, playerCardCount:1, autoSeconds:2 })
    });
    assert.equal(created.response.status, 200, JSON.stringify(created.data));
    const login = await json('/api/player/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ roomCode:created.data.roomCode, code:created.data.playerCode, deviceId:'rush-player' })
    });
    assert.equal(login.response.status, 200, JSON.stringify(login.data));
    const headers = {'Content-Type':'application/json','X-Player-Token':login.data.token};
    const cardId = login.data.state.player.offeredCards[0].id;
    const choose = await json('/api/player/choose', { method:'POST', headers, body:JSON.stringify({ name:'Jugador Rápido', cardIds:[cardId] }) });
    assert.equal(choose.response.status, 200, JSON.stringify(choose.data));

    for (const enabled of [true,false,true,false,true]) {
      const out = await json('/api/player/automark', { method:'POST', headers, body:JSON.stringify({enabled}) });
      assert.equal(out.response.status, 200, JSON.stringify(out.data));
    }
    const afterAuto = await json('/api/player/state', { headers });
    assert.equal(afterAuto.data.player.autoMark, true, 'AUTO no toleró alternancia rápida');

    const started = await json('/api/player/demo/start', { method:'POST', headers, body:'{}' });
    assert.equal(started.response.status, 200, JSON.stringify(started.data));
    let state = started.data;
    for (let i=0;i<50 && state.status !== 'playing';i++) {
      await wait(40);
      state = (await json('/api/player/state',{headers})).data;
    }
    assert.equal(state.status, 'playing', `demo no llegó a playing: ${state.status}`);

    const firstClaim = await json('/api/player/claim', { method:'POST', headers, body:JSON.stringify({cardId,type:'line'}) });
    assert.equal(firstClaim.response.status, 200, JSON.stringify(firstClaim.data));
    const duplicate = await json('/api/player/claim', { method:'POST', headers, body:JSON.stringify({cardId,type:'line'}) });
    assert.notEqual(duplicate.response.status, 200, 'un doble toque registró dos reclamos del mismo cartón');

    const reset = await json('/api/player/demo/reset', { method:'POST', headers, body:'{}' });
    assert.equal(reset.response.status, 200, JSON.stringify(reset.data));
    assert.notEqual(reset.data.roomCode, created.data.roomCode, 'reiniciar demo debe crear una sala limpia');
    assert.equal(reset.data.participants[0].cardCount, 0, 'el demo reiniciado debe volver a elección de cartones');

    console.log('PRUEBA JUGADOR APURADO / UI ROBUSTA: OK');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive:true, force:true });
  }
})();
