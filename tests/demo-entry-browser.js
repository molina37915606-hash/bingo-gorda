'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const port = 50920 + Math.floor(Math.random() * 200);
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-gorda-demo-entry-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(port), BINGO_TEST_MODE: 'true', BINGO_DATA_DIR: dataDir },
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
    const createdResponse = await fetch(base + '/demo/start', {
      method:'POST', redirect:'manual',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body:form.toString()
    });
    const setCookie = createdResponse.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0];
    assert.equal(createdResponse.status, 303, 'El formulario DEMO debe redirigir directamente desde el servidor.');
    assert.equal(createdResponse.headers.get('location'), '/jugador?demo=1');
    assert(/bingo_demo_session=/i.test(setCookie), 'La creación directa debe emitir cookie DEMO.');
    assert(/HttpOnly/i.test(setCookie));
    assert(/SameSite=Lax/i.test(setCookie));

    const missingCookiePage = await fetch(base + '/jugador?demo=1', { redirect:'manual' });
    assert.equal(missingCookiePage.status, 302);
    assert.equal(missingCookiePage.headers.get('location'), '/demo?error=session');

    const page = await fetch(base + '/jugador?demo=1', { headers:{ Cookie:cookie } });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert(/no-store/i.test(page.headers.get('cache-control') || ''));
    assert(!html.includes('window.__BINGO_DEMO_BOOTSTRAP__ = null;'), 'La página DEMO debe recibir el estado inicial embebido.');
    assert(html.includes('window.__BINGO_DEMO_BOOTSTRAP__ = {'), 'Debe existir bootstrap DEMO del servidor.');
    assert(html.includes('"demoHuman":true'), 'El bootstrap debe identificar al jugador DEMO.');
    assert(html.includes('"active":true'), 'El bootstrap debe contener una sala activa.');
    assert(html.includes('online-room-player.js?v=2.9.0'), 'El jugador debe cargar la versión 2.9.0.');
    assert(html.includes('setTimeout(()=>{') && html.includes('8000'), 'Debe existir watchdog de arranque independiente del JS principal.');

    const demoPage = await fetch(base + '/demo');
    const demoHtml = await demoPage.text();
    assert(demoHtml.includes('method="post" action="/demo/start"'), 'CREAR MI DEMO debe usar POST normal del navegador.');
    assert(!demoHtml.includes("fetch('/api/demo/create'"), 'La creación pública no debe depender de fetch.');

    const jsResponse = await fetch(base + '/js/online-room-player.js?v=2.8.0');
    const playerJs = await jsResponse.text();
    assert.equal(jsResponse.status, 200);
    assert(/no-store/i.test(jsResponse.headers.get('cache-control') || ''));
    assert(playerJs.includes('const initialDemoState = window.__BINGO_DEMO_BOOTSTRAP__'));
    assert(playerJs.includes('this.applyState(initialDemoState)'), 'La sala debe mostrarse sin pedir /api/player/state primero.');
    assert(playerJs.includes('await this.resume({ demoBoot:true })'), 'Debe conservarse consulta de respaldo si falta el estado embebido.');

    console.log('PRUEBA ENTRADA DEMO DIRECTA + BOOTSTRAP: OK');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
