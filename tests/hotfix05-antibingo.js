'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..'),port=59710+Math.floor(Math.random()*70),base=`http://127.0.0.1:${port}`,dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bingo-antibingo-'));
let child=null;const wait=ms=>new Promise(r=>setTimeout(r,ms));
function start(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'20'},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1400);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<160;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await wait(35)}throw Error('No inició servidor')}
async function raw(url,{method='GET',body,token,playerToken}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(url,opt={}){const x=await raw(url,opt);assert(x.r.ok,`${url}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}
async function selectRoom(admin,roomCode){const list=await ok('/api/admin/workspaces',{token:admin}),room=list.rooms.find(x=>x.roomCode===roomCode);assert(room,`Admin no encontró ${roomCode}`);if(list.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}})}
async function waitPlaying(playerToken){for(let i=0;i<120;i++){const s=await ok('/api/player/state',{playerToken});if(s.status==='playing'||s.status==='finished')return s;await wait(25)}throw Error('Antibingo no llegó a playing')}
const nums=card=>(card.grid||[]).flat().filter(Number.isFinite).map(Number);
async function createAnti(mode,suffix,maxCards=1){const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:`anti-host-${suffix}`,name:'Host',roomName:`Antibingo ${suffix}`,gameKind:'antibingo',mode,maxPlayers:6,maxCardsPerPlayer:maxCards,autoSeconds:20,startMode:'manual',accessType:'public'}});assert.equal(created.gameKind,'antibingo');assert.equal(created.prizeLabels?.length||0,0,'Antibingo no debe publicar premios tradicionales');const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Ana',cardCount:maxCards,deviceId:`anti-a-${suffix}`}}),b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Beto',cardCount:maxCards,deviceId:`anti-b-${suffix}`}});const creator=await ok('/api/community/creator-state',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});const alias=String(creator.transmissionUrl||'').split('/').filter(Boolean).at(-1);assert(alias);await ok('/api/community/creator-start',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});await waitPlaying(a.token);return{created,a,b,alias}}
(async()=>{try{
 start();await ready();const admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;

 // Funcional en Bingo 75 y 90: completar Bingo elimina automáticamente ese cartón y el otro gana.
 for(const mode of [75,90]){
  const {created,a,b,alias}=await createAnti(mode,`direct-${mode}`,1);await selectRoom(admin,created.roomCode);
  let sa=await ok('/api/player/state',{playerToken:a.token}),sb=await ok('/api/player/state',{playerToken:b.token});
  assert(sa.antibingo?.enabled&&sb.antibingo?.enabled,`Modo ${mode}: debe llegar payload Antibingo`);assert.equal(sa.player.autoMark,true);assert.equal(sa.player.autoMarkForced,true);assert.equal(sa.antibingo.ownCards.length,1);assert.equal(sa.rivals.mode,'antibingo');
  const an=nums(sa.player.cards[0]),bn=nums(sb.player.cards[0]),bset=new Set(bn),aset=new Set(an),uniqueA=an.filter(n=>!bset.has(n)),uniqueB=bn.filter(n=>!aset.has(n));assert(uniqueA.length&&uniqueB.length,`Modo ${mode}: los dos cartones deben diferir`);
  const final=uniqueA[0],sequence=[...an.filter(n=>n!==final),final];
  await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence}});
  for(let i=0;i<sequence.length-1;i++)await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:`anti-${mode}`}});
  sa=await ok('/api/player/state',{playerToken:a.token});assert.equal(sa.status,'playing');const aOwn=sa.antibingo.ownCards[0];assert.equal(aOwn.eliminated,false);assert.equal(aOwn.missing,1,`Modo ${mode}: Ana debe quedar a uno antes de caer`);
  const tv=await ok(`/api/broadcast/state?token=${encodeURIComponent(alias)}`);assert(tv.antibingo?.enabled);assert.equal(tv.highlightedCards.length,2);assert(tv.highlightedCards.every(c=>c.antibingo&&c.racePrizeLabel==='QUEDAR AFUERA'));
  await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:`anti-final-${mode}`}});
  sa=await ok('/api/player/state',{playerToken:a.token});sb=await ok('/api/player/state',{playerToken:b.token});
  assert.equal(sa.status,'finished');assert.equal(sa.antibingo.finished,true);assert.equal(sa.antibingo.tie,false);assert.equal(sa.antibingo.ownCards[0].eliminated,true);assert.equal(sa.antibingo.ownCards[0].eliminatedBall,final);assert.equal(sa.antibingo.winners.length,1);assert.equal(sa.antibingo.winners[0].playerName,'Beto');assert.equal(sb.antibingo.ownCards[0].winner,true);assert.equal(sa.antibingo.aliveCount,1);
  const claim=await raw('/api/player/claim',{method:'POST',playerToken:a.token,body:{type:'bingo',cardId:sa.player.cards[0].id}});assert(!claim.r.ok,'Antibingo no debe aceptar un reclamo de Bingo tradicional');
  const pdf=await fetch(base+'/api/player/acta.pdf',{headers:{'X-Player-Token':a.token}});assert(pdf.ok);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,4).toString('latin1'),'%PDF');
  const creatorFinal=await ok('/api/community/creator-state',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});assert.equal(creatorFinal.gameKind,'antibingo');assert.equal(creatorFinal.antibingo?.finished,true);
 }

 // Empate real: los dos últimos cartones necesitan la misma bolilla para completar Bingo.
 const {created,a,b}=await createAnti(75,'tie',1);await selectRoom(admin,created.roomCode);let sa=await ok('/api/player/state',{playerToken:a.token}),sb=await ok('/api/player/state',{playerToken:b.token});const an=nums(sa.player.cards[0]),bn=nums(sb.player.cards[0]),common=an.filter(n=>bn.includes(n));assert(common.length,'Los cartones 75 deben compartir al menos un número para esta prueba');const last=common[0],seq=[...new Set([...an.filter(n=>n!==last),...bn.filter(n=>n!==last)]),last];await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence:seq}});for(let i=0;i<seq.length;i++)await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'anti-tie'}});sa=await ok('/api/player/state',{playerToken:a.token});assert.equal(sa.status,'finished');assert.equal(sa.antibingo.tie,true);assert.equal(sa.antibingo.aliveCount,0);assert.equal(sa.antibingo.winners.length,2);assert(sa.antibingo.winners.every(x=>x.eliminated),'Los empatados caen con la misma bolilla y comparten el resultado');assert.equal(sa.antibingo.winningBall,last);

 // Varios cartones: C1 puede quedar eliminado y C2 del mismo jugador sigue vivo.
 {
  const {created,a,b}=await createAnti(75,'multicard',2);await selectRoom(admin,created.roomCode);
  let sa=await ok('/api/player/state',{playerToken:a.token}),sb=await ok('/api/player/state',{playerToken:b.token});
  assert.equal(sa.player.cards.length,2);assert.equal(sa.antibingo.ownCards.length,2,'Antibingo debe tratar C1/C2 por separado');
  const c1=sa.player.cards[0],c2=sa.player.cards[1],seq=nums(c1);
  await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence:seq}});
  for(const _ of seq)await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'anti-multicard'}});
  sa=await ok('/api/player/state',{playerToken:a.token});sb=await ok('/api/player/state',{playerToken:b.token});
  const own1=sa.antibingo.ownCards.find(x=>x.cardId===c1.id),own2=sa.antibingo.ownCards.find(x=>x.cardId===c2.id);
  assert(own1&&own2);assert.equal(own1.eliminated,true,'C1 debe quedar eliminado');assert.equal(own2.eliminated,false,'C2 debe seguir vivo');
  assert.equal(sa.status,'playing','Perder un cartón no elimina al jugador mientras conserve otro');
  assert(sa.antibingo.aliveCount>=2,'Deben quedar varios cartones vivos tras caer sólo C1');
  assert(sa.rivals.items.some(x=>x.cardId===c2.id&&x.own===true),'C2 vivo debe seguir apareciendo individualmente en Sobrevivientes');
  assert(sa.rivals.recentEliminations.some(x=>x.cardId===c1.id),'C1 debe aparecer entre eliminados recientes');
 }

 // Persistencia: un cartón eliminado no revive después de reiniciar el servidor.
 {
  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'anti-restart-host',name:'Host',roomName:'Antibingo persistencia',gameKind:'antibingo',mode:75,maxPlayers:6,maxCardsPerPlayer:1,autoSeconds:20,startMode:'manual',accessType:'public'}});
  const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Ana R',cardCount:1,deviceId:'anti-restart-a'}}),b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Beto R',cardCount:1,deviceId:'anti-restart-b'}}),c=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Caro R',cardCount:1,deviceId:'anti-restart-c'}});
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});await waitPlaying(a.token);let admin2=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;await selectRoom(admin2,created.roomCode);const ast=await ok('/api/player/state',{playerToken:a.token}),bst=await ok('/api/player/state',{playerToken:b.token}),cst=await ok('/api/player/state',{playerToken:c.token}),an=nums(ast.player.cards[0]),others=new Set([...nums(bst.player.cards[0]),...nums(cst.player.cards[0])]),unique=an.find(n=>!others.has(n))||an[0],seq=[...an.filter(n=>n!==unique),unique];await ok('/api/admin/test/draw-order',{method:'POST',token:admin2,body:{sequence:seq}});for(const _ of seq)await ok('/api/admin/draw',{method:'POST',token:admin2,body:{source:'anti-restart'}});let beforeRestart=await ok('/api/player/state',{playerToken:a.token});assert.equal(beforeRestart.status,'playing');assert.equal(beforeRestart.antibingo.ownCards[0].eliminated,true);const eliminatedAt=beforeRestart.antibingo.ownCards[0].eliminatedAt;await stop();start();await ready();const afterRestart=await ok('/api/player/state',{playerToken:a.token});assert.equal(afterRestart.antibingo.ownCards[0].eliminated,true,'El cartón no puede revivir tras reiniciar');assert.equal(afterRestart.antibingo.ownCards[0].eliminatedAt,eliminatedAt);assert.equal(afterRestart.antibingo.aliveCount,2);
 }

 // Interfaz integrada: misma identidad, Sobrevivientes, estado rojo y animación del prototipo.
 const playerJs=fs.readFileSync(path.join(root,'js/player.js'),'utf8'),css=fs.readFileSync(path.join(root,'css/platform.css'),'utf8'),community=fs.readFileSync(path.join(root,'comunidad.html'),'utf8'),communityJs=fs.readFileSync(path.join(root,'js/community.js'),'utf8'),tvJs=fs.readFileSync(path.join(root,'js/tv.js'),'utf8'),transmissionJs=fs.readFileSync(path.join(root,'js/transmision.js'),'utf8'),transmissionHtml=fs.readFileSync(path.join(root,'transmision.html'),'utf8');
 assert(playerJs.includes('renderAntibingoGame')&&playerJs.includes('SOBREVIVIENTES')&&playerJs.includes('antibingoSkullFx')&&playerJs.includes('ELIMINADOS RECIENTES'));
 assert(css.includes('@keyframes antibingoSkullRise')&&css.includes('.antibingoTab.eliminated')&&css.includes('.antibingoTicketPanel.eliminated'));
 assert(community.includes('value="antibingo"')&&communityJs.includes("gameKind==='antibingo'"));assert(tvJs.includes('SOBREVIVIENTES MÁS COMPROMETIDOS')&&tvJs.includes('ÚLTIMO SOBREVIVIENTE'));assert(transmissionJs.includes('SOBREVIVIENTES MÁS COMPROMETIDOS')&&transmissionJs.includes('antibingoTransmissionFinal')&&transmissionHtml.includes('hotfix05AntibingoTransmission'));assert(fs.readFileSync(path.join(root,'reglamento.html'),'utf8').includes('Modo Antibingo · V1'));
 console.log('HOTFIX 05 ANTIBINGO: OK · 75/90 · multi-cartón · eliminación automática · último sobreviviente · empate · Sobrevivientes · animación · TV');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();if(!process.exitCode)fs.rmSync(dataDir,{recursive:true,force:true});else console.error('DATA_DIR:',dataDir)}})();
