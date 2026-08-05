'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const port = 44800 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-beta-test-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    ONLINE_MODE: 'true',
    ADMIN_PASSWORD: 'prueba-segura',
    RENDER_EXTERNAL_URL: 'https://bingo-prueba.onrender.com',
    BINGO_DATA_DIR: dataDir
  },
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

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch {}
    await sleep(80);
  }
  throw new Error(`El servidor no inició.\n${logs}`);
}

function card(index) {
  return {
    id: `card-${index}`,
    number: String(index).padStart(3, '0'),
    name: `Cartón disponible ${index}`,
    originalName: `Cartón disponible ${index}`,
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
    let result = await json('/healthz');
    assert.strictEqual(result.data.version, 'Beta');

    const adminJs = await (await fetch(`${base}/js/online-room-admin.js`)).text();
    const playerJs = await (await fetch(`${base}/js/online-room-player.js`)).text();
    const appJs = await (await fetch(`${base}/js/app-v8.js`)).text();
    const adminHtml = await (await fetch(`${base}/admin`)).text();
    const playerHtml = await (await fetch(`${base}/jugador`)).text();
    assert.ok(adminJs.includes('Revisión antes de iniciar'));
    assert.ok(adminJs.includes('PROBAR BINGO'));
    assert.ok(adminJs.includes('Buscar jugador o cartón'));
    assert.ok(adminJs.includes('NUEVA SALA'));
    assert.ok(playerJs.includes('prizeReady'));
    assert.ok(playerJs.includes('¡TENÉS BINGO'));
    assert.ok(appJs.includes('length: 250'));
    assert.ok(adminHtml.includes('VERSIÓN BETA'));
    assert.ok(playerHtml.includes('resultsBtn'));
    assert.ok(playerJs.includes('/api/results.pdf'));
    assert.ok(adminJs.includes('RESULTADOS · DESCARGAR PDF'));

    result = await json('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'prueba-segura' })
    });
    assert.strictEqual(result.response.status, 200);
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': result.data.token };

    const cards = Array.from({ length: 250 }, (_, i) => card(i + 1));
    const game = {
      id: 'game-beta', number: 17, mode: 90,
      rules: { ambocabeza: false, line: true, bingo: true },
      drawMode: 'manual', autoSeconds: 6, presenter: 'vero', theme: 'clasico',
      phase: 'READY', drawn: [], cards
    };

    // Capacidad máxima prevista: 60 jugadores x 4 = 240 cartones activos, con 250 generados.
    const maxPlayers = Array.from({ length: 60 }, (_, i) => ({ name: `Masivo ${i + 1}`, allowedCardCount: 4 }));
    result = await json('/api/admin/configure', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ game, players: maxPlayers })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.maxCards, 250);
    assert.strictEqual(result.data.maxActiveCards, 240);
    assert.strictEqual(result.data.maxPlayers, 60);
    assert.strictEqual(result.data.preflight.activeCards, 0);
    assert.strictEqual(result.data.preflight.pendingPlayers.length, 60);

    // Sala funcional reducida para probar todo el flujo.
    const players = Array.from({ length: 6 }, (_, i) => ({ name: `Jugador ${i + 1}`, allowedCardCount: 2 }));
    result = await json('/api/admin/configure', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        game, players,
        roomSettings: {
          playerAudioAllowed: true,
          linePrizeCount: 2,
          allowSamePlayerSecondLine: true,
          tiePolicy: 'same_ball'
        },
        assignmentTimer: { enabled: true, durationMinutes: 10 }
      })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    let state = result.data;
    assert.strictEqual(state.status, 'waiting');
    assert.strictEqual(state.readyToStart, false);

    // Asignación manual, liberación y reasignación antes del inicio.
    result = await json('/api/admin/assign-player', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ playerId: state.players[0].id, cardNumbers: ['001', '002'] })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.players[0].selectionConfirmed, true);
    result = await json('/api/admin/release-selection', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ playerId: state.players[0].id })
    });
    assert.strictEqual(result.response.status, 200);
    result = await json('/api/admin/assign-player', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ playerId: state.players[0].id, cardNumbers: ['001', '002'] })
    });
    assert.strictEqual(result.response.status, 200);
    state = result.data;

    // Ingreso, reserva y modo de prueba, sin alterar el sorteo.
    const sessions = [];
    for (let i = 0; i < 6; i++) {
      const login = await json('/api/player/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: state.players[i].code, roomCode: state.roomCode })
      });
      assert.strictEqual(login.response.status, 200, JSON.stringify(login.data));
      sessions.push({ headers: { 'Content-Type': 'application/json', 'X-Player-Token': login.data.token } });
    }

    let p2 = (await json('/api/player/state', { headers: sessions[1].headers })).data;
    const reservedP2 = p2.player.offeredCards[0].id;
    result = await json('/api/player/reserve', {
      method: 'POST', headers: sessions[1].headers,
      body: JSON.stringify({ cardId: reservedP2, reserve: true })
    });
    assert.strictEqual(result.response.status, 200);

    result = await json('/api/admin/test-event', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ type: 'bingo', text: 'Prueba sin afectar la partida' })
    });
    assert.strictEqual(result.response.status, 200);
    const testPlayerState = (await json('/api/player/state', { headers: sessions[1].headers })).data;
    assert.strictEqual(testPlayerState.testEvent.type, 'bingo');
    assert.strictEqual(testPlayerState.game.drawn.length, 0);

    // La sala de espera impide sortear antes de presionar INICIAR SORTEO.
    game.drawn = [1];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 400);
    game.drawn = [];

    // Asignación automática completa pendientes, conserva reserva y evita duplicados.
    result = await json('/api/admin/assignment-timer', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ action: 'assign-now' })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    state = result.data;
    assert.strictEqual(state.readyToStart, true);
    assert.strictEqual(state.preflight.ok, true);
    assert.strictEqual(state.preflight.activeCards, 12);
    assert.strictEqual(state.cardStatus.length, 12);
    assert.ok(state.players[1].cardIds.includes(reservedP2));
    assert.strictEqual(new Set(state.cardStatus.map(item => item.cardId)).size, 12);

    result = await json('/api/admin/start', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'playing');

    // El sistema avisa al jugador cuando oficialmente ya tiene línea.
    game.drawn = [1, 2, 3, 4, 5];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    state = result.data;
    const playerOneState = (await json('/api/player/state', { headers: sessions[0].headers })).data;
    assert.ok(playerOneState.readiness.some(item => item.lineEligible));

    // Dos reclamos con la misma última bolilla forman un empate por la primera línea.
    const p1Card = state.players[0].cardIds[0];
    const p2Card = state.players[1].cardIds[0];
    const claim1 = await json('/api/player/claim', {
      method: 'POST', headers: sessions[0].headers,
      body: JSON.stringify({ cardId: p1Card, type: 'line' })
    });
    assert.strictEqual(claim1.response.status, 200, JSON.stringify(claim1.data));
    const claim2 = await json('/api/player/claim', {
      method: 'POST', headers: sessions[1].headers,
      body: JSON.stringify({ cardId: p2Card, type: 'line' })
    });
    assert.strictEqual(claim2.response.status, 200, JSON.stringify(claim2.data));
    assert.strictEqual(claim1.data.prizeNumber, 1);
    assert.strictEqual(claim2.data.prizeNumber, 1);

    for (const claim of [claim1.data, claim2.data]) {
      result = await json('/api/admin/resolve', {
        method: 'POST', headers: adminHeaders,
        body: JSON.stringify({ claimId: claim.id, resolution: 'confirmed' })
      });
      assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    }
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.strictEqual(state.prizeStatus.line.awarded, 1);
    assert.strictEqual(state.prizeStatus.line.winners.length, 2);
    assert.strictEqual(state.prizeStatus.line.closed, false);

    // Segunda línea para el mismo jugador, pero con otro cartón, y cierre del botón de línea.
    const p1SecondCard = state.players[0].cardIds[1];
    result = await json('/api/player/claim', {
      method: 'POST', headers: sessions[0].headers,
      body: JSON.stringify({ cardId: p1SecondCard, type: 'line' })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.prizeNumber, 2);
    result = await json('/api/admin/resolve', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ claimId: result.data.id, resolution: 'confirmed' })
    });
    assert.strictEqual(result.response.status, 200);
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.strictEqual(state.prizeStatus.line.closed, true);
    const extraLine = await json('/api/player/claim', {
      method: 'POST', headers: sessions[3].headers,
      body: JSON.stringify({ cardId: state.players[3].cardIds[0], type: 'line' })
    });
    assert.strictEqual(extraLine.response.status, 400);

    // Bingo, alerta oficial y cierre del premio.
    game.drawn = [1, 2, 3, 4, 5, 11, 22, 33, 44, 55, 7, 37, 48, 67, 78, 89];
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    state = result.data;
    const p4State = (await json('/api/player/state', { headers: sessions[3].headers })).data;
    assert.ok(p4State.readiness.some(item => item.bingoEligible));
    const p4Card = state.players[3].cardIds[0];
    result = await json('/api/player/claim', {
      method: 'POST', headers: sessions[3].headers,
      body: JSON.stringify({ cardId: p4Card, type: 'bingo' })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    result = await json('/api/admin/resolve', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ claimId: result.data.id, resolution: 'confirmed' })
    });
    assert.strictEqual(result.response.status, 200);

    // Cierre, acta completa y exportación separada de jugadores.
    result = await json('/api/admin/finish', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'finished');

    const acta = await json('/api/admin/acta', { headers: adminHeaders });
    assert.strictEqual(acta.response.status, 200);
    assert.strictEqual(acta.data.version, 'Beta');
    assert.deepStrictEqual(acta.data.balls.map(row => row.number), game.drawn);
    assert.strictEqual(acta.data.participants.length, 6);
    assert.strictEqual(acta.data.winners.length, 4); // empate de primera línea + segunda línea + bingo

    const csvResponse = await fetch(`${base}/api/admin/acta.csv`, { headers: { 'X-Admin-Token': adminHeaders['X-Admin-Token'] } });
    assert.strictEqual(csvResponse.status, 200);
    const csv = await csvResponse.text();
    assert.ok(csv.includes('JUGADORES Y CARTONES'));
    assert.ok(csv.includes('Primera línea'));

    const participantsResponse = await fetch(`${base}/api/admin/participants.csv`, { headers: { 'X-Admin-Token': adminHeaders['X-Admin-Token'] } });
    assert.strictEqual(participantsResponse.status, 200);
    const participantsCsv = await participantsResponse.text();
    assert.ok(participantsCsv.includes('AUTORIZADOS'));
    assert.ok(participantsCsv.includes('Jugador 1'));

    assert.ok(Array.isArray(acta.data.winners[0].grid));
    assert.ok(acta.data.winners.every(winner => winner.claimedAt));
    assert.ok(acta.data.winners.every(winner => winner.ballOrder));

    const publicPdfResponse = await fetch(`${base}/api/results.pdf?sala=${state.roomCode}`);
    assert.strictEqual(publicPdfResponse.status, 200);
    const pdf = Buffer.from(await publicPdfResponse.arrayBuffer());
    assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 50000);
    if (process.env.BINGO_TEST_PDF_OUT) fs.writeFileSync(process.env.BINGO_TEST_PDF_OUT, pdf);

    const wrongRoomPdf = await fetch(`${base}/api/results.pdf?sala=OTRA`);
    assert.strictEqual(wrongRoomPdf.status, 400);

    // Bloqueo total al finalizar.
    game.drawn.push(90);
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 400);

    result = await json('/api/admin/backup', { headers: adminHeaders });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.format, 'el-bingo-de-la-gorda-beta-backup');

    // Nueva sala limpia todo el estado anterior.
    result = await json('/api/admin/new-room', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.data.active, false);
    assert.strictEqual(result.data.status, 'closed');
    assert.strictEqual(result.data.players.length, 0);

    console.log('PRUEBAS BETA: OK');
  } catch (error) {
    console.error(error.stack || error);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
