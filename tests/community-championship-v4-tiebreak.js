'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const port = 59320 + Math.floor(Math.random() * 80);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-champ-v4-tie-'));
let child;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function start(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'20'},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1200);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<160;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await sleep(35)}throw new Error('No inició servidor')}
async function raw(url,{method='GET',body,token,playerToken}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(url,opt={}){const x=await raw(url,opt);assert(x.r.ok,`${url}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}
async function selectRoom(admin,roomCode){const list=await ok('/api/admin/workspaces',{token:admin}),room=list.rooms.find(x=>x.roomCode===roomCode);assert(room,'Admin debe encontrar la sala');if(list.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}})}
const nums = card => (card.grid||[]).flat().filter(Number.isFinite).map(Number);
function lineDefs75(card){
  const grid=card.grid||[],lines=[];
  for(let row=0;row<5;row++)lines.push((grid[row]||[]).filter(Number.isFinite).map(Number));
  for(let col=0;col<5;col++)lines.push(grid.map(row=>row?.[col]).filter(Number.isFinite).map(Number));
  lines.push(grid.map((row,i)=>row?.[i]).filter(Number.isFinite).map(Number));
  lines.push(grid.map((row,i)=>row?.[4-i]).filter(Number.isFinite).map(Number));
  return lines.filter(line=>line.length);
}
function lineCompletionBalls(card,sequence){
  const at=new Map(sequence.map((n,i)=>[Number(n),i+1]));
  return lineDefs75(card).map(line=>Math.max(...line.map(n=>at.get(n)||999))).sort((a,b)=>a-b);
}
function bonusDiff(cardA,cardB,sequence){
  const aa=lineCompletionBalls(cardA,sequence),bb=lineCompletionBalls(cardB,sequence);
  const cmp=(a,b)=>a===b?0:(a<b?5:-5);
  return cmp(aa[0],bb[0])+cmp(aa[1],bb[1]);
}
function shuffled(values){const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
function equalBonusSequence(cardA,cardB){
  const an=nums(cardA),bn=nums(cardB),bset=new Set(bn),commons=an.filter(n=>bset.has(n)),union=[...new Set([...an,...bn])];
  assert(commons.length,'Los dos cartones 75 deberían compartir al menos un número para la prueba controlada');
  for(const common of commons){
    const rest=union.filter(n=>n!==common);
    for(let attempt=0;attempt<12000;attempt++){
      const sequence=[...shuffled(rest),common];
      if(bonusDiff(cardA,cardB,sequence)===0)return sequence;
    }
  }
  throw new Error('No se encontró una secuencia controlada con bonus de Línea equilibrados');
}
async function forceEqualRound(admin,aToken,bToken){
  const a=await ok('/api/player/state',{playerToken:aToken}),b=await ok('/api/player/state',{playerToken:bToken});
  assert.equal(a.player.cards.length,1);assert.equal(b.player.cards.length,1);
  const sequence=equalBonusSequence(a.player.cards[0],b.player.cards[0]);
  await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence}});
  for(let guard=0;guard<60;guard++){
    const readyState=await ok('/api/player/state',{playerToken:aToken});
    if(readyState.status==='playing')break;
    await sleep(20);
  }
  for(let i=0;i<80;i++){
    const before=await ok('/api/player/state',{playerToken:aToken});
    if(before.championship?.betweenRounds||before.championship?.inTiebreak||before.status==='finished')return before;
    await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'v4-tiebreak-test'}});
  }
  throw new Error('La ronda controlada no cerró');
}

(async()=>{try{
  start();await ready();
  const admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;
  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'host-tie-v4',name:'Host',roomName:'Desempate V4',gameKind:'championship',championshipRounds:3,mode:75,maxPlayers:4,maxCardsPerPlayer:1,autoSeconds:12,startMode:'manual',accessType:'public'}});
  const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Ana',cardCount:1,deviceId:'tie-a'}});
  const b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Beto',cardCount:1,deviceId:'tie-b'}});
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});await sleep(90);await selectRoom(admin,created.roomCode);

  for(let round=1;round<=3;round++){
    const out=await forceEqualRound(admin,a.token,b.token);
    if(round<3){
      assert.equal(out.championship.stage,'results');
      const board=out.championship.leaderboard;assert.equal(board[0].points,board[1].points,'Deben quedar empatados en puntaje acumulado');
      assert(board[0].eligible&&board[1].eligible,'Ambos deben ser elegibles porque hicieron Bingo');
      await ok('/api/community/creator-next-round',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});await sleep(70);
    }else{
      assert.equal(out.championship.stage,'tiebreak','El empate final debe abrir el desempate jugable');
      assert.equal(out.status,'playing');
      assert.equal(out.championship.tiebreak.contenders.length,2);
      assert.equal(out.championship.leaderboard[0].points,out.championship.leaderboard[1].points);
    }
  }

  let sa=await ok('/api/player/state',{playerToken:a.token}),sb=await ok('/api/player/state',{playerToken:b.token});
  const ac=sa.player.cards[0],bc=sb.player.cards[0];assert(ac&&bc,'Cada finalista debe recibir un cartón nuevo de desempate');
  const an=nums(ac),bn=nums(bc),aset=new Set(an),bset=new Set(bn),outside=Array.from({length:75},(_,i)=>i+1).filter(n=>!aset.has(n)&&!bset.has(n));
  assert(outside.length>=11,'Debe haber al menos 11 bolillas que no sumen a ninguno');
  let unique=an.find(n=>!bset.has(n)),expectedName='Ana';
  if(!unique){unique=bn.find(n=>!aset.has(n));expectedName='Beto'}
  assert(unique,'Los cartones de desempate deben diferir al menos en un número');
  await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence:[...outside.slice(0,11),unique]}});
  for(let i=0;i<10;i++)await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'tie-ten'}});
  sa=await ok('/api/player/state',{playerToken:a.token});
  assert.equal(sa.status,'playing','Un 0-0 tras diez bolillas no debe declarar campeón');
  assert.equal(sa.championship.tiebreak.drawnCount,10);
  assert.equal(sa.championship.tiebreak.suddenDeath,true,'Tras diez bolillas empatados debe comenzar muerte súbita');
  assert.equal(sa.championship.tiebreak.activePositionIds.length,2);

  await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'tie-sudden-death-neutral'}});
  sa=await ok('/api/player/state',{playerToken:a.token});
  assert.equal(sa.status,'playing','Si ninguno marca la bolilla extra, la muerte súbita debe continuar.');
  assert.equal(sa.championship.tiebreak.drawnCount,11);
  assert.equal(sa.championship.tiebreak.suddenDeathDrawn,1);

  await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'tie-sudden-death-decisive'}});
  sa=await ok('/api/player/state',{playerToken:a.token});
  assert.equal(sa.status,'finished');assert.equal(sa.championship.stage,'finished');
  const winner=sa.championship.fullLeaderboard[0];
  assert.equal(winner.playerName,expectedName,'La primera bolilla diferencial debe decidir al único Campeón');
  assert.equal(sa.championship.tiebreak.drawnCount,12);
  assert.equal(sa.championship.tiebreak.winningBall,unique);
  assert(sa.championship.tiebreak.winnerPositionId);
  assert.equal(sa.championship.fullLeaderboard.filter(x=>x.champion).length,1,'Debe existir un único Campeón Oficial');
  assert.equal(sa.championship.fullLeaderboard[0].points,sa.championship.fullLeaderboard[1].points,'El desempate no debe modificar el puntaje normal');
  console.log('CAMPEONATO V4 DESEMPATE: OK · empate real · cartones nuevos · 10 bolas · muerte súbita por bolilla diferencial · campeón único');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();if(!process.exitCode)fs.rmSync(dataDir,{recursive:true,force:true});else console.error('DATA_DIR:',dataDir)}})();
