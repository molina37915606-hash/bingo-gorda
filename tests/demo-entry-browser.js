'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const port = 50920 + Math.floor(Math.random() * 200);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-demo-entry-v3-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(port), BINGO_TEST_MODE: 'true', BINGO_DATA_DIR: dataDir, BINGO_START_SEQUENCE_MS:'100' },
  stdio: ['ignore', 'pipe', 'pipe']
});

async function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitServer() {
  for (let i = 0; i < 120; i++) {
    try { const response = await fetch(base + '/healthz'); if (response.ok) return; } catch {}
    await wait(50);
  }
  throw new Error('El servidor no inició.');
}
(async () => {
  try {
    await waitServer();
    const form = new URLSearchParams({
      mode:'90', prizeAmbo:'1', prizeLine:'1', prizeBingo:'1', linePrizeCount:'1',
      aiCount:'2', aiNames:'Zoe,Mateo', playerCardCount:'2', autoSeconds:'4'
    });
    const created = await fetch(base + '/demo/start', {
      method:'POST', redirect:'manual', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body:form.toString()
    });
    assert.equal(created.status, 303);
    const waitingPath = created.headers.get('location');
    assert(/^\/demo\/jugar\/demoentry_[a-f0-9]{24}$/.test(waitingPath), `Ruta inesperada: ${waitingPath}`);

    const waitingResponse = await fetch(base + waitingPath);
    const waitingHtml = await waitingResponse.text();
    assert.equal(waitingResponse.status, 200);
    assert(waitingHtml.includes('DEMO · SALA DE ESPERA'));
    assert(waitingHtml.includes('Tu nombre o apodo'));
    assert(waitingHtml.includes('RECARGAR CARTONES'));
    assert(waitingHtml.includes('CONFIRMAR Y SEGUIR'));
    assert(!/Preparando tu (partida|demostración)/i.test(waitingHtml));
    assert(!/Ingresá.*código privado/i.test(waitingHtml));

    // La sala llega renderizada desde el servidor: aun sin ejecutar JavaScript, ya es utilizable.
    assert(waitingHtml.includes('type="text" name="name"'));
    assert(waitingHtml.includes('type="checkbox" name="card_'));

    let cardMatches = [...waitingHtml.matchAll(/name="card_([^"]+)"/g)].map(match => match[1]);
    assert(cardMatches.length >= 2, 'La sala debe renderizar cartones desde el servidor.');

    const refreshBody = new URLSearchParams({ name:'Jugador Demo', action:'refresh', [`card_${cardMatches[0]}`]:'1' });
    const refreshed = await fetch(base + waitingPath, {
      method:'POST', redirect:'manual', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body:refreshBody.toString()
    });
    assert.equal(refreshed.status, 303);
    const refreshedPage = await fetch(base + waitingPath);
    const refreshedHtml = await refreshedPage.text();
    assert(refreshedHtml.includes(`name="card_${cardMatches[0]}" value="1" checked`), 'Recargar debe conservar el cartón ya elegido.');
    cardMatches = [...refreshedHtml.matchAll(/name="card_([^"]+)"/g)].map(match => match[1]);
    const secondCard = cardMatches.find(id => id !== cardMatches[0]);
    assert(secondCard, 'Después de recargar debe seguir habiendo más opciones.');
    const confirmBody = new URLSearchParams({ name:'Jugador Demo', action:'confirm', [`card_${cardMatches[0]}`]:'1', [`card_${secondCard}`]:'1' });
    const confirm = await fetch(base + waitingPath, {
      method:'POST', redirect:'manual', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body:confirmBody.toString()
    });
    assert.equal(confirm.status, 303);
    const gamePath = confirm.headers.get('location');
    assert(/^\/demo\/jugar\/demoentry_[a-f0-9]{24}\/partida\?demo=1$/.test(gamePath), `Ruta de juego inesperada: ${gamePath}`);

    const gameResponse = await fetch(base + gamePath);
    const gameHtml = await gameResponse.text();
    assert.equal(gameResponse.status, 200);
    assert(gameHtml.includes('window.__BINGO_DEMO_BOOTSTRAP__ = {'));
    assert(!gameHtml.includes("window.__BINGO_DEMO_DIRECT_TOKEN__ = '';"));
    assert(gameHtml.includes('online-room-player.js?v=3.1.0'));
    assert(gameHtml.includes('"selectionConfirmed":true'));
    const tokenMatch = gameHtml.match(/window\.__BINGO_DEMO_DIRECT_TOKEN__ = "([^"]+)";/);
    assert(tokenMatch?.[1], 'La ruta de juego debe recibir un token temporal directo.');
    const directState = await fetch(base + '/api/player/state', { headers:{ 'X-Player-Token':tokenMatch[1] } });
    assert.equal(directState.status, 200, 'El token embebido debe autenticar la interfaz de juego sin cookie.');
    const directJson = await directState.json();
    assert.equal(directJson.player.name, 'Jugador Demo');
    assert.equal(directJson.player.selectionConfirmed, true);

    assert(gameHtml.includes('Jugador Demo'), 'El bootstrap debe incluir al jugador confirmado.');
    assert(!gameHtml.includes('Ingresá con tu código privado') || gameHtml.includes('window.__BINGO_DEMO_BOOTSTRAP__ = {'));

    console.log('PRUEBA DEMO V3 · SALA RENDERIZADA SIN JS: OK');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
