'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const playerJs = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
assert(playerJs.includes("label:'PRIMERA LÍNEA'") && playerJs.includes("label:'SEGUNDA LÍNEA'"), 'Jugador Campeonato debe ofrecer Primera y Segunda Línea.');
assert(serverSrc.includes('function createChampionshipClaim'), 'Servidor debe usar reclamos propios de Campeonato.');
assert(!serverSrc.includes('if (championshipRoomEnabled()) return createChampionshipBingoClaim'), 'Campeonato no debe desviar todos los reclamos exclusivamente a Bingo.');

const port = 59020 + Math.floor(Math.random() * 60);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-champ-claims-'));
let child = null;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function spawnServer(){ child = spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'30'},stdio:['ignore','pipe','pipe']}); }
async function stop(){ if(!child)return; const proc=child; child=null; await new Promise(resolve=>{const t=setTimeout(()=>{try{proc.kill('SIGKILL')}catch{} resolve()},1200);proc.once('exit',()=>{clearTimeout(t);resolve()});try{proc.kill('SIGTERM')}catch{clearTimeout(t);resolve()}}); }
async function waitServer(){ for(let i=0;i<160;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{} await wait(40)} throw new Error('No inició servidor'); }
async function raw(pathname,{method='GET',body,token,playerToken}={}){const r=await fetch(base+pathname,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({}));return{response:r,data};}
async function ok(pathname,opt={}){const out=await raw(pathname,opt);assert(out.response.ok,`${pathname}: ${out.response.status} ${JSON.stringify(out.data)}`);return out.data;}
async function selectRoom(admin,roomCode){const list=await ok('/api/admin/workspaces',{token:admin});const room=list.rooms.find(x=>x.roomCode===roomCode);assert(room);if(list.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}});}

(async()=>{
 try{
  spawnServer(); await waitServer();
  const admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;
  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'host-claims',name:'Host',roomName:'Campeonato Reclamos',gameKind:'championship',championshipRounds:5,championshipReactionBonus:true,mode:90,maxPlayers:10,maxCardsPerPlayer:2,autoSeconds:8,startMode:'manual',accessType:'public'}});
  const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Ana',cardCount:2,deviceId:'claims-a'}});
  const b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Beto',cardCount:2,deviceId:'claims-b'}});
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});
  await wait(130); await selectRoom(admin,created.roomCode);

  const players=[{token:a.token,name:'Ana'},{token:b.token,name:'Beto'}];
  const lineClaims=new Set(); const secondClaims=new Set(); let bingoClaimed=false; let duplicateChecked=false;
  for(let i=0;i<90;i++){
    const draw=await raw('/api/admin/draw',{method:'POST',token:admin,body:{source:'champ-claims-test'}});
    if(!draw.response.ok) break;
    for(const pl of players){
      let st=await ok('/api/player/state',{playerToken:pl.token});
      for(const pos of st.championship?.ownPositions||[]){
        if(pos.lineBall && !pos.lineClaimed && !lineClaims.has(pos.positionId)){
          const claim=await ok('/api/player/claim',{method:'POST',playerToken:pl.token,body:{type:'line',cardId:pos.cardId}});
          assert.equal(claim.championshipClaim,true); assert.equal(claim.type,'line'); assert.equal(claim.claimed.length,1);
          lineClaims.add(pos.positionId);
          const after=await ok('/api/player/state',{playerToken:pl.token});
          const own=after.championship.ownPositions.find(x=>x.positionId===pos.positionId);
          assert.equal(own.lineClaimed,true,'El cartón debe quedar registrado como Línea cantada.');
          assert(!['verifying'].includes(after.status),'Cantar Línea en Campeonato no debe pausar para verificación.');
          if(!duplicateChecked){
            const dup=await raw('/api/player/claim',{method:'POST',playerToken:pl.token,body:{type:'line',cardId:pos.cardId}});
            assert(!dup.response.ok,'El mismo cartón no puede cantar dos veces su Primera Línea.');
            duplicateChecked=true;
          }
          st=after;
        }
        if(pos.secondLineBall && !pos.secondLineClaimed && !secondClaims.has(pos.positionId)){
          const claim=await ok('/api/player/claim',{method:'POST',playerToken:pl.token,body:{type:'secondLine',cardId:pos.cardId}});
          assert.equal(claim.championshipClaim,true); assert.equal(claim.type,'secondLine'); assert.equal(claim.claimed.length,1);
          secondClaims.add(pos.positionId);
          const after=await ok('/api/player/state',{playerToken:pl.token});
          const own=after.championship.ownPositions.find(x=>x.positionId===pos.positionId);
          assert.equal(own.secondLineClaimed,true,'El cartón debe quedar registrado como Segunda Línea cantada.');
          assert(!['verifying'].includes(after.status),'Cantar Segunda Línea no debe bloquear el Campeonato.');
        }
      }
      st=await ok('/api/player/state',{playerToken:pl.token});
      const bingoReady=(st.championship?.ownPositions||[]).find(pos=>pos.bingoBall&&!pos.bingoClaimed);
      if(bingoReady&&!bingoClaimed){
        const claim=await ok('/api/player/claim',{method:'POST',playerToken:pl.token,body:{type:'bingo',cardId:bingoReady.cardId}});
        assert.equal(claim.championshipClaim,true); assert.equal(claim.type,'bingo'); assert(claim.claimed.length>=1);
        bingoClaimed=true;
      }
    }
    if(lineClaims.size>=3 && secondClaims.size>=2 && bingoClaimed) break;
  }
  assert(lineClaims.size>=2,'Al menos dos cartones distintos deben poder cantar Primera Línea.');
  assert(secondClaims.size>=1,'Debe poder cantarse Segunda Línea.');
  assert(bingoClaimed,'Debe poder cantarse Bingo.');

  // Un canto no cierra la jugada para los demás cartones: los registros son por posición.
  const aState=await ok('/api/player/state',{playerToken:a.token});
  const bState=await ok('/api/player/state',{playerToken:b.token});
  const totalLineClaimed=[...aState.championship.ownPositions,...bState.championship.ownPositions].filter(x=>x.lineClaimed).length;
  assert(totalLineClaimed>=2,'La Línea debe poder ser cantada por múltiples cartones del Campeonato.');

  console.log('HOTFIX RECLAMOS CAMPEONATO V9.0.2: OK · Línea/Segunda Línea/Bingo por cartón · sin cierre global · sin pausa de bolillero');
 }catch(err){console.error(err);process.exitCode=1}finally{await stop();fs.rmSync(dataDir,{recursive:true,force:true})}
})();
