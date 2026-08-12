'use strict';
const assert=require('assert');
const {spawn}=require('child_process');
const path=require('path');
const os=require('os');
const fs=require('fs');
const port=51200+Math.floor(Math.random()*500);
const base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'gorda-beta4-'));
const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
async function req(url,opt={}){const response=await fetch(base+url,opt);const data=await response.json().catch(()=>({}));return {response,data}}
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await new Promise(r=>setTimeout(r,40))}throw Error('server timeout')}
(async()=>{try{
 await ready();
 let r=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.response.status,200,JSON.stringify(r.data));
 const admin={'Content-Type':'application/json','X-Admin-Token':r.data.token};
 r=await req('/api/admin/create-simple-room',{method:'POST',headers:admin,body:JSON.stringify({roomType:'official',mode:90,cardCount:25,rules:{line:true,bingo:true}})});assert.equal(r.response.status,200,JSON.stringify(r.data));
 const room=r.data.roomCode;
 const add=await req('/api/admin/add-official-player',{method:'POST',headers:admin,body:JSON.stringify({name:'Código Beta',cardCount:2})});assert.equal(add.response.status,200,JSON.stringify(add.data));
 const code=add.data.player.code;assert(/^\d{6}$/.test(code),`Código esperado 6 dígitos, recibido ${code}`);assert(add.data.player.directJoinUrl.includes(`acceso=${code}`));
 const codeOnly=await req('/api/player/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,deviceId:'beta4-code-only'})});assert.equal(codeOnly.response.status,200,JSON.stringify(codeOnly.data));assert.equal(codeOnly.data.state.roomCode,room);
 const preview=await req('/api/admin/player-view-session',{method:'POST',headers:admin,body:JSON.stringify({playerId:add.data.player.id})});assert.equal(preview.response.status,200,JSON.stringify(preview.data));assert.equal(preview.data.readOnly,true);assert(preview.data.url.startsWith('/admin-player-preview?previewSession='));assert(!/codigo=|acceso=|simcontrol=|session=/i.test(preview.data.url.replace('previewSession=','previewtoken=')));
 const previewState=await req(`/api/admin-player-preview/state?token=${encodeURIComponent(preview.data.token)}`);assert.equal(previewState.response.status,200,JSON.stringify(previewState.data));assert.equal(previewState.data.adminPreview,true);assert.equal(previewState.data.player.id,add.data.player.id);
 const previewMutation=await req('/api/player/automark',{method:'POST',headers:{'Content-Type':'application/json','X-Player-Token':preview.data.token},body:JSON.stringify({enabled:true})});assert([401,403].includes(previewMutation.response.status));
 await req('/api/admin/new-room',{method:'POST',headers:admin,body:'{}'});
 const sim=await req('/api/admin/create-ai-simulation',{method:'POST',headers:admin,body:JSON.stringify({playerCount:4,mode:75,autoSeconds:5,rules:{line:true,bingo:true},aiChatEnabled:true})});assert.equal(sim.response.status,200,JSON.stringify(sim.data));
 const ai=sim.data.players.find(p=>p.virtual);assert(ai);
 const view=await req('/api/admin/player-view-session',{method:'POST',headers:admin,body:JSON.stringify({playerId:ai.id})});assert.equal(view.response.status,200,JSON.stringify(view.data));assert.equal(view.data.readOnly,true);assert.equal(view.data.virtual,true);assert(view.data.url.startsWith('/admin-player-preview?previewSession='));assert(!/codigo=|acceso=|simcontrol=/i.test(view.data.url));
 const aiState=await req(`/api/admin-player-preview/state?token=${encodeURIComponent(view.data.token)}`);assert.equal(aiState.response.status,200,JSON.stringify(aiState.data));assert.equal(aiState.data.player.id,ai.id);assert.equal(aiState.data.adminPreview,true);
 const adminJs=fs.readFileSync(path.join(__dirname,'..','js','admin-simplificado.js'),'utf8');
 assert(adminJs.includes('COPIAR CÓDIGO'));assert(adminJs.includes('LINK DIRECTO'));assert(adminJs.includes('¡La partida ya está lista!'));assert(adminJs.includes('simulación en vivo de solo lectura'));assert(!adminJs.includes('Controlando ${data.playerName}'));const adminHtml=fs.readFileSync(path.join(__dirname,'..','admin.html'),'utf8');assert(adminHtml.includes('VISTA PREVIA DEL JUGADOR'));assert(!adminHtml.includes('controlalo desde su pantalla real'));
 const communityHtml=fs.readFileSync(path.join(__dirname,'..','comunidad.html'),'utf8');const communityJs=fs.readFileSync(path.join(__dirname,'..','js','community.js'),'utf8');
 assert(communityHtml.includes('position:absolute;z-index:25'));assert(communityHtml.includes('height:calc(100dvh - 98px)'));assert(communityJs.includes('closePicker(scope);try{input.focus'));
 console.log('BETA 4 · ACCESOS / VISTA ADMIN / CHAT COMUNIDAD: OK');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
