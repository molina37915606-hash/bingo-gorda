'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const port=55200+Math.floor(Math.random()*200),base=`http://127.0.0.1:${port}`,dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-functional-'));
const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'120'},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició el servidor')}
async function request(url,opt={}){return fetch(base+url,opt)}
async function jsonReq(url,opt={}){const r=await request(url,opt),d=await r.json().catch(()=>({}));return{r,d}}
async function post(url,body,headers={}){const {r,d}=await jsonReq(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body||{})});assert(r.ok,`${url} ${r.status} ${JSON.stringify(d)}`);return d}
async function getJson(url,headers={}){const {r,d}=await jsonReq(url,{headers});assert(r.ok,`${url} ${r.status} ${JSON.stringify(d)}`);return d}
function cookieFrom(res){const raw=res.headers.get('set-cookie')||'';return raw.split(';')[0]}
async function claimInvite(url){const u=new URL(url),path=u.pathname+u.search;const head=await request(path,{method:'HEAD',redirect:'manual'});assert.equal(head.status,200,'HEAD de vista previa no debe consumir la invitación');assert(!cookieFrom(head),'HEAD no debe crear sesión');const preview=await request(path,{redirect:'manual'});assert.equal(preview.status,200,'GET de WhatsApp debe devolver una página segura sin consumir');assert(!cookieFrom(preview),'GET de vista previa no debe crear sesión');const html=await preview.text();const match=html.match(/name="activationToken" value="([^"]+)"/);assert(match,'La página real debe incluir activación efímera');const preview2=await request(path,{redirect:'manual'});const html2=await preview2.text();assert(preview2.status===200&&html2.includes('activationToken'),'Una segunda vista previa tampoco debe consumir el link');const r=await request(path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`activationToken=${encodeURIComponent(match[1])}`,redirect:'manual'});assert.equal(r.status,303,'El POST interno del navegador debe activar la invitación');assert.equal(r.headers.get('location'),'/jugar');const cookie=cookieFrom(r);assert(cookie.startsWith('bingo_player_session='),'Debe crear cookie privada HttpOnly');return cookie}
(async()=>{let controllers=[];try{
  await waitServer();
  const login=await post('/api/admin/login',{}),ah={'X-Admin-Token':login.token};
  const room=await post('/api/admin/create-simple-room',{mode:90,cardCount:100,autoSeconds:60,rules:{line:true,bingo:true},markingMode:'normal',linePrizeCount:2,maxCardsPerPlayer:4},ah);
  assert.equal(room.roomSettings.maxCardsPerPlayer,4);assert.equal(room.roomSettings.joinOpen,false);assert.equal(room.roomSettings.paymentMode,'free');assert(room.broadcastUrl,'La transmisión debe existir siempre');

  const ana=await post('/api/admin/invite-player',{name:'María',allowedCardCount:4},ah);
  const beto=await post('/api/admin/invite-player',{name:'Beto',allowedCardCount:4},ah);
  assert(ana.player.inviteUrl.includes('/invitacion/'));assert(beto.player.inviteUrl.includes('/invitacion/'));

  // Simula la vista previa que hace WhatsApp: HEAD/GET no deben reclamar la invitación.
  const anaPath=new URL(ana.player.inviteUrl).pathname;
  let waHead=await request(anaPath,{method:'HEAD',redirect:'manual'});assert.equal(waHead.status,200);
  let waPreview=await request(anaPath,{redirect:'manual'});assert.equal(waPreview.status,200);assert((await waPreview.text()).includes('activationToken'));
  let anaAdmin=(await getJson('/api/admin/state',ah)).players.find(p=>p.id===ana.player.id);assert.equal(anaAdmin.invitationClaimed,false,'La vista previa de WhatsApp no debe marcar la invitación como usada');

  let dup=await jsonReq('/api/admin/invite-player',{method:'POST',headers:{'Content-Type':'application/json',...ah},body:JSON.stringify({name:'  MARIA ',allowedCardCount:4})});
  assert.equal(dup.r.status,400,'El nombre debe ser único ignorando mayúsculas/espacios/acentos');

  let before=(await getJson('/api/admin/state',ah)).players.length;
  let bulk=await jsonReq('/api/admin/invite-players',{method:'POST',headers:{'Content-Type':'application/json',...ah},body:JSON.stringify({names:'Lucía\nLucia',allowedCardCount:4})});
  assert.equal(bulk.r.status,400,'Un lote con nombres equivalentes debe rechazarse');
  assert.equal((await getJson('/api/admin/state',ah)).players.length,before,'El lote inválido no debe crear jugadores parciales');

  const cookieA=await claimInvite(ana.player.inviteUrl),cookieB=await claimInvite(beto.player.inviteUrl);
  assert.notEqual(cookieA,cookieB,'Cada jugador debe tener una sesión diferente');

  let reuse=await request(new URL(ana.player.inviteUrl).pathname,{redirect:'manual'});assert.equal(reuse.status,200,'Otro dispositivo no debe reutilizar la invitación');assert((await reuse.text()).includes('ya fue utilizado'));
  let same=await request(new URL(ana.player.inviteUrl).pathname,{headers:{Cookie:cookieA},redirect:'manual'});assert.equal(same.status,303,'El mismo navegador puede volver a abrir su link');

  let a=await getJson('/api/player/state',{Cookie:cookieA}),b=await getJson('/api/player/state',{Cookie:cookieB});
  assert.equal(a.player.name,'María');assert.equal(b.player.name,'Beto');assert.equal(a.player.allowedCardCount,4);assert.equal(b.player.allowedCardCount,4);
  assert(a.player.offeredCards.length>=4&&b.player.offeredCards.length>=4);

  // Chat y minijuegos existen antes del sorteo.
  await post('/api/player/chat',{text:'Hola desde la sala de espera 😀'},{Cookie:cookieA});
  await post('/api/player/waiting-game/score',{gameType:'red_black',bestScore:3},{Cookie:cookieA});
  a=await getJson('/api/player/state',{Cookie:cookieA});
  assert(a.chat.messages.some(m=>String(m.text).includes('Hola desde')));assert(a.waitingGame.activeTypes.includes('red_black'));

  // María elige voluntariamente solo 2 de los 4 autorizados: debe conservarlos.
  const aIds=a.player.offeredCards.slice(0,2).map(c=>c.id);
  await post('/api/player/choose',{cardIds:aIds},{Cookie:cookieA});
  a=await getJson('/api/player/state',{Cookie:cookieA});assert.equal(a.player.cards.length,2);assert.equal(a.player.selectionConfirmed,true);

  // Mantener dos conexiones SSE reales para habilitar INICIAR SORTEO.
  for(const cookie of [cookieA,cookieB]){const ctrl=new AbortController();controllers.push(ctrl);const r=await request('/api/events?role=player',{headers:{Cookie:cookie},signal:ctrl.signal});assert.equal(r.status,200)}
  await wait(120);
  const adm=await getJson('/api/admin/state',ah);assert.equal(adm.startPlan.connectedEligiblePlayers,2);assert.equal(adm.startPlan.autoAssignPlayers,1);assert.equal(adm.startPlan.canStartFromAdmin,true);

  await post('/api/admin/start',{},ah);await wait(260);
  a=await getJson('/api/player/state',{Cookie:cookieA});b=await getJson('/api/player/state',{Cookie:cookieB});
  assert(['starting','playing'].includes(a.status));assert(['starting','playing'].includes(b.status));
  assert.equal(a.player.cards.length,2,'Quien confirmó menos que el máximo debe conservar exactamente su selección');
  assert.equal(b.player.cards.length,4,'Quien no eligió nada debe recibir automáticamente la cantidad autorizada');
  const aCardIds=new Set(a.player.cards.map(c=>c.id));assert(b.player.cards.every(c=>!aCardIds.has(c.id)),'No puede haber cartones duplicados entre jugadores');
  const nums=[...a.player.cards,...b.player.cards].map(c=>c.number);assert.equal(new Set(nums).size,nums.length,'Los números visibles de cartón deben ser únicos');

  // Recuperación: rota sesión y solo puede usarse una vez.
  const mariaAdmin=(await getJson('/api/admin/state',ah)).players.find(p=>p.name==='María');
  const recovery=await post('/api/admin/player-recovery-link',{playerId:mariaAdmin.id},ah);const token=new URL(recovery.url).searchParams.get('recuperar');
  const recovered=await post('/api/player/recover',{recoveryToken:token,deviceId:'telefono-nuevo'});assert(recovered.token);
  let old=await jsonReq('/api/player/state',{headers:{Cookie:cookieA}});assert.equal(old.r.status,401,'La sesión anterior debe invalidarse al recuperar');
  let again=await jsonReq('/api/player/recover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recoveryToken:token,deviceId:'otro'})});assert.equal(again.r.status,400,'La recuperación debe ser de un solo uso');

  console.log('PRUEBA CUASIFINAL FUNCIONAL: OK · link privado + sala de espera + selección parcial + autoasignación + seguridad');
}catch(e){console.error(e);process.exitCode=1}finally{for(const c of controllers)c.abort();child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
