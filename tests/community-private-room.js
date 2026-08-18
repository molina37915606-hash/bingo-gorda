'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
const communityHtml=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
const communityJs=fs.readFileSync(path.join(root,'js/community.js'),'utf8');
const adminJs=fs.readFileSync(path.join(root,'js/admin.js'),'utf8');
assert(communityHtml.includes('id="createPrivateRoomTile"')&&communityHtml.includes('id="privateRoomForm"'),'Comunidad debe ofrecer creación de sala privada.');
assert(communityJs.includes('/api/community/private-room')&&communityJs.includes('sharePrivateRoom'),'Comunidad debe crear y compartir la sala.');
assert(adminJs.includes('communityHost'),'El panel Admin debe reconocer el acceso limitado del anfitrión.');

const port=58100+Math.floor(Math.random()*120),base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-community-private-'));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base},stdio:['ignore','pipe','pipe']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
async function raw(pathname,{method='GET',body,token}={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return {r,d}}
async function ok(pathname,opt={}){const out=await raw(pathname,opt);assert(out.r.ok,`${pathname}: ${out.r.status} ${JSON.stringify(out.d)}`);return out.d}
(async()=>{try{
  await waitServer();const login=await ok('/api/admin/login',{method:'POST',body:{}}),owner=login.token;
  // Una programación oficial próxima reserva uno de los dos lugares incluso si AUTO está apagado.
  const startsAt=new Date(Date.now()+30*60_000).toISOString();
  await ok('/api/admin/community/schedule',{method:'POST',token:owner,body:{action:'save',startsAt,registrationMinutes:15,autoStart:false,mode:90,paymentMode:'free',markingMode:'normal',maxCardsPerPlayer:2,cardCount:60,autoSeconds:8,linePrizeCount:1,rules:{line:true,bingo:true}}});
  let community=await ok('/api/community/state?visitorId=private-room-test');assert.equal(community.privateRooms.reservedSlots,1,'La sala oficial próxima debe reservar capacidad.');assert.equal(community.privateRooms.available,true,'Debe quedar un slot disponible para Comunidad.');

  const created=await ok('/api/community/private-room',{method:'POST',body:{visitorId:'private-room-test',name:'Marta Test',mode:90,maxPlayers:10,maxCardsPerPlayer:2,autoSeconds:8,linePrizeCount:2}});
  assert(created.roomCode&&created.joinUrl&&created.hostUrl,'Debe devolver sala, link de jugadores y acceso de anfitrión.');assert(!Object.prototype.hasOwnProperty.call(created,'state'),'La API pública no debe exponer el estado administrativo completo.');assert(created.hostUrl.includes('#communityHost='),'La clave de anfitrión debe viajar en fragmento y no en query HTTP.');
  community=await ok('/api/community/state?visitorId=private-room-test');assert.equal(community.privateRooms.available,false,'El slot restante debe seguir reservado para la partida oficial.');assert.equal(community.activeGame,null,'Una sala privada no debe reemplazar la partida oficial destacada de Comunidad.');
  const blocked=await raw('/api/community/private-room',{method:'POST',body:{name:'Otra Persona',mode:75,maxPlayers:10,maxCardsPerPlayer:1}});assert.equal(blocked.r.status,400,'No debe poder ocupar el slot reservado para la partida oficial.');

  const hash=created.hostUrl.split('#communityHost=')[1],dot=hash.indexOf('.');const roomCode=decodeURIComponent(hash.slice(0,dot)),hostKey=decodeURIComponent(hash.slice(dot+1));
  const hostLogin=await ok('/api/community/host-login',{method:'POST',body:{roomCode,hostKey}});assert.equal(hostLogin.role,'community_host');const host=hostLogin.token;
  let state=await ok('/api/admin/state',{token:host});assert.equal(state.roomCode,created.roomCode);assert.equal(state.roomSettings.roomOrigin,'community');assert.equal(state.roomSettings.paymentMode,'free','Sala comunitaria debe ser siempre gratuita.');assert.equal(state.roomSettings.maxOpenPlayers,10);assert.equal(state.roomSettings.maxCardsPerPlayer,2);
  const noRooms=await raw('/api/admin/workspaces',{token:host});assert.equal(noRooms.r.status,403,'Anfitrión no debe ver ni cambiar otras salas.');
  const noCommunity=await raw('/api/admin/community',{token:host});assert.equal(noCommunity.r.status,403,'Anfitrión no debe configurar Comunidad global.');
  const noReplace=await raw('/api/admin/create-simple-room',{method:'POST',token:host,body:{mode:75,cardCount:30}});assert.equal(noReplace.r.status,403,'Anfitrión no debe reemplazar su sala por otra.');
  state=await ok('/api/admin/join-open',{method:'POST',token:host,body:{open:false}});assert.equal(state.roomSettings.joinOpen,false,'Anfitrión debe poder cerrar inscripciones de su propia sala.');
  state=await ok('/api/admin/join-open',{method:'POST',token:host,body:{open:true}});assert.equal(state.roomSettings.joinOpen,true,'Anfitrión debe poder reabrir inscripciones mientras espera.');

  console.log('PRUEBA SALA PRIVADA COMUNIDAD: OK · gratuita + anfitrión limitado + reserva oficial + máximo 2 slots');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})}})();
