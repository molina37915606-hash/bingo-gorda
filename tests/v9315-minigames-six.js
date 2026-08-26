const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawn}=require('child_process');
const assert=require('assert');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
const community=fs.readFileSync(path.join(root,'js','community.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const types=['red_black','higher_lower','gorda_21','ghost_ball','secret_number','intruder_ball'];
for(const type of types){
  assert(html.includes(`data-open-game="${type}"`),`Falta tarjeta ${type}`);
  assert(html.includes(`data-game-tab="${type}"`),`Falta pestaña ${type}`);
  assert(community.includes(`'${type}'`),`Community JS no reconoce ${type}`);
}
assert(html.includes('21 de La Gorda')&&html.includes('La Bolilla Fantasma')&&html.includes('El Número Secreto')&&html.includes('La Bolilla Intrusa'),'Faltan nombres de los cuatro minijuegos nuevos.');
assert(html.includes('.gamesRow{grid-template-columns:repeat(3,minmax(0,1fr))}'),'Escritorio debe usar grilla 3×2.');
assert(html.includes('@media(max-width:720px){.gamesRow{display:grid!important;grid-template-columns:1fr!important'),'Móvil debe apilar los minijuegos.');
assert(community.includes('function play21(')&&community.includes('function startGhostRound(')&&community.includes('function playSecret(')&&community.includes('function startIntruderRound('),'Falta lógica de algún minijuego nuevo.');
assert(server.includes("const COMMUNITY_MINIGAME_TYPES = ['red_black','higher_lower','gorda_21','ghost_ball','secret_number','intruder_ball']"),'Servidor debe reconocer los seis rankings.');
assert(/\/js\/community\.js\?v=v9-3-(?:15-seis-minijuegos|17-hotfix-21)-20260826/.test(html),'Community debe conservar una versión de caché compatible con los seis minijuegos.');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gorda-v9315-'));
const port=19500+Math.floor(Math.random()*300);
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BINGO_DATA_DIR:tmp,ONLINE_MODE:'0',PUBLIC_URL:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe']});
let stderr=''; child.stderr.on('data',d=>stderr+=d);
const base=`http://127.0.0.1:${port}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function req(url,opt={}){const r=await fetch(base+url,{...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${r.status} ${data.error||url}`);return data}
async function ready(){for(let i=0;i<80;i++){try{await req('/api/community/state?visitorId=probe');return}catch{}await sleep(50)}throw new Error('Servidor no inició: '+stderr)}
(async()=>{try{
  await ready();
  let score=11,index=1;
  for(const type of types){
    const playerName=`Jugador ${index++}`;
    const state=await req('/api/community/score',{method:'POST',body:JSON.stringify({visitorId:`v-${type}`,name:playerName,gameType:type,score:score++})});
    assert(Array.isArray(state.leaderboards[type]),`No volvió ranking ${type}`);
    assert.equal(state.leaderboards[type][0].name,playerName);
  }
  const state=await req('/api/community/state?visitorId=final');
  for(const type of types)assert(Array.isArray(state.leaderboards[type]),`Estado público no incluye ${type}`);
  let rejected=false;try{await req('/api/community/score',{method:'POST',body:JSON.stringify({visitorId:'bad',name:'Mal',gameType:'inventado',score:99})})}catch(e){rejected=true}
  assert(rejected,'Servidor debe rechazar minijuegos inventados.');
  console.log('OK V9.3.15 · 6 minijuegos + 6 rankings + grilla 3×2');
}finally{child.kill('SIGTERM');await sleep(100);fs.rmSync(tmp,{recursive:true,force:true})}})().catch(e=>{console.error(e);child.kill('SIGTERM');try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}process.exit(1)});
