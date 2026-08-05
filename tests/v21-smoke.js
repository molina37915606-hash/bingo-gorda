'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const port = 45200 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-v21-test-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    ONLINE_MODE: 'true',
    MASTER_ADMIN_PASSWORD: 'prueba-maestra-2.1',
    ADMIN_PASSWORD: 'clave-antigua-no-usada',
    PUBLIC_URL: base,
    BINGO_DATA_DIR: dataDir,
    BINGO_START_SEQUENCE_MS: '250',
    BINGO_RESUME_SEQUENCE_MS: '220'
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

async function waitForStatus(headers, status, timeout = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await json('/api/admin/state', { headers });
    if (result.data.status === status) return result.data;
    await sleep(40);
  }
  throw new Error(`La sala no llegó al estado ${status}.`);
}

function card(index) {
  return {
    id: `card-${index}`,
    number: String(index).padStart(3, '0'),
    name: `Cartón ${String(index).padStart(3, '0')}`,
    originalName: `Cartón ${String(index).padStart(3, '0')}`,
    mode: 90,
    grid: [
      [1, 2, 3, 4, 5, null, null, null, null],
      [null, 11, 22, 33, 44, 55, null, null, null],
      [7, null, null, 37, 48, null, 67, 78, 89]
    ],
    bets: { ambocabeza: true, line: true, bingo: true }
  };
}

async function resumeAndWait(adminHeaders) {
  const resumed = await json('/api/admin/resume', { method: 'POST', headers: adminHeaders, body: '{}' });
  assert.strictEqual(resumed.response.status, 200, JSON.stringify(resumed.data));
  assert.strictEqual(resumed.data.status, 'resuming');
  return waitForStatus(adminHeaders, 'playing');
}

(async () => {
  try {
    await waitForServer();

    let result = await json('/healthz');
    assert.strictEqual(result.data.version, '2.1');

    const principalHtml = await (await fetch(`${base}/admin-principal`)).text();
    const adminHtml = await (await fetch(`${base}/admin`)).text();
    const transmissionHtml = await (await fetch(`${base}/transmision/demo`)).text();
    const adminJs = await (await fetch(`${base}/js/online-room-admin.js`)).text();
    const playerJs = await (await fetch(`${base}/js/online-room-player.js`)).text();
    const presenterJs = await (await fetch(`${base}/js/presenter-scripts.js`)).text();
    const appJs = await (await fetch(`${base}/js/app-v8.js`)).text();

    assert.ok(principalHtml.includes('ADMINISTRACIÓN PRINCIPAL'));
    assert.ok(principalHtml.includes('Crear acceso temporal'));
    assert.ok(adminHtml.includes('BINGO DE LA GORDA 2.1'));
    assert.ok(adminHtml.includes('CREAR SALA'));
    assert.ok(adminHtml.includes('RECUPERAR PARTIDA'));
    assert.ok(!adminHtml.includes('INGRESAR A SALA'));
    assert.ok(transmissionHtml.toUpperCase().includes('MODO TIKTOK'));
    assert.ok(appJs.includes('length: 250'));
    assert.ok(appJs.includes('CONFIGURAR SALA'));
    assert.ok(appJs.includes("if (this.localRoom?.active) groups = [];"));
    assert.ok(appJs.includes('updateAutoSeconds(value)'));
    assert.ok(playerJs.includes('RENOVAR CARTONES'));
    assert.ok(playerJs.includes('Al continuar, aceptás el reglamento interno.'));
    assert.ok(playerJs.includes('EL ADMINISTRADOR PAUSÓ LA PARTIDA'));
    assert.ok(playerJs.includes('LA PARTIDA CONTINÚA EN'));
    assert.ok(presenterJs.includes('class PhraseEngine'));
    assert.ok((presenterJs.match(/'[^']*\{n\}[^']*'/g) || []).length >= 120);
    assert.ok(adminJs.includes("['starting','resuming'].includes(previous)"));
    assert.ok(adminJs.includes('Solicitudes de cambio de dispositivo'));

    // Panel principal y creación de un acceso separado para un operador temporal.
    result = await json('/api/master/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'prueba-maestra-2.1' })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    const masterHeaders = { 'Content-Type': 'application/json', 'X-Master-Token': result.data.token };

    result = await json('/api/master/operators', {
      method: 'POST', headers: masterHeaders,
      body: JSON.stringify({ name: 'Operador de prueba', hours: 24, maxGames: 1 })
    });
    assert.strictEqual(result.response.status, 201, JSON.stringify(result.data));
    const operator = result.data.operator;
    assert.strictEqual(operator.status, 'active');
    assert.ok(operator.accessUrl.includes('/operador/'));
    const accessToken = decodeURIComponent(operator.accessUrl.split('/operador/')[1]);

    result = await json('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorAccessToken: accessToken })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.role, 'operator');
    const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': result.data.token };

    // El propietario conserva un espacio separado del operador.
    const ownerLogin = await json('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'prueba-maestra-2.1' })
    });
    const ownerHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': ownerLogin.data.token };
    const ownerState = await json('/api/admin/state', { headers: ownerHeaders });
    assert.strictEqual(ownerState.data.active, false);
    assert.strictEqual(ownerState.data.accessContext.role, 'owner');

    const cards = Array.from({ length: 250 }, (_, i) => card(i + 1));
    let game = {
      id: 'game-v21', number: 21, mode: 90,
      rules: { ambocabeza: true, line: true, bingo: true },
      drawMode: 'automatic', autoSeconds: 10, presenter: 'daia', theme: 'clasico',
      phase: 'READY', drawn: [], cards
    };
    const players = Array.from({ length: 6 }, (_, i) => ({ name: `Jugador ${i + 1}`, allowedCardCount: 2 }));
    result = await json('/api/admin/configure', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        game, players,
        roomSettings: {
          playerAudioAllowed: true, playerAudioDefault: true,
          linePrizeCount: 1, allowSamePlayerSecondLine: false, tiePolicy: 'first_claim',
          gameType: 'real', prizeAmounts: { ambo: 20000, line: 50000, bingo: 300000 },
          whatsapp: '+54 3764 000000', showMercadoPago: true, argentinaHint: true
        },
        assignmentTimer: { enabled: true, durationMinutes: 10 }
      })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    let state = result.data;
    assert.strictEqual(state.accessContext.role, 'operator');
    assert.strictEqual(state.maxCards, 250);
    assert.strictEqual(state.status, 'waiting');
    assert.ok(state.broadcastUrl.includes('/transmision/'));
    assert.strictEqual(state.roomSettings.prizeAmounts.bingo, 300000);

    const broadcastToken = decodeURIComponent(state.broadcastUrl.split('/transmision/')[1]);
    let broadcast = await json(`/api/broadcast/state?token=${encodeURIComponent(broadcastToken)}`);
    assert.strictEqual(broadcast.response.status, 200);
    assert.strictEqual(broadcast.data.roomSettings.whatsapp, '+54 3764 000000');
    assert.strictEqual(broadcast.data.roomSettings.argentinaHint, true);

    const sessions = [];
    for (let i = 0; i < players.length; i++) {
      const deviceId = `device-${i + 1}`;
      const login = await json('/api/player/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: state.players[i].code, roomCode: state.roomCode, deviceId })
      });
      assert.strictEqual(login.response.status, 200, JSON.stringify(login.data));
      sessions.push({ deviceId, headers: { 'Content-Type': 'application/json', 'X-Player-Token': login.data.token } });
    }

    // Renovar opciones conserva lo reservado.
    const p2 = (await json('/api/player/state', { headers: sessions[1].headers })).data;
    const firstOffers = p2.player.offeredCards.map(item => item.id);
    const reserved = firstOffers[0];
    await json('/api/player/reserve', { method: 'POST', headers: sessions[1].headers, body: JSON.stringify({ cardId: reserved, reserve: true }) });
    result = await json('/api/player/renew-offers', { method: 'POST', headers: sessions[1].headers, body: '{}' });
    assert.strictEqual(result.response.status, 200);
    assert.ok(result.data.player.reservedCardIds.includes(reserved));
    assert.ok(result.data.player.offeredCards.some(item => item.id === reserved));
    assert.ok(result.data.player.offeredCards.some(item => !firstOffers.includes(item.id)));

    // Cambio de dispositivo solo con autorización del administrador.
    const duplicateLogin = await json('/api/player/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: state.players[1].code, roomCode: state.roomCode, deviceId: 'device-nuevo' })
    });
    assert.strictEqual(duplicateLogin.response.status, 409);
    const transfer = await json('/api/player/request-transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: state.players[1].code, roomCode: state.roomCode, deviceId: 'device-nuevo' })
    });
    state = (await json('/api/admin/resolve-device-transfer', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ requestId: transfer.data.requestId, resolution: 'approved' })
    })).data;
    const transferStatus = await json('/api/player/transfer-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: transfer.data.requestId, deviceId: 'device-nuevo' })
    });
    assert.strictEqual(transferStatus.data.status, 'approved');
    sessions[1].headers = { 'Content-Type': 'application/json', 'X-Player-Token': transferStatus.data.token };

    // Asignación automática completa los cartones.
    result = await json('/api/admin/assignment-timer', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ action: 'assign-now' })
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    state = result.data;
    assert.strictEqual(state.readyToStart, true);
    assert.strictEqual(state.preflight.activeCards, 12);

    // Otra sala del propietario puede iniciar al mismo tiempo sin mezclar temporizadores ni datos.
    const ownerCards = [card(901), card(902)].map((item, index) => ({ ...item, id: `owner-card-${index + 1}`, number: `O${index + 1}`, name: `Cartón propietario ${index + 1}` }));
    const ownerGame = {
      id: 'owner-concurrent-game', number: 99, mode: 90,
      rules: { ambocabeza: true, line: true, bingo: true }, drawMode: 'manual', autoSeconds: 10,
      presenter: 'vero', theme: 'clasico', phase: 'READY', drawn: [], cards: ownerCards
    };
    let ownerConfigured = await json('/api/admin/configure', {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ game: ownerGame, players: [{ name: 'Propietario A', allowedCardCount: 1 }, { name: 'Propietario B', allowedCardCount: 1 }] })
    });
    assert.strictEqual(ownerConfigured.response.status, 200, JSON.stringify(ownerConfigured.data));
    ownerConfigured = await json('/api/admin/assignment-timer', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({ action: 'assign-now' }) });
    assert.strictEqual(ownerConfigured.data.readyToStart, true);

    const [operatorStart, ownerStart] = await Promise.all([
      json('/api/admin/start', { method: 'POST', headers: adminHeaders, body: '{}' }),
      json('/api/admin/start', { method: 'POST', headers: ownerHeaders, body: '{}' })
    ]);
    assert.strictEqual(operatorStart.data.status, 'starting');
    assert.strictEqual(ownerStart.data.status, 'starting');
    const [operatorPlaying, ownerPlaying] = await Promise.all([
      waitForStatus(adminHeaders, 'playing'),
      waitForStatus(ownerHeaders, 'playing')
    ]);
    state = operatorPlaying;
    assert.strictEqual(ownerPlaying.roomCode === state.roomCode, false);
    await json('/api/admin/pause', { method: 'POST', headers: ownerHeaders, body: '{}' });

    // El intervalo automático puede cambiar durante la partida.
    game = state.game;
    game.autoSeconds = 17;
    result = await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.game.autoSeconds, 17);

    // AmboCabeza solo se anuncia cuando el jugador reclama; luego queda pausado.
    game = result.data.game;
    game.drawn = [1, 5];
    state = (await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) })).data;
    const p1 = (await json('/api/player/state', { headers: sessions[0].headers })).data;
    assert.ok(p1.readiness.some(item => item.amboEligible));
    assert.strictEqual(state.claims.filter(item => item.type === 'ambo').length, 0);
    let claim = await json('/api/player/claim', {
      method: 'POST', headers: sessions[0].headers,
      body: JSON.stringify({ cardId: state.players[0].cardIds[0], type: 'ambo' })
    });
    assert.strictEqual(claim.response.status, 200, JSON.stringify(claim.data));
    assert.strictEqual(claim.data.officialValid, true);
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.strictEqual(state.status, 'paused');
    const adminClaim = state.claims.find(item => item.id === claim.data.id);
    assert.ok(adminClaim.comparison.playerMarked);
    assert.ok(adminClaim.comparison.officialMarked);
    result = await json('/api/admin/resolve', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ claimId: claim.data.id, resolution: 'confirmed' })
    });
    assert.strictEqual(result.response.status, 200);
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.strictEqual(state.status, 'paused'); // nunca reinicia solo
    state = await resumeAndWait(adminHeaders);

    // Línea: mismo flujo manual y sin reinicio automático.
    game = state.game;
    game.drawn = [1, 2, 3, 4, 5];
    state = (await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) })).data;
    claim = await json('/api/player/claim', {
      method: 'POST', headers: sessions[2].headers,
      body: JSON.stringify({ cardId: state.players[2].cardIds[0], type: 'line' })
    });
    assert.strictEqual(claim.response.status, 200, JSON.stringify(claim.data));
    await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: claim.data.id, resolution: 'confirmed' }) });
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.strictEqual(state.status, 'paused');
    state = await resumeAndWait(adminHeaders);

    // Bingo: la celebración se publica solo después de la aprobación.
    game = state.game;
    game.drawn = [1, 2, 3, 4, 5, 11, 22, 33, 44, 55, 7, 37, 48, 67, 78, 89];
    state = (await json('/api/admin/game', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ game }) })).data;
    claim = await json('/api/player/claim', {
      method: 'POST', headers: sessions[3].headers,
      body: JSON.stringify({ cardId: state.players[3].cardIds[0], type: 'bingo' })
    });
    broadcast = await json(`/api/broadcast/state?token=${encodeURIComponent(broadcastToken)}`);
    assert.strictEqual(broadcast.data.pendingClaim.type, 'bingo');
    assert.strictEqual(broadcast.data.latestConfirmed, null);
    await json('/api/admin/resolve', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ claimId: claim.data.id, resolution: 'confirmed' }) });
    broadcast = await json(`/api/broadcast/state?token=${encodeURIComponent(broadcastToken)}`);
    assert.strictEqual(broadcast.data.pendingClaim, null);
    assert.strictEqual(broadcast.data.latestConfirmed.type, 'bingo');
    state = (await json('/api/admin/state', { headers: adminHeaders })).data;
    assert.strictEqual(state.status, 'paused');
    assert.strictEqual(state.bingoConfirmed, true);

    result = await json('/api/admin/finish', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.data));
    assert.strictEqual(result.data.status, 'finished');

    const acta = await json('/api/admin/acta', { headers: adminHeaders });
    assert.strictEqual(acta.data.version, '2.1');
    assert.ok(acta.data.winners.some(item => item.type === 'ambo'));
    assert.ok(acta.data.winners.some(item => item.type === 'line'));
    assert.ok(acta.data.winners.some(item => item.type === 'bingo'));

    const pdfResponse = await fetch(`${base}/api/results.pdf?sala=${state.roomCode}`);
    assert.strictEqual(pdfResponse.status, 200);
    const pdf = Buffer.from(await pdfResponse.arrayBuffer());
    assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 50000);

    result = await json('/api/admin/backup', { headers: adminHeaders });
    assert.strictEqual(result.data.format, 'el-bingo-de-la-gorda-2.1-backup');

    // Límite de una partida para el acceso temporal.
    result = await json('/api/admin/new-room', { method: 'POST', headers: adminHeaders, body: '{}' });
    assert.strictEqual(result.response.status, 400);
    assert.match(result.data.error, /máxima|límite|partidas/i);

    // Revocar el acceso impide usar el panel limitado.
    await json('/api/master/operators/revoke', {
      method: 'POST', headers: masterHeaders, body: JSON.stringify({ id: operator.id, revoke: true })
    });
    result = await json('/api/admin/state', { headers: adminHeaders });
    assert.strictEqual(result.response.status, 401);

    console.log('PRUEBAS BINGO DE LA GORDA 2.1: OK');
  } catch (error) {
    console.error(error.stack || error);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
