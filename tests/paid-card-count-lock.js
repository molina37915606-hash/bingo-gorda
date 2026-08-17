'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const port=57500+Math.floor(Math.random()*250),base=`http://127.0.0.1:${port}`,root=path.join(__dirname,'..'),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-paid-count-lock-'));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<140;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(35)}throw Error('No inició servidor')}
async function call(url,opt={}){const r=await fetch(base+url,opt),d=await r.json().catch(()=>({}));return{r,d}}
async function post(url,body={},headers={}){const {r,d}=await call(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});assert(r.ok,`${url}: ${r.status} ${JSON.stringify(d)}`);return d}
async function postFail(url,body={},headers={}){const {r,d}=await call(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});assert(!r.ok,`${url} debía fallar`);return d}
async function get(url,headers={}){const {r,d}=await call(url,{headers});assert(r.ok,`${url}: ${r.status} ${JSON.stringify(d)}`);return d}
async function join(roomCode,name,count){const r=await fetch(base+'/jugador/entrar',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`roomCode=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(name)}&cardCount=${count}`,redirect:'manual'});assert.equal(r.status,303);return (r.headers.get('set-cookie')||'').split(';')[0]}
(async()=>{try{
 await waitServer();
 const login=await post('/api/admin/login',{}),ah={'X-Admin-Token':login.token};
 let room=await post('/api/admin/create-simple-room',{mode:90,cardCount:180,autoSeconds:60,rules:{line:true,bingo:true},linePrizeCount:1,maxCardsPerPlayer:4,markingMode:'normal',paymentMode:'paid',cardPrice:1000,paymentAlias:'lagorda.lock',paymentAccountHolder:'La Gorda',paymentProvider:'Mercado Pago',whatsapp:'5493757624388'},ah);
 await post('/api/admin/join-open',{open:true},ah);
 const players=[];
 for(let i=0;i<60;i++){
   const qty=(i%4)+1,name=`Jugador Pago ${String(i+1).padStart(2,'0')}`,cookie=await join(room.roomCode,name,qty);
   await post('/api/player/payment-report',{dni:String(20000000+i),holder:`Titular ${i+1}`},{Cookie:cookie});
   players.push({name,qty,cookie});
 }
 let admin=await get('/api/admin/state',ah);
 for(const item of players){
   const p=admin.players.find(x=>x.name===item.name); assert(p,`Falta ${item.name}`); assert.equal(p.requestedCardCount,item.qty);
   admin=await post('/api/admin/player-approval',{playerId:p.id,confirmPayment:true},ah);
 }
 const expected=players.reduce((s,p)=>s+p.qty,0);
 assert.equal(admin.registrationSummary.confirmedCards,expected,'El total confirmado debe coincidir exactamente con los pedidos pagados');
 for(const item of players){const p=admin.players.find(x=>x.name===item.name);assert.equal(p.requestedCardCount,item.qty,`${item.name}: pedido`);assert.equal(p.allowedCardCount,item.qty,`${item.name}: autorizado`);assert.equal(p.paymentStatus,'confirmed');}
 const one=players.find(p=>p.qty===1),oneState=await get('/api/player/state',{Cookie:one.cookie});
 assert.equal(oneState.player.allowedCardCount,1,'Quien pagó 1 debe recibir límite 1');
 assert(oneState.player.offeredCards.length>=2,'Debe haber opciones suficientes para verificar el límite');
 const [first,second]=oneState.player.offeredCards;
 await post('/api/player/reserve',{cardId:first.id,reserve:true},{Cookie:one.cookie});
 const blocked=await postFail('/api/player/reserve',{cardId:second.id,reserve:true},{Cookie:one.cookie});
 assert(/Solo podés reservar 1 cartón/i.test(blocked.error),'El servidor debe bloquear el segundo cartón');
 const target=admin.players.find(x=>x.name===one.name);
 const increase=await postFail('/api/admin/player-approval',{playerId:target.id,allowedCardCount:4,confirmPayment:true},ah);
 assert(/No se puede confirmar una cantidad mayor/i.test(increase.error),'Ni una confirmación administrativa puede ampliar accidentalmente un pedido pago');
 console.log(`PRUEBA PAGO · CANTIDAD EXACTA 60 JUGADORES: OK · ${expected} cartones confirmados`);
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
