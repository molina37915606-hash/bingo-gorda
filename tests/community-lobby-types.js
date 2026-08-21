'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
const communityHtml=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
const communityJs=fs.readFileSync(path.join(root,'js/community.js'),'utf8');
const playerJs=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
const serverSrc=fs.readFileSync(path.join(root,'server.js'),'utf8');
const ranges90=[[1,9],[10,19],[20,29],[30,39],[40,49],[50,59],[60,69],[70,79],[80,90]];
function assertStandard90Card(card,label='cartón 90'){
  const grid=card.grid;assert(Array.isArray(grid)&&grid.length===3&&grid.every(row=>Array.isArray(row)&&row.length===9),`${label}: debe ser 3x9`);
  const all=[];
  grid.forEach((row,index)=>{const nums=row.filter(Number.isFinite);assert.equal(nums.length,5,`${label}: fila ${index+1} debe tener 5 números`);all.push(...nums)});
  assert.equal(all.length,15,`${label}: debe tener 15 números`);assert.equal(new Set(all).size,15,`${label}: no debe repetir números`);
  for(let col=0;col<9;col++){const vals=grid.map(row=>row[col]).filter(Number.isFinite);assert(vals.length>=1&&vals.length<=2,`${label}: columna ${col+1} debe tener 1 o 2 números`);const [lo,hi]=ranges90[col];assert(vals.every(v=>Number.isInteger(v)&&v>=lo&&v<=hi),`${label}: rango incorrecto en columna ${col+1}`);assert.deepEqual(vals,[...vals].sort((a,b)=>a-b),`${label}: columna ${col+1} debe crecer de arriba hacia abajo`)}
}
function assertStandard90Series(series){
  assert.equal(series.cards.length,6,`Serie ${series.number}: debe contener 6 cartones`);const nums=[];series.cards.forEach((card,index)=>{assertStandard90Card(card,`Serie ${series.number} cartón ${index+1}`);nums.push(...card.grid.flat().filter(Number.isFinite))});assert.equal(nums.length,90);assert.deepEqual([...nums].sort((a,b)=>a-b),Array.from({length:90},(_,i)=>i+1),`Serie ${series.number}: debe contener 1..90 exactamente una vez`);
}
assert(communityHtml.includes('Públicas, privadas y administradas')&&communityHtml.includes('🔒 PRIVADA')&&communityHtml.includes('PÚBLICA'),'Comunidad debe presentar el lobby por tipos.');
assert(communityJs.includes("kind==='official'")&&communityJs.includes("kind==='private'")&&communityJs.includes('/api/community/room-access'),'El lobby debe diferenciar oficial/privada y proteger el acceso.');
assert(playerJs.includes('/api/player/community-rematch'),'El flujo de revancha debe seguir disponible cuando el creador también ingresó como jugador.');
assert(serverSrc.includes('COMMUNITY_FINISH_GRACE_MS')&&serverSrc.includes('maybeCloseFinishedCommunityRoom')&&serverSrc.includes("roomType: state.roomSettings?.roomOrigin === 'community'"),'Servidor debe cerrar la sala tras la ventana final y conservar tipo en historial.');
assert(communityHtml.includes('cardsToolBtn')&&communityHtml.includes('bolilleroToolBtn')&&communityHtml.includes('bolilleroOverlay'),'Comunidad debe incluir Cartones y Bolillero sin crear otra página.');
const toolsJs=fs.readFileSync(path.join(root,'js/community-tools.js'),'utf8');
assert(toolsJs.includes('/api/community/cards/generate')&&toolsJs.includes('LA_GORDA_CARD_LOT_V1')&&toolsJs.includes('analyzeLoadedCard')&&toolsJs.includes('loadedCardRaceRows')&&toolsJs.includes('progressForPrize')&&toolsJs.includes('SACAR BOLILLA'),'Bolillero debe generar, cargar PDF autocontenido, controlar los cartones y validar premios localmente.');
assert(serverSrc.includes('buildCardLotPdf')&&serverSrc.includes('CARD_LOTS_DIR')&&serverSrc.includes('/api/community/cards/pdf')&&serverSrc.includes('emptyCell(cx, cy, cw, ch)')&&serverSrc.includes('generateCard90StripServer'),'Servidor debe persistir lotes, producir PDF legible y generar series estándar de Bingo 90.');
assert(communityHtml.includes('bolNearPanel')&&communityHtml.includes('claimCandidatesWrap')&&communityHtml.includes('bolCardPreviewOverlay'),'Bolillero debe mostrar cercanos, candidatos al canto y vista previa de cartones cargados.');

const port=58610+Math.floor(Math.random()*70),base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'el-bingo-lobby-'));
let child=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function spawnServer(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'30',BINGO_COMMUNITY_FINISH_GRACE_MS:'350'},stdio:['ignore','pipe','pipe']});}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1400);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<150;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(40)}throw Error('No inició servidor')}
function cookies(headers){const raw=headers.get('set-cookie')||'';return raw.split(/,(?=\s*[^;,]+=)/).map(x=>x.split(';')[0].trim()).filter(Boolean).join('; ')}
function namedCookie(headers,name){const raw=headers.get('set-cookie')||'';const m=raw.match(new RegExp(`${name}=([^;]+)`));return m?`${name}=${m[1]}`:''}
async function raw(pathname,{method='GET',body,cookie,playerToken,adminToken,redirect='follow',form=false}={}){const headers={...(body!==undefined&&!form?{'Content-Type':'application/json'}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(cookie?{Cookie:cookie}:{}),...(playerToken?{'X-Player-Token':playerToken}:{}),...(adminToken?{'X-Admin-Token':adminToken}:{})};const r=await fetch(base+pathname,{method,redirect,headers,body:body===undefined?undefined:(form?new URLSearchParams(body):JSON.stringify(body))});const type=r.headers.get('content-type')||'';const d=type.includes('application/json')?await r.json().catch(()=>({})):await r.text().catch(()=>'');return{r,d}}
async function ok(pathname,opt={}){const x=await raw(pathname,opt);assert(x.r.ok,`${pathname}: ${x.r.status} ${typeof x.d==='string'?x.d.slice(0,250):JSON.stringify(x.d)}`);return x.d}
async function adminSelect(adminToken,roomCode){const manager=await ok('/api/admin/workspaces',{adminToken});const room=manager.rooms.find(x=>x.roomCode===roomCode);assert(room,`No se encontró workspace de ${roomCode}`);await ok('/api/admin/workspace/select',{method:'POST',adminToken,body:{workspaceId:room.workspaceId}});return room.workspaceId}

async function finishCurrent(adminToken){let st=await ok('/api/admin/state',{adminToken});const remaining=Math.max(0,Number(st.game?.mode||0)-Number(st.game?.drawn?.length||0));for(let i=0;i<remaining;i++)await ok('/api/admin/draw',{method:'POST',adminToken,body:{source:'lobby-test'}});return ok('/api/admin/finish',{method:'POST',adminToken,body:{}})}
(async()=>{try{
  spawnServer();await ready();
  const admin=(await ok('/api/admin/login',{method:'POST',body:{}})).token;

  // Herramientas públicas: lote persistente + PDF real + web configurable.
  let toolsState=await ok('/api/community/state?visitorId=tools-test');assert(toolsState.tools&&toolsState.tools.cardsPrintSite);
  const lot90=await ok('/api/community/cards/generate',{method:'POST',body:{mode:90,seriesCount:3}});assert(/^LG-[A-Z0-9]{6}$/.test(lot90.code));assert.equal(lot90.totalCards,18);assert.equal(lot90.series.length,3);lot90.series.forEach(assertStandard90Series);
  const lot90Loaded=await ok(`/api/community/cards/lot?lot=${lot90.code}`);assert.equal(lot90Loaded.code,lot90.code);
  const testCard90=lot90Loaded.series[0].cards[0],all90=testCard90.grid.flat().filter(Number.isFinite);const bingoCheck=await ok('/api/community/cards/validate',{method:'POST',body:{lot:lot90.code,seriesNumber:1,cardNumber:1,type:'bingo',drawn:all90}});assert.equal(bingoCheck.valid,true,'El Bolillero debe validar con el mismo motor los cartones impresos.');
  const pdfResponse=await fetch(base+lot90.downloadUrl);assert(pdfResponse.ok);assert((pdfResponse.headers.get('content-type')||'').includes('application/pdf'));const pdfBuffer=Buffer.from(await pdfResponse.arrayBuffer());assert(pdfBuffer.subarray(0,4).toString()==='%PDF');assert(pdfBuffer.includes(Buffer.from('LA_GORDA_CARD_LOT_V1')),'El PDF debe llevar sus cartones embebidos para poder cargarse sin depender del lote del servidor.');const embeddedPdf=pdfBuffer.toString('latin1').match(/LA_GORDA_CARD_LOT_V1\n([A-Za-z0-9_-]+)\nLA_GORDA_CARD_LOT_END/);assert(embeddedPdf);const embeddedLot=JSON.parse(Buffer.from(embeddedPdf[1],'base64url').toString('utf8'));assert.equal(embeddedLot.code,lot90.code);assert.equal(embeddedLot.series[0].cards.length,6);
  const lot75=await ok('/api/community/cards/generate',{method:'POST',body:{mode:75,seriesCount:1}});assert.equal(lot75.totalCards,6);assert(lot75.series[0].cards.every(card=>card.grid.length===5&&card.grid[2][2]==='LIBRE'&&card.grid.flat().filter(Number.isFinite).length===24));
  await ok('/api/admin/community/settings',{method:'POST',adminToken:admin,body:{cardsPrintSite:'ejemplo.com/bingo'}});const branded=await ok('/api/community/cards/generate',{method:'POST',body:{mode:90,seriesCount:1}});assert.equal(branded.site,'ejemplo.com/bingo');

  // Una sala creada por Admin debe aparecer como OFICIAL, nunca como pública/privada de jugador.
  const official=await ok('/api/admin/create-simple-room',{method:'POST',adminToken:admin,body:{mode:90,cardCount:40,autoSeconds:30,rules:{line:true,bingo:true},linePrizeCount:1,maxCardsPerPlayer:2}});
  await ok('/api/admin/join-open',{method:'POST',adminToken:admin,body:{open:true}});
  let community=await ok('/api/community/state?visitorId=lobby-test');
  const officialCard=community.lobbyRooms.find(x=>x.kind==='official'&&x.status==='waiting');
  assert(officialCard&&officialCard.name==='EL BINGO DE LA GORDA','La sala del Admin debe verse como OFICIAL.');

  // Sala privada: crearla no convierte al creador en jugador; la clave sigue protegiendo ingreso y transmisión.
  let createdResp=await raw('/api/community/public-room',{method:'POST',body:{visitorId:'creator-private',name:'Ana',roomName:'Cumple de Ana',accessType:'private',accessKey:'ANA2026',mode:75,maxPlayers:10,maxCardsPerPlayer:1,autoSeconds:8,rules:{line:true,corners:true,bingo:true},startMode:'manual'}});
  assert(createdResp.r.ok,JSON.stringify(createdResp.d));const created=createdResp.d;assert.equal(namedCookie(createdResp.r.headers,'bingo_player_session'),'','Crear la sala no debe dar sesión de jugador al creador.');assert.equal(created.accessType,'private');assert.equal(created.roomCode,'');assert.equal(created.joinUrl,'');assert.equal(created.transmissionUrl,'');assert(!created.hostUrl,'No debe existir un panel de anfitrión separado.');
  const recovered=await ok('/api/community/creator-recover',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode,deviceId:'creator-private-2'}});assert(recovered.organizer&&recovered.roomCode,'El código de creador debe recuperar el control de la sala sin crear jugador.');const privateRoomCode=recovered.roomCode;
  await adminSelect(admin,privateRoomCode);let hostState=await ok('/api/admin/state',{adminToken:admin});assert.equal(hostState.players.length,0,'La sala privada debe comenzar sin registrar al creador como jugador.');
  community=await ok('/api/community/state?visitorId=lobby-test');const privateCard=community.lobbyRooms.find(x=>x.id===created.id);assert(privateCard&&privateCard.kind==='private'&&privateCard.requiresKey);assert.equal(privateCard.roomCode,'');assert.equal(privateCard.joinUrl,'');assert.equal(privateCard.transmissionUrl,'');assert(!JSON.stringify(privateCard).includes('ANA2026'),'La clave nunca debe salir en el lobby.');
  const adminPrivateKey=await ok('/api/admin/private-room-key',{adminToken:admin});assert.equal(adminPrivateKey.accessKey,'ANA2026','Admin debe poder recuperar la clave de la sala privada seleccionada.');community=await ok('/api/community/state?visitorId=lobby-test-2');assert(!JSON.stringify(community).includes('ANA2026'),'La clave administrativa nunca debe filtrarse a Comunidad.');
  const bypass=await raw('/api/player/open-join',{method:'POST',body:{roomCode:privateRoomCode,name:'Intruso',cardCount:1,deviceId:'intruso'}});assert.equal(bypass.r.status,400,'No se debe poder saltar la clave usando la API de ingreso general.');
  const bad=await raw('/api/community/room-access',{method:'POST',body:{publicId:created.id,accessKey:'MALACLAVE'}});assert.equal(bad.r.status,400);
  const access=await raw('/api/community/room-access',{method:'POST',body:{publicId:created.id,accessKey:'ANA2026'}});assert(access.r.ok,JSON.stringify(access.d));const roomAccessCookie=namedCookie(access.r.headers,'bingo_community_room_access');assert(roomAccessCookie&&access.d.joinUrl&&access.d.transmissionUrl,'Clave correcta debe habilitar juego y transmisión.');
  let watch=await raw(access.d.transmissionUrl,{redirect:'manual'});assert.equal(watch.r.status,303,'La transmisión privada sin permiso debe volver a pedir clave.');
  watch=await raw(access.d.transmissionUrl,{cookie:roomAccessCookie,redirect:'manual'});assert.equal(watch.r.status,200,'La misma clave debe habilitar la transmisión privada.');
  let entryPage=await raw(access.d.joinUrl,{cookie:roomAccessCookie,redirect:'manual'});assert.equal(entryPage.r.status,200,'La misma clave debe habilitar el formulario de ingreso.');
  const guestEntry=await raw('/jugador/entrar',{method:'POST',cookie:roomAccessCookie,redirect:'manual',form:true,body:{roomCode:privateRoomCode,name:'Beto',cardCount:'1'}});assert.equal(guestEntry.r.status,303);assert.equal(guestEntry.r.headers.get('location'),'/jugar');const guestCookie=namedCookie(guestEntry.r.headers,'bingo_player_session');assert(guestCookie,'El invitado autorizado debe obtener sesión de jugador.');
  const guest2Entry=await raw('/jugador/entrar',{method:'POST',cookie:roomAccessCookie,redirect:'manual',form:true,body:{roomCode:privateRoomCode,name:'Lola',cardCount:'1'}});assert.equal(guest2Entry.r.status,303);const guest2Cookie=namedCookie(guest2Entry.r.headers,'bingo_player_session');assert(guest2Cookie);

  // Inicio por código de creador, transmisión y cierre automático sin convertir al creador en participante.
  await ok('/api/player/chat',{method:'POST',cookie:guestCookie,body:{text:'mensaje-de-la-sala-privada'}});
  hostState=await ok('/api/admin/state',{adminToken:admin});assert.equal(hostState.players.length,2);assert(hostState.players.every(p=>p.name!=='Ana'),'Ana no debe aparecer en participantes mientras no elija jugar.');
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});await wait(120);
  let guestState=await ok('/api/player/state',{cookie:guestCookie});assert(['starting','playing'].includes(guestState.status));assert.equal(guestState.player.cards.length,1);
  await adminSelect(admin,privateRoomCode);await finishCurrent(admin);
  guestState=await ok('/api/player/state',{cookie:guestCookie});assert.equal(guestState.status,'finished');assert(!guestState.communityRoom?.rematch?.available,'Sin creador-jugador no debe aparecer una revancha imposible.');
  const sameLink=await raw(`/mesa/${created.id}`,{redirect:'manual'});assert([200,303].includes(sameLink.r.status),'El link estable debe seguir resolviendo durante el cierre.');if(sameLink.r.status===303)assert((sameLink.r.headers.get('location')||'').includes(`/comunidad?mesa=${created.id}`));else assert(String(sameLink.d).includes('Esta partida ya terminó'));
  let history=await ok('/api/admin/history',{adminToken:admin});let rounds=history.entries.filter(x=>x.communityPublicId===created.id&&x.status==='finished');assert.equal(rounds.length,1);assert.equal(rounds[0].roomType,'private');assert.equal(rounds[0].roomName,'Cumple de Ana');
  const detail=await ok(`/api/admin/history?sala=${encodeURIComponent(privateRoomCode)}`,{adminToken:admin});assert(detail.acta&&detail.acta.participants.length===2,'El historial debe conservar el acta con los jugadores reales.');assert(detail.acta.participants.every(p=>p.name!=='Ana'),'El acta no debe incluir al creador si no ingresó a jugar.');
  await wait(1500);
  const manager=await ok('/api/admin/workspaces',{adminToken:admin});const closed=manager.rooms.find(x=>x.workspaceId!==undefined&&x.roomCode===privateRoomCode);assert(!closed||!closed.active,'La sala comunitaria terminada debe liberar el workspace automáticamente.');
  const ended=await raw(`/mesa/${created.id}`,{redirect:'manual'});assert.equal(ended.r.status,200,'El mismo link debe mostrar que la partida terminó después del cierre.');assert(String(ended.d).includes('Esta partida ya terminó'));

  console.log('PRUEBA LOBBY PÚBLICA/PRIVADA/OFICIAL: OK · creador no jugador + clave privada + transmisión + cierre automático + acta histórica');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}})();
