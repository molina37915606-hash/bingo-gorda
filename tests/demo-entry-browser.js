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
    const createdResponse = await fetch(base + '/api/demo/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 90, rules: { ambocabeza: true, line: true, bingo: true }, linePrizeCount: 1, aiCount: 2, playerCardCount: 2, autoSeconds: 4 })
    });
    const created = await createdResponse.json();
    assert.equal(createdResponse.status, 200, JSON.stringify(created));
    assert(created.playerUrl.includes('demo=1'), 'La URL debe identificar la entrada DEMO.');
    assert(created.playerUrl.includes('demoSession='), 'La URL debe incluir la sesión temporal.');
    assert(!/codigo=|code=|acceso=/i.test(created.playerUrl), 'La DEMO no debe incluir un código privado.');

    const page = await fetch(base + created.playerUrl);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert(/no-store/i.test(page.headers.get('cache-control') || ''), 'jugador.html debe servirse sin caché.');
    assert(html.includes("bootParams.get('demoSession')"), 'El HTML debe capturar la sesión DEMO antes del JS principal.');
    assert(html.includes("localStorage.setItem('bingoOnlineToken',demoSession)"), 'El bootstrap debe guardar el token antes de cargar la app.');
    assert(html.includes('data-demo-boot'), 'Debe ocultar preventivamente el formulario de código durante el arranque DEMO.');
    assert(html.includes('id="demoBootRetryBtn"'), 'El arranque DEMO debe ofrecer REINTENTAR si la sesión tarda o falla.');
    assert(html.includes('id="demoBootBackBtn"'), 'El arranque DEMO debe permitir volver a configurar la demo.');
    assert(html.includes('online-room-player.js?v=2.6.1'), 'El jugador debe cargar la versión 2.6.1 del JS.');

    const jsResponse = await fetch(base + '/js/online-room-player.js?v=2.4.0');
    const playerJs = await jsResponse.text();
    assert.equal(jsResponse.status, 200);
    assert(/no-store/i.test(jsResponse.headers.get('cache-control') || ''), 'El JS crítico debe servirse sin caché incluso con una query vieja.');
    assert(playerJs.includes("params.get('demoSession')"), 'El JS actual debe reconocer demoSession.');
    assert(playerJs.includes('timeoutMs:4500'), 'La entrada DEMO debe tener un timeout corto.');
    assert(playerJs.includes('retries:1'), 'La entrada DEMO debe reintentar automáticamente una vez.');
    assert(playerJs.includes('showDemoBootError'), 'Un fallo de arranque debe mostrar una salida recuperable.');
    assert(playerJs.includes('retryDemoBoot'), 'Debe poder reintentarse sin pedir código privado.');

    console.log('PRUEBA ENTRADA DEMO SIN CÓDIGO/CACHÉ: OK');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
