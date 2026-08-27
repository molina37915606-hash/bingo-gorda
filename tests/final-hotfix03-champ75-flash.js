'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {spawn}=require('child_process');
const root=path.resolve(__dirname,'..'),port=59720+Math.floor(Math.random()*60),base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-hotfix03-'));let child;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function start(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'1500',BINGO_FLASH_START_SEQUENCE_MS:'300'},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1200);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<180;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(35)}throw Error('No inició servidor')}
async function raw(url,{method='GET',body,token,playerToken}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(url,opt={}){const x=await raw(url,opt);assert(x.r.ok,`${url}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}
async function selectRoom(admin,roomCode){const list=await ok('/api/admin/workspaces',{token:admin}),room=list.rooms.find(x=>x.roomCode===roomCode);assert(room,`No se encontró sala ${roomCode}`);if(list.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}})}
const uniq=a=>[...new Set(a.map(Number).filter(Number.isFinite))];
async function waitStatus(playerToken,status){for(let i=0;i<160;i++){const s=await ok('/api/player/state',{playerToken});if(s.status===status)return s;await wait(20)}throw Error(`No llegó a ${status}`)}
(async()=>{try{
 start();await ready();
 const admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;

 // Campeonato 75: 4ª y 5ª línea.
 const room=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'host-hf03-champ',name:'Host',roomName:'Campe 75 cinco líneas',gameKind:'championship',championshipRounds:3,mode:75,maxPlayers:4,maxCardsPerPlayer:1,autoSeconds:12,startMode:'manual',accessType:'public'}});
 const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:room.roomCode,name:'Ana',cardCount:1,deviceId:'hf03-a'}});
 await ok('/api/player/open-join',{method:'POST',body:{roomCode:room.roomCode,name:'Beto',cardCount:1,deviceId:'hf03-b'}});
 await ok('/api/community/creator-start',{method:'POST',body:{publicId:room.id,creatorCode:room.creatorCode}});
 await selectRoom(admin,room.roomCode);
 let st=await waitStatus(a.token,'playing');
 assert.equal(st.championship.scoring.quadrupleLine,40);assert.equal(st.championship.scoring.firstQuadrupleLine,5);
 assert.equal(st.championship.scoring.quintupleLine,50);assert.equal(st.championship.scoring.firstQuintupleLine,5);
 assert(st.prizeLabels.includes('CUÁDRUPLE LÍNEA'));assert(st.prizeLabels.includes('QUINTA LÍNEA'));
 const card=st.player.cards[0],g=card.grid;
 const target=uniq([...(g[0]||[]),...(g[1]||[]),...(g[2]||[]),...(g[3]||[]),g?.[4]?.[0]]);
 const all=uniq((g||[]).flat()),missing=all.filter(n=>!target.includes(n));
 assert(missing.length>=1,'La secuencia de 5 líneas no debe completar Bingo');
 const rest=Array.from({length:75},(_,i)=>i+1).filter(n=>!target.includes(n));
 await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence:[...target,...rest]}});
 for(let i=0;i<target.length;i++)await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'hf03-five-lines'}});
 st=await ok('/api/player/state',{playerToken:a.token});let pos=st.championship.ownPositions[0];
 assert(pos.quadrupleLineBall,'Debe detectar Cuádruple Línea');assert.equal(pos.quadrupleLinePoints,40);assert.equal(pos.firstQuadrupleLineBonus,5);
 assert(pos.quintupleLineBall,'Debe detectar Quinta Línea');assert.equal(pos.quintupleLinePoints,50);assert.equal(pos.firstQuintupleLineBonus,5);
 assert(!pos.bingoBall,'Cinco líneas seleccionadas no deben forzar Bingo');
 let c=await ok('/api/player/claim',{method:'POST',playerToken:a.token,body:{type:'quadrupleLine',cardId:pos.cardId}});assert.equal(c.claimed[0].label,'CUÁDRUPLE LÍNEA');
 c=await ok('/api/player/claim',{method:'POST',playerToken:a.token,body:{type:'quintupleLine',cardId:pos.cardId}});assert.equal(c.claimed[0].label,'QUINTA LÍNEA');
 st=await ok('/api/player/state',{playerToken:a.token});pos=st.championship.ownPositions[0];assert.equal(pos.quadrupleLineClaimed,true);assert.equal(pos.quintupleLineClaimed,true);

 // Flash: inicio propio y extracción fija de 4 segundos.
 const flash=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'host-hf03-flash',name:'FlashHost',roomName:'Flash fijo',gameKind:'flash',mode:75,maxPlayers:5,maxCardsPerPlayer:4,autoSeconds:12,startMode:'manual',accessType:'public'}});
 assert.equal(flash.autoSeconds,4,'Flash debe ignorar la velocidad pedida y guardar 4 s');
 const fa=await ok('/api/player/open-join',{method:'POST',body:{roomCode:flash.roomCode,name:'Fabi',cardCount:1,deviceId:'hf03-fa'}});
 await ok('/api/player/open-join',{method:'POST',body:{roomCode:flash.roomCode,name:'Gus',cardCount:1,deviceId:'hf03-fb'}});
 await selectRoom(admin,flash.roomCode);
 await ok('/api/community/creator-start',{method:'POST',body:{publicId:flash.id,creatorCode:flash.creatorCode}});
 let ast=await ok('/api/admin/state',{token:admin});
 assert.equal(ast.status,'starting');assert.equal(ast.game.autoSeconds,4);
 const transitionMs=new Date(ast.transition.endsAt).getTime()-new Date(ast.transition.startedAt).getTime();
 assert(transitionMs>=280&&transitionMs<=340,`Flash debe usar su inicio corto dedicado: ${transitionMs} ms`);
 assert.equal(ast.transition.largeRoomNotice,false,'Flash no debe usar el aviso largo de salas grandes');
 await ok('/api/admin/draw-settings',{method:'POST',token:admin,body:{autoSeconds:12}});
 ast=await ok('/api/admin/state',{token:admin});assert.equal(ast.game.autoSeconds,4,'Flash debe seguir en 4 s aunque intenten cambiarlo');

 // Static UI/server guarantees.
 const serverSrc=fs.readFileSync(path.join(root,'server.js'),'utf8'),communityJs=fs.readFileSync(path.join(root,'js/community.js'),'utf8');
 assert(serverSrc.includes("flashRoomEnabled() ? FLASH_START_SEQUENCE_MS"));
 assert(serverSrc.includes("flashRoomEnabled() ? FLASH_AUTO_SECONDS"));
 assert(communityJs.includes("flash?4:Number($('privateRoomInterval').value)"));
 assert(communityJs.includes("FLASH · INICIO EN 3s · 1 BOLILLA CADA 4s"));
 console.log('HOTFIX 03: OK · Campeonato 75 4ª/5ª línea · Flash inicio 3s + bolilla cada 4s fijo');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();if(!process.exitCode)fs.rmSync(dataDir,{recursive:true,force:true});else console.error('DATA_DIR:',dataDir)}})();
