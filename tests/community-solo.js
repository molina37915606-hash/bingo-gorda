'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const communityHtml = fs.readFileSync(path.join(root, 'comunidad.html'), 'utf8');
const communityJs = fs.readFileSync(path.join(root, 'js/community.js'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const six = ['red_black','higher_lower','gorda_21','ghost_ball','secret_number','intruder_ball'];

assert(communityHtml.includes('data-solo-play') && communityHtml.includes('RIVALES FIJOS'), 'Comunidad debe ofrecer Modo Solitario.');
for (const name of ['MATEO','ZOE','OWEN']) assert(communityHtml.includes(name), `${name} debe figurar como rival fijo.`);
assert(communityJs.includes("'/api/community/solo'") && communityJs.includes("roomCreationMode='solo'"), 'El configurador debe crear el Solitario desde Comunidad.');
for (const game of six) assert(playerJs.includes(game), `La espera del jugador debe incluir ${game}.`);
assert(serverSrc.includes("const SOLO_AI_NAMES = Object.freeze(['Mateo', 'Zoe', 'Owen'])"), 'Las IA fijas deben estar definidas en servidor.');

const port = 59700 + Math.floor(Math.random() * 80);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-solo-'));
let child;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function start(){ child = spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),ONLINE_MODE:'false',MASTER_ADMIN_PASSWORD:'',ADMIN_PASSWORD:'',BINGO_TEST_MODE:'true',BINGO_DATA_DIR:dataDir,PUBLIC_URL:base,BINGO_START_SEQUENCE_MS:'20'},stdio:['ignore','pipe','pipe']}); }
async function stop(){ if(!child)return; const p=child; child=null; await new Promise(resolve=>{const t=setTimeout(()=>{try{p.kill('SIGKILL')}catch{} resolve()},1200);p.once('exit',()=>{clearTimeout(t);resolve()});try{p.kill('SIGTERM')}catch{clearTimeout(t);resolve()}}); }
async function ready(){ for(let i=0;i<160;i++){try{if((await fetch(base+'/healthz')).ok)return}catch{} await sleep(35)} throw new Error('No inició servidor'); }
async function raw(url,{method='GET',body,cookie}={}){const r=await fetch(base+url,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));return{r,d,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
async function ok(url,opt={}){const x=await raw(url,opt);assert(x.r.ok,`${url}: ${x.r.status} ${JSON.stringify(x.d)}`);return x;}
async function state(cookie){return (await ok('/api/player/state',{cookie})).d;}
async function createSolo({suffix,gameKind='normal',mode=90,cards=2,rounds=0}){
  const out=await ok('/api/community/solo',{method:'POST',body:{visitorId:`solo-${suffix}`,name:`Jugador ${suffix}`,gameKind,mode,maxCardsPerPlayer:cards,championshipRounds:rounds,autoSeconds:4,claimMode:'manual',rules:{ambocabeza:true,line:true,corners:true,doubleLine:true,tripleLine:true}}});
  assert(out.cookie,'Debe crear cookie de sesión del jugador solitario.');
  assert.deepEqual(out.d.rivals,['Mateo','Zoe','Owen']);
  const s=await state(out.cookie);
  assert.equal(s.communityRoom?.isSolo,true);
  assert.equal(s.communityRoom?.playMode,'solo');
  assert.equal(s.communityRoom?.playerCount,4);
  assert.equal(s.communityRoom?.maxPlayers,4);
  assert.equal(s.communityRoom?.shareUrl,'');
  assert.deepEqual((s.communityRoom?.participants||[]).map(x=>x.name).sort(),[`Jugador ${suffix}`,'Mateo','Owen','Zoe'].sort());
  assert.deepEqual((s.communityRoom?.participants||[]).filter(x=>x.virtual).map(x=>x.name).sort(),['Mateo','Owen','Zoe'].sort());
  assert.deepEqual(s.waitingGame?.activeTypes,six);
  for(const type of six) assert(Array.isArray(s.waitingGame?.leaderboards?.[type]),`Falta leaderboard ${type}`);
  return {cookie:out.cookie,s};
}

(async()=>{try{
  start(); await ready();

  // El nombre de una IA queda reservado.
  const reserved=await raw('/api/community/solo',{method:'POST',body:{visitorId:'solo-reserved',name:'zoe',gameKind:'normal',mode:90,maxCardsPerPlayer:1}});
  assert(!reserved.r.ok && /reservado/i.test(String(reserved.d.error||'')), 'No se debe poder suplantar a Zoe/Mateo/Owen.');

  // Tradicional 90: cuatro competidores, seis minijuegos y arranque real.
  let solo=await createSolo({suffix:'Normal90',gameKind:'normal',mode:90,cards:2});
  for(let i=0;i<six.length;i++){
    const score=await ok('/api/player/waiting-game/score',{method:'POST',cookie:solo.cookie,body:{gameType:six[i],score:i+1}});
    assert(score.d.waitingGame.leaderboards[six[i]].some(x=>x.bestScore===i+1),`${six[i]} debe aceptar puntaje en sala de espera.`);
  }
  await ok('/api/player/random-cards',{method:'POST',cookie:solo.cookie,body:{cardCount:2}});
  await ok('/api/player/automark',{method:'POST',cookie:solo.cookie,body:{enabled:true}});
  await ok('/api/player/community-start',{method:'POST',cookie:solo.cookie,body:{}});
  await sleep(80);
  let s=await state(solo.cookie);
  assert(['starting','playing'].includes(s.status), 'Tradicional solitario debe iniciar con el motor real.');
  assert((s.communityRoom?.participants||[]).filter(x=>x.virtual).length===3, 'Las tres IA deben conservarse como rivales durante la partida.');

  // Flash 75: las tres IA deben entrar al leaderboard competitivo antes de iniciar.
  solo=await createSolo({suffix:'Flash75',gameKind:'flash',mode:75,cards:4});
  assert.equal(solo.s.player.allowedCardCount,1,'Flash fuerza un cartón humano.');
  assert.deepEqual((solo.s.flash?.leaderboard||[]).map(x=>x.playerName).sort(),['Mateo','Owen','Zoe'].sort(),'Flash debe incluir a las tres IA.');
  await ok('/api/player/random-cards',{method:'POST',cookie:solo.cookie,body:{cardCount:1}});
  await ok('/api/player/community-start',{method:'POST',cookie:solo.cookie,body:{}});
  await sleep(80); s=await state(solo.cookie);
  assert.equal(s.flash?.enabled,true); assert(['starting','playing'].includes(s.status));
  assert.equal((s.flash?.leaderboard||[]).length,4,'Flash iniciado debe tener cuatro competidores.');

  // Antibingo 90: las IA participan como cartones vivos y la persona completa el cuarto lugar competitivo.
  solo=await createSolo({suffix:'Anti90',gameKind:'antibingo',mode:90,cards:2});
  assert.equal(solo.s.antibingo?.enabled,true);
  assert.equal(Number(solo.s.antibingo?.totalCards)||0,6,'Antes de elegir, las 3 IA deben aportar sus 6 cartones al Antibingo.');
  await ok('/api/player/random-cards',{method:'POST',cookie:solo.cookie,body:{cardCount:2}});
  await ok('/api/player/community-start',{method:'POST',cookie:solo.cookie,body:{}});
  await sleep(80); s=await state(solo.cookie);
  assert(['starting','playing'].includes(s.status));
  assert.equal(Number(s.antibingo?.totalCards)||0,8,'Antibingo iniciado debe tener 8 cartones competitivos (4x2).');

  // Campeonato 75: arranca sin selección manual y crea posiciones para los cuatro competidores.
  solo=await createSolo({suffix:'Champ75',gameKind:'championship',mode:75,cards:2,rounds:3});
  assert.equal(solo.s.championship?.enabled,true); assert.equal(solo.s.championship?.totalRounds,3);
  await ok('/api/player/community-start',{method:'POST',cookie:solo.cookie,body:{}});
  await sleep(100); s=await state(solo.cookie);
  assert(['starting','playing'].includes(s.status));
  const championshipNames=new Set((s.championship?.leaderboard||[]).map(x=>x.playerName));
  for(const n of [`Jugador Champ75`,'Mateo','Zoe','Owen']) assert(championshipNames.has(n),`Campeonato debe incluir a ${n}.`);
  assert.equal((s.championship?.leaderboard||[]).length,8,'Con 2 posiciones por jugador debe haber 8 posiciones en Campeonato.');

  // Las partidas solitarias son efímeras y no aparecen como mesas públicas del lobby.
  const lobby=(await ok('/api/community/state')).d;
  assert(!JSON.stringify(lobby).includes('Solitario de Jugador'), 'El lobby público no debe publicar las partidas solitarias.');

  console.log('OK community-solo');
}catch(e){console.error(e);process.exitCode=1}finally{await stop();}})();
