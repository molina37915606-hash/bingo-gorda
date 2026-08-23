'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const port = 59620 + Math.floor(Math.random() * 60);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-registration-random-'));
let child;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function start(){
  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT:String(port), ONLINE_MODE:'false', MASTER_ADMIN_PASSWORD:'', ADMIN_PASSWORD:'', BINGO_TEST_MODE:'true', BINGO_DATA_DIR:dataDir, PUBLIC_URL:base },
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

(async()=>{try{
  start(); await ready();

  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'v924-host',name:'Organizador',roomName:'Contador persistente',gameKind:'normal',mode:90,maxPlayers:30,maxCardsPerPlayer:4,autoSeconds:10,startMode:'manual',accessType:'public'}});
  const ana=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Ana',cardCount:4,deviceId:'v924-ana'}});
  let lobby=await ok('/api/community/state?visitorId=v924-lobby');
  let card=lobby.publicRooms.find(item=>item.id===created.id);
  assert(card,'La mesa debe estar visible en Comunidad');
  assert.equal(card.playerCount,1,'Un jugador inscripto debe verse como 1/30 aunque todavía esté eligiendo cartones');

  const abortEvents=new AbortController();
  const eventResponse=await fetch(base+`/api/events?role=player&token=${encodeURIComponent(ana.token)}`,{signal:abortEvents.signal});
  assert(eventResponse.ok,'La conexión SSE debe abrir');
  const reader=eventResponse.body.getReader(); await reader.read(); abortEvents.abort(); try{await reader.cancel()}catch{}
  await sleep(100);
  lobby=await ok('/api/community/state?visitorId=v924-after-disconnect');
  card=lobby.publicRooms.find(item=>item.id===created.id);
  assert(card);
  assert.equal(card.playerCount,1,'Desconectarse no debe convertir 1/30 en 0/30');

  let state=await ok('/api/player/state',{playerToken:ana.token});
  assert.equal(state.player.selectionConfirmed,false,'Antes de elegir debe seguir pendiente');
  assert.equal(Number(state.player.allowedCardCount),4,'Debe conservar la cantidad elegida al ingresar');

  const reservedId=state.player.offeredCards[0]?.id;
  assert(reservedId,'Debe haber cartones ofrecidos');
  await ok('/api/player/reserve',{method:'POST',playerToken:ana.token,body:{cardId:reservedId,reserve:true}});
  state=await ok('/api/player/random-cards',{method:'POST',playerToken:ana.token,body:{}});
  assert.equal(state.player.selectionConfirmed,true,'CARTONES AL AZAR debe confirmar la selección');
  assert.equal(state.player.cards.length,4,'Debe asignar exactamente la cantidad elegida');
  assert.equal(new Set(state.player.cards.map(item=>item.id)).size,4,'No puede repetir cartones al asignar al azar');
  assert.equal((state.player.reservedCardIds||[]).length,0,'La asignación al azar debe limpiar reservas temporales');
  const anaIds=new Set(state.player.cards.map(item=>item.id));

  const beto=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Beto',cardCount:4,deviceId:'v924-beto'}});
  const betoState=await ok('/api/player/random-cards',{method:'POST',playerToken:beto.token,body:{}});
  assert.equal(betoState.player.cards.length,4);
  assert.equal(betoState.player.cards.some(item=>anaIds.has(item.id)),false,'Dos jugadores no pueden recibir el mismo cartón');

  lobby=await ok('/api/community/state?visitorId=v924-two');
  card=lobby.publicRooms.find(item=>item.id===created.id);
  assert.equal(card.playerCount,2,'La Comunidad debe contar inscriptos, no conexiones');

  const duplicate=await raw('/api/player/random-cards',{method:'POST',playerToken:ana.token,body:{}});
  assert.equal(duplicate.r.status,400,'No debe reasignar al azar una selección ya confirmada');

  const js=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
  assert(js.includes('CARTONES AL AZAR')&&js.includes('/api/player/random-cards'),'La interfaz debe exponer la opción de cartones al azar');

  console.log('V9.2.4 REGISTRO + CARTONES AL AZAR: OK · 1/30 persiste desconectado · cantidad exacta · sin duplicados');
}catch(error){
  console.error(error); process.exitCode=1;
}finally{
  await stop();
  if(!process.exitCode) fs.rmSync(dataDir,{recursive:true,force:true});
  else console.error('DATA_DIR:',dataDir);
}})();
