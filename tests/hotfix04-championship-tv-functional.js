'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..'),port=59600+Math.floor(Math.random()*80),base=`http://127.0.0.1:${port}`,dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-hotfix04-tv-'));
let child=null;const wait=ms=>new Promise(r=>setTimeout(r,ms));
function spawnServer(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'30'},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const timer=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1200);p.once('exit',()=>{clearTimeout(timer);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(timer);resolve()}})}
async function waitServer(){for(let i=0;i<150;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
async function raw(url,{method='GET',body,token,playerToken}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({}));return{r,data}}
async function ok(url,opt={}){const out=await raw(url,opt);assert(out.r.ok,`${url}: ${out.r.status} ${JSON.stringify(out.data)}`);return out.data}
async function selectRoom(admin,roomCode){const list=await ok('/api/admin/workspaces',{token:admin}),room=list.rooms.find(x=>x.roomCode===roomCode);assert(room);if(list.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}})}
function expectedTarget(champ,mode){const seq=mode===75?[[champ.firstLineDrawnCount,'PRIMERA LÍNEA'],[champ.firstCornersDrawnCount,'4 ESQUINAS'],[champ.firstSecondLineDrawnCount,'SEGUNDA LÍNEA'],[champ.firstTripleLineDrawnCount,'TRIPLE LÍNEA'],[champ.firstQuadrupleLineDrawnCount,'CUÁDRUPLE LÍNEA'],[champ.firstQuintupleLineDrawnCount,'QUINTA LÍNEA'],[champ.firstBingoDrawnCount,'BINGO']]:[[champ.firstLineDrawnCount,'PRIMERA LÍNEA'],[champ.firstSecondLineDrawnCount,'SEGUNDA LÍNEA'],[champ.firstBingoDrawnCount,'BINGO']];return seq.find(([done])=>!Number(done))?.[1]||null}
(async()=>{try{spawnServer();await waitServer();const admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;
 for(const mode of [90,75]){
  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:`host-${mode}`,name:'Host',roomName:`TV ${mode}`,gameKind:'championship',championshipRounds:3,mode,maxPlayers:6,maxCardsPerPlayer:1,autoSeconds:8,startMode:'manual',accessType:'public'}});
  const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:`Ana${mode}`,cardCount:1,deviceId:`ana-${mode}`}}),b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:`Beto${mode}`,cardCount:1,deviceId:`beto-${mode}`}});assert(a.token&&b.token);
  let creator=await ok('/api/community/creator-state',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});const alias=String(creator.transmissionUrl||'').split('/').filter(Boolean).at(-1);assert(alias,'Debe existir alias de transmisión');
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});await wait(150);await selectRoom(admin,created.roomCode);let adminState=await ok('/api/admin/state',{token:admin});if(adminState.status==='starting'){await wait(100);adminState=await ok('/api/admin/state',{token:admin})}assert.equal(adminState.status,'playing');
  const seenTargets=new Set();let sawClosedPhase=false;
  for(let i=0;i<mode;i++){
   const draw=await raw('/api/admin/draw',{method:'POST',token:admin,body:{source:'hotfix04-tv'}});if(!draw.r.ok)break;
   const ps=await ok('/api/player/state',{playerToken:a.token}),target=expectedTarget(ps.championship,mode),tv=await ok(`/api/broadcast/state?token=${encodeURIComponent(alias)}`),cards=tv.highlightedCards||[];
   if(target){assert(cards.length>0,`Modo ${mode}: debe haber carrera para ${target}`);assert(cards.every(c=>c.racePrizeLabel===target),`Modo ${mode}: todos deben correr por ${target}, llegó ${cards.map(c=>c.racePrizeLabel).join(',')}`)}else{assert.equal(cards.length,0,`Modo ${mode}: después del primer Bingo no debe seguir calculando premios cerrados`)}
   if(target)seenTargets.add(target);else if(Number(ps.championship.firstBingoDrawnCount))sawClosedPhase=true;
   if(ps.championship.betweenRounds)break;
  }
  assert(seenTargets.has('PRIMERA LÍNEA'),`Modo ${mode}: la carrera debe comenzar por Primera Línea`);assert(seenTargets.size>=2,`Modo ${mode}: la carrera debe avanzar cuando se cierra un premio`);assert(sawClosedPhase,`Modo ${mode}: después del primer Bingo la carrera debe quedar sin premio pendiente`);
 }
 console.log('HOTFIX 04 TV FUNCIONAL: OK · un único próximo premio por vez en Campeonato 90/75');
}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})().catch(async e=>{console.error(e);try{await stop()}catch{};try{fs.rmSync(dataDir,{recursive:true,force:true})}catch{};process.exit(1)});
