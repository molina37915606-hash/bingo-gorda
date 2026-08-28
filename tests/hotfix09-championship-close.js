'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const port = 59620 + Math.floor(Math.random() * 60);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-hotfix09-champ-close-'));
let child;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function start(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'20',BINGO_CHAMPIONSHIP_START_SEQUENCE_MS:'50',BINGO_CHAMPIONSHIP_FINAL_CLAIM_WINDOW_MS:'220'},stdio:['ignore','pipe','pipe']})}
async function stop(){if(!child)return;const p=child;child=null;await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{}resolve()},1200);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}})}
async function ready(){for(let i=0;i<180;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await sleep(30)}throw new Error('No inició servidor')}
async function raw(url,{method='GET',body,token,playerToken}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(playerToken?{'X-Player-Token':playerToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d}}
async function ok(url,opt={}){const x=await raw(url,opt);assert(x.r.ok,`${url}: ${x.r.status} ${JSON.stringify(x.d)}`);return x.d}
async function selectRoom(admin,roomCode){const list=await ok('/api/admin/workspaces',{token:admin}),room=list.rooms.find(x=>x.roomCode===roomCode);assert(room,'Admin debe encontrar la sala');if(list.selectedWorkspaceId!==room.workspaceId)await ok('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}})}
const nums=card=>(card.grid||[]).flat().filter(Number.isFinite).map(Number);

(async()=>{try{
  start();await ready();
  const admin=(await ok('/api/admin/login',{method:'POST',body:{password:''}})).token;
  const created=await ok('/api/community/public-room',{method:'POST',body:{visitorId:'host-hf09',name:'Host',roomName:'Cierre Campeonato HF09',gameKind:'championship',championshipRounds:3,mode:75,maxPlayers:4,maxCardsPerPlayer:1,startMode:'manual',accessType:'public'}});
  const a=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Ana',cardCount:1,deviceId:'hf09-a'}});
  const b=await ok('/api/player/open-join',{method:'POST',body:{roomCode:created.roomCode,name:'Beto',cardCount:1,deviceId:'hf09-b'}});
  await ok('/api/community/creator-start',{method:'POST',body:{publicId:created.id,creatorCode:created.creatorCode}});
  await sleep(100);await selectRoom(admin,created.roomCode);
  let sa=await ok('/api/player/state',{playerToken:a.token}),sb=await ok('/api/player/state',{playerToken:b.token});
  const ac=sa.player.cards[0],bc=sb.player.cards[0];assert(ac&&bc,'Los finalistas deben tener cartón');
  const an=nums(ac),bn=nums(bc),aset=new Set(an),bset=new Set(bn);
  const aLast=an.find(n=>!bset.has(n)),bLast=bn.find(n=>!aset.has(n));
  assert(aLast&&bLast,'Los cartones deben tener al menos un número exclusivo cada uno');
  const union=[...new Set([...an,...bn])];
  const restUnion=union.filter(n=>n!==aLast&&n!==bLast);
  const neutral=Array.from({length:75},(_,i)=>i+1).filter(n=>!union.includes(n)).slice(0,4);
  assert.equal(neutral.length,4,'Se necesitan cuatro bolillas neutrales para las cinco extras');
  const prefix=[...restUnion,aLast,...neutral,bLast];
  await ok('/api/admin/test/draw-order',{method:'POST',token:admin,body:{sequence:prefix}});

  for(let i=0;i<prefix.length;i++){
    await ok('/api/admin/draw',{method:'POST',token:admin,body:{source:'hotfix09-close-test'}});
    sa=await ok('/api/player/state',{playerToken:a.token});
    if(i===restUnion.length){
      assert.equal(sa.championship.firstBingoDrawnCount,i+1,'El primer Bingo matemático debe fijar el cierre');
      assert.equal(sa.championship.closingDrawnCount,i+6,'El Campeonato debe conceder cinco bolillas extra');
    }
  }

  sb=await ok('/api/player/state',{playerToken:b.token});
  assert.equal(sb.status,'playing','La quinta bolilla extra no debe cerrar la ronda de golpe');
  assert.equal(sb.championship.closingClaims,true,'Debe abrirse una ventana final para cantar jugadas');
  assert(sb.championship.closingClaimRemainingMs>0,'La ventana final debe tener tiempo restante');
  assert.equal(sb.championship.ownPositions[0].bingoBall,prefix.length,'Beto debe completar Bingo precisamente en la quinta bolilla extra');
  assert.equal(sb.championship.ownPositions[0].bingoClaimed,false,'El Bingo final todavía debe poder cantarse');

  const claimed=await ok('/api/player/claim',{method:'POST',playerToken:b.token,body:{type:'bingo',cardId:bc.id}});
  assert.equal(claimed.championshipClaim,true,'Debe aceptar el Bingo durante la ventana final');
  sb=await ok('/api/player/state',{playerToken:b.token});
  assert.equal(sb.championship.ownPositions[0].bingoClaimed,true,'El Bingo de la quinta extra debe quedar registrado');

  const extra=await raw('/api/admin/draw',{method:'POST',token:admin,body:{source:'should-not-draw'}});
  assert.equal(extra.r.status,400,'No debe permitir una bolilla adicional durante el cierre');
  assert(/última bolilla|ventana/i.test(String(extra.d?.error||extra.d?.message||'')),'Debe explicar que la extracción terminó');

  await sleep(320);
  sb=await ok('/api/player/state',{playerToken:b.token});
  assert.equal(sb.championship.stage,'results','Después de la ventana recién debe pasar al resultado de ronda');
  assert.equal(sb.championship.betweenRounds,true);
  assert(Number(sb.championship.ownPositions[0].roundRank)>=1,'El payload debe incluir la posición de ronda para la animación');

  const playerJs=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'css/platform.css'),'utf8');
  assert(playerJs.includes('playChampionshipPositionReveal'),'El jugador debe mostrar la animación de posición');
  assert(playerJs.includes('ÚLTIMA BOLILLA · CANTÁ BINGO'),'La interfaz debe avisar la ventana final');
  assert(css.includes('.championshipPositionReveal'),'Debe existir el overlay de posición');
  assert(css.includes('.championshipConfetti'),'El campeón debe tener confeti');
  console.log('HOTFIX 09 CAMPEONATO: OK · quinta extra conserva reclamo · posición animada · corona/confeti preparados');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();if(!process.exitCode)fs.rmSync(dataDir,{recursive:true,force:true});else console.error('DATA_DIR:',dataDir)}})();
