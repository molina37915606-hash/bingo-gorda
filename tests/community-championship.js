'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const communityHtml = fs.readFileSync(path.join(root, 'comunidad.html'), 'utf8');
const communityJs = fs.readFileSync(path.join(root, 'js/community.js'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert(communityHtml.includes('privateRoomGameKind') && communityHtml.includes('CAMPEONATO'), 'Comunidad debe ofrecer Campeonato al crear sala.');
assert(communityHtml.includes('privateRoomChampionshipRounds'), 'Comunidad debe permitir 10/20/30 rondas.');
assert(communityJs.includes("'championship'") && communityJs.includes('privateRoomGameKind'), 'Comunidad debe enviar/interpretar el tipo Campeonato.');
assert(playerJs.includes('renderChampionshipResults') && playerJs.includes('RECLAMAR BINGO'), 'Jugador debe conservar reclamo normal y resultados entre rondas.');
assert(serverSrc.includes('function prepareChampionshipRound') && serverSrc.includes('function processChampionshipAfterDraw'), 'Servidor debe tener motor de Campeonato.');
assert(serverSrc.includes('Math.min(mode, drawCount + 5)'), 'Primer Bingo debe cerrar exactamente cinco extracciones después, limitado por el bolillero.');

const port = 58900 + Math.floor(Math.random() * 80);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-championship-'));
let child = null;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function spawnServer() {
  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port), ONLINE_MODE: 'false', MASTER_ADMIN_PASSWORD: '', ADMIN_PASSWORD: '',
      BINGO_TEST_MODE: 'true', BINGO_DATA_DIR: dataDir, PUBLIC_URL: base,
      BINGO_START_SEQUENCE_MS: '30', BINGO_COMMUNITY_PUBLIC_OPEN_MS: '8000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}
async function stop() {
  if (!child) return;
  const proc = child; child = null;
  await new Promise(resolve => {
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 1400);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
    try { proc.kill('SIGTERM'); } catch { clearTimeout(timer); resolve(); }
  });
}
async function waitServer() {
  for (let i = 0; i < 160; i++) {
    try { if ((await fetch(base + '/healthz')).ok) return; } catch {}
    await wait(40);
  }
  throw new Error('No inició servidor');
}
async function raw(pathname, { method = 'GET', body, token, playerToken } = {}) {
  const response = await fetch(base + pathname, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Admin-Token': token } : {}),
      ...(playerToken ? { 'X-Player-Token': playerToken } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function ok(pathname, options = {}) {
  const out = await raw(pathname, options);
  assert(out.response.ok, `${pathname}: ${out.response.status} ${JSON.stringify(out.data)}`);
  return out.data;
}
async function adminLogin() { return (await ok('/api/admin/login', { method: 'POST', body: { password: '' } })).token; }
async function selectRoom(admin, roomCode) {
  const list = await ok('/api/admin/workspaces', { token: admin });
  const room = list.rooms.find(item => item.roomCode === roomCode);
  assert(room, `Admin debe encontrar ${roomCode}`);
  if (list.selectedWorkspaceId !== room.workspaceId) {
    await ok('/api/admin/workspace/select', { method: 'POST', token: admin, body: { workspaceId: room.workspaceId } });
  }
  return ok('/api/admin/state', { token: admin });
}
const cardSignature = card => JSON.stringify(card?.grid || []);

(async () => {
  try {
    spawnServer();
    await waitServer();
    let admin = await adminLogin();

    const created = await ok('/api/community/public-room', {
      method: 'POST',
      body: {
        visitorId: 'host-champ', name: 'Marta', roomName: 'Campeonato del barrio',
        gameKind: 'championship', championshipRounds: 10, championshipReactionBonus: false,
        mode: 90, maxPlayers: 10, maxCardsPerPlayer: 4, autoSeconds: 8,
        startMode: 'manual', accessType: 'public'
      }
    });
    assert.equal(created.gameKind, 'championship');
    assert.equal(created.championshipRounds, 10);
    assert.equal(created.kind, 'public', 'Campeonato debe ser una sala pública de Comunidad.');
    assert(created.roomCode && created.creatorCode);

    const ana = await ok('/api/player/open-join', {
      method: 'POST', body: { roomCode: created.roomCode, name: 'Ana', cardCount: 1, deviceId: 'ana-champ' }
    });
    const beto = await ok('/api/player/open-join', {
      method: 'POST', body: { roomCode: created.roomCode, name: 'Beto', cardCount: 3, deviceId: 'beto-champ' }
    });
    assert(ana.token && beto.token);
    assert.equal(ana.state.player.cards.length, 0, 'Antes de R1 Campeonato no debe entregar matrices para elegir.');
    assert.equal(beto.state.player.cards.length, 0, 'Antes de R1 Campeonato no debe entregar matrices para elegir.');
    assert.equal(ana.state.player.offeredCards.length, 0, 'No debe ofrecer selección de cartones.');
    assert.equal(ana.state.player.selectionConfirmed, true);
    assert.equal(beto.state.player.requestedCardCount, 3);
    assert.equal(ana.state.championship.stage, 'registration');

    const creatorState = await ok('/api/community/creator-state', { method: 'POST', body: { publicId: created.id, creatorCode: created.creatorCode } });
    assert.equal(creatorState.playerCount, 2);
    assert.equal(creatorState.cardCount, 4, 'Debe contar posiciones competitivas solicitadas aun antes de generar matrices.');

    await ok('/api/community/creator-start', { method: 'POST', body: { publicId: created.id, creatorCode: created.creatorCode } });
    await wait(140);
    let adminState = await selectRoom(admin, created.roomCode);
    assert.equal(adminState.roomSettings.communityGameKind, 'championship');
    assert(['playing', 'starting'].includes(adminState.status));
    if (adminState.status === 'starting') { await wait(100); adminState = await ok('/api/admin/state', { token: admin }); }
    assert.equal(adminState.status, 'playing');

    let anaState = await ok('/api/player/state', { playerToken: ana.token });
    let betoState = await ok('/api/player/state', { playerToken: beto.token });
    assert.equal(anaState.player.cards.length, 1);
    assert.equal(betoState.player.cards.length, 3);
    assert.equal(anaState.championship.currentRound, 1);
    assert.equal(anaState.championship.ownPositions.length, 1);
    assert.equal(betoState.championship.ownPositions.length, 3);
    assert.deepEqual(betoState.championship.ownPositions.map(p => p.label).sort(), ['C1','C2','C3']);

    const anaPositionId = anaState.championship.ownPositions[0].positionId;
    const betoPositionIds = betoState.championship.ownPositions.map(p => p.positionId).sort();
    const round1AnaCardId = anaState.player.cards[0].id;
    const round1AnaGrid = cardSignature(anaState.player.cards[0]);
    const reconnectSameRound = await ok('/api/player/state', { playerToken: ana.token });
    assert.equal(reconnectSameRound.player.cards[0].id, round1AnaCardId, 'Reconectar en la misma ronda debe devolver el mismo cartón.');
    assert.equal(cardSignature(reconnectSameRound.player.cards[0]), round1AnaGrid);

    // Nadie nuevo puede incorporarse una vez iniciada R1.
    const late = await raw('/api/player/open-join', { method: 'POST', body: { roomCode: created.roomCode, name: 'Tarde', cardCount: 1, deviceId: 'late-champ' } });
    assert(!late.response.ok, 'No debe aceptar competidores nuevos después del comienzo.');

    // Extraer hasta que el primer Bingo matemático active +5 y la ronda se cierre.
    let finalizingState = null;
    for (let i = 0; i < 90; i++) {
      const draw = await raw('/api/admin/draw', { method: 'POST', token: admin, body: { source: 'championship-test' } });
      if (!draw.response.ok) break;
      anaState = await ok('/api/player/state', { playerToken: ana.token });
      if (anaState.status === 'finalizing' && anaState.championship.stage === 'reaction') {
        finalizingState = anaState;
        break;
      }
    }
    assert(finalizingState, 'La ronda debe entrar en ventana final después de primer Bingo +5.');
    const first = finalizingState.championship.firstBingoDrawnCount;
    const closing = finalizingState.championship.closingDrawnCount;
    assert(first > 0 && closing > 0);
    assert.equal(closing, Math.min(90, first + 5), 'El cierre debe ser exactamente primer Bingo +5, limitado a 90.');
    assert.equal(finalizingState.game.drawn.length, closing, 'No debe extraer una bolilla adicional al cierre reglamentario.');
    assert.equal(finalizingState.championship.finalBallsRemaining, 0);

    const afterCloseDraw = await raw('/api/admin/draw', { method: 'POST', token: admin, body: { source: 'must-fail' } });
    assert(!afterCloseDraw.response.ok, 'El bolillero debe bloquear nuevas extracciones durante la ventana final.');

    await wait(240);
    anaState = await ok('/api/player/state', { playerToken: ana.token });
    betoState = await ok('/api/player/state', { playerToken: beto.token });
    assert.equal(anaState.status, 'paused');
    assert.equal(anaState.championship.betweenRounds, true);
    assert.equal(anaState.championship.completedRounds, 1);
    assert(anaState.championship.roundLeaderboard.length >= 4);
    assert(anaState.championship.leaderboard.length >= 4);
    const round1AnaPoints = anaState.championship.ownPositions[0].points;
    assert(round1AnaPoints > 0, 'La posición debe haber sumado puntos matemáticos.');

    // La siguiente ronda conserva C1/C2/C3 y acumulados, pero cambia la matriz aleatoriamente.
    await ok('/api/community/creator-next-round', { method: 'POST', body: { publicId: created.id, creatorCode: created.creatorCode } });
    await wait(150);
    anaState = await ok('/api/player/state', { playerToken: ana.token });
    betoState = await ok('/api/player/state', { playerToken: beto.token });
    assert.equal(anaState.championship.currentRound, 2);
    assert.equal(anaState.status, 'playing');
    assert.equal(anaState.championship.ownPositions[0].positionId, anaPositionId, 'C1 debe conservar identidad competitiva.');
    assert.deepEqual(betoState.championship.ownPositions.map(p => p.positionId).sort(), betoPositionIds, 'C1/C2/C3 deben conservar identidad competitiva.');
    assert.notEqual(anaState.player.cards[0].id, round1AnaCardId, 'R2 debe asignar un cartón nuevo.');
    assert.notEqual(cardSignature(anaState.player.cards[0]), round1AnaGrid, 'R2 debe cambiar la matriz del cartón.');
    assert(anaState.championship.ownPositions[0].points >= round1AnaPoints, 'El total acumulado no debe reiniciarse.');
    assert.equal(anaState.championship.ownPositions[0].roundPoints, 0, 'La puntuación de la nueva ronda debe empezar en cero.');

    // Reinicio real: misma ronda, misma posición y misma matriz.
    const round2CardId = anaState.player.cards[0].id;
    const round2Grid = cardSignature(anaState.player.cards[0]);
    await stop();
    spawnServer();
    await waitServer();
    admin = await adminLogin();
    const recoveredAfterRestart = await ok('/api/player/state', { playerToken: ana.token });
    assert.equal(recoveredAfterRestart.championship.currentRound, 2, 'Debe recuperar la ronda activa tras reinicio.');
    assert.equal(recoveredAfterRestart.championship.ownPositions[0].positionId, anaPositionId, 'Debe recuperar la identidad C1 tras reinicio.');
    assert.equal(recoveredAfterRestart.player.cards[0].id, round2CardId, 'No debe regenerar el cartón por reiniciar el servidor.');
    assert.equal(cardSignature(recoveredAfterRestart.player.cards[0]), round2Grid, 'La matriz debe persistir exactamente tras reinicio.');

    // Bingo 75 + bonus de reacción: misma filosofía, tablas propias y centro libre.
    const created75 = await ok('/api/community/public-room', {
      method: 'POST',
      body: {
        visitorId: 'host-champ75', name: 'Nora', roomName: 'Campeonato 75',
        gameKind: 'championship', championshipRounds: 10, championshipReactionBonus: true,
        mode: 75, maxPlayers: 8, maxCardsPerPlayer: 2, autoSeconds: 8, startMode: 'manual', accessType: 'public'
      }
    });
    const p75a = await ok('/api/player/open-join', { method:'POST', body:{roomCode:created75.roomCode,name:'Lola',cardCount:2,deviceId:'lola75'} });
    const p75b = await ok('/api/player/open-join', { method:'POST', body:{roomCode:created75.roomCode,name:'Raúl',cardCount:2,deviceId:'raul75'} });
    await ok('/api/community/creator-start', { method:'POST', body:{publicId:created75.id,creatorCode:created75.creatorCode} });
    await wait(150);
    await selectRoom(admin, created75.roomCode);
    let reactionClaim = null;
    let state75a = null, state75b = null;
    for (let i=0;i<75;i++) {
      const draw=await raw('/api/admin/draw',{method:'POST',token:admin,body:{source:'championship-75-test'}});
      if(!draw.response.ok) break;
      state75a=await ok('/api/player/state',{playerToken:p75a.token});
      state75b=await ok('/api/player/state',{playerToken:p75b.token});
      if(!reactionClaim){
        const candidate=[[p75a.token,state75a],[p75b.token,state75b]].find(([,st])=>(st.championship?.ownPositions||[]).some(pos=>pos.bingoBall&&!pos.reactionClaimed));
        if(candidate){
          const [token,st]=candidate;
          reactionClaim=await ok('/api/player/claim',{method:'POST',playerToken:token,body:{type:'bingo',cardId:st.player.cards[0].id}});
          assert.equal(reactionClaim.championshipClaim,true);
          assert(reactionClaim.claimed.length>=1,'Un toque debe registrar todos los Bingos propios habilitados.');
          assert(reactionClaim.totalBonus>=1&&reactionClaim.totalBonus<=reactionClaim.claimed.length*3,'El bonus de reacción debe ser pequeño y positivo al reclamar inmediatamente.');
        }
      }
      if(state75a.status==='finalizing') break;
    }
    state75a=await ok('/api/player/state',{playerToken:p75a.token});
    assert.equal(state75a.game.mode,75);
    assert.equal(state75a.championship.reactionBonusEnabled,true);
    assert(state75a.championship.firstBingoDrawnCount>0,'Bingo 75 debe detectar su primer Bingo matemático.');
    assert.equal(state75a.championship.closingDrawnCount,Math.min(75,state75a.championship.firstBingoDrawnCount+5));
    assert(reactionClaim,'Debe existir al menos un reclamo de reacción válido en Bingo 75.');

    console.log('PRUEBA CAMPEONATO PÚBLICO V9: OK · Comunidad pública + 1–4 posiciones + matrices aleatorias por ronda + puntos persistentes + reinicio + Bingo 90/75 + reacción + primer Bingo +5');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
