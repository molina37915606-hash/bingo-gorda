'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const port = 52350 + Math.floor(Math.random() * 150);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-demo-server-start-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT:String(port), BINGO_TEST_MODE:'true', BINGO_DATA_DIR:dataDir, BINGO_DEMO_READY_COUNTDOWN_MS:'700' },
  stdio:['ignore','pipe','pipe']
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function json(url, options={}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function waitServer() {
  for (let i=0;i<120;i++) { try { const out=await json('/healthz'); if(out.response.ok) return; } catch {} await wait(50); }
  throw new Error('El servidor no inició.');
}

(async()=>{
  try {
    await waitServer();
    const created = await json('/api/demo/create', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ mode:90, aiCount:2, playerCardCount:2, rules:{ambocabeza:true,line:true,bingo:true}, autoSeconds:2 }) });
    assert.equal(created.response.status, 200, JSON.stringify(created.data));
    const cookie = (created.response.headers.get('set-cookie') || '').split(';')[0];
    const headers = { 'Content-Type':'application/json', Cookie:cookie };
    let state = (await json('/api/player/state', { headers })).data;
    const cardIds = state.player.offeredCards.slice(0,2).map(card=>card.id);
    state = (await json('/api/player/choose', { method:'POST', headers, body:JSON.stringify({ name:'Prueba Servidor', cardIds }) })).data;
    assert.equal(state.status, 'waiting');
    assert.equal(state.demo.startFlow.phase, 'tutorial');
    const modeChoice = await json('/api/player/automark', { method:'POST', headers, body:JSON.stringify({ enabled:false }) });
    assert.equal(modeChoice.response.status, 200, JSON.stringify(modeChoice.data));

    const resolved = await json('/api/player/demo/tutorial', { method:'POST', headers, body:JSON.stringify({ skipped:true }) });
    assert.equal(resolved.response.status, 200, JSON.stringify(resolved.data));
    assert.equal(resolved.data.status, 'waiting');
    assert.equal(resolved.data.demo.startFlow.phase, 'countdown');
    assert.equal(resolved.data.demo.startFlow.tutorialResolved, true);
    const deadline = new Date(resolved.data.demo.startFlow.countdownEndsAt).getTime();
    assert(deadline > Date.now(), 'El servidor debe conservar el final de la cuenta regresiva.');

    // Simula recarga/desconexión del navegador: no se envía ninguna otra orden de inicio.
    await wait(250);
    const reloaded = await json('/api/player/state', { headers });
    assert.equal(reloaded.data.status, 'waiting');
    assert.equal(reloaded.data.demo.startFlow.phase, 'countdown');
    assert.equal(new Date(reloaded.data.demo.startFlow.countdownEndsAt).getTime(), deadline, 'La recarga no debe reiniciar la cuenta.');

    // El servidor debe iniciar solo después del deadline, sin /demo/start desde el navegador.
    let live = reloaded.data;
    for (let i=0;i<35 && live.status !== 'playing';i++) { await wait(60); live=(await json('/api/player/state',{headers})).data; }
    assert.equal(live.status, 'playing', `La demo quedó trabada en ${live.status}.`);
    assert.equal(live.demo.startFlow.phase, 'playing');
    assert((live.game.drawn || []).length >= 0);

    console.log('PRUEBA DEMO · MÁQUINA DE ESTADOS DEL SERVIDOR: OK');
  } catch(error) {
    console.error(error);
    process.exitCode=1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir,{recursive:true,force:true});
  }
})();
