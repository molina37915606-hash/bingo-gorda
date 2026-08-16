'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const port=56100+Math.floor(Math.random()*250),base=`http://127.0.0.1:${port}`,root=path.join(__dirname,'..'),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-final-access-'));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'500'},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
async function jsonReq(url,opt={}){const r=await fetch(base+url,opt),d=await r.json().catch(()=>({}));return{r,d}}
async function post(url,body={},headers={}){const {r,d}=await jsonReq(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});assert(r.ok,`${url}: ${r.status} ${JSON.stringify(d)}`);return d}
async function postFail(url,body={},headers={}){const {r,d}=await jsonReq(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});assert(!r.ok,`${url} debía fallar`);return{r,d}}
async function get(url,headers={}){const {r,d}=await jsonReq(url,{headers});assert(r.ok,`${url}: ${r.status} ${JSON.stringify(d)}`);return d}
function cookieFrom(res){return (res.headers.get('set-cookie')||'').split(';')[0]}
async function generalJoin(roomCode,name,cardCount){const r=await fetch(base+'/jugador/entrar',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`roomCode=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(name)}&cardCount=${cardCount}`,redirect:'manual'});assert.equal(r.status,303,'El link general debe crear una sesión privada');const cookie=cookieFrom(r);assert(cookie.startsWith('bingo_player_session='));return cookie}
async function claimInvite(inviteUrl){const invitePath=new URL(inviteUrl).pathname;const preview=await fetch(base+invitePath,{redirect:'manual'});assert.equal(preview.status,200);const html=await preview.text();const token=html.match(/name="activationToken" value="([^"]+)"/)?.[1];assert(token,'La invitación debe emitir activación efímera');const r=await fetch(base+invitePath,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`activationToken=${encodeURIComponent(token)}`,redirect:'manual'});assert.equal(r.status,303);return cookieFrom(r)}
(async()=>{try{
  await waitServer();
  const login=await post('/api/admin/login',{}),ah={'X-Admin-Token':login.token};

  // Partida paga: inscripción, total, datos del transferente y confirmación manual.
  let room=await post('/api/admin/create-simple-room',{mode:90,cardCount:80,autoSeconds:60,rules:{line:true,bingo:true},linePrizeCount:2,maxCardsPerPlayer:4,markingMode:'normal',paymentMode:'paid',cardPrice:2500,paymentAlias:'lagorda.prueba',paymentAccountHolder:'La Gorda',paymentProvider:'Mercado Pago',whatsapp:'5491112345678'},ah);
  assert.equal(room.roomSettings.paymentMode,'paid');
  assert.equal(room.roomSettings.cardPrice,2500);
  assert.equal(room.roomSettings.paymentAlias,'lagorda.prueba');
  assert.equal(room.roomSettings.paymentAccountHolder,'La Gorda');
  assert.equal(room.roomSettings.paymentProvider,'Mercado Pago');
  assert.equal(room.roomSettings.joinOpen,false,'Las inscripciones deben iniciar cerradas');

  room=await post('/api/admin/join-open',{open:true},ah);
  const cookie=await generalJoin(room.roomCode,'María Jugadora',2);
  let player=await get('/api/player/state',{Cookie:cookie});
  assert.equal(player.player.requestedCardCount,2);
  assert.equal(player.player.paymentStatus,'pending');
  assert.equal(player.player.offeredCards.length,0,'No debe ofrecer cartones antes del pago confirmado');

  // Antes de informar pago, el jugador puede corregir libremente la cantidad.
  player=await post('/api/player/order',{cardCount:3},{Cookie:cookie});
  assert.equal(player.player.requestedCardCount,3);
  assert.equal(player.player.allowedCardCount,3);
  assert.equal(player.player.paymentStatus,'pending');

  player=await post('/api/player/payment-report',{dni:'12.345.678',holder:'Rubén Pérez'},{Cookie:cookie});
  assert.equal(player.player.paymentStatus,'reported');
  assert.equal(player.player.paymentTransferDni,'12345678');
  assert.equal(player.player.paymentTransferHolder,'Rubén Pérez');

  // Si informó por error pero todavía no transfirió, puede volver a pendiente y corregir.
  player=await post('/api/player/order',{cardCount:2,transferState:'not_transferred'},{Cookie:cookie});
  assert.equal(player.player.paymentStatus,'pending');
  assert.equal(player.player.requestedCardCount,2);
  player=await post('/api/player/payment-report',{dni:'12.345.678',holder:'Rubén Pérez'},{Cookie:cookie});

  // Si ya transfirió, el cambio queda para revisión del Admin y no altera el pedido silenciosamente.
  player=await post('/api/player/order',{cardCount:3,transferState:'already_transferred'},{Cookie:cookie});
  assert.equal(player.player.paymentStatus,'reported');
  assert.equal(player.player.requestedCardCount,2);
  assert.equal(player.player.paymentChangeRequestedCount,3);

  let admin=await get('/api/admin/state',ah);
  let maria=admin.players.find(p=>p.name==='María Jugadora');
  assert(maria);
  assert.equal(maria.paymentStatus,'reported');
  assert.equal(maria.paymentChangeRequestedCount,3);
  assert.equal(admin.registrationSummary.requestedCards,2);
  assert.equal(admin.registrationSummary.confirmedCards,0);
  assert.equal(admin.startPlan.pendingPaymentPlayers,1);

  room=await post('/api/admin/join-open',{open:false},ah);
  assert.equal(room.status,'waiting','Cerrar inscripciones no debe iniciar el sorteo');
  assert.equal(room.roomSettings.joinOpen,false);
  const blocked=await postFail('/api/admin/start',{},ah);
  assert(/pagos pendientes/i.test(blocked.d.error),'No debe iniciar con pagos pendientes');

  const changeBlocked=await postFail('/api/admin/player-approval',{playerId:maria.id,allowedCardCount:2,confirmPayment:true},ah);
  assert(/cambio de cantidad/i.test(changeBlocked.d.error),'No debe confirmar el pago sin resolver antes el cambio solicitado');
  admin=await post('/api/admin/player-approval',{playerId:maria.id,applyRequestedChange:true,allowedCardCount:3},ah);
  maria=admin.players.find(p=>p.id===maria.id);
  assert.equal(maria.allowedCardCount,3);
  assert.equal(maria.paymentChangeRequestedCount,null);
  admin=await post('/api/admin/player-approval',{playerId:maria.id,allowedCardCount:3,confirmPayment:true},ah);
  maria=admin.players.find(p=>p.id===maria.id);
  assert.equal(maria.paymentStatus,'confirmed');
  assert.equal(admin.registrationSummary.confirmedCards,3,'Admin debe ver cuántos cartones jugarán');

  player=await get('/api/player/state',{Cookie:cookie});
  assert(player.player.offeredCards.length>=3,'Al confirmar pago debe ofrecer cartones');
  const offered=player.player.offeredCards.slice(0,3).map(c=>c.id);
  const partial=await postFail('/api/player/choose',{cardIds:offered.slice(0,2)},{Cookie:cookie});
  assert(/exactamente 3/i.test(partial.d.error),'En paga debe elegir exactamente la cantidad confirmada');
  player=await post('/api/player/choose',{cardIds:offered},{Cookie:cookie});
  assert.equal(player.player.cards.length,3);

  admin=await get('/api/admin/state',ah);
  assert.equal(admin.registrationSummary.assignedCards,3);
  assert.equal(admin.registrationSummary.playingCards,3);
  const started=await post('/api/admin/start',{},ah);
  assert.equal(started.status,'starting');
  assert.equal(started.game.drawn.length,0,'No debe salir una bolilla al pulsar iniciar');
  await wait(250);
  admin=await get('/api/admin/state',ah);
  assert.equal(admin.status,'starting','Debe respetar el período de tutorial/preparación');
  assert.equal(admin.game.drawn.length,0,'No puede salir la primera bolilla durante el tutorial');

  // Nueva sala: un link privado no abierto antes del inicio sigue siendo participante y entra tarde.
  room=await post('/api/admin/create-simple-room',{mode:75,cardCount:70,autoSeconds:60,rules:{bingo:true},maxCardsPerPlayer:2,markingMode:'normal',paymentMode:'free'},ah);
  const late=await post('/api/admin/invite-player',{name:'Laura Tarde',allowedCardCount:2},ah);
  const other=await post('/api/admin/invite-player',{name:'Ana Presente',allowedCardCount:1},ah);
  assert(late.player.inviteUrl&&other.player.inviteUrl);
  // Nadie abre el link y no hay SSE: igual son jugadores ya registrados.
  admin=await get('/api/admin/state',ah);
  assert.equal(admin.startPlan.eligiblePlayers,2);
  assert.equal(admin.startPlan.connectedEligiblePlayers,0);
  assert.equal(admin.roomSettings.joinOpen,false);
  await post('/api/admin/start',{},ah);
  await wait(650);
  admin=await get('/api/admin/state',ah);
  assert(['playing','starting'].includes(admin.status));
  const lateAdmin=admin.players.find(p=>p.name==='Laura Tarde');
  assert.equal(lateAdmin.selectionConfirmed,true,'El servidor debe asignar cartones aunque todavía no abrió el link');
  assert.equal(lateAdmin.cardIds.length,2);

  const lateCookie=await claimInvite(late.player.inviteUrl);
  player=await get('/api/player/state',{Cookie:lateCookie});
  assert.equal(player.player.name,'Laura Tarde');
  assert.equal(player.player.cards.length,2,'Al entrar tarde debe recibir los cartones asignados al inicio');
  assert.equal(player.player.excludedFromRound,false);

  const recovery=await post('/api/admin/player-recovery-link',{playerId:lateAdmin.id},ah);
  assert(recovery.url.includes('recuperar='),'Admin debe poder generar recuperación durante la partida');
  const recoveryToken=new URL(recovery.url).searchParams.get('recuperar');
  const recovered=await post('/api/player/recover',{recoveryToken,deviceId:'telefono-nuevo'});
  assert(recovered.token,'La recuperación durante la partida debe rotar la sesión');

  const closedPage=await fetch(room.joinUrl);const closedHtml=await closedPage.text();
  assert(closedHtml.includes('Inscripciones cerradas'));
  assert(closedHtml.includes('recuperación'),'El link general cerrado debe orientar a jugadores ya inscriptos');

  const playerJs=fs.readFileSync(path.join(root,'js','player.js'),'utf8');
  assert(playerJs.includes('openCoachTutorial'),'Debe existir tutorial contextual sobre la interfaz real');
  assert(playerJs.includes('coachPrizeSteps'),'El tutorial debe explicar individualmente los premios activos');
  assert(playerJs.includes('data-prize-visual'),'Cada premio debe tener un ancla propia para el globo');
  assert(playerJs.includes('coachPrizeCell'),'El tutorial debe demostrar visualmente las casillas del premio');
  assert(playerJs.includes('visualViewport'),'El posicionamiento debe respetar el viewport móvil real');
  assert(playerJs.includes('AmboCabeza')&&playerJs.includes('Doble Línea')&&playerJs.includes('4 Esquinas'),'El tutorial debe explicar las jugadas configurables');
  assert(playerJs.includes('paymentAccountHolder')&&playerJs.includes('paymentProvider'),'El jugador debe ver titular y billetera/banco de destino');
  assert(playerJs.includes('Primera bolilla en'),'Debe mostrarse cuenta regresiva de preparación');
  console.log('PRUEBA FINAL ACCESO + PAGOS + INGRESO TARDÍO: OK');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
