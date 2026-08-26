'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const serverSrc = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const communityHtml = fs.readFileSync(path.join(root, 'comunidad.html'), 'utf8');
const communityJs = fs.readFileSync(path.join(root, 'js/community.js'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');

assert(serverSrc.includes('const CHAMPIONSHIP_AUTO_SECONDS = 3;'), 'Campeonato debe fijar 3 segundos por bolilla.');
assert(serverSrc.includes('BINGO_CHAMPIONSHIP_START_SEQUENCE_MS') && serverSrc.includes(': 3000'), 'Campeonato debe tener una secuencia inicial propia de 3 segundos.');
assert(serverSrc.includes("championshipRoomEnabled() ? CHAMPIONSHIP_START_SEQUENCE_MS"), 'Ronda 1 debe usar la secuencia corta solo en Campeonato.');
assert(serverSrc.includes('const delay = CHAMPIONSHIP_START_SEQUENCE_MS;'), 'Las rondas siguientes deben usar la secuencia corta de Campeonato.');
assert(serverSrc.includes("championshipRoomEnabled() ? CHAMPIONSHIP_AUTO_SECONDS"), 'El programador automático debe forzar 3 segundos solo en Campeonato.');
assert(communityHtml.includes('privateChampionshipSpeed') && communityHtml.includes('3 SEGUNDOS POR BOLILLA'), 'La creación de Campeonato debe mostrar el ritmo fijo.');
assert(communityJs.includes("autoSeconds:championship?3:"), 'Comunidad debe enviar 3 segundos al crear Campeonato.');
assert(!communityJs.includes("confirm('¿Iniciar la siguiente ronda?"), 'El panel del creador no debe confirmar la siguiente ronda.');
assert(!playerJs.includes("confirm('¿Preparar e iniciar la siguiente ronda?"), 'El jugador-creador no debe confirmar la siguiente ronda.');
assert(playerJs.includes("championship?'¿Iniciar el Campeonato?"), 'La confirmación inicial del Campeonato se conserva; solo se agilizan las rondas siguientes.');

const port = 59140 + Math.floor(Math.random() * 40);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-v9314-'));
let child;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function request(pathname, { method='GET', body, token, playerToken } = {}) {
  const response = await fetch(base + pathname, {
    method,
    headers: {
      ...(body !== undefined ? {'Content-Type':'application/json'} : {}),
      ...(token ? {'X-Admin-Token':token} : {}),
      ...(playerToken ? {'X-Player-Token':playerToken} : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

(async()=>{
  try {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      env: {
        ...process.env,
        PORT:String(port), ONLINE_MODE:'false', MASTER_ADMIN_PASSWORD:'', ADMIN_PASSWORD:'',
        BINGO_TEST_MODE:'true', BINGO_DATA_DIR:dataDir, PUBLIC_URL:base,
        BINGO_START_SEQUENCE_MS:'1500', BINGO_CHAMPIONSHIP_START_SEQUENCE_MS:'500'
      },
      stdio:['ignore','pipe','pipe']
    });
    for (let i=0;i<160;i++) {
      try { if ((await fetch(base+'/healthz')).ok) break; } catch {}
      await wait(40);
      if (i===159) throw new Error('No inició servidor');
    }

    const normal = await request('/api/community/public-room', {method:'POST', body:{visitorId:'normal-host',name:'Normal',roomName:'Normal 12s',gameKind:'normal',mode:90,maxPlayers:5,maxCardsPerPlayer:1,autoSeconds:12,startMode:'manual',accessType:'public'}});
    assert.equal(normal.autoSeconds, 12, 'Partida Normal debe conservar la velocidad elegida.');

    const champ = await request('/api/community/public-room', {method:'POST', body:{visitorId:'champ-host',name:'Campe',roomName:'Campe rápido',gameKind:'championship',championshipRounds:3,mode:90,maxPlayers:5,maxCardsPerPlayer:1,autoSeconds:12,startMode:'manual',accessType:'public'}});
    assert.equal(champ.autoSeconds, 3, 'Campeonato debe ignorar 6/8/10/12 y guardar 3 segundos.');

    await request('/api/player/open-join', {method:'POST',body:{roomCode:champ.roomCode,name:'Ana',cardCount:1,deviceId:'a'}});
    await request('/api/player/open-join', {method:'POST',body:{roomCode:champ.roomCode,name:'Beto',cardCount:1,deviceId:'b'}});
    await request('/api/community/creator-start', {method:'POST',body:{publicId:champ.id,creatorCode:champ.creatorCode}});

    const admin = (await request('/api/admin/login',{method:'POST',body:{password:''}})).token;
    const workspaces = await request('/api/admin/workspaces',{token:admin});
    const room = workspaces.rooms.find(r=>r.roomCode===champ.roomCode);
    assert(room, 'Admin debe encontrar el Campeonato.');
    if (workspaces.selectedWorkspaceId !== room.workspaceId) await request('/api/admin/workspace/select',{method:'POST',token:admin,body:{workspaceId:room.workspaceId}});
    const state = await request('/api/admin/state',{token:admin});
    assert.equal(state.game.autoSeconds,3,'El juego activo de Campeonato debe quedar fijado en 3 segundos.');
    assert.equal(state.status,'starting');
    const transitionMs = new Date(state.transition.endsAt).getTime() - new Date(state.transition.startedAt).getTime();
    assert(transitionMs >= 480 && transitionMs <= 520, `La secuencia de prueba de Campeonato debe usar su temporizador propio, no el global: ${transitionMs}ms`);

    await request('/api/admin/draw-settings',{method:'POST',token:admin,body:{autoSeconds:12}});
    const after = await request('/api/admin/state',{token:admin});
    assert.equal(after.game.autoSeconds,3,'Ni un cambio de configuración debe sacar a Campeonato de 3 segundos.');

    console.log('OK v9.3.14 campeonato rápido');
  } finally {
    if (child) {
      try { child.kill('SIGTERM'); } catch {}
      await wait(100);
      try { if (!child.killed) child.kill('SIGKILL'); } catch {}
    }
    fs.rmSync(dataDir,{recursive:true,force:true});
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
