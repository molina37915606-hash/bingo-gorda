'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const port = 59720 + Math.floor(Math.random() * 60);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-empty-idle-'));
const idleMs = 1200;
let child;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function start(){
  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT:String(port), ONLINE_MODE:'false', MASTER_ADMIN_PASSWORD:'', ADMIN_PASSWORD:'',
      BINGO_TEST_MODE:'true', BINGO_DATA_DIR:dataDir, PUBLIC_URL:base,
      BINGO_COMMUNITY_EMPTY_IDLE_MS:String(idleMs)
    },
    stdio:['ignore','pipe','pipe']
  });
}
async function stop(){
  if(!child) return;
  const p=child; child=null;
  await new Promise(resolve=>{
    const timer=setTimeout(()=>{ try{p.kill('SIGKILL')}catch{} resolve(); },1200);
    p.once('exit',()=>{clearTimeout(timer);resolve();});
    try{p.kill('SIGTERM')}catch{clearTimeout(timer);resolve();}
  });
}
async function ready(){
  for(let i=0;i<160;i++){
    try{ if((await fetch(base+'/healthz')).ok) return; }catch{}
    await sleep(35);
  }
  throw new Error('No inició servidor');
}
async function raw(url,{method='GET',body,playerToken}={}){
  const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  return {r,d};
}
async function ok(url,opt={}){
  const x=await raw(url,opt);
  assert(x.r.ok,`${url}: ${x.r.status} ${JSON.stringify(x.d)}`);
  return x.d;
}
async function lobby(){ return ok('/api/community/state?visitorId=v925-check'); }
async function waitUntilGone(id, timeout=4500){
  const started=Date.now();
  while(Date.now()-started<timeout){
    const s=await lobby();
    if(!(s.publicRooms||[]).some(item=>item.id===id)) return true;
    await sleep(180);
  }
  return false;
}
async function createManual(name){
  return ok('/api/community/public-room',{method:'POST',body:{visitorId:`v925-${name}`,name,roomName:`Sala ${name}`,gameKind:'normal',mode:90,maxPlayers:30,maxCardsPerPlayer:4,autoSeconds:10,startMode:'manual',accessType:'public'}});
}

(async()=>{try{
  start(); await ready();

  // 1) Una sala manual vacía puede existir y la actividad autenticada del creador renueva el plazo.
  const activeCreator=await createManual('Creador activo');
  let state=await lobby();
  let card=(state.publicRooms||[]).find(item=>item.id===activeCreator.id);
  assert(card&&card.status==='waiting');
  assert.equal(card.playerCount,0,'Crear la sala no debe agregar al creador como jugador');
  await sleep(800);
  const creatorState=await ok('/api/community/creator-state',{method:'POST',body:{publicId:activeCreator.id,creatorCode:activeCreator.creatorCode}});
  assert.equal(creatorState.playerCount,0);
  await sleep(800);
  state=await lobby();
  assert((state.publicRooms||[]).some(item=>item.id===activeCreator.id),'La actividad del creador debe mantener viva la sala vacía');
  assert(await waitUntilGone(activeCreator.id),'Sin más actividad, la sala vacía debe cerrarse automáticamente');

  // 2) Si hay un inscripto, la limpieza de 0 jugadores no aplica aunque no haya tráfico del jugador.
  const withPlayer=await createManual('Con jugador');
  const ana=await ok('/api/player/open-join',{method:'POST',body:{roomCode:withPlayer.roomCode,name:'Ana',cardCount:2,deviceId:'v925-ana'}});
  assert(ana.token);
  await sleep(idleMs + 1800);
  state=await lobby();
  card=(state.publicRooms||[]).find(item=>item.id===withPlayer.id);
  assert(card,'Una sala con un jugador inscripto no debe cerrarse por inactividad vacía');
  assert.equal(card.playerCount,1,'El jugador inscripto debe seguir contando como 1/30');

  // 3) Las salas programadas quedan fuera de la limpieza de sala manual vacía.
  const scheduled=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'v925-scheduled',name:'Programador',roomName:'Sala programada',gameKind:'normal',mode:90,maxPlayers:30,maxCardsPerPlayer:2,autoSeconds:10,startMode:'scheduled',startsAt:new Date(Date.now()+60_000).toISOString(),accessType:'public'}});
  await sleep(idleMs + 1800);
  state=await lobby();
  card=(state.publicRooms||[]).find(item=>item.id===scheduled.id);
  assert(card,'Una sala programada no debe cerrarse por la regla de inactividad de sala manual vacía');

  const src=fs.readFileSync(path.join(root,'server.js'),'utf8');
  assert(src.includes('COMMUNITY_EMPTY_MANUAL_IDLE_MS')&&src.includes('community_empty_inactive_timeout'),'El servidor debe contener la regla explícita de 5 minutos para salas manuales vacías');

  console.log('V9.2.5 LIMPIEZA SALAS VACÍAS: OK · creador activo conserva · 5 min sin actividad cierra · 1/30 no cierra · programadas excluidas');
}catch(error){
  console.error(error); process.exitCode=1;
}finally{
  await stop();
  if(!process.exitCode) fs.rmSync(dataDir,{recursive:true,force:true});
  else console.error('DATA_DIR:',dataDir);
}})();
