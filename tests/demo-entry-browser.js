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
    const setCookie = createdResponse.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0];
    assert.equal(createdResponse.status, 200, JSON.stringify(created));
    assert.equal(created.playerUrl, '/jugador?demo=1', 'La URL DEMO debe ser limpia y no exponer credenciales.');
    assert(!/demoSession=|codigo=|code=|acceso=/i.test(created.playerUrl), 'La DEMO no debe incluir token ni código privado en la URL.');
    assert(!created.playerSessionToken && !created.demoSessionToken && !created.playerCode, 'La API pública no debe exponer credenciales de la DEMO.');
    assert(/bingo_demo_session=/i.test(setCookie), 'La creación debe emitir la cookie de sesión DEMO.');
    assert(/HttpOnly/i.test(setCookie), 'La cookie DEMO debe ser HttpOnly.');
    assert(/SameSite=Lax/i.test(setCookie), 'La cookie DEMO debe usar SameSite=Lax.');

    const missingCookiePage = await fetch(base + created.playerUrl, { redirect:'manual' });
    assert.equal(missingCookiePage.status, 302, 'Sin cookie válida no debe abrirse una DEMO vacía.');
    assert.equal(missingCookiePage.headers.get('location'), '/demo?error=session');

    const page = await fetch(base + created.playerUrl, { headers: { Cookie: cookie } });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert(/no-store/i.test(page.headers.get('cache-control') || ''), 'jugador.html debe servirse sin caché.');
    assert(html.includes("bootParams.get('demo')==='1'"), 'El HTML debe detectar DEMO antes del JS principal.');
    assert(html.includes("localStorage.removeItem('bingoOnlineToken')"), 'El bootstrap DEMO debe evitar que una sesión normal tenga prioridad.');
    assert(!html.includes("bootParams.get('demoSession')"), 'El HTML ya no debe depender de demoSession en la URL.');
    assert(html.includes('data-demo-boot'), 'Debe ocultar preventivamente el formulario de código durante el arranque DEMO.');
    assert(html.includes('id="demoBootRetryBtn"'), 'El arranque DEMO debe ofrecer REINTENTAR si la sesión tarda o falla.');
    assert(html.includes('id="demoBootBackBtn"'), 'El arranque DEMO debe permitir volver a configurar la demo.');
    assert(html.includes('online-room-player.js?v=2.7.0'), 'El jugador debe cargar la versión 2.7.0 del JS.');

    const stateResponse = await fetch(base + '/api/player/state', { headers: { Cookie: cookie } });
    const state = await stateResponse.json();
    assert.equal(stateResponse.status, 200, JSON.stringify(state));
    assert.equal(state.demo?.active, true, 'La cookie debe autenticar directamente la DEMO.');
    assert.equal(state.player?.demoHuman, true);

    const jsResponse = await fetch(base + '/js/online-room-player.js?v=2.4.0');
    const playerJs = await jsResponse.text();
    assert.equal(jsResponse.status, 200);
    assert(/no-store/i.test(jsResponse.headers.get('cache-control') || ''), 'El JS crítico debe servirse sin caché incluso con una query vieja.');
    assert(playerJs.includes("const demoEntry = params.get('demo') === '1'"), 'El JS debe reconocer la entrada DEMO por el modo, no por un token visible.');
    assert(playerJs.includes('this.cookieSession = true'), 'La app debe mantener la sesión DEMO por cookie.');
    assert(playerJs.includes("credentials:'same-origin'"), 'Las llamadas del jugador deben aceptar la cookie de sesión.');
    assert(playerJs.includes("'/api/events?role=player'"), 'EventSource debe poder autenticarse mediante cookie sin token en la URL.');
    assert(playerJs.includes('timeoutMs:4500'), 'La entrada DEMO debe conservar un timeout corto.');
    assert(playerJs.includes('retries:1'), 'La entrada DEMO debe reintentar automáticamente una vez.');

    console.log('PRUEBA ENTRADA DEMO POR COOKIE/REDIRECCIÓN: OK');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
