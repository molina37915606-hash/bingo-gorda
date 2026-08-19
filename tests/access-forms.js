'use strict';
// Regresión del acceso actual: link general reutilizable -> sesión privada HttpOnly, sin clave compartida.
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const port=53400+Math.floor(Math.random()*200),base=`http://127.0.0.1:${port}`,root=path.join(__dirname,'..'),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-final-access-forms-'));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('Servidor no disponible')}
async function json(pathname,method='GET',body,headers={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({}));assert(r.ok,`${pathname}: ${r.status} ${JSON.stringify(data)}`);return{r,data}}
async function form(pathname,values){return fetch(base+pathname,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values),redirect:'manual'})}
function cookieFrom(r){const c=(r.headers.get('set-cookie')||'').split(';')[0];assert(c.startsWith('bingo_player_session='),`Cookie faltante: ${c}`);return c}
(async()=>{try{
  await waitServer();const login=(await json('/api/admin/login','POST',{})).data,ah={'X-Admin-Token':login.token};
  let room=(await json('/api/admin/create-simple-room','POST',{mode:90,cardCount:80,autoSeconds:60,rules:{line:true,bingo:true},paymentMode:'free',markingMode:'normal',maxCardsPerPlayer:4,linePrizeCount:2},ah)).data;
  let r=await fetch(base+'/jugador'),html=await r.text();assert(r.ok);assert(!html.includes('name="accessKey"'));assert(html.includes('link privado'),'El acceso base debe orientar al link privado/recuperación');
  const joinPath=new URL(room.joinUrl).pathname+new URL(room.joinUrl).search;
  r=await fetch(base+joinPath);html=await r.text();assert(html.includes('Inscripciones cerradas'));
  room=(await json('/api/admin/join-open','POST',{open:true},ah)).data;
  r=await fetch(base+joinPath);html=await r.text();assert(r.ok&&html.includes('name="name"')&&html.includes('name="cardCount"'));assert(!html.includes('name="accessKey"'));
  r=await form('/jugador/entrar',{roomCode:room.roomCode,name:'Jugador Form',cardCount:'1'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/jugar');const c1=cookieFrom(r);
  let p1=(await json('/api/player/state','GET',undefined,{Cookie:c1})).data;assert.equal(p1.player.name,'Jugador Form');
  await json('/api/player/choose','POST',{cardIds:[p1.player.offeredCards[0].id]},{Cookie:c1});
  r=await form('/jugador/entrar',{roomCode:room.roomCode,name:'Jugador Directo',cardCount:'2'});assert.equal(r.status,303);const c2=cookieFrom(r);assert.notEqual(c1,c2);
  let p2=(await json('/api/player/state','GET',undefined,{Cookie:c2})).data;assert.equal(p2.player.allowedCardCount,2);
  r=await fetch(base+'/jugar',{headers:{Cookie:c2}});html=await r.text();assert(r.ok&&html.includes('js/player.js'));assert(!html.includes('BINGO_PLAYER_DIRECT_TOKEN'));assert(!html.includes('name="accessKey"'));
  await json('/api/player/choose','POST',{cardIds:p2.player.offeredCards.slice(0,2).map(c=>c.id)},{Cookie:c2});
  await json('/api/admin/join-open','POST',{open:false},ah);let admin=(await json('/api/admin/state','GET',undefined,ah)).data;assert.equal(admin.startPlan.eligiblePlayers,2);await json('/api/admin/start','POST',{},ah);

  await json('/api/admin/close','POST',{},ah);
  room=(await json('/api/admin/create-simple-room','POST',{mode:90,cardCount:100,autoSeconds:60,rules:{line:true,bingo:true},paymentMode:'paid',cardPrice:1000,paymentAlias:'lagorda.form',paymentAccountHolder:'La Gorda',paymentProvider:'Mercado Pago',whatsapp:'5493757624388',markingMode:'normal',maxCardsPerPlayer:4,linePrizeCount:1},ah)).data;
  await json('/api/admin/join-open','POST',{open:true},ah);
  r=await form('/jugador/entrar',{roomCode:room.roomCode,name:'Pago Directo',cardCount:'2'});const pc=cookieFrom(r);let ps=(await json('/api/player/state','GET',undefined,{Cookie:pc})).data;assert.equal(ps.player.paymentStatus,'pending');assert.equal(ps.player.offeredCards.length,0);
  await json('/api/player/payment-report','POST',{dni:'12345678',holder:'Titular Pago'},{Cookie:pc});admin=(await json('/api/admin/state','GET',undefined,ah)).data;const pa=admin.players.find(p=>p.name==='Pago Directo');assert.equal(pa.paymentStatus,'reported');await json('/api/admin/player-approval','POST',{playerId:pa.id,allowedCardCount:2,confirmPayment:true},ah);ps=(await json('/api/player/state','GET',undefined,{Cookie:pc})).data;assert.equal(ps.player.paymentStatus,'confirmed');assert(ps.player.offeredCards.length>=2);
  r=await fetch(base+'/jugador/salir',{headers:{Cookie:pc},redirect:'manual'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/jugador');r=await fetch(base+'/jugador/salir?comunidad=1',{headers:{Cookie:pc},redirect:'manual'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/comunidad');
  console.log('PRUEBA ACCESO FINAL: OK · link general -> cookie privada -> pago/recuperación sin clave compartida');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
