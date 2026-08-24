'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const root=path.join(__dirname,'..'),port=59300+Math.floor(Math.random()*200),base=`http://127.0.0.1:${port}`,dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-v930-rivals-'));
let child;const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(url,{method='GET',body,token}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Player-Token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(url,opt){const out=await raw(url,opt);assert(out.r.ok,`${url}: ${out.r.status} ${JSON.stringify(out.d)}`);return out.d}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1200);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{resolve()}})}
(async()=>{try{
 child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'20'},stdio:['ignore','ignore','pipe']});
 for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)break}catch{}await wait(35);if(i===119)throw Error('Servidor no inició')}
 const room=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'owner',name:'Dueño',roomName:'Rivales 930',mode:90,maxPlayers:10,maxCardsPerPlayer:1,autoSeconds:8,linePrizeCount:2,rules:{line:true,bingo:true},startMode:'manual'}});
 const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:room.roomCode,name:'Ana',cardCount:1,deviceId:'ana-v930'}}),b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:room.roomCode,name:'Beto',cardCount:1,deviceId:'beto-v930'}});
 await ok('/api/community/creator-start',{method:'POST',body:{publicId:room.id,creatorCode:room.creatorCode}});await wait(100);
 const state=await ok('/api/player/state',{token:a.token});assert(state.rivals?.enabled,'RIVALES debe estar habilitado durante partida');assert.equal(state.rivals.mode,'normal');assert.equal(state.rivals.items.length,1);const rival=state.rivals.items[0];assert.equal(rival.playerName,'Beto');assert(Number.isFinite(Number(rival.missing)),'Debe informar distancia numérica');assert(rival.raceLabel,'Debe informar próximo premio');for(const forbidden of ['grid','cardId','cardNumber','missingNumbers'])assert(!(forbidden in rival),`No debe exponer ${forbidden}`);
 console.log('V9.3.0 RIVALES FUNCIONAL: OK · resumen seguro por jugador');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})();
