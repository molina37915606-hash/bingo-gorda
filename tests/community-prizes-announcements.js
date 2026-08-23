'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');

const root=path.join(__dirname,'..');
const port=59420+Math.floor(Math.random()*70);
const base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'la-gorda-v927-prizes-'));
let child=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function start(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1200);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<150;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(35)}throw Error('No inició servidor')}
async function raw(url,{method='GET',body,playerToken}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)}),d=await r.json().catch(()=>({}));return{r,d}}
async function ok(url,opt={}){const x=await raw(url,opt);assert(x.r.ok,`${url}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}

(async()=>{try{
  const communityJs=fs.readFileSync(path.join(root,'js/community.js'),'utf8');
  const playerJs=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
  const tvJs=fs.readFileSync(path.join(root,'js/tv.js'),'utf8');
  const txJs=fs.readFileSync(path.join(root,'js/transmision.js'),'utf8');
  const tvHtml=fs.readFileSync(path.join(root,'tv.html'),'utf8');
  assert(communityJs.includes('SE JUEGA POR:')&&communityJs.includes('roomPrizeText'),'Comunidad debe mostrar los premios activos de cada mesa.');
  assert(playerJs.includes('waitingPrizeMarkup')&&playerJs.includes('SE JUEGA POR:'),'La sala de espera debe mostrar los premios activos.');
  assert(playerJs.includes('syncAutomaticPrizeAnnouncement'),'Jugador debe escuchar/ver premios automáticos sincronizados.');
  assert(tvJs.includes('renderAutomaticPrizeAnnouncement')&&tvHtml.includes('autoPrizeOverlay'),'Modo TV debe tener cartel global para el premio automático.');
  assert(txJs.includes('showAutomaticPrizeAnnouncement')&&txJs.includes('automatic_prize'),'Transmisión debe respetar la pausa y el anuncio sincronizado.');

  start();await ready();
  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'v927-host',name:'Organizador',roomName:'Premios siempre visibles',gameKind:'normal',accessType:'public',mode:75,maxPlayers:20,maxCardsPerPlayer:2,autoSeconds:8,claimMode:'automatic_ties',rules:{corners:true,line:true,doubleLine:true,tripleLine:true,bingo:true},startMode:'manual'}});
  const lobby=await ok('/api/community/state?visitorId=v927-outsider');
  const room=lobby.lobbyRooms.find(x=>x.id===created.id);
  assert(room,'La sala debe figurar en Comunidad.');
  assert.deepEqual(room.prizeLabels,['4 ESQUINAS','LÍNEA','DOBLE LÍNEA','TRIPLE LÍNEA','BINGO'],'Comunidad debe recibir todos los premios reales de la mesa.');

  const joined=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Ana',cardCount:1,deviceId:'v927-player'}});
  const player=await ok('/api/player/state',{playerToken:joined.token});
  assert.deepEqual(player.prizeLabels,room.prizeLabels,'El jugador debe recibir la misma lista de premios que vio en Comunidad.');
  assert.deepEqual(player.communityRoom.prizeLabels,room.prizeLabels,'La sala de espera debe conservar la lista de premios de Comunidad.');

  console.log('V9.2.7 PREMIOS VISIBLES + ANUNCIOS: OK · Comunidad + espera + jugador/TV/transmisión sincronizados');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})();
