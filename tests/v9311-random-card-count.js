'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const port = 59820 + Math.floor(Math.random() * 60);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-v9311-random-'));
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
  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'v9311-host',name:'Organizador',roomName:'Azar flexible',gameKind:'normal',mode:90,maxPlayers:20,maxCardsPerPlayer:4,autoSeconds:10,startMode:'manual',accessType:'public'}});

  const uno=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Uno',cardCount:4,deviceId:'v9311-uno'}});
  let state=await ok('/api/player/state',{playerToken:uno.token});
  assert.equal(Number(state.player.allowedCardCount),4,'La mesa debe conservar 4 como máximo autorizado');
  state=await ok('/api/player/random-cards',{method:'POST',playerToken:uno.token,body:{cardCount:1}});
  assert.equal(state.player.cards.length,1,'Debe poder elegir un solo cartón al azar aunque el máximo sea 4');

  const tres=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Tres',cardCount:4,deviceId:'v9311-tres'}});
  state=await ok('/api/player/random-cards',{method:'POST',playerToken:tres.token,body:{cardCount:3}});
  assert.equal(state.player.cards.length,3,'Debe poder elegir tres cartones al azar');
  assert.equal(new Set(state.player.cards.map(x=>x.id)).size,3,'Los cartones al azar no deben repetirse');

  const viejo=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Compat',cardCount:4,deviceId:'v9311-compat'}});
  state=await ok('/api/player/random-cards',{method:'POST',playerToken:viejo.token,body:{}});
  assert.equal(state.player.cards.length,4,'El cliente anterior sin cardCount debe conservar el comportamiento compatible');

  const invalido=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Invalido',cardCount:4,deviceId:'v9311-invalid'}});
  const bad=await raw('/api/player/random-cards',{method:'POST',playerToken:invalido.token,body:{cardCount:5}});
  assert.equal(bad.r.status,400,'El servidor debe rechazar cantidades mayores al máximo');

  const playerJs=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
  const community=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
  assert(playerJs.includes('CARTONES AL AZAR · ¿CUÁNTOS?')&&playerJs.includes('data-random-count')&&playerJs.includes('cardCount:wanted'),'La interfaz debe permitir elegir la cantidad al azar');
  assert(community.includes('(CREAR MESA)')&&community.includes('lobbyMobileActionCopy'),'El botón móvil debe aclarar que JUGAR crea una mesa');

  console.log('V9.3.11 JUGAR + AZAR FLEXIBLE: OK · 1/3/4 cartones · límite validado');
}catch(error){
  console.error(error); process.exitCode=1;
}finally{
  await stop();
  if(!process.exitCode) fs.rmSync(dataDir,{recursive:true,force:true});
  else console.error('DATA_DIR:',dataDir);
}})();
