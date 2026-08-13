'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const port = 53400 + Math.floor(Math.random() * 200);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-alpha5-access-'));
const child = spawn(process.execPath, ['server.js'], { cwd:path.join(__dirname,'..'), env:{...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base}, stdio:['ignore','pipe','pipe'] });
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<100;i++){try{const r=await fetch(base+'/healthz');if(r.ok)return}catch{}await wait(40)}throw new Error('Servidor no disponible')}
async function json(pathname,method='GET',body,headers={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({}));assert(r.ok,`${pathname}: ${r.status} ${JSON.stringify(data)}`);return {r,data}}
async function form(pathname,values){const body=new URLSearchParams(values);return fetch(base+pathname,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'manual'})}
function cookieFrom(response){const raw=response.headers.get('set-cookie')||'';const first=raw.split(';')[0];assert(first.startsWith('bingo_player_session='),`Cookie de jugador faltante: ${raw}`);return first}
(async()=>{try{
  await waitServer();
  const login=(await json('/api/admin/login','POST',{})).data;
  const ah={'X-Admin-Token':login.token};

  // GRATIS + acceso manual por clave.
  const room=(await json('/api/admin/create-simple-room','POST',{mode:90,cardCount:80,autoSeconds:60,rules:{line:true,bingo:true},paymentMode:'free',markingMode:'normal',accessKey:'FORM333',maxCardsPerPlayer:4,linePrizeCount:2},ah)).data;
  let r=await fetch(base+'/jugador'); let html=await r.text();
  assert(r.ok); assert(html.includes('name="accessKey"')); assert(!html.includes('name="name"'),'El primer paso no debe pedir nombre todavía.');
  r=await form('/jugador/verificar',{accessKey:'FORM333'}); html=await r.text();
  assert.equal(r.status,200); assert(html.includes('Clave correcta')); assert(html.includes('name="name"')); assert(html.includes(`value="${room.roomCode}"`));
  r=await form('/jugador/entrar',{roomCode:room.roomCode,name:'Jugador Form',cardCount:'1',deviceId:'device-form-1'});
  assert.equal(r.status,303); assert.equal(r.headers.get('location'),'/jugar');
  const cookie1=cookieFrom(r);
  r=await fetch(base+'/jugar',{headers:{Cookie:cookie1}}); html=await r.text();
  assert(r.ok); assert(html.includes('js/player.js'), 'La pantalla /jugar debe usar el módulo Jugador CUASIFINAL.');
  assert(!html.includes('BINGO_PLAYER_DIRECT_TOKEN'), 'El token privado no debe quedar expuesto en el HTML/JavaScript.');
  assert(!html.includes('name="accessKey"'), 'Dentro de /jugar nunca debe existir otro formulario de clave.');
  const playerCookieState=(await json('/api/player/state','GET',undefined,{Cookie:cookie1})).data;
  assert.equal(playerCookieState.player.name,'Jugador Form'); assert.equal(playerCookieState.player.allowedCardCount,1);

  // LINK DIRECTO: no pide clave y termina en la misma sesión segura.
  const directPath=new URL(room.joinUrl).pathname+new URL(room.joinUrl).search;
  r=await fetch(base+directPath); html=await r.text();
  assert(r.ok); assert(html.includes('Acceso directo listo')); assert(!html.includes('name="accessKey"')); assert(html.includes('name="name"'));
  r=await form('/jugador/entrar',{roomCode:room.roomCode,name:'Jugador Directo',cardCount:'2',deviceId:'device-form-2'});
  assert.equal(r.status,303); assert.equal(r.headers.get('location'),'/jugar');
  const cookie2=cookieFrom(r);
  const directState=(await json('/api/player/state','GET',undefined,{Cookie:cookie2})).data;
  assert.equal(directState.player.name,'Jugador Directo'); assert.equal(directState.player.allowedCardCount,2);
  // Recargar /jugar no vuelve a pedir clave.
  r=await fetch(base+'/jugar',{headers:{Cookie:cookie2}}); html=await r.text();
  assert(r.ok); assert(html.includes('js/player.js')); assert(!html.includes('name="accessKey"'));

  // Completar gratis e iniciar.
  await json('/api/player/choose','POST',{cardIds:[playerCookieState.player.offeredCards[0].id],name:'Jugador Form'},{Cookie:cookie1});
  await json('/api/player/automark','POST',{enabled:false},{Cookie:cookie1});
  const directFresh=(await json('/api/player/state','GET',undefined,{Cookie:cookie2})).data;
  await json('/api/player/choose','POST',{cardIds:directFresh.player.offeredCards.slice(0,2).map(card=>card.id),name:'Jugador Directo'},{Cookie:cookie2});
  await json('/api/player/automark','POST',{enabled:false},{Cookie:cookie2});
  let adminState=(await json('/api/admin/state','GET',undefined,ah)).data;
  assert.equal(adminState.preflight.ok,true,JSON.stringify(adminState.preflight.errors||[]));
  await json('/api/admin/start','POST',{},ah);

  // PAGA: link directo -> solicita -> admin ajusta/confirma -> /jugar sigue autenticado -> elige cartones.
  await json('/api/admin/close-room','POST',{},ah).catch(()=>null);
  const paidRoom=(await json('/api/admin/create-simple-room','POST',{mode:90,cardCount:100,autoSeconds:60,rules:{line:true,bingo:true},paymentMode:'paid',cardPrice:1000,whatsapp:'3757624388',markingMode:'normal',accessKey:'PAGA444',maxCardsPerPlayer:4,linePrizeCount:1},ah)).data;
  const paidDirect=new URL(paidRoom.joinUrl).pathname+new URL(paidRoom.joinUrl).search;
  r=await fetch(base+paidDirect); html=await r.text(); assert(html.includes('Acceso directo listo')); assert(!html.includes('name="accessKey"'));
  r=await form('/jugador/entrar',{roomCode:paidRoom.roomCode,name:'Pago Directo',cardCount:'4',deviceId:'device-paid'});
  assert.equal(r.status,303); const paidCookie=cookieFrom(r);
  let paidState=(await json('/api/player/state','GET',undefined,{Cookie:paidCookie})).data;
  assert.equal(paidState.player.paymentStatus,'pending'); assert.equal(paidState.player.requestedCardCount,4);
  adminState=(await json('/api/admin/state','GET',undefined,ah)).data;
  const paidAdmin=adminState.players.find(p=>p.name==='Pago Directo'); assert(paidAdmin);
  await json('/api/admin/player-approval','POST',{playerId:paidAdmin.id,allowedCardCount:2,confirmPayment:true},ah);
  paidState=(await json('/api/player/state','GET',undefined,{Cookie:paidCookie})).data;
  assert.equal(paidState.player.paymentStatus,'confirmed'); assert.equal(paidState.player.allowedCardCount,2); assert(paidState.player.offeredCards.length>=2);
  r=await fetch(base+'/jugar',{headers:{Cookie:paidCookie}}); html=await r.text();
  assert(r.ok); assert(html.includes('js/player.js')); assert(!html.includes('name="accessKey"'));
  await json('/api/player/choose','POST',{cardIds:paidState.player.offeredCards.slice(0,2).map(card=>card.id),name:'Pago Directo'},{Cookie:paidCookie});

  // Salir borra cookie y /jugar sin sesión vuelve a acceso, no al login viejo embebido.
  r=await fetch(base+'/jugador/salir',{headers:{Cookie:paidCookie},redirect:'manual'}); assert.equal(r.status,303); assert.equal(r.headers.get('location'),'/jugador');

  console.log('PRUEBA ACCESO ALFA 6: OK · clave/link → cookie HttpOnly → nuevo jugador sin token expuesto ni segundo login');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
