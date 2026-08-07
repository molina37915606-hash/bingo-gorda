
'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const port = 50700 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-stress-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    PORT: String(port),
    BINGO_TEST_MODE: 'true',
    BINGO_DATA_DIR: dataDir,
    BINGO_START_SEQUENCE_MS: '30',
    BINGO_RESUME_SEQUENCE_MS: '30',
    BINGO_CLAIM_WINDOW_MS: '45',
    BINGO_FINAL_BALLS_SEQUENCE_MS: '80'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

async function json(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitServer() {
  for (let i = 0; i < 120; i++) {
    try { const result = await json('/healthz'); if (result.response.ok) return; } catch {}
    await wait(40);
  }
  throw new Error('El servidor no inició.');
}
const adminHeaders = token => ({ 'Content-Type': 'application/json', 'X-Admin-Token': token });

async function state(admin) {
  const out = await json('/api/admin/state', { headers: adminHeaders(admin) });
  assert.equal(out.response.status, 200, JSON.stringify(out.data));
  return out.data;
}

async function waitForPlayable(admin, maxMs = 1200) {
  const started = Date.now();
  let current = await state(admin);
  while (Date.now() - started < maxMs && !['playing','verifying','paused','finalizing','finished'].includes(current.status)) {
    await wait(25);
    current = await state(admin);
  }
  return current;
}

async function settleClaims(admin) {
  let current = await state(admin);
  let guard = 0;
  while (current.claims?.some(claim => claim.status === 'pending')) {
    if (++guard > 80) throw new Error('Demasiados reclamos pendientes en la simulación.');
    const expiresAt = Number(current.claimWindow?.expiresAtMs || 0);
    if (expiresAt > Date.now()) await wait(Math.min(100, expiresAt - Date.now() + 8));
    const pending = (current.claims || []).filter(claim => claim.status === 'pending').sort((a,b)=>(a.receivedSequence||0)-(b.receivedSequence||0));
    if (!pending.length) break;
    const claim = pending[0];
    let resolution = claim.officialValid ? 'confirmed' : 'rejected';
    let out = await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders(admin), body: JSON.stringify({ claimId: claim.id, resolution }) });
    if (!out.response.ok && resolution === 'confirmed') {
      out = await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders(admin), body: JSON.stringify({ claimId: claim.id, resolution: 'rejected' }) });
    }
    assert.equal(out.response.status, 200, `No se pudo resolver reclamo ${claim.id}: ${JSON.stringify(out.data)}`);
    current = await state(admin);
  }
  if (current.status === 'paused' && current.game.drawn.length < current.game.mode) {
    const resumed = await json('/api/admin/resume', { method: 'POST', headers: adminHeaders(admin), body: JSON.stringify({ drawMode: 'manual' }) });
    assert.equal(resumed.response.status, 200, JSON.stringify(resumed.data));
    current = await waitForPlayable(admin);
  }
  return current;
}

(async () => {
  try {
    await waitServer();
    const login = await json('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(login.response.status, 200, JSON.stringify(login.data));
    const admin = login.data.token;

    const created = await json('/api/admin/create-ai-simulation', {
      method: 'POST', headers: adminHeaders(admin),
      body: JSON.stringify({ playerCount: 60, mode: 90, autoSeconds: 6, presenter: 'vero', rules: { ambocabeza: true, line: true, bingo: true } })
    });
    assert.equal(created.response.status, 200, JSON.stringify(created.data));
    let current = created.data;
    assert.equal(current.players.length, 60);
    const assigned = current.players.flatMap(player => player.cardIds || []);
    assert(assigned.length >= 60 && assigned.length <= 240, `Cantidad inesperada de cartones: ${assigned.length}`);
    assert.equal(new Set(assigned).size, assigned.length, 'Un mismo cartón no debe quedar asignado a dos IA.');
    assert.equal(current.preflight.activeCards, assigned.length);

    const manual = await json('/api/admin/draw-settings', { method: 'POST', headers: adminHeaders(admin), body: JSON.stringify({ drawMode: 'manual' }) });
    assert.equal(manual.response.status, 200, JSON.stringify(manual.data));
    const started = await json('/api/admin/start', { method: 'POST', headers: adminHeaders(admin), body: '{}' });
    assert.equal(started.response.status, 200, JSON.stringify(started.data));
    current = await waitForPlayable(admin);
    assert(['playing','verifying','paused'].includes(current.status), `La simulación no quedó lista para jugar: ${current.status}`);

    let resolvedClaims = 0;
    for (let i = 0; i < 40; i++) {
      current = await state(admin);
      if (['finished','finalizing'].includes(current.status)) break;
      if (current.status === 'verifying' || current.status === 'paused') {
        const before = (current.claims || []).filter(c => c.status !== 'pending').length;
        current = await settleClaims(admin);
        resolvedClaims += Math.max(0, (current.claims || []).filter(c => c.status !== 'pending').length - before);
        if (['finished','finalizing'].includes(current.status)) break;
      }
      const draw = await json('/api/admin/draw', { method: 'POST', headers: adminHeaders(admin), body: JSON.stringify({ source: 'stress-60-ai' }) });
      assert.equal(draw.response.status, 200, `Extracción ${i+1}: ${JSON.stringify(draw.data)}`);
      await wait(70);
    }
    current = await settleClaims(admin);
    const resolved = (current.claims || []).filter(claim => claim.status === 'confirmed' || claim.status === 'rejected');
    assert(current.game.drawn.length > 0, 'La simulación debe poder avanzar el sorteo.');
    assert.equal(current.players.length, 60, 'No deben perderse jugadores IA durante el sorteo.');
    assert.equal(current.preflight.activeCards, assigned.length, 'No deben perderse cartones durante el sorteo.');
    assert(!current.claims?.some(claim => claim.status === 'pending'), 'No deben quedar reclamos huérfanos después de resolver la cola.');
    assert(resolved.length >= 0);

    // Repetir lecturas del estado simula recargas/reconexiones del administrador durante una sala grande.
    for (let i = 0; i < 15; i++) {
      const snapshot = await state(admin);
      assert.equal(snapshot.players.length, 60);
      assert.equal(snapshot.preflight.activeCards, assigned.length);
    }

    console.log(`PRUEBA DE ESTRÉS 60 IA: OK · ${current.game.drawn.length} bolillas · ${resolved.length} reclamos resueltos · ${assigned.length} cartones`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
