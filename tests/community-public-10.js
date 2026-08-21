'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
const port=58280+Math.floor(Math.random()*100),base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-public-10-'));
let child=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function spawnServer(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'100'},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const proc=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{proc.kill('SIGKILL')}catch{}resolve()},1500);proc.once('exit',()=>{clearTimeout(t);resolve()});try{proc.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<140;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
function cookie(headers){const raw=headers.get('set-cookie')||'',m=raw.match(/bingo_player_session=([^;]+)/);return m?`bingo_player_session=${m[1]}`:''}
async function raw(pathname,{method='GET',body,cookie:ck,playerToken,adminToken}={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(ck?{Cookie:ck}:{}),...(playerToken?{'X-Player-Token':playerToken}:{}),...(adminToken?{'X-Admin-Token':adminToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(pathname,opt={}){const x=await raw(pathname,opt);assert(x.r.ok,`${pathname}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}
(async()=>{try{
  spawnServer();await ready();
  const rooms=[],guestNames=['Pedro','Lucía','Carlos','Marta','Nora','Ana','Beto','Sofía','Diego','Elena'],guestNames2=['Raúl','Camila','Mateo','Julia','Tomás','Valeria','Pablo','Carla','Mario','Rocío'];
  for(let i=0;i<10;i++){
    const response=await raw('/api/community/public-room',{method:'POST',body:{visitorId:`creator-${i}`,name:`Anfitrión ${i+1}`,roomName:`Mesa pública ${i+1}`,mode:i%2?75:90,maxPlayers:10,maxCardsPerPlayer:1,autoSeconds:20,linePrizeCount:1,rules:{line:true,bingo:true},startMode:'manual'}});
    assert(response.r.ok,`No pudo crear sala ${i+1}: ${JSON.stringify(response.d)}`);
    assert.equal(cookie(response.r.headers),'',`Sala ${i+1}: el anfitrión no debe convertirse en jugador.`);
    const joined=await ok('/api/player/open-join',{method:'POST',body:{roomCode:response.d.roomCode,name:guestNames[i],cardCount:1,deviceId:`guest-${i}`}});
    const joined2=await ok('/api/player/open-join',{method:'POST',body:{roomCode:response.d.roomCode,name:guestNames2[i],cardCount:1,deviceId:`guest-b-${i}`}});
    rooms.push({...response.d,guestToken:joined.token,guestToken2:joined2.token});
  }
  const overflow=await raw('/api/community/public-room',{method:'POST',body:{visitorId:'creator-11',name:'Once',roomName:'Mesa 11',mode:90,maxPlayers:5,maxCardsPerPlayer:1,startMode:'manual'}});assert.equal(overflow.r.status,400,'La sala activa número 11 debe rechazarse.');
  const community=await ok('/api/community/state?visitorId=observer');assert.equal(community.publicRooms.filter(x=>x.status==='waiting').length,10,'Comunidad debe publicar las diez salas activas.');

  for(let i=0;i<rooms.length;i++)await ok('/api/player/chat',{method:'POST',playerToken:rooms[i].guestToken,body:{text:`mensaje-unico-${i}`}});
  for(let i=0;i<rooms.length;i++){
    const st=await ok('/api/player/state',{playerToken:rooms[i].guestToken}),texts=(st.chat?.messages||[]).map(x=>x.text).filter(Boolean);
    assert(texts.includes(`mensaje-unico-${i}`),`Sala ${i+1} debe conservar su mensaje.`);
    for(let j=0;j<rooms.length;j++)if(j!==i)assert(!texts.includes(`mensaje-unico-${j}`),`Chat de sala ${i+1} no debe contener mensajes de sala ${j+1}.`);
  }

  // Las diez pueden iniciar a la vez con el código de cada creador, sin que el creador sea jugador.
  for(const room of rooms){const started=await ok('/api/community/creator-start',{method:'POST',body:{publicId:room.id,creatorCode:room.creatorCode}});assert(started.ok);}
  await wait(350);
  for(let i=0;i<rooms.length;i++){const st=await ok('/api/player/state',{playerToken:rooms[i].guestToken});assert.equal(st.status,'playing',`Sala ${i+1} debe estar jugando.`);assert.equal(st.game.drawn.length,0)}

  const admin=(await ok('/api/admin/login',{method:'POST',body:{}})).token;
  let manager=await ok('/api/admin/workspaces',{adminToken:admin});assert.equal(manager.rooms.length,10);assert.equal(manager.rooms.filter(x=>x.active).length,10,'Los diez workspaces deben estar activos.');assert(manager.rooms.every(x=>Array.isArray(x.playerSummary)),'El administrador debe recibir el resumen simple de jugadores de cada sala.');
  const target=manager.rooms.find(x=>x.roomCode===rooms[2].roomCode);assert(target);await ok('/api/admin/workspace/select',{method:'POST',adminToken:admin,body:{workspaceId:target.workspaceId}});await ok('/api/admin/draw',{method:'POST',adminToken:admin,body:{source:'public-10-test'}});
  const drawnTarget=await ok('/api/player/state',{playerToken:rooms[2].guestToken});const untouched=await ok('/api/player/state',{playerToken:rooms[3].guestToken});assert.equal(drawnTarget.game.drawn.length,1);assert.equal(untouched.game.drawn.length,0,'Bolillas de una sala no deben cruzarse a otra.');

  const claimState=await ok('/api/player/state',{playerToken:rooms[0].guestToken});const cardId=claimState.player.cards[0].id;await ok('/api/player/claim',{method:'POST',playerToken:rooms[0].guestToken,body:{type:'line',cardId}});const claimed=await ok('/api/player/state',{playerToken:rooms[0].guestToken}),other=await ok('/api/player/state',{playerToken:rooms[1].guestToken});assert.equal(claimed.status,'verifying');assert.equal(other.status,'playing','Un reclamo de otra sala no debe pausar esta partida.');assert.equal((other.publicClaims||[]).length,0,'Los reclamos no deben cruzarse entre salas.');

  await stop();spawnServer();await ready();
  const admin2=(await ok('/api/admin/login',{method:'POST',body:{}})).token;manager=await ok('/api/admin/workspaces',{adminToken:admin2});assert.equal(manager.rooms.filter(x=>x.active).length,10,'Las diez salas deben recuperarse tras reiniciar.');
  for(let i=0;i<rooms.length;i++){const st=await ok('/api/player/state',{playerToken:rooms[i].guestToken});assert.equal(st.roomCode,rooms[i].roomCode);assert((st.chat?.messages||[]).some(x=>x.text===`mensaje-unico-${i}`),'El chat propio debe sobrevivir al reinicio.');}

  console.log('PRUEBA 10 SALAS PÚBLICAS: OK · creador no jugador + límite 10 + aislamiento + reinicio');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})();
