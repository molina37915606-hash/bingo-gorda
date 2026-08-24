'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
const playerHtml=fs.readFileSync(path.join(root,'player.html'),'utf8');
const adminHtml=fs.readFileSync(path.join(root,'admin.html'),'utf8');
const playerJs=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
const adminJs=fs.readFileSync(path.join(root,'js/admin.js'),'utf8');
assert(playerHtml.includes('id="chatVoiceBtn"')&&playerHtml.includes('id="chatAudioModerationBtn"'),'Jugador debe tener micrófono y moderación de audio integrada al chat.');
assert(adminHtml.includes('id="adminVoiceBtn"')&&adminHtml.includes('id="creatorKeyTools"'),'Admin debe tener micrófono y herramienta de código creador.');
assert(playerJs.includes("/api/player/chat/audio")&&playerJs.includes("/api/player/chat/audio-moderate"),'Jugador debe usar APIs de voz y moderación.');
assert(adminJs.includes("/api/admin/chat/audio")&&adminJs.includes("/api/admin/creator-room-code"),'Admin debe usar APIs de voz y recuperación del código creador.');

const port=58900+Math.floor(Math.random()*80),base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-chat-audio-v929-'));
let child=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function spawnServer(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base},stdio:['ignore','pipe','pipe']});}
async function stop(){if(!child)return;const proc=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{proc.kill('SIGKILL')}catch{}resolve()},1400);proc.once('exit',()=>{clearTimeout(t);resolve()});try{proc.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function waitServer(){for(let i=0;i<140;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
function playerCookie(headers){const raw=headers.get('set-cookie')||'';const m=raw.match(/bingo_player_session=([^;]+)/);return m?`bingo_player_session=${m[1]}`:''}
async function raw(pathname,{method='GET',body,token,playerToken,cookie}={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return {r,d}}
async function ok(pathname,opt={}){const out=await raw(pathname,opt);assert(out.r.ok,`${pathname}: ${out.r.status} ${JSON.stringify(out.d)}`);return out.d}
async function adminLogin(){return (await ok('/api/admin/login',{method:'POST',body:{password:''}})).token}
async function selectRoom(admin,roomCode){const ws=await ok('/api/admin/workspaces',{token:admin});const room=ws.rooms.find(x=>x.roomCode===roomCode);assert(room,`Admin debe encontrar sala ${roomCode}`);if(ws.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}});return ok('/api/admin/state',{token:admin})}
const fakeAudio='data:audio/webm;codecs=opus;base64,'+Buffer.from('LA-GORDA-VOICE-TEST-'.repeat(20)).toString('base64');

(async()=>{try{
  spawnServer();await waitServer();const admin=await adminLogin();
  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'creator-device',name:'Creadora',roomName:'Sala con voz',mode:75,maxPlayers:10,maxCardsPerPlayer:2,autoSeconds:8,rules:{line:true,bingo:true},startMode:'manual'}});
  await selectRoom(admin,created.roomCode);
  const recoveredCode=await ok('/api/admin/creator-room-code',{token:admin});
  assert.equal(recoveredCode.creatorCode,created.creatorCode,'Admin debe poder recuperar el código exacto del creador.');

  const creatorJoin=await raw('/api/community/creator-join-player',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode,deviceId:'creator-play'}});
  assert(creatorJoin.r.ok,JSON.stringify(creatorJoin.d));const creatorCookie=playerCookie(creatorJoin.r.headers);assert(creatorCookie,'El creador-jugador debe tener sesión.');
  const normal=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Mateo',cardCount:1,deviceId:'normal-play'}});
  let creatorState=await ok('/api/player/state',{cookie:creatorCookie});
  let normalState=await ok('/api/player/state',{playerToken:normal.token});
  assert.equal(creatorState.chat.audioMaxSeconds,120,'Creador debe tener hasta 120 segundos.');
  assert.equal(normalState.chat.audioMaxSeconds,8,'Jugador normal debe tener hasta 8 segundos.');
  assert.equal(creatorState.chat.canModerateAudio,true,'Creador debe poder moderar audio.');

  const normalVoice=await ok('/api/player/chat/audio',{method:'POST',playerToken:normal.token,body:{audioData:fakeAudio,durationMs:8000}});
  assert.equal(normalVoice.type,'audio');assert.equal(normalVoice.durationMs,8000);assert.equal(normalVoice.voiceRole,'player');
  const audioFetch=await fetch(`${base}/chat-audio/${normalVoice.audioId}.${normalVoice.audioExt}`);assert(audioFetch.ok,'El audio guardado debe poder reproducirse.');assert((await audioFetch.arrayBuffer()).byteLength>0);
  const tooLong=await raw('/api/player/chat/audio',{method:'POST',playerToken:normal.token,body:{audioData:fakeAudio,durationMs:9001}});assert.equal(tooLong.r.status,400);assert(/8 segundos/.test(tooLong.d.error||''),'Jugador debe ser rechazado si supera 8 segundos.');
  const creatorVoice=await ok('/api/player/chat/audio',{method:'POST',cookie:creatorCookie,body:{audioData:fakeAudio,durationMs:120000}});assert.equal(creatorVoice.voiceRole,'creator');

  const adminState=await ok('/api/admin/state',{token:admin}),normalPlayer=adminState.players.find(p=>p.name==='Mateo'),creatorPlayer=adminState.players.find(p=>p.name==='Creadora');assert(normalPlayer&&creatorPlayer);
  creatorState=await ok('/api/player/chat/audio-moderate',{method:'POST',cookie:creatorCookie,body:{playerId:normalPlayer.id,action:'mute-audio'}});assert(creatorState.communityRoom.creatorPlayers.find(p=>p.playerId===normalPlayer.id)?.audioMuted,'Creador debe poder silenciar audio de otro jugador.');
  const mutedVoice=await raw('/api/player/chat/audio',{method:'POST',playerToken:normal.token,body:{audioData:fakeAudio,durationMs:3000}});assert.equal(mutedVoice.r.status,400);assert(/silenciados/.test(mutedVoice.d.error||''));
  const textStillWorks=await ok('/api/player/chat',{method:'POST',playerToken:normal.token,body:{text:'Sigo pudiendo escribir'}});assert.equal(textStillWorks.text,'Sigo pudiendo escribir','Silenciar voz no debe bloquear texto.');
  await ok('/api/player/chat/audio-moderate',{method:'POST',cookie:creatorCookie,body:{playerId:normalPlayer.id,action:'unmute-audio'}});

  await ok('/api/admin/chat/moderate',{method:'POST',token:admin,body:{action:'mute-audio',playerId:creatorPlayer.id}});
  const creatorMuted=await raw('/api/player/chat/audio',{method:'POST',cookie:creatorCookie,body:{audioData:fakeAudio,durationMs:3000}});assert.equal(creatorMuted.r.status,400,'Admin debe poder silenciar incluso al creador-jugador.');
  await ok('/api/admin/chat/moderate',{method:'POST',token:admin,body:{action:'unmute-audio',playerId:creatorPlayer.id}});
  const adminVoice=await ok('/api/admin/chat/audio',{method:'POST',token:admin,body:{audioData:fakeAudio,durationMs:120000}});const last=adminVoice.chat.messages.at(-1);assert.equal(last.type,'audio');assert.equal(last.voiceRole,'admin');assert.equal(last.durationMs,120000,'Admin debe tener hasta 120 segundos.');

  console.log('PRUEBA CHAT DE VOZ V9.2.9: OK · 8s jugador + 120s creador/admin + moderación independiente + código creador recuperable');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})();
