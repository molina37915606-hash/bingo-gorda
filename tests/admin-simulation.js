'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const port = 50100 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-simulation-'));
const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port), BINGO_TEST_MODE: 'true', BINGO_DATA_DIR: dataDir, BINGO_START_SEQUENCE_MS: '100', BINGO_CLAIM_WINDOW_MS: '120' }, stdio: ['ignore', 'pipe', 'pipe'] });
async function json(url, options = {}) { const response = await fetch(base + url, options); const data = await response.json().catch(() => ({})); return { response, data }; }
async function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitServer() { for (let i = 0; i < 120; i++) { try { const x = await json('/healthz'); if (x.response.ok) return; } catch {} await wait(50); } throw new Error('El servidor no inició.'); }
function adminHeaders(token) { return { 'Content-Type': 'application/json', 'X-Admin-Token': token }; }
(async () => { try {
  await waitServer();
  const login = await json('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(login.response.status, 200, JSON.stringify(login.data)); const admin = login.data.token;
  let out = await json('/api/admin/create-simple-room', { method: 'POST', headers: adminHeaders(admin), body: JSON.stringify({ roomType: 'test', mode: 90, cardCount: 50, autoSeconds: 6, presenter: 'vero', rules: { line: true, bingo: true } }) }); assert.equal(out.response.status, 200, JSON.stringify(out.data)); const roomCode = out.data.roomCode;
  for (let i = 1; i <= 10; i++) { const joined = await json('/api/player/open-join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomCode, deviceId: `familia-dispositivo-${i}`, name: `Familiar ${i}`, cardCount: 4 }) }); assert.equal(joined.response.status, 200, `Ingreso ${i}: ${JSON.stringify(joined.data)}`); }
  let state = (await json('/api/admin/state', { headers: adminHeaders(admin) })).data; assert.equal(state.players.length, 10);
  await json('/api/admin/new-room', { method: 'POST', headers: adminHeaders(admin), body: '{}' });
  out = await json('/api/admin/create-ai-simulation', { method: 'POST', headers: adminHeaders(admin), body: JSON.stringify({ playerCount: 60, mode: 90, autoSeconds: 6, presenter: 'vero', rules: { ambocabeza: true, line: true, bingo: true }, aiChatEnabled: true }) }); assert.equal(out.response.status, 200, JSON.stringify(out.data)); state = out.data;
  assert.equal(state.roomSettings.adminSimulation, true); assert.equal(state.roomSettings.simulatedChat, true); assert.equal(state.chat.enabled, true); assert.equal(state.players.length, 60); assert(state.players.every(p => p.virtual === true)); assert(state.players.every(p => p.allowedCardCount >= 1 && p.allowedCardCount <= 4)); const activeCards = state.players.reduce((sum,p)=>sum+p.cardIds.length,0); assert(activeCards >= 60 && activeCards <= 240); assert.equal(state.preflight.activeCards, activeCards); assert(state.players.every((p,i)=>p.name===`IA ${String(i+1).padStart(2,'0')}`));
  const firstAi = state.players[0]; const firstCard = state.game.cards.find(card => firstAi.cardIds.includes(card.id)); const lineNumbers = firstCard.grid[0].filter(Number.isFinite);
  out = await json('/api/admin/test/draw-order', { method: 'POST', headers: adminHeaders(admin), body: JSON.stringify({ sequence: lineNumbers }) }); assert.equal(out.response.status, 200, JSON.stringify(out.data));
  out = await json('/api/admin/draw-settings', { method: 'POST', headers: adminHeaders(admin), body: JSON.stringify({ drawMode: 'manual' }) }); assert.equal(out.response.status, 200, JSON.stringify(out.data));
  out = await json('/api/admin/start', { method: 'POST', headers: adminHeaders(admin), body: '{}' }); assert.equal(out.response.status, 200, JSON.stringify(out.data)); assert.equal(out.data.status, 'starting'); assert.equal(out.data.transition?.largeRoomNotice, true); assert(out.data.transition?.priorityNotice?.text?.includes('VÁLIDA POSTERIOR')); await wait(160);
  out = await json('/api/admin/settings', { method: 'POST', headers: adminHeaders(admin), body: JSON.stringify({ transmission: { enabled: true, showChat: true, showCards: true, showNames: false, showProgress: true, rotationSeconds: 15 } }) }); assert.equal(out.response.status, 200, JSON.stringify(out.data)); assert.equal(out.data.roomSettings.transmission.enabled, true); assert.equal(out.data.roomSettings.transmission.rotationSeconds, 15);
  for (const number of lineNumbers) { out = await json('/api/admin/draw', { method: 'POST', headers: adminHeaders(admin), body: JSON.stringify({ source: 'simulation-test' }) }); assert.equal(out.response.status, 200, JSON.stringify(out.data)); await wait(70); }
  await wait(120); state = (await json('/api/admin/state', { headers: adminHeaders(admin) })).data; assert((state.chat?.messages||[]).length > 0, 'La simulación con chat habilitado debe generar mensajes IA.'); assert((state.chat?.messages||[]).some(m => m.role === 'player' && (m.type === 'sticker' || /[😀-🙏🎉🍀🎱⭐💰🔥❤️👀😬]/u.test(m.text||''))), 'El chat IA debe incluir emojis o stickers.'); assert(state.claims.some(claim => claim.status === 'pending' && claim.playerName.startsWith('IA ')), 'Las IA de simulación deben generar reclamos para que el administrador los resuelva.'); assert(!state.claims.some(claim => claim.status === 'confirmed'), 'La simulación administrativa no debe auto-confirmar premios.');
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'); assert(source.includes("DEMO_AI_NAME_POOL = ['Owen'")); assert(source.includes('shuffle(DEMO_AI_NAME_POOL).slice(0, aiCount)'));
  console.log('PRUEBAS DE SIMULACIÓN Y RED FAMILIAR: OK');
} catch (error) { console.error(error); process.exitCode = 1; } finally { child.kill('SIGTERM'); fs.rmSync(dataDir, { recursive: true, force: true }); } })();
