'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const port = 51200 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-final-showcase-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT:String(port), BINGO_TEST_MODE:'true', BINGO_DATA_DIR:dataDir, BINGO_CLAIM_WINDOW_MS:'100', BINGO_START_SEQUENCE_MS:'100' },
  stdio:['ignore','pipe','pipe']
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function json(url, options={}) { const response = await fetch(base + url, options); const data = await response.json().catch(()=>({})); return { response, data }; }
async function waitServer(){ for(let i=0;i<100;i++){ try{const x=await json('/healthz'); if(x.response.ok)return;}catch{} await wait(50); } throw new Error('Servidor no disponible.'); }
function adminHeaders(token){ return {'Content-Type':'application/json','X-Admin-Token':token}; }
(async()=>{try{
  await waitServer();
  let out = await json('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); assert.equal(out.response.status,200,JSON.stringify(out.data)); const admin=out.data.token;
  out = await json('/api/admin/create-simple-room',{method:'POST',headers:adminHeaders(admin),body:JSON.stringify({roomType:'official',mode:90,cardCount:25,autoSeconds:30,rules:{ambocabeza:false,line:false,bingo:true}})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  out = await json('/api/admin/add-official-player',{method:'POST',headers:adminHeaders(admin),body:JSON.stringify({name:'Ganadora Final',cardCount:1})}); assert.equal(out.response.status,200,JSON.stringify(out.data)); const playerCode=out.data.player.code;
  out = await json('/api/admin/add-official-player',{method:'POST',headers:adminHeaders(admin),body:JSON.stringify({name:'Segundo Jugador',cardCount:1})}); assert.equal(out.response.status,200,JSON.stringify(out.data)); const secondPlayerCode=out.data.player.code;
  let state=(await json('/api/admin/state',{headers:adminHeaders(admin)})).data;
  const winnerPlayer=state.players.find(p=>p.name==='Ganadora Final'), winnerCard=state.game.cards.find(c=>winnerPlayer.cardIds.includes(c.id));
  const cardNumbers=winnerCard.grid.flat().filter(Number.isFinite);
  out=await json('/api/admin/test/draw-order',{method:'POST',headers:adminHeaders(admin),body:JSON.stringify({sequence:cardNumbers})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  out=await json('/api/admin/draw-settings',{method:'POST',headers:adminHeaders(admin),body:JSON.stringify({drawMode:'manual'})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  const login=await json('/api/player/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomCode:state.roomCode,code:playerCode,deviceId:'winner-final-device'})}); assert.equal(login.response.status,200,JSON.stringify(login.data)); const playerToken=login.data.token;
  out=await json('/api/player/automark',{method:'POST',headers:{'Content-Type':'application/json','X-Player-Token':playerToken},body:JSON.stringify({enabled:false})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  const login2=await json('/api/player/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomCode:state.roomCode,code:secondPlayerCode,deviceId:'second-final-device'})}); assert.equal(login2.response.status,200,JSON.stringify(login2.data));
  out=await json('/api/player/automark',{method:'POST',headers:{'Content-Type':'application/json','X-Player-Token':login2.data.token},body:JSON.stringify({enabled:false})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  out=await json('/api/admin/start',{method:'POST',headers:adminHeaders(admin),body:'{}'}); assert.equal(out.response.status,200,JSON.stringify(out.data)); await wait(130);
  for(const _ of cardNumbers){ out=await json('/api/admin/draw',{method:'POST',headers:adminHeaders(admin),body:JSON.stringify({source:'final-showcase-test'})}); assert.equal(out.response.status,200,JSON.stringify(out.data)); }
  out=await json('/api/player/claim',{method:'POST',headers:{'Content-Type':'application/json','X-Player-Token':playerToken},body:JSON.stringify({cardId:winnerCard.id,type:'bingo'})}); assert.equal(out.response.status,200,JSON.stringify(out.data)); assert.equal(out.data.officialValid,true);
  await wait(130);
  out=await json('/api/admin/resolve',{method:'POST',headers:adminHeaders(admin),body:JSON.stringify({claimId:out.data.id,resolution:'confirmed'})}); assert.equal(out.response.status,200,JSON.stringify(out.data));
  state=(await json('/api/admin/state',{headers:adminHeaders(admin)})).data; assert.equal(state.status,'finalizing'); assert(state.transition?.type==='final-balls');
  const earlyActa=await json('/api/admin/acta',{headers:adminHeaders(admin)}); assert.equal(earlyActa.response.status,400,'El acta no debe estar habilitada durante la extracción final.');
  const txToken=state.roomSettings.broadcastToken;
  let tx=(await json(`/api/broadcast/state?token=${encodeURIComponent(txToken)}`)).data; assert.equal(tx.status,'finalizing'); assert(tx.bingoConfirmed); assert(tx.finalExtraction?.active); assert(tx.finalExtraction.remaining>0);
  for(let i=0;i<90;i++){ state=(await json('/api/admin/state',{headers:adminHeaders(admin)})).data; if(state.status==='finished')break; await wait(35); }
  assert.equal(state.status,'finished','La extracción final debe completar la partida.'); assert.equal(state.game.drawn.length,90);
  tx=(await json(`/api/broadcast/state?token=${encodeURIComponent(txToken)}`)).data; assert.equal(tx.status,'finished'); assert.equal(tx.resultsReady,true); assert(Array.isArray(tx.finalShowcase)&&tx.finalShowcase.length>=1,'La transmisión debe recibir los cartones ganadores.'); assert.equal(tx.integrity?.verified,true,'El sello público debe verificar el orden completo al finalizar.'); assert.equal(tx.integrity?.drawOrder?.length,90,'Al finalizar debe revelarse el orden sellado completo.');
  const finalActa=(await json('/api/admin/acta',{headers:adminHeaders(admin)})).data; assert.equal(finalActa.integrity?.verified,true,'El acta debe incluir la verificación del sorteo.'); assert.equal(finalActa.integrity?.commitment,tx.integrity?.commitment);
  const slide=tx.finalShowcase.find(w=>String(w.cardNumber)===String(winnerCard.number)); assert(slide,'Debe estar el cartón ganador de Bingo.'); assert(slide.prizes.some(p=>p.type==='bingo')); assert.equal(slide.playerName,'Ganadora Final'); assert(slide.grid.length===3); assert(slide.winningNumbers.length===15);
  const html=await (await fetch(`${base}/transmision/${encodeURIComponent(txToken)}`)).text(); assert(html.includes('GANADORES DE LA PARTIDA')); assert(html.includes('closingOverlay'));
  console.log('PRUEBA CIERRE Y CARRUSEL DE GANADORES: OK');
}catch(error){console.error(error);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
