'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const port = 47000 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'la-gorda-bingo-online-'));
const password = 'clave-prueba-2026-4';
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    ONLINE_MODE: 'true',
    BINGO_TEST_MODE: 'true',
    MASTER_ADMIN_PASSWORD: password,
    PUBLIC_URL: base,
    BINGO_DATA_DIR: dataDir,
    BINGO_START_SEQUENCE_MS: '100',
    BINGO_RESUME_SEQUENCE_MS: '100',
    BINGO_FINAL_BALLS_SEQUENCE_MS: '250',
    BINGO_CLAIM_WINDOW_MS: '120'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function json(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function waitForServer() {
  for (let index = 0; index < 160; index++) {
    try { if ((await fetch(base + '/healthz')).ok) return; } catch {}
    await sleep(40);
  }
  throw new Error(`El servidor no inició.\n${logs}`);
}

async function waitForStatus(headers, expected) {
  for (let index = 0; index < 220; index++) {
    const result = await json('/api/admin/state', { headers });
    if (result.data.status === expected) return result.data;
    await sleep(25);
  }
  throw new Error(`No llegó al estado ${expected}`);
}

function numbers(cardOrGrid) {
  const grid = Array.isArray(cardOrGrid) ? cardOrGrid : cardOrGrid.grid;
  return grid.flat().filter(Number.isFinite);
}

function winningLines(grid, mode) {
  if (mode === 90) return grid.map(row => row.filter(Number.isFinite));
  const rows = grid.map(row => row.filter(Number.isFinite));
  const columns = Array.from({ length: 5 }, (_, column) => grid.map(row => row[column]).filter(Number.isFinite));
  const diagonals = [
    Array.from({ length: 5 }, (_, index) => grid[index][index]).filter(Number.isFinite),
    Array.from({ length: 5 }, (_, index) => grid[index][4 - index]).filter(Number.isFinite)
  ];
  return [...rows, ...columns, ...diagonals];
}

async function demoCards(mode, players, cardsPerPlayer) {
  const aiCount = Math.max(1, Math.min(3, Number(players) || 2));
  const playerCardCount = Math.max(1, Math.min(4, Number(cardsPerPlayer) || 2));
  const result = await json('/api/demo/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, aiCount, playerCardCount, autoSeconds: 8, presenter: 'vero', testHoldStart: true })
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert(result.data.playerUrl.includes('/jugador'));
  assert.equal(result.data.participants[0].name, 'Vos');
  assert.equal(result.data.participants[0].cardCount, playerCardCount);
  assert(result.data.participants.slice(1).every(player => player.cardCount === 2));
  const headers = { 'Content-Type': 'application/json', 'X-Admin-Token': result.data.testAdminToken };
  const state = (await json('/api/admin/state', { headers })).data;
  assert.equal(state.demo, true);
  assert.equal(state.game.drawMode, 'automatic');
  assert.equal(state.status, 'waiting');
  assert.equal(state.players[0].name, 'Vos');
  const aiNames = state.players.slice(1).map(player => player.name);
  assert.equal(aiNames.length, aiCount);
  assert.equal(new Set(aiNames).size, aiCount, 'Los nombres IA de demo deben ser únicos en cada partida.');
  assert(aiNames.every(name => ['Zoe','Mateo','Owen'].includes(name)), 'Las demos solo deben usar Zoe, Mateo y Owen.');
  assert(state.players.every(player => player.nameSet && player.autoMark));
  const login = await json('/api/player/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: result.data.playerCode, roomCode: result.data.roomCode, deviceId: `demo-${mode}-${Date.now()}` })
  });
  assert.equal(login.response.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.state.player.name, 'Vos');
  assert.equal(login.data.state.player.cards.length, playerCardCount);
  assert.equal(login.data.state.player.autoMarkForced, true);
  assert.equal(login.data.state.demo.participants.length, aiCount + 1);
  return { state, headers, response: result.data, playerState: login.data.state };
}

async function playerLogin(state, playerIndex, deviceId) {
  const result = await json('/api/player/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: state.players[playerIndex].code, roomCode: state.roomCode, deviceId })
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  return { 'Content-Type': 'application/json', 'X-Player-Token': result.data.token };
}

async function drawMany(adminHeaders, count) {
  let state;
  for (let index = 0; index < count; index++) {
    const result = await json('/api/admin/draw', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ source: 'test' }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    state = result.data;
  }
  return state;
}

(async () => {
  try {
    await waitForServer();

    let result = await json('/healthz');
    assert.equal(result.data.version, 'LA GORDA - BINGO ONLINE');
    const demoHtml = await (await fetch(base + '/demo')).text();
    assert(demoHtml.includes('Jugá una partida real y rápida'));
    assert(demoHtml.includes('CREAR Y COMENZAR PARTIDA'));
    assert(demoHtml.includes('Zoe, Mateo y Owen'));
    const adminHtml = await (await fetch(base + '/admin')).text();
    assert(adminHtml.includes('LA GORDA - BINGO ONLINE'));
    assert(adminHtml.includes('.ballNumber{display:block;color:#fff'));
    assert(adminHtml.includes('id="actaPreview"'));
    assert(!adminHtml.includes('id="pdfFrame"'));
    assert(adminHtml.includes('id="pdfOpenTab"'));
    assert.equal((await fetch(base + '/admin-avanzado.html')).status, 404);
    assert.equal((await fetch(base + '/js/app-v8.js')).status, 404);
    assert.equal((await fetch(base + '/js/online-room-admin.js')).status, 404);

    const playerHtml = await (await fetch(base + '/jugador')).text();
    assert(playerHtml.includes('id="settingsToggle"'));
    assert(playerHtml.includes('id="infoDrawer"'));
    assert(playerHtml.includes('id="resultsViewerOverlay"'));
    assert(playerHtml.includes('id="voiceToggle"'));
    assert(playerHtml.includes('VER ACTA COMPLETA'));
    const stickerAsset = await fetch(base + '/assets/stickers/corazon.webp');
    assert.equal(stickerAsset.status, 200);
    assert.equal(stickerAsset.headers.get('content-type'), 'image/webp');
    const playerJs = await (await fetch(base + '/js/online-room-player.js')).text();
    for (const emoji of ['😀','😁','😂','😉','😊','😎','😮','😭','😤','🤞','🙏','👏','👍','❤️','🔥','🎉','🍀','🎱','⭐','💰']) assert(playerJs.includes(emoji));
    assert(playerJs.includes('data-send-sticker'));
    assert(playerJs.includes('sendSticker(stickerId)'));
    assert(playerJs.includes('renderSortedNumbers'));

    result = await json('/api/master/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': result.data.adminToken };
    const generatedSets = {};
    for (const mode of [75, 90]) {
      const generated = await json('/api/admin/create-simple-room', {
        method: 'POST', headers: adminHeaders,
        body: JSON.stringify({ roomType: 'test', mode, cardCount: 250, rules: { line: true, bingo: true } })
      });
      assert.equal(generated.response.status, 200, JSON.stringify(generated.data));
      const grids = generated.data.game.cards.map(card => card.grid);
      assert.equal(grids.length, 250);
      const signatures = new Set();
      for (const grid of grids) {
        const cardNumbers = numbers(grid);
        assert.equal(cardNumbers.length, mode === 75 ? 24 : 15);
        assert.equal(new Set(cardNumbers).size, cardNumbers.length);
        const signature = [...cardNumbers].sort((a, b) => a - b).join(',');
        assert(!signatures.has(signature), `No debe repetir cartones de ${mode} bolas.`);
        signatures.add(signature);
      }
      generatedSets[mode] = grids;
      await json('/api/admin/close', { method: 'POST', headers: adminHeaders, body: '{}' });
    }

    const demo75solo = await demoCards(75, 1, 1);
    assert.equal(demo75solo.state.players.length, 2);
    const demo75 = await demoCards(75, 2, 1);

    // La demo debe sortear sola y resolver los reclamos de IA sin administrador.
    const demo90Flow = await demoCards(90, 3, 1);
    const aiPlayer = demo90Flow.state.players[1];
    const aiCard = demo90Flow.state.game.cards.find(card => aiPlayer.cardIds.includes(card.id));
    const amboRow = aiCard.grid.find(row => row.filter(Number.isFinite).length === 5).filter(Number.isFinite);
    result = await json('/api/admin/test/draw-order', { method: 'POST', headers: demo90Flow.headers, body: JSON.stringify({ sequence: [amboRow[0], amboRow.at(-1)] }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    result = await json('/api/admin/draw-settings', { method: 'POST', headers: demo90Flow.headers, body: JSON.stringify({ drawMode: 'automatic', autoSeconds: 2 }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    result = await json('/api/admin/start', { method: 'POST', headers: demo90Flow.headers, body: '{}' });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    let demoClaimState = null;
    for (let index = 0; index < 160; index++) {
      demoClaimState = (await json('/api/admin/state', { headers: demo90Flow.headers })).data;
      if (demoClaimState.claims.some(claim => claim.type === 'ambo' && claim.status === 'confirmed' && claim.playerName === aiPlayer.name)) break;
      await sleep(50);
    }
    assert(demoClaimState.claims.some(claim => claim.type === 'ambo' && claim.status === 'confirmed' && claim.playerName === aiPlayer.name), 'La IA de la demo no reclamó o no fue validada automáticamente.');

    const sourceCards = demo75.state.game.cards.slice(0, 2).map(card => ({ ...card }));
    const game = {
      ...demo75.state.game,
      id: 'integridad-75',
      number: 202602,
      drawMode: 'manual',
      autoSeconds: 20,
      drawn: [],
      phase: 'READY',
      cards: sourceCards
    };

    result = await json('/api/admin/configure', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        game,
        players: sourceCards.map(card => ({ allowedCardCount: 1, cardIds: [card.id] })),
        roomSettings: {
          gameType: 'test', tiePolicy: 'first_claim', linePrizeCount: 1,
          prizeAmounts: { line: 1000, doubleLine: 2000, tripleLine: 3000, corners: 1500, bingo: 5000 }
        }
      })
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    let state = result.data;
    let p1 = await playerLogin(state, 0, 'device-a');
    let p2 = await playerLogin(state, 1, 'device-b');
    assert.equal((await json('/api/player/name', { method: 'POST', headers: p1, body: JSON.stringify({ name: 'Ana' }) })).response.status, 200);
    assert.equal((await json('/api/player/name', { method: 'POST', headers: p2, body: JSON.stringify({ name: 'Bruno' }) })).response.status, 200);

    // El respaldo debe conservar nombres, cupos y estado listo.
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.equal(state.readyToStart, true);
    const backup = (await json('/api/admin/backup', { headers: adminHeaders })).data;
    const restored = await json('/api/admin/restore', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ backup }) });
    assert.equal(restored.response.status, 200, JSON.stringify(restored.data));
    assert.equal(restored.data.readyToStart, true);
    assert.equal(restored.data.players[0].name, 'Ana');
    assert.equal(restored.data.players[0].slotLabel, state.players[0].slotLabel);
    state = restored.data;
    p1 = await playerLogin(state, 0, 'device-a-restored');
    p2 = await playerLogin(state, 1, 'device-b-restored');

    // Chat separado y moderable.
    result = await json('/api/player/chat', { method: 'POST', headers: p1, body: JSON.stringify({ text: '<b>Hola sala</b>' }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.text, '<b>Hola sala</b>');
    result = await json('/api/admin/chat', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ text: 'Mensaje oficial' }) });
    assert.equal(result.response.status, 200);
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.equal(state.chat.messages.length, 2);
    assert.equal(state.chat.messages[0].name, 'Ana');
    result = await json('/api/player/chat', { method: 'POST', headers: p1, body: JSON.stringify({ stickerId: 'gorda-risa' }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.type, 'sticker');
    assert.equal(result.data.stickerId, 'gorda-risa');
    result = await json('/api/player/chat', { method: 'POST', headers: p1, body: JSON.stringify({ stickerId: 'corazon' }) });
    assert.equal(result.response.status, 400, 'El anti-spam de stickers debe bloquear el segundo envío inmediato.');
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.equal(state.chat.messages.length, 3);
    assert.equal((await json('/api/admin/chat/moderate', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ action: 'lock' }) })).response.status, 200);
    assert.equal((await json('/api/player/chat', { method: 'POST', headers: p2, body: JSON.stringify({ text: 'No debería entrar' }) })).response.status, 400);
    await json('/api/admin/chat/moderate', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ action: 'unlock' }) });

    // Orden controlado por servidor y bloqueo de configuración.
    const firstCard = sourceCards[0];
    const secondCard = sourceCards[1];
    const row = firstCard.grid[0].filter(Number.isFinite);
    const union = [...new Set([...row, ...numbers(firstCard), ...numbers(secondCard)])];
    result = await json('/api/admin/test/draw-order', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ sequence: union }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    result = await json('/api/admin/start', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.equal(result.response.status, 200);
    state = await waitForStatus(adminHeaders, 'playing');
    assert(state.game.integrity?.configurationSha256);
    assert(state.game.integrity?.drawOrderCommitment);

    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game: state.game }) });
    assert.equal(result.response.status, 400, 'La configuración debe quedar bloqueada al comenzar.');

    state = await drawMany(adminHeaders, row.length);
    assert.deepEqual(state.game.drawn, row);
    let lineClaim = await json('/api/player/claim', { method: 'POST', headers: p1, body: JSON.stringify({ cardId: firstCard.id, type: 'line' }) });
    assert.equal(lineClaim.response.status, 200, JSON.stringify(lineClaim.data));
    assert.equal(lineClaim.data.officialValid, true);
    const tooSoon = await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: lineClaim.data.id, resolution: 'confirmed' }) });
    assert.equal(tooSoon.response.status, 400, 'No debe resolverse antes de cerrar la ventana de auditoría.');
    await sleep(145);
    result = await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: lineClaim.data.id, resolution: 'confirmed' }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    result = await json('/api/admin/resume', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ mode: 'manual' }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    state = await waitForStatus(adminHeaders, 'playing');

    state = await drawMany(adminHeaders, union.length - row.length);
    assert.deepEqual(state.game.drawn, union);

    // Dos bingos válidos en la misma ventana: gana el primero recibido por el servidor.
    const bingo1 = await json('/api/player/claim', { method: 'POST', headers: p1, body: JSON.stringify({ cardId: firstCard.id, type: 'bingo' }) });
    const bingo2 = await json('/api/player/claim', { method: 'POST', headers: p2, body: JSON.stringify({ cardId: secondCard.id, type: 'bingo' }) });
    assert.equal(bingo1.response.status, 200, JSON.stringify(bingo1.data));
    assert.equal(bingo2.response.status, 200, JSON.stringify(bingo2.data));
    assert.equal(bingo1.data.officialValid, true);
    assert.equal(bingo2.data.officialValid, true);
    assert(bingo2.data.receivedSequence > bingo1.data.receivedSequence);
    await sleep(145);
    result = await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: bingo1.data.id, resolution: 'confirmed' }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    state = await waitForStatus(adminHeaders, 'finished');
    assert.equal(state.game.drawn.length, 75);

    const acta = (await json('/api/admin/acta', { headers: adminHeaders })).data;
    assert.equal(acta.version, 'LA GORDA - BINGO ONLINE');
    assert.equal(acta.categories.bingo.status, 'confirmed');
    const bingoWinner = acta.categories.bingo.winners[0];
    assert.equal(bingoWinner.receivedSequence, bingo1.data.receivedSequence);
    assert.equal(bingoWinner.claimAlerts.length, 2);
    assert.equal(bingoWinner.claimAlerts[0].winner, true);
    assert.equal(bingoWinner.claimAlerts[1].resolutionReason, 'valid_but_received_later');
    assert(bingoWinner.claimAlerts[1].sequence > bingoWinner.claimAlerts[0].sequence);
    const csv = await (await fetch(base + '/api/admin/acta.csv', { headers: adminHeaders })).text();
    assert(csv.includes('TODAS LAS ALERTAS DE PREMIOS'));
    assert(csv.includes('VÁLIDA POSTERIOR'));
    const pdf = await fetch(base + `/api/results.pdf?sala=${encodeURIComponent(state.roomCode)}`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert(pdf.headers.get('content-disposition').startsWith('attachment;'));
    const previewPdf = await fetch(base + `/api/results.pdf?sala=${encodeURIComponent(state.roomCode)}&preview=1`);
    assert.equal(previewPdf.status, 200);
    assert.equal(previewPdf.headers.get('content-type'), 'application/pdf');
    assert(previewPdf.headers.get('content-disposition').startsWith('inline;'));
    const pdfBuffer = Buffer.from(await pdf.arrayBuffer());
    assert(pdfBuffer.length > 5000);
    assert(pdfBuffer.toString('latin1').includes('OTRAS ALERTAS RECIBIDAS'));
    fs.writeFileSync(path.join(dataDir, 'resultado-prueba.pdf'), pdfBuffer);

    // Más de 10 jugadores: automarcado obligatorio y rechazo del modo manual.
    await json('/api/admin/close', { method: 'POST', headers: adminHeaders, body: '{}' });
    const rules90 = { ambocabeza: true, line: true, doubleLine: false, tripleLine: false, corners: false, bingo: true };
    const cards11 = generatedSets[90].slice(0, 11).map((grid, index) => ({
      id: `large90-${index + 1}`, number: String(index + 1).padStart(3, '0'), name: `Cartón ${index + 1}`,
      originalName: `Cartón ${index + 1}`, mode: 90, source: 'generated', grid,
      bets: { ambocabeza: true, line: true, doubleLine: false, tripleLine: false, corners: false, bingo: true }
    }));
    const largeGame = { id: 'escala-90', number: 90, mode: 90, rules: rules90, drawMode: 'manual', autoSeconds: 10, presenter: 'vero', phase: 'READY', drawn: [], cards: cards11 };
    result = await json('/api/admin/configure', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        game: largeGame,
        players: cards11.map(card => ({ allowedCardCount: 1, cardIds: [card.id] })),
        roomSettings: { gameType: 'test', tiePolicy: 'first_claim', linePrizeCount: 1 }
      })
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.markingPolicy.automaticRequired, true);
    assert.equal(result.data.markingPolicy.activePlayers, 11);
    assert(result.data.players.every(player => player.autoMark));
    const largePlayer = await playerLogin(result.data, 0, 'large-device');
    const disableAutomark = await json('/api/player/automark', { method: 'POST', headers: largePlayer, body: JSON.stringify({ enabled: false }) });
    assert.equal(disableAutomark.response.status, 400);

    // El servidor rechaza cartones malformados aunque el navegador intente enviarlos.
    await json('/api/admin/close', { method: 'POST', headers: adminHeaders, body: '{}' });
    const malformed = { ...largeGame, id: 'invalido', cards: [{ ...cards11[0], id: 'bad', number: 'BAD', grid: [[1]] }, cards11[1]] };
    result = await json('/api/admin/configure', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ game: malformed, players: [{ allowedCardCount: 1 }, { allowedCardCount: 1 }] })
    });
    assert.equal(result.response.status, 400);

    // Escala real: 60 jugadores, 240 cartones, 60 conexiones SSE y una ráfaga de chat.
    const scaleRules = { ambocabeza: false, line: true, doubleLine: true, tripleLine: true, corners: true, bingo: true };
    const scaleCards = generatedSets[75].map((grid, index) => ({
      id: `scale-${index + 1}`, number: String(index + 1).padStart(3, '0'), name: `Cartón ${index + 1}`,
      originalName: `Cartón ${index + 1}`, mode: 75, source: 'generated', grid,
      bets: { ambocabeza: false, line: true, doubleLine: true, tripleLine: true, corners: true, bingo: true }
    }));
    result = await json('/api/admin/configure', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        game: { id: 'escala-60', number: 60, mode: 75, rules: scaleRules, drawMode: 'manual', autoSeconds: 10, presenter: 'vero', phase: 'READY', drawn: [], cards: scaleCards },
        players: Array.from({ length: 60 }, () => ({ allowedCardCount: 4 })),
        roomSettings: { gameType: 'test', tiePolicy: 'first_claim' }
      })
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    state = result.data;
    for (const player of state.players) {
      result = await json('/api/admin/assign-player', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ playerId: player.id, cardNumbers: [] }) });
      assert.equal(result.response.status, 200, JSON.stringify(result.data));
      state = result.data;
    }
    assert.equal(state.markingPolicy.activePlayers, 60);
    assert.equal(state.markingPolicy.activeCards, 240);
    assert.equal(state.markingPolicy.automaticRequired, true);
    assert(state.players.every(player => player.autoMark));

    const scaleLogins = await Promise.all(state.players.map((player, index) => json('/api/player/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: player.code, roomCode: state.roomCode, deviceId: `scale-device-${index + 1}` })
    })));
    assert(scaleLogins.every(item => item.response.status === 200), JSON.stringify(scaleLogins.find(item => item.response.status !== 200)?.data || {}));
    const scaleHeaders = scaleLogins.map(item => ({ 'Content-Type': 'application/json', 'X-Player-Token': item.data.token }));
    await Promise.all(scaleHeaders.map((headers, index) => json('/api/player/name', { method: 'POST', headers, body: JSON.stringify({ name: `Persona ${index + 1}` }) })));
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.equal(state.readyToStart, true);

    const controllers = scaleHeaders.map(() => new AbortController());
    const streams = await Promise.all(scaleHeaders.map((headers, index) => fetch(`${base}/api/events?role=player&token=${encodeURIComponent(headers['X-Player-Token'])}`, { signal: controllers[index].signal })));
    assert(streams.every(stream => stream.status === 200));
    await sleep(100);
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.equal(state.players.filter(player => player.connected).length, 60);

    await json('/api/admin/start', { method: 'POST', headers: adminHeaders, body: '{}' });
    state = await waitForStatus(adminHeaders, 'playing');
    const drawStarted = Date.now();
    result = await json('/api/admin/draw', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ source: 'scale-test' }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert(Date.now() - drawStarted < 5000, 'Una extracción con 60 conexiones tardó demasiado.');

    const chatStarted = Date.now();
    const chatBurst = await Promise.all(scaleHeaders.map((headers, index) => json('/api/player/chat', { method: 'POST', headers, body: JSON.stringify({ text: `Mensaje de escala ${index + 1}` }) })));
    assert(chatBurst.every(item => item.response.status === 200), JSON.stringify(chatBurst.find(item => item.response.status !== 200)?.data || {}));
    assert(Date.now() - chatStarted < 8000, 'La ráfaga de 60 mensajes tardó demasiado.');
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.equal(state.chat.messages.length, 60);
    controllers.forEach(controller => controller.abort());

    console.log('PRUEBAS LA GORDA - BINGO ONLINE: OK');
  } catch (error) {
    console.error(error);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
})();
