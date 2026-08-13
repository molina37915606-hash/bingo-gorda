'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const port = 53400 + Math.floor(Math.random() * 200);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-alpha3-access-'));
const child = spawn(process.execPath, ['server.js'], { cwd:path.join(__dirname,'..'), env:{...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base}, stdio:['ignore','pipe','pipe'] });
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<100;i++){try{const r=await fetch(base+'/healthz');if(r.ok)return}catch{}await wait(40)}throw new Error('Servidor no disponible')}
async function json(pathname,method='GET',body,headers={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({}));assert(r.ok,`${pathname}: ${r.status} ${JSON.stringify(data)}`);return {r,data}}
async function form(pathname,values){const body=new URLSearchParams(values);return fetch(base+pathname,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'manual'})}
(async()=>{try{
  await waitServer();
  const login=(await json('/api/admin/login','POST',{})).data;
  const ah={'X-Admin-Token':login.token};
  const room=(await json('/api/admin/create-simple-room','POST',{mode:90,cardCount:80,autoSeconds:60,rules:{line:true,bingo:true},paymentMode:'free',markingMode:'normal',accessKey:'FORM333',maxCardsPerPlayer:4,linePrizeCount:2},ah)).data;
  let r=await fetch(base+'/jugador'); let html=await r.text();
  assert(r.ok); assert(html.includes('name="accessKey"')); assert(!html.includes('name="name"'),'El primer paso no debe pedir nombre todavía.');
  r=await form('/jugador/verificar',{accessKey:'FORM333'}); html=await r.text();
  assert.equal(r.status,200); assert(html.includes('Clave correcta')); assert(html.includes('name="name"')); assert(html.includes(`value="${room.roomCode}"`));
  r=await form('/jugador/entrar',{roomCode:room.roomCode,name:'Jugador Form',cardCount:'1',deviceId:'device-form-1'});
  assert.equal(r.status,303); const location=r.headers.get('location')||''; assert(location.startsWith('/jugar?session='),location);
  const token=new URL(base+location).searchParams.get('session'); assert(token);
  const player=(await json('/api/player/state','GET',undefined,{'X-Player-Token':token})).data;
  assert.equal(player.player.name,'Jugador Form'); assert.equal(player.player.allowedCardCount,1);
  const directPath=new URL(room.joinUrl).pathname+new URL(room.joinUrl).search;
  r=await fetch(base+directPath); html=await r.text();
  assert(r.ok); assert(html.includes('Acceso directo listo')); assert(!html.includes('name="accessKey"')); assert(html.includes('name="name"'));
  r=await form('/jugador/entrar',{roomCode:room.roomCode,name:'Jugador Directo',cardCount:'2',deviceId:'device-form-2'});
  assert.equal(r.status,303); const directToken=new URL(base+(r.headers.get('location')||'')).searchParams.get('session'); assert(directToken);
  const directState=(await json('/api/player/state','GET',undefined,{'X-Player-Token':directToken})).data;
  assert.equal(directState.player.name,'Jugador Directo'); assert.equal(directState.player.allowedCardCount,2);
  // Completar cartones de ambos jugadores y comprobar que Admin puede iniciar.
  await json('/api/player/choose','POST',{cardIds:[player.player.offeredCards[0].id],name:'Jugador Form'},{'X-Player-Token':token});
  await json('/api/player/automark','POST',{enabled:false},{'X-Player-Token':token});
  await json('/api/player/choose','POST',{cardIds:directState.player.offeredCards.slice(0,2).map(card=>card.id),name:'Jugador Directo'},{'X-Player-Token':directToken});
  await json('/api/player/automark','POST',{enabled:false},{'X-Player-Token':directToken});
  const adminState=(await json('/api/admin/state','GET',undefined,ah)).data;
  assert.equal(adminState.preflight.ok,true,JSON.stringify(adminState.preflight.errors||[]));
  const started=(await json('/api/admin/start','POST',{},ah)).data;
  assert(['starting','playing'].includes(started.status),'La sala debe poder iniciarse después del ingreso por formulario.');
  console.log('PRUEBA ACCESO ALFA 3: OK · clave → datos → sesión + link directo → iniciar');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
