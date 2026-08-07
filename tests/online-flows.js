'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const port = 48000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-nueva-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT:String(port), BINGO_TEST_MODE:'true', BINGO_DATA_DIR:dataDir, BINGO_START_SEQUENCE_MS:'100', BINGO_RESUME_SEQUENCE_MS:'100', BINGO_CLAIM_WINDOW_MS:'150' },
  stdio:['ignore','pipe','pipe']
});
async function json(url, options={}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function waitServer(){for(let i=0;i<100;i++){try{const x=await json('/healthz');if(x.response.ok)return}catch{}await new Promise(r=>setTimeout(r,50))}throw new Error('El servidor no inició.');}
(async()=>{
  try {
    await waitServer();
    let result = await json('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    const admin = { 'Content-Type':'application/json', 'X-Admin-Token':result.data.token };

    for (const mode of [75,90]) for (let count=25;count<=250;count+=25) {
      result = await json('/api/admin/create-simple-room', { method:'POST', headers:admin, body:JSON.stringify({ roomType:'test', mode, cardCount:count, rules:{ line:true, bingo:true } }) });
      assert.equal(result.response.status, 200, `${mode}/${count}: ${JSON.stringify(result.data)}`);
      assert.equal(result.data.game.cards.length, count);
    }

    for (const playerCount of [2, 9]) {
      result = await json('/api/admin/create-simple-room', { method:'POST', headers:admin, body:JSON.stringify({ roomType:'test', mode:75, cardCount:25, autoSeconds:8, waitingGame:'none', rules:{ line:true, bingo:true } }) });
      assert.equal(result.response.status, 200, JSON.stringify(result.data));
      const quickRoom = result.data.roomCode;
      for (let index=1; index<=playerCount; index++) {
        const joined = await json('/api/player/open-join', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ roomCode:quickRoom, name:`Rápido ${playerCount}-${index}`, cardCount:1, deviceId:`quick-${playerCount}-${index}` }) });
        assert.equal(joined.response.status, 200, JSON.stringify(joined.data));
      }
      result = await json('/api/admin/start', { method:'POST', headers:admin, body:'{}' });
      assert.equal(result.response.status, 200, `No pudo iniciar con ${playerCount}: ${JSON.stringify(result.data)}`);
      assert.equal(result.data.roomSettings.joinOpen, false);
      await json('/api/admin/new-room', { method:'POST', headers:admin, body:'{}' });
    }

    result = await json('/api/admin/create-simple-room', { method:'POST', headers:admin, body:JSON.stringify({ roomType:'test', mode:75, cardCount:50, autoSeconds:4, waitingGame:'red_black', presenter:'vero', presenterVoiceGender:'female', rules:{ line:true, corners:true, bingo:true }, transmission:{ enabled:true, showChat:true, showCards:true, showNames:true, showProgress:true, rotationSeconds:30 } }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    const room = result.data.roomCode;
    assert.equal(result.data.roomSettings.roomType, 'test');
    assert.equal(result.data.roomSettings.joinOpen, true);
    assert.equal(result.data.waitingGame.type, 'both');
    assert.deepEqual(result.data.waitingGame.activeTypes, ['red_black','higher_lower']);
    const joins = [];
    let secondReservedCardId = '';
    for (let index=1; index<=10; index++) {
      const requestedCards = index === 1 ? 4 : index === 2 ? 3 : 1;
      const joined = await json('/api/player/open-join', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ roomCode:room, name:`Persona ${index}`, cardCount:requestedCards, deviceId:`device-${index}` }) });
      assert.equal(joined.response.status, 200, JSON.stringify(joined.data));
      assert.equal(joined.data.state.player.selectionConfirmed, false);
      assert.equal(joined.data.state.player.cards.length, 0);
      assert.equal(joined.data.state.player.offeredCards.length, 10);
      joins.push(joined.data);
      const headers = { 'Content-Type':'application/json', 'X-Player-Token':joined.data.token };
      if (index === 1) {
        const keptCardId = joined.data.state.player.offeredCards[0].id;
        let reserved = await json('/api/player/reserve', { method:'POST', headers, body:JSON.stringify({ cardId:keptCardId, reserve:true }) });
        assert.equal(reserved.response.status, 200, JSON.stringify(reserved.data));
        const renewed = await json('/api/player/renew-offers', { method:'POST', headers, body:'{}' });
        assert.equal(renewed.response.status, 200, JSON.stringify(renewed.data));
        assert.equal(renewed.data.player.offeredCards.length, 10);
        assert(renewed.data.player.offeredCards.some(card => card.id === keptCardId), 'Recargar debe conservar el cartón reservado.');
        const chosenIds = [keptCardId, ...renewed.data.player.offeredCards.filter(card => card.id !== keptCardId).slice(0, 3).map(card => card.id)];
        for (const cardId of chosenIds.slice(1)) {
          reserved = await json('/api/player/reserve', { method:'POST', headers, body:JSON.stringify({ cardId, reserve:true }) });
          assert.equal(reserved.response.status, 200, JSON.stringify(reserved.data));
        }
        const chosen = await json('/api/player/choose', { method:'POST', headers, body:JSON.stringify({ cardIds:chosenIds }) });
        assert.equal(chosen.response.status, 200, JSON.stringify(chosen.data));
        assert.equal(chosen.data.player.selectionConfirmed, true);
        assert.equal(chosen.data.player.cards.length, 4);
      }
      if (index === 2) {
        secondReservedCardId = joined.data.state.player.offeredCards[0].id;
        const reserved = await json('/api/player/reserve', { method:'POST', headers, body:JSON.stringify({ cardId:secondReservedCardId, reserve:true }) });
        assert.equal(reserved.response.status, 200, JSON.stringify(reserved.data));
        assert.equal(reserved.data.player.reservedCardIds.length, 1);
        const partial = await json('/api/player/choose', { method:'POST', headers, body:JSON.stringify({ cardIds:[secondReservedCardId] }) });
        assert.equal(partial.response.status, 400, 'La sala de prueba debe exigir la cantidad elegida.');
      }
    }
    result = await json('/api/admin/state', { headers:admin });
    assert.equal(result.data.players.length, 10);
    assert.equal(result.data.roomSettings.joinOpen, false);
    const late = await json('/api/player/open-join', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ roomCode:room, name:'Tarde', cardCount:1, deviceId:'late' }) });
    assert.equal(late.response.status, 400);
    const playerHeaders = { 'Content-Type':'application/json', 'X-Player-Token':joins[0].token };
    result = await json('/api/player/waiting-game/score', { method:'POST', headers:playerHeaders, body:JSON.stringify({ score:9, gameType:'red_black' }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.waitingGame.leaderboards.red_black[0].bestScore, 9);
    result = await json('/api/player/waiting-game/score', { method:'POST', headers:playerHeaders, body:JSON.stringify({ score:6, gameType:'higher_lower' }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.waitingGame.leaderboards.higher_lower[0].bestScore, 6);
    const returning = await json('/api/player/open-join', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ roomCode:room, name:'Ignorado', cardCount:1, deviceId:'device-1' }) });
    assert.equal(returning.response.status, 200);
    assert.equal(returning.data.returning, true);

    result = await json('/api/admin/start', { method:'POST', headers:admin, body:'{}' });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert(result.data.players.every(player => player.selectionConfirmed));
    const secondPlayer = result.data.players.find(player => player.name === 'Persona 2');
    assert.equal(secondPlayer.cardIds.length, 3);
    assert(secondPlayer.cardIds.includes(secondReservedCardId), 'La asignación automática debe conservar el cartón reservado.');
    assert.equal(result.data.preflight.activeCards, 15);
    await new Promise(r=>setTimeout(r,160));
    result = await json('/api/admin/draw', { method:'POST', headers:admin, body:JSON.stringify({ source:'test' }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    const txToken = result.data.roomSettings.broadcastToken;
    const tx = await json(`/api/broadcast/state?token=${encodeURIComponent(txToken)}`);
    assert.equal(tx.response.status, 200, JSON.stringify(tx.data));
    assert(tx.data.highlightedCards.length > 0 && tx.data.highlightedCards.length <= 4);
    tx.data.highlightedCards.forEach((card, index) => {
      assert.equal(card.rank, index + 1);
      assert(Number.isFinite(Number(card.raceMissing)), 'La transmisión debe indicar cuántos números faltan para el premio más cercano.');
      assert(card.racePrizeLabel && card.racePrizeType, 'La transmisión debe indicar el premio por el que corre cada cartón.');
    });

    await json('/api/admin/new-room', { method:'POST', headers:admin, body:'{}' });
    result = await json('/api/admin/create-simple-room', { method:'POST', headers:admin, body:JSON.stringify({ roomType:'official', mode:90, cardCount:25, autoSeconds:6, presenter:'josu', presenterVoiceGender:'male', rules:{ line:true, ambocabeza:true, bingo:true } }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    const officialRoom = result.data.roomCode;
    const p1 = await json('/api/admin/add-official-player', { method:'POST', headers:admin, body:JSON.stringify({ name:'Laura', cardCount:3 }) });
    const p2 = await json('/api/admin/add-official-player', { method:'POST', headers:admin, body:JSON.stringify({ name:'Marcos', cardCount:2 }) });
    assert.equal(p1.response.status, 200, JSON.stringify(p1.data));
    assert.equal(p2.response.status, 200, JSON.stringify(p2.data));
    assert.notEqual(p1.data.player.code, p2.data.player.code);
    assert.equal(p1.data.player.cardNumbers.length, 3);
    const login = await json('/api/player/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ roomCode:officialRoom, code:p1.data.player.code, deviceId:'official-laura' }) });
    assert.equal(login.response.status, 200, JSON.stringify(login.data));
    assert.equal(login.data.state.player.cards.length, 3);
    assert.equal(login.data.state.roomSettings.presenterVoiceGender, 'male');

    for (const file of ['dorso.webp','corazon.webp','pica.webp','diamante.webp','trebol.webp']) {
      const response = await fetch(`${base}/assets/cards/${file}`);
      assert.equal(response.status, 200, file);
    }
    const adminHtml = await (await fetch(`${base}/admin`)).text();
    assert(adminHtml.includes('CONFIGURAR SALA'));
    assert(adminHtml.includes('CONFIGURAR TRANSMISIÓN'));
    assert(adminHtml.includes('MINIJUEGOS SIEMPRE ACTIVOS'));
    assert(!adminHtml.includes('id="waitingGame"'));
    const playerHtml = await (await fetch(`${base}/jugador?sala=${room}&prueba=1`)).text();
    assert(playerHtml.includes('openJoinFields'));
    const transmissionHtml = await (await fetch(`${base}/transmision/${txToken}`)).text();
    assert(transmissionHtml.includes('CHAT DE LA SALA'));
    console.log('PRUEBAS NUEVAS LA GORDA - BINGO ONLINE: OK');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive:true, force:true });
  }
})();
