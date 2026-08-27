'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {spawn}=require('child_process');
const root=path.resolve(__dirname,'..'),port=59600+Math.floor(Math.random()*80),base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-champ75-corners-triple-'));let child;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function start(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'30'},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1200);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<160;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(35)}throw Error('No inició servidor')}
async function raw(url,{method='GET',body,token,playerToken}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(url,opt={}){const x=await raw(url,opt);assert(x.r.ok,`${url}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}
async function selectRoom(admin,roomCode){const list=await ok('/api/admin/workspaces',{token:admin}),room=list.rooms.find(x=>x.roomCode===roomCode);assert(room);if(list.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}})}
const uniq=a=>[...new Set(a.map(Number).filter(Number.isFinite))];
(async()=>{try{
 start();await ready();
 const admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;
 const room=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'host-75-new-prizes',name:'Host',roomName:'75 completo',gameKind:'championship',championshipRounds:3,mode:75,maxPlayers:4,maxCardsPerPlayer:1,autoSeconds:8,startMode:'manual',accessType:'public'}});
 const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:room.roomCode,name:'Ana',cardCount:1,deviceId:'75-a'}});
 await ok('/api/player/open-join',{method:'POST',body:{roomCode:room.roomCode,name:'Beto',cardCount:1,deviceId:'75-b'}});
 await ok('/api/community/creator-start',{method:'POST',body:{publicId:room.id,creatorCode:room.creatorCode}});await wait(100);await selectRoom(admin,room.roomCode);
 let st=await ok('/api/player/state',{playerToken:a.token});
 for(let i=0;i<80&&st.status!=='playing';i++){await wait(20);st=await ok('/api/player/state',{playerToken:a.token})}
 assert.equal(st.game.mode,75);const adminState=await ok('/api/admin/state',{token:admin});assert.equal(adminState.game.rules.corners,true);assert.equal(adminState.game.rules.tripleLine,true);
 assert.equal(st.championship.scoring.corners,15);assert.equal(st.championship.scoring.firstCorners,5);assert.equal(st.championship.scoring.tripleLine,30);assert.equal(st.championship.scoring.firstTripleLine,5);
 assert(st.prizeLabels.includes('4 ESQUINAS'),'Campeonato 75 debe anunciar 4 Esquinas');assert(st.prizeLabels.includes('TRIPLE LÍNEA'),'Campeonato 75 debe anunciar Triple Línea');
 const card=st.player.cards[0],g=card.grid;
 const target=uniq([...(g[0]||[]),...(g[1]||[]),...(g[2]||[]),g?.[4]?.[0],g?.[4]?.[4]]);
 assert(target.length>=15&&target.length<24,'La secuencia debe completar tres líneas y esquinas sin completar Bingo');
 const rest=Array.from({length:75},(_,i)=>i+1).filter(n=>!target.includes(n));
 await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence:[...target,...rest]}});
 for(let i=0;i<target.length;i++) await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'champ75-prizes'}});
 st=await ok('/api/player/state',{playerToken:a.token});
 let pos=st.championship.ownPositions[0];
 assert(pos.cornersBall,'4 Esquinas debe detectarse matemáticamente');assert.equal(pos.cornersPoints,15);
 assert(pos.tripleLineBall,'Triple Línea debe detectarse matemáticamente');assert.equal(pos.tripleLinePoints,30);
 assert(pos.roundPoints>=15+30,'Los puntos de 4 Esquinas y Triple Línea deben entrar al total de ronda');
 const corners=await ok('/api/player/claim',{method:'POST',playerToken:a.token,body:{type:'corners',cardId:pos.cardId}});assert.equal(corners.championshipClaim,true);assert.equal(corners.claimed[0].label,'4 ESQUINAS');
 const triple=await ok('/api/player/claim',{method:'POST',playerToken:a.token,body:{type:'tripleLine',cardId:pos.cardId}});assert.equal(triple.championshipClaim,true);assert.equal(triple.claimed[0].label,'TRIPLE LÍNEA');
 st=await ok('/api/player/state',{playerToken:a.token});pos=st.championship.ownPositions[0];assert.equal(pos.cornersClaimed,true);assert.equal(pos.tripleLineClaimed,true);
 assert(st.championship.announcements.some(x=>x.type==='corners'));assert(st.championship.announcements.some(x=>x.type==='tripleLine'));
 console.log('CAMPEONATO 75 HOTFIX: OK · 4 Esquinas +15 (+5 primero) · Triple Línea +30 (+5 primero) · cantes visibles');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})();
