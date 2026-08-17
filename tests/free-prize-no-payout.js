'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const port=56900+Math.floor(Math.random()*200),base=`http://127.0.0.1:${port}`,root=path.join(__dirname,'..'),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-free-no-payout-'));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
async function post(url,body={},headers={}){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));return{r,d}}
function cookieFrom(res){return (res.headers.get('set-cookie')||'').split(';')[0]}
(async()=>{try{
  await waitServer();
  let {r,d}=await post('/api/admin/login',{});assert(r.ok);const ah={'X-Admin-Token':d.token};
  ({r,d}=await post('/api/admin/create-simple-room',{mode:75,cardCount:50,autoSeconds:60,rules:{line:true,bingo:true},paymentMode:'free',markingMode:'normal',maxCardsPerPlayer:1},ah));assert(r.ok);const room=d;
  ({r,d}=await post('/api/admin/join-open',{open:true},ah));assert(r.ok);
  const join=await fetch(base+'/jugador/entrar',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`roomCode=${encodeURIComponent(room.roomCode)}&name=Jugador Gratis&cardCount=1`,redirect:'manual'});assert.equal(join.status,303);const cookie=cookieFrom(join);
  ({r,d}=await post('/api/player/prize-payout',{alias:'no.debe',accountHolder:'Jugador Gratis',provider:'Mercado Pago'},{Cookie:cookie}));assert(!r.ok,'Una partida gratuita debe rechazar datos de cobro');assert(/gratuita/i.test(d.error||''),'El rechazo debe explicar que la partida es gratuita');
  const playerJs=fs.readFileSync(path.join(root,'js','player.js'),'utf8');
  const adminJs=fs.readFileSync(path.join(root,'js','admin.js'),'utf8');
  assert(playerJs.includes("const payout=(paid&&!demo&&ownWins.length)"),'El formulario de cobro solo debe renderizarse si la sala es paga');
  assert(playerJs.includes("'¡Felicitaciones! Tenés un premio confirmado en esta partida gratuita.'"),'La pantalla final gratuita debe felicitar sin hablar de cobro');
  assert(adminJs.includes("host.classList.toggle('hidden',!paid)"),'Admin debe ocultar cobros de ganadores en salas gratuitas');
  console.log('PRUEBA PARTIDA GRATUITA SIN COBRO: OK');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
