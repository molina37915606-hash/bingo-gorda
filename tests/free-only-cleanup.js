'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-free-only-v6-'));
const stateFile=path.join(dataDir,'sala-online.json'),platformFile=path.join(dataDir,'plataforma.json');
const startsAt=new Date(Date.now()+3*60*60*1000).toISOString();
fs.writeFileSync(stateFile,JSON.stringify({
  active:false,
  roomSettings:{paymentMode:'paid',cardPrice:5000,paymentAlias:'viejo.alias',paymentAccountHolder:'Viejo',paymentProvider:'Banco',prizeAmounts:{line:1000,bingo:5000}},
  players:[{id:'legacy-player',name:'Jugador viejo',paymentStatus:'confirmed',paymentTransferDni:'123',prizePayoutAlias:'cobro.viejo',allowedCardCount:1,cardIds:[]}]
},null,2));
fs.writeFileSync(platformFile,JSON.stringify({version:24,community:{
  supportEnabled:true,supportRecipient:'legacy',supportWallet:'legacy',supportCustomAlias:'legacy.alias',supportTitle:'Colaborar',supportMessage:'Viejo',
  scheduledGames:[{id:'legacy-agenda',startsAt,mode:90,paymentMode:'paid',cardPrice:3000,paymentAlias:'agenda.alias',paymentAccountHolder:'Agenda',paymentProvider:'Banco'}]
}},null,2));
const port=57100+Math.floor(Math.random()*150),base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:''},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<140;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició el servidor')}
async function request(url,opt={}){const r=await fetch(base+url,opt),d=await r.json().catch(()=>({}));return{r,d}}
async function post(url,body,headers={}){const {r,d}=await request(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body||{})});assert(r.ok,`${url}: ${r.status} ${JSON.stringify(d)}`);return d}
async function get(url,headers={}){const {r,d}=await request(url,{headers});assert(r.ok,`${url}: ${r.status} ${JSON.stringify(d)}`);return d}
function containsLegacy(obj){const text=JSON.stringify(obj);return ['paymentMode','cardPrice','paymentAlias','paymentAccountHolder','paymentProvider','prizeAmounts','paymentStatus','paymentTransferDni','prizePayoutAlias','supportEnabled','supportRecipient','supportWallet','supportCustomAlias','supportTitle','supportMessage'].some(k=>text.includes(`"${k}"`))}
function cookieFrom(r){const cookie=(r.headers.get('set-cookie')||'').split(';')[0];assert(cookie.startsWith('bingo_player_session='),'Falta cookie privada de jugador');return cookie}
async function claimInvite(url){const u=new URL(url),target=u.pathname+u.search;let r=await fetch(base+target,{redirect:'manual'});assert.equal(r.status,200);const html=await r.text();const m=html.match(/name="activationToken" value="([^"]+)"/);assert(m,'Falta token de activación');r=await fetch(base+target,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`activationToken=${encodeURIComponent(m[1])}`,redirect:'manual'});assert.equal(r.status,303);return cookieFrom(r)}
(async()=>{try{
  await waitServer();
  assert(fs.existsSync(stateFile+'.pre-free-v6.bak'),'La migración debe respaldar el estado viejo.');
  assert(fs.existsSync(platformFile+'.pre-free-v6.bak'),'La migración debe respaldar la plataforma vieja.');
  const migratedState=JSON.parse(fs.readFileSync(stateFile,'utf8')),migratedPlatform=JSON.parse(fs.readFileSync(platformFile,'utf8'));
  assert(!containsLegacy(migratedState),'El estado migrado no debe conservar estructuras financieras.');
  assert(!containsLegacy(migratedPlatform),'La plataforma migrada no debe conservar estructuras financieras.');
  assert.equal(migratedPlatform.community.scheduledGames.length,1,'La agenda gratuita debe conservarse durante la migración.');

  const login=await post('/api/admin/login',{}),ah={'X-Admin-Token':login.token};
  let room=await post('/api/admin/create-simple-room',{
    mode:90,cardCount:40,autoSeconds:60,rules:{line:true,bingo:true},maxCardsPerPlayer:2,
    paymentMode:'paid',cardPrice:99999,paymentAlias:'inyectado',paymentAccountHolder:'X',paymentProvider:'X',prizeAmounts:{line:1,bingo:2}
  },ah);
  assert(!containsLegacy(room.roomSettings),'Crear sala debe ignorar por completo campos financieros heredados.');
  assert.equal(room.roomSettings.claimMode,'manual','La limpieza no debe cambiar el modo tradicional predeterminado.');

  const inv=await post('/api/admin/invite-player',{name:'Jugador Libre',allowedCardCount:1,paymentStatus:'confirmed'},ah);
  const cookie=await claimInvite(inv.player.inviteUrl);
  const player=await get('/api/player/state',{Cookie:cookie});
  assert(!containsLegacy(player.player),'El payload del jugador no debe exponer datos de pagos/cobros.');
  assert(player.player.offeredCards?.length,'El jugador gratuito debe seguir recibiendo cartones.');
  await post('/api/player/choose',{cardIds:[player.player.offeredCards[0].id]},{Cookie:cookie});

  for(const endpoint of ['/api/player/payment-report','/api/player/prize-payout','/api/player/order']){
    const {r}=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Cookie':cookie},body:'{}'});
    assert.equal(r.status,404,`${endpoint} debe haber sido eliminado del backend.`);
  }

  let community=await post('/api/admin/community/schedule',{action:'save',startsAt:new Date(Date.now()+4*60*60*1000).toISOString(),mode:75,registrationMinutes:10,markingMode:'normal',maxCardsPerPlayer:2,cardCount:40,autoSeconds:8,rules:{line:true,bingo:true},paymentMode:'paid',cardPrice:7000,paymentAlias:'agenda.inyectada'},ah);
  const schedule=community.scheduledGames.at(-1);assert(schedule,'Debe conservarse la agenda gratuita.');assert(!containsLegacy(schedule),'La agenda debe ignorar campos financieros heredados.');

  const admin=await get('/api/admin/state',ah);assert(!containsLegacy(admin),'Admin no debe exponer infraestructura financiera.');
  console.log('OK free-only-cleanup · migración con backup + backend gratuito + rutas de pago eliminadas');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
