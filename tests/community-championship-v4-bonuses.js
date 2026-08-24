'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const port = 59410 + Math.floor(Math.random() * 70);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-champ-v4-bonus-'));
let child;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function start(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'20'},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1200);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<160;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await sleep(35)}throw new Error('No inició servidor')}
async function raw(url,{method='GET',body,token,playerToken}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(url,opt={}){const x=await raw(url,opt);assert(x.r.ok,`${url}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}
async function selectRoom(admin,roomCode){const list=await ok('/api/admin/workspaces',{token:admin}),room=list.rooms.find(x=>x.roomCode===roomCode);assert(room);if(list.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}})}
const nums = card => (card.grid||[]).flat().filter(Number.isFinite).map(Number);

(async()=>{try{
  start();await ready();
  const admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;
  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'host-bonus-v4',name:'Host',roomName:'Bonus Campeonato V4',gameKind:'championship',championshipRounds:3,mode:90,maxPlayers:4,maxCardsPerPlayer:1,autoSeconds:12,startMode:'manual',accessType:'public'}});
  const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Ana',cardCount:1,deviceId:'bonus-a'}});
  const b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Beto',cardCount:1,deviceId:'bonus-b'}});
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});await sleep(90);await selectRoom(admin,created.roomCode);

  let sa=await ok('/api/player/state',{playerToken:a.token}),sb=await ok('/api/player/state',{playerToken:b.token});
  assert.equal(sa.championship.scoring.firstLine,5);assert.equal(sa.championship.scoring.firstSecondLine,5);assert.equal(sa.championship.scoring.firstBingo,15);
  const ac=sa.player.cards[0],bc=sb.player.cards[0],an=nums(ac),bn=nums(bc),aset=new Set(an),bset=new Set(bn);
  const aOnly=an.filter(n=>!bset.has(n)),bOnly=bn.filter(n=>!aset.has(n));
  assert(aOnly.length&&bOnly.length,'Los cartones deben diferir para probar primer y segundo Bingo.');
  const aLast=aOnly[0],bLast=bOnly[0],union=[...new Set([...an,...bn])];
  const prefix=[...union.filter(n=>n!==aLast&&n!==bLast),aLast,bLast];
  await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence:prefix}});

  for(let i=0;i<prefix.length-1;i++){
    await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'bonus-v4-first'}});
    sa=await ok('/api/player/state',{playerToken:a.token});
    if(sa.championship.firstBingoDrawnCount)break;
  }
  sa=await ok('/api/player/state',{playerToken:a.token});
  sb=await ok('/api/player/state',{playerToken:b.token});
  const apos=sa.championship.ownPositions[0],bpos=sb.championship.ownPositions[0];
  assert(apos.bingoBall,'Ana debe completar el primer Bingo controlado.');
  assert(!bpos.bingoBall,'Beto todavía debe estar a un número del Bingo.');
  assert.equal(apos.firstBingoBonus,15,'El primer Bingo debe guardar +15 real en la posición.');
  assert.equal(bpos.firstBingoBonus,0);

  const allNow=[apos,bpos];
  const minLine=Math.min(...allNow.map(x=>Number(x.lineBall)||999));
  for(const pos of allNow.filter(x=>x.lineBall))assert.equal(Number(pos.firstLineBonus)||0,Number(pos.lineBall)===minLine?5:0,'El bonus de Primera Línea debe pertenecer a la primera bolilla matemática y compartirse si es simultánea.');
  const secondBalls=allNow.map(x=>Number(x.secondLineBall)||999),minSecond=Math.min(...secondBalls);
  for(const pos of allNow.filter(x=>x.secondLineBall))assert.equal(Number(pos.firstSecondLineBonus)||0,Number(pos.secondLineBall)===minSecond?5:0,'El bonus de Segunda Línea debe pertenecer a la primera bolilla matemática y compartirse si es simultánea.');

  const claimA=await ok('/api/player/claim',{method:'POST',playerToken:a.token,body:{type:'bingo',cardId:apos.cardId}});
  assert.equal(claimA.claimed.length,1);assert.equal(claimA.claimed[0].points,75,'El primer Bingo cantado debe anunciar 75 (60 + 15).');

  await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'bonus-v4-second'}});
  sb=await ok('/api/player/state',{playerToken:b.token});
  const bAfter=sb.championship.ownPositions[0];
  assert(bAfter.bingoBall,'Beto debe completar el Bingo con la bolilla siguiente.');
  assert.equal(bAfter.firstBingoBonus,0,'El Bingo posterior no recibe el bonus de primero.');
  const claimB=await ok('/api/player/claim',{method:'POST',playerToken:b.token,body:{type:'bingo',cardId:bAfter.cardId}});
  assert.equal(claimB.claimed.length,1);assert.equal(claimB.claimed[0].points,60,'El segundo Bingo debe anunciar 60.');

  sa=await ok('/api/player/state',{playerToken:a.token});
  const anns=sa.championship.announcements.filter(x=>x.type==='bingo');
  assert(anns.some(x=>x.playerName==='Ana'&&x.points===75),'El anuncio público debe mostrar 75 al primer Bingo.');
  assert(anns.some(x=>x.playerName==='Beto'&&x.points===60),'El anuncio público debe mostrar 60 al Bingo posterior.');
  console.log('CAMPEONATO V4 BONUS: OK · Línea +5 · Segunda Línea +5 · primer Bingo 75 · siguiente Bingo 60');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();if(!process.exitCode)fs.rmSync(dataDir,{recursive:true,force:true});else console.error('DATA_DIR:',dataDir)}})();
