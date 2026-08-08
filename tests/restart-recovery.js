'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const port = 51600 + Math.floor(Math.random() * 250);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-restart-recovery-'));
const cwd = path.join(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let child = null;

function spawnServer() {
  child = spawn(process.execPath, ['server.js'], {
    cwd,
    env: { ...process.env, PORT: String(port), BINGO_TEST_MODE: 'true', BINGO_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return child;
}
async function stopServer() {
  if (!child || child.killed) return;
  const proc = child;
  child = null;
  await new Promise(resolve => {
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 1200);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
    try { proc.kill('SIGTERM'); } catch { clearTimeout(timer); resolve(); }
  });
}
async function json(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function waitServer() {
  for (let i = 0; i < 120; i++) {
    try { const x = await json('/healthz'); if (x.response.ok) return; } catch {}
    await wait(40);
  }
  throw new Error('Servidor no disponible.');
}
function headers(token) { return { 'Content-Type': 'application/json', 'X-Admin-Token': token }; }
async function login() {
  const out = await json('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(out.response.status, 200, JSON.stringify(out.data));
  return out.data.token;
}

(async () => {
  try {
    spawnServer();
    await waitServer();
    let admin = await login();
    let out = await json('/api/admin/create-ai-simulation', {
      method: 'POST', headers: headers(admin),
      body: JSON.stringify({ playerCount: 2, mode: 90, autoSeconds: 3, rules: { ambocabeza: false, line: true, bingo: true }, aiChatEnabled: false })
    });
    assert.equal(out.response.status, 200, JSON.stringify(out.data));
    out = await json('/api/admin/draw-settings', { method: 'POST', headers: headers(admin), body: JSON.stringify({ drawMode: 'automatic', autoSeconds: 3 }) });
    assert.equal(out.response.status, 200, JSON.stringify(out.data));
    out = await json('/api/admin/start', { method: 'POST', headers: headers(admin), body: JSON.stringify({ force: true }) });
    assert.equal(out.response.status, 200, JSON.stringify(out.data));
    await wait(130);
    out = await json('/api/admin/draw', { method: 'POST', headers: headers(admin), body: JSON.stringify({ source: 'restart-recovery-test' }) });
    assert.equal(out.response.status, 200, JSON.stringify(out.data));
    let state = (await json('/api/admin/state', { headers: headers(admin) })).data;
    assert.equal(state.status, 'playing');
    const beforeRestart = state.game.drawn.length;
    const commitment = state.integrity?.commitment;
    assert(commitment, 'Debe existir un sello de integridad antes del reinicio.');

    await stopServer();
    spawnServer();
    await waitServer();
    admin = await login();
    state = (await json('/api/admin/state', { headers: headers(admin) })).data;
    assert.equal(state.status, 'playing', 'La partida debe recuperar el estado de juego tras el reinicio.');
    assert.equal(state.game.drawn.length, beforeRestart, 'Las bolillas ya extraídas deben conservarse.');
    assert.equal(state.integrity?.commitment, commitment, 'El sello del sorteo debe conservarse sin regenerarse.');

    await wait(3250);
    state = (await json('/api/admin/state', { headers: headers(admin) })).data;
    assert(state.game.drawn.length > beforeRestart, 'El temporizador automático debe reanudarse tras reiniciar el servidor.');
    console.log('PRUEBA RECUPERACIÓN TRAS REINICIO: OK');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await stopServer();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
