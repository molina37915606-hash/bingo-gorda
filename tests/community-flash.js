'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const port = 59420 + Math.floor(Math.random() * 70);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-flash-'));
let child;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function start(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'20'},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1200);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<160;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await sleep(35)}throw new Error('No inició servidor')}
async function raw(url,{method='GET',body,token,playerToken}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(url,opt={}){const x=await raw(url,opt);assert(x.r.ok,`${url}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}
async function selectRoom(admin,roomCode){const list=await ok('/api/admin/workspaces',{token:admin}),room=list.rooms.find(x=>x.roomCode===roomCode);assert(room,'Admin debe encontrar Flash');if(list.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}})}
const nums = card => (card.grid||[]).flat().filter(Number.isFinite).map(Number);
async function waitPlaying(playerToken){for(let i=0;i<120;i++){const s=await ok('/api/player/state',{playerToken});if(s.status==='playing')return s;if(s.status==='finished')return s;await sleep(20)}throw new Error('Flash no llegó a playing')}
async function createFlash(name, suffix, mode=75){
  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:`host-flash-${suffix}`,name:'Host',roomName:name,gameKind:'flash',mode,maxPlayers:6,maxCardsPerPlayer:4,autoSeconds:12,startMode:'manual',accessType:'public'}});
  assert.equal(created.gameKind,'flash');assert.equal(created.maxCardsPerPlayer,1,'Flash debe forzar un cartón');
  const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Ana',cardCount:4,deviceId:`flash-a-${suffix}`}});
  const b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Beto',cardCount:4,deviceId:`flash-b-${suffix}`}});
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});await waitPlaying(a.token);
  return {created,a,b};
}
(async()=>{try{
  start();await ready();
  const admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;

  // Caso 1: ganador único al completar las 10 bolas.
  let {created,a,b}=await createFlash('Flash directo','direct');await selectRoom(admin,created.roomCode);
  let sa=await ok('/api/player/state',{playerToken:a.token}),sb=await ok('/api/player/state',{playerToken:b.token});
  assert(sa.flash?.enabled&&sb.flash?.enabled);assert.equal(sa.player.cards.length,1);assert.equal(sb.player.cards.length,1);assert.equal(sa.player.autoMark,true,'Flash debe usar automarcado oficial');
  const an=nums(sa.player.cards[0]),bn=nums(sb.player.cards[0]),bset=new Set(bn),aset=new Set(an);
  const onlyA=an.filter(n=>!bset.has(n)),outside=Array.from({length:75},(_,i)=>i+1).filter(n=>!aset.has(n)&&!bset.has(n));
  assert(onlyA.length>=1&&outside.length>=9,'Debe existir secuencia controlada para ganador directo');
  await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence:[onlyA[0],...outside.slice(0,9)]}});
  for(let i=0;i<10;i++)await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'flash-direct'}});
  sa=await ok('/api/player/state',{playerToken:a.token});
  assert.equal(sa.status,'finished');assert.equal(sa.flash.stage,'finished');assert.equal(sa.flash.winner.playerName,'Ana');assert.equal(sa.flash.winner.score,1);assert.equal(sa.flash.winningBall,null,'Un ganador directo no debe figurar como muerte súbita');
  const badClaim=await raw('/api/player/claim',{method:'POST',playerToken:a.token,body:{type:'bingo',cardId:sa.player.cards[0].id}});assert(!badClaim.r.ok,'Flash no debe aceptar reclamos');
  const pdf=await fetch(base+'/api/player/acta.pdf',{headers:{'X-Player-Token':a.token}});assert(pdf.ok);const pdfHead=Buffer.from(await pdf.arrayBuffer()).subarray(0,4).toString('latin1');assert.equal(pdfHead,'%PDF','Flash debe generar acta PDF válida');

  // Caso 2: 0-0 tras 10 y muerte súbita en la bola 11.
  ({created,a,b}=await createFlash('Flash empate','tie'));await selectRoom(admin,created.roomCode);
  sa=await ok('/api/player/state',{playerToken:a.token});sb=await ok('/api/player/state',{playerToken:b.token});
  const an2=nums(sa.player.cards[0]),bn2=nums(sb.player.cards[0]),a2=new Set(an2),b2=new Set(bn2),outside2=Array.from({length:75},(_,i)=>i+1).filter(n=>!a2.has(n)&&!b2.has(n));
  let unique=an2.find(n=>!b2.has(n)),expected='Ana';if(!unique){unique=bn2.find(n=>!a2.has(n));expected='Beto'}
  assert(outside2.length>=10&&unique,'Debe existir secuencia de empate y desempate');
  await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence:[...outside2.slice(0,10),unique]}});
  for(let i=0;i<10;i++)await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'flash-tie'}});
  sa=await ok('/api/player/state',{playerToken:a.token});
  assert.equal(sa.status,'playing');assert.equal(sa.flash.stage,'sudden_death');assert.equal(sa.flash.contenderPlayerIds.length,2);assert.equal(sa.flash.leaderboard[0].score,0);assert.equal(sa.flash.leaderboard[1].score,0);
  await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'flash-sudden-death'}});
  sa=await ok('/api/player/state',{playerToken:a.token});
  assert.equal(sa.status,'finished');assert.equal(sa.flash.winner.playerName,expected);assert.equal(sa.flash.winningBall,unique);assert.equal(sa.flash.leaderboard[0].score,0,'La muerte súbita no debe alterar el puntaje de las 10 bolas');assert.equal(sa.flash.leaderboard[1].score,0);

  const recovered=await ok('/api/community/creator-state',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});assert.equal(recovered.gameKind,'flash');assert.equal(recovered.status,'finished');assert(recovered.flash?.winner,'El creador debe ver el resultado Flash');

  // Caso 3: misma mecánica en Bingo 90.
  ({created,a,b}=await createFlash('Flash 90','mode90',90));await selectRoom(admin,created.roomCode);
  sa=await ok('/api/player/state',{playerToken:a.token});sb=await ok('/api/player/state',{playerToken:b.token});
  assert.equal(sa.game.mode,90);assert.equal(sa.player.cards.length,1);
  const an90=nums(sa.player.cards[0]),bn90=nums(sb.player.cards[0]),b90=new Set(bn90),a90=new Set(an90);
  const onlyA90=an90.filter(n=>!b90.has(n)),outside90=Array.from({length:90},(_,i)=>i+1).filter(n=>!a90.has(n)&&!b90.has(n));
  assert(onlyA90.length>=1&&outside90.length>=9,'Bingo 90 debe permitir una secuencia Flash controlada');
  await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence:[onlyA90[0],...outside90.slice(0,9)]}});
  for(let i=0;i<10;i++)await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'flash-90'}});
  sa=await ok('/api/player/state',{playerToken:a.token});assert.equal(sa.status,'finished');assert.equal(sa.flash.winner.playerName,'Ana');assert.equal(sa.flash.winner.score,1);

  console.log('MODO FLASH: OK · Bingo 75/90 · 1 cartón · 10 bolas · conteo oficial · empate · muerte súbita · ganador único');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();if(!process.exitCode)fs.rmSync(dataDir,{recursive:true,force:true});else console.error('DATA_DIR:',dataDir)}})();
