'use strict';
// Regresión de inicio: autoasignación y cierre separado de inscripciones.
const assert=require('assert'),{spawn}=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
const port=53800+Math.floor(Math.random()*150),base=`http://127.0.0.1:${port}`,dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-final-start-')),root=path.join(__dirname,'..');
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'100'},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function waitServer(){for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('server')}
async function req(url,opt={}){const r=await fetch(base+url,opt),d=await r.json().catch(()=>({}));return{r,d}}async function post(url,body={},headers={}){const o=await req(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});assert(o.r.ok,`${url}: ${o.r.status} ${JSON.stringify(o.d)}`);return o.d}async function fail(url,body={},headers={}){const o=await req(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});assert(!o.r.ok,`${url} debía fallar`);return o.d}async function get(url,headers={}){const o=await req(url,{headers});assert(o.r.ok);return o.d}
(async()=>{try{await waitServer();const login=await post('/api/admin/login',{}),ah={'X-Admin-Token':login.token};
 let st=await post('/api/admin/create-simple-room',{mode:90,cardCount:100,autoSeconds:60,rules:{line:true,bingo:true},markingMode:'normal',maxCardsPerPlayer:3,linePrizeCount:2},ah);await post('/api/admin/join-open',{open:true},ah);
 for(const [name,count,dev] of [['Ana',2,'a'],['Beto',3,'b'],['Ceci',1,'c']])await post('/api/player/open-join',{roomCode:st.roomCode,name,cardCount:count,deviceId:`final-${dev}`});
 st=await get('/api/admin/state',ah);assert.equal(st.startPlan.autoAssignPlayers,3);let error=await fail('/api/admin/start',{},ah);assert(/cerrá las inscripciones/i.test(error.error));
 await post('/api/admin/join-open',{open:false},ah);await post('/api/admin/start',{},ah);st=await get('/api/admin/state',ah);assert.equal(st.players.filter(p=>p.selectionConfirmed).length,3);assert.equal(st.players.every(p=>p.markingModeChosen&&!p.autoMark),true);const ids=st.players.flatMap(p=>p.cardIds);assert.equal(new Set(ids).size,ids.length);assert.deepEqual(st.players.map(p=>p.cardIds.length).sort((a,b)=>a-b),[1,2,3]);await post('/api/admin/close',{},ah);

 console.log('PRUEBA INICIO FINAL: OK · cierre separado + autoasignación');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
