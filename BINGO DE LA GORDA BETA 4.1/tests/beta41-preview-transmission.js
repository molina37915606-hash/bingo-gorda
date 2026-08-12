'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const path=require('path');
const os=require('os');
const fs=require('fs');
const port=51700+Math.floor(Math.random()*300);
const base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'gorda-beta41-'));
const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,BINGO_START_SEQUENCE_MS:'40'},stdio:['ignore','pipe','pipe']});
async function req(url,opt={}){const response=await fetch(base+url,opt);const data=await response.json().catch(()=>({}));return{response,data}}
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await new Promise(r=>setTimeout(r,35))}throw Error('server timeout')}
(async()=>{try{
 await ready();
 const login=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(login.response.status,200);
 const admin={'Content-Type':'application/json','X-Admin-Token':login.data.token};
 const sim=await req('/api/admin/create-ai-simulation',{method:'POST',headers:admin,body:JSON.stringify({playerCount:3,mode:90,autoSeconds:5,rules:{line:true,bingo:true},aiChatEnabled:true})});assert.equal(sim.response.status,200,JSON.stringify(sim.data));
 const ai=sim.data.players.find(p=>p.virtual);assert(ai,'Debe existir una IA para la vista previa.');
 const view=await req('/api/admin/player-view-session',{method:'POST',headers:admin,body:JSON.stringify({playerId:ai.id})});assert.equal(view.response.status,200,JSON.stringify(view.data));
 assert.equal(view.data.readOnly,true);assert.equal(view.data.virtual,true);assert(view.data.url.startsWith('/jugador?adminpreview=1&previewSession='));assert(!view.data.url.includes('simcontrol=1'));
 let state=await req(`/api/admin-player-preview/state?token=${encodeURIComponent(view.data.token)}`);assert.equal(state.response.status,200,JSON.stringify(state.data));assert.equal(state.data.player.id,ai.id);assert.equal(state.data.adminPreview,true);
 await req('/api/admin/start',{method:'POST',headers:admin,body:JSON.stringify({force:true})});await new Promise(r=>setTimeout(r,70));
 await req('/api/admin/draw-settings',{method:'POST',headers:admin,body:JSON.stringify({drawMode:'manual'})});
 await req('/api/admin/draw',{method:'POST',headers:admin,body:JSON.stringify({source:'beta41'})});
 state=await req(`/api/admin-player-preview/state?token=${encodeURIComponent(view.data.token)}`);assert.equal(state.response.status,200);assert(state.data.game.drawn.length>=1,'La vista previa debe reflejar el estado vivo de la partida.');
 const adminJs=fs.readFileSync(path.join(__dirname,'..','js','admin-simplificado.js'),'utf8');
 const playerJs=fs.readFileSync(path.join(__dirname,'..','js','online-room-player.js'),'utf8');
 const txHtml=fs.readFileSync(path.join(__dirname,'..','transmision.html'),'utf8');
 const txJs=fs.readFileSync(path.join(__dirname,'..','js','transmision.js'),'utf8');
 assert(adminJs.includes('openMobilePreview(true)'));assert(adminJs.includes("queueMicrotask(()=>this.loadMobilePreview())"));assert(!adminJs.includes('window.open(data.url'));
 assert(playerJs.includes("params.get('adminpreview') === '1'"));assert(playerJs.includes('/api/admin-player-preview/state?token='));
 assert(txJs.includes("slice(-40)"),'La transmisión debe conservar suficientes mensajes para llenar toda la columna.');
 assert(!txHtml.includes('-webkit-line-clamp:2'),'Los mensajes normales de transmisión no deben cortarse a dos líneas.');
 console.log('BETA 4.1 · VISTA IA SIMULADA / CHAT TRANSMISIÓN: OK');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
