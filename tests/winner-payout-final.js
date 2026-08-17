'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const port=56600+Math.floor(Math.random()*250),base=`http://127.0.0.1:${port}`,root=path.join(__dirname,'..'),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-winner-payout-'));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'80',BINGO_CLAIM_WINDOW_MS:'100'},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
async function req(url,opt={}){const r=await fetch(base+url,opt),d=await r.json().catch(()=>({}));return{r,d}}
async function post(url,body={},headers={}){const {r,d}=await req(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});assert(r.ok,`${url}: ${r.status} ${JSON.stringify(d)}`);return d}
async function postFail(url,body={},headers={}){const {r,d}=await req(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});assert(!r.ok,`${url} debía fallar`);return d}
async function get(url,headers={}){const {r,d}=await req(url,{headers});assert(r.ok,`${url}: ${r.status} ${JSON.stringify(d)}`);return d}
function cookieFrom(res){return (res.headers.get('set-cookie')||'').split(';')[0]}
async function join(roomCode,name){const r=await fetch(base+'/jugador/entrar',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`roomCode=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(name)}&cardCount=1`,redirect:'manual'});assert.equal(r.status,303);return cookieFrom(r)}
(async()=>{try{
  await waitServer();
  const login=await post('/api/admin/login',{}),ah={'X-Admin-Token':login.token};
  await post('/api/admin/community/settings',{whatsappNumber:'+54 9 3757 624388',whatsappGroup:'',chatEnabled:true,blockPhoneNumbers:true,blockWhatsappLinks:true},ah);
  let admin=await post('/api/admin/create-simple-room',{mode:75,cardCount:60,autoSeconds:60,rules:{line:true,corners:false,doubleLine:false,tripleLine:false,bingo:true},paymentMode:'paid',cardPrice:1000,paymentAlias:'lagorda.premio',paymentAccountHolder:'La Gorda',paymentProvider:'Mercado Pago',whatsapp:'+54 9 3757 624388',markingMode:'normal',maxCardsPerPlayer:1},ah);
  assert.equal(admin.roomSettings.whatsapp,'+54 9 3757 624388','La partida paga debe conservar el WhatsApp configurado');
  admin=await post('/api/admin/join-open',{open:true},ah);
  const winnerCookie=await join(admin.roomCode,'María Ganadora');
  let winner=await post('/api/player/payment-report',{dni:'12345678',holder:'María Gómez'},{Cookie:winnerCookie});
  admin=await get('/api/admin/state',ah);
  let mariaAdmin=admin.players.find(p=>p.name==='María Ganadora');
  await post('/api/admin/player-approval',{playerId:mariaAdmin.id,allowedCardCount:1,confirmPayment:true},ah);
  winner=await get('/api/player/state',{Cookie:winnerCookie});
  const winnerCard=winner.player.offeredCards[0];
  assert(winnerCard,'Debe existir oferta para la ganadora');
  winner=await post('/api/player/choose',{cardIds:[winnerCard.id]},{Cookie:winnerCookie});
  const otherCookie=await join(admin.roomCode,'Ana Jugadora');
  let other=await post('/api/player/payment-report',{dni:'23456789',holder:'Ana Jugadora'},{Cookie:otherCookie});
  admin=await get('/api/admin/state',ah);
  const anaAdmin=admin.players.find(p=>p.name==='Ana Jugadora');
  await post('/api/admin/player-approval',{playerId:anaAdmin.id,allowedCardCount:1,confirmPayment:true},ah);
  other=await get('/api/player/state',{Cookie:otherCookie});
  const otherCard=other.player.offeredCards[0];
  assert(otherCard,'Debe existir oferta para la segunda jugadora');
  await post('/api/player/choose',{cardIds:[otherCard.id]},{Cookie:otherCookie});
  const firstRow=(winner.player.cards[0].grid[0]||[]).map(Number).filter(Number.isFinite).filter(n=>n>0);
  assert(firstRow.length>=4,'La primera fila debe contener números para forzar una línea');
  await post('/api/admin/test/draw-order',{sequence:firstRow},ah);
  await post('/api/admin/join-open',{open:false},ah);
  await post('/api/admin/start',{},ah);
  await wait(150);
  for(let i=0;i<firstRow.length;i++) await post('/api/admin/draw',{source:'manual'},ah);
  const claim=await post('/api/player/claim',{cardId:winner.player.cards[0].id,type:'line'},{Cookie:winnerCookie});
  assert.equal(claim.officialValid,true,'La línea forzada debe ser válida');
  await wait(130);
  await post('/api/admin/resolve',{claimId:claim.id,resolution:'confirmed'},ah);
  winner=await get('/api/player/state',{Cookie:winnerCookie});
  assert.equal(winner.player.confirmedPrizes.length,1,'El ganador debe recibir sus premios confirmados en su payload privado');
  assert.equal(winner.player.confirmedPrizes[0].cardNumber,winner.player.cards[0].number);
  const denied=await postFail('/api/player/prize-payout',{alias:'ana.cobro',accountHolder:'Ana Jugadora',provider:'Mercado Pago'},{Cookie:otherCookie});
  assert(/premio confirmado/i.test(denied.error),'Un no ganador no debe poder guardar datos de cobro');
  winner=await post('/api/player/prize-payout',{alias:'maria.premio',accountHolder:'María Gómez',provider:'Mercado Pago'},{Cookie:winnerCookie});
  assert.equal(winner.player.prizePayoutAlias,'maria.premio');
  assert.equal(winner.player.prizePayoutAccountHolder,'María Gómez');
  assert.equal(winner.player.prizePayoutProvider,'Mercado Pago');
  assert(winner.player.prizePayoutUpdatedAt);
  admin=await get('/api/admin/state',ah);
  const maria=admin.players.find(p=>p.name==='María Ganadora');
  assert.equal(maria.prizePayoutAlias,'maria.premio','Admin debe ver el alias privado de cobro del ganador');
  assert.equal(maria.prizePayoutAccountHolder,'María Gómez');
  const playerJs=fs.readFileSync(path.join(root,'js','player.js'),'utf8');
  const adminJs=fs.readFileSync(path.join(root,'js','admin.js'),'utf8');
  const adminHtml=fs.readFileSync(path.join(root,'admin.html'),'utf8');
  assert(playerJs.includes('WHATSAPP · COORDINAR COBRO'));
  assert(playerJs.includes('GUARDAR DATOS DE COBRO'));
  assert(playerJs.includes('/api/player/prize-payout'));
  assert(adminJs.includes('COBRO DE GANADORES')&&adminJs.includes('data-copy-payout'));
  assert(adminHtml.includes('WHATSAPP DE CONTACTO Y PREMIOS'));
  console.log('PRUEBA FINAL COBRO DE GANADORES: OK');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
