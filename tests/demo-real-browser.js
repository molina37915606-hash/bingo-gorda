'use strict';
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const serverPort = 52050 + Math.floor(Math.random() * 150);
const debugPort = 53050 + Math.floor(Math.random() * 150);
const base = `http://127.0.0.1:${serverPort}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-demo-real-browser-data-'));
const chromeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-demo-real-browser-chrome-'));
const root = path.join(__dirname, '..');
const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(serverPort),
    BINGO_TEST_MODE: 'true',
    BINGO_DATA_DIR: dataDir,
    BINGO_DEMO_READY_COUNTDOWN_MS: '900'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let chromium = null;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitHttp(url, attempts = 160) {
  for (let i = 0; i < attempts; i++) {
    try { const r = await fetch(url); if (r.ok) return r; } catch {}
    await wait(50);
  }
  throw new Error(`No respondió ${url}`);
}

class Cdp {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once:true }); this.ws.addEventListener('error', reject, { once:true }); });
    this.ws.addEventListener('message', event => {
      const msg = JSON.parse(String(event.data));
      if (!msg.id) return;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error.message || 'CDP error')); else pending.resolve(msg.result || {});
    });
  }
  call(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

async function main() {
  await waitHttp(base + '/healthz');
  chromium = spawn('/usr/bin/chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-proxy-server', '--disable-features=HttpsUpgrades',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${chromeDir}`, 'about:blank'
  ], { stdio:['ignore','pipe','pipe'] });
  await waitHttp(`http://127.0.0.1:${debugPort}/json/version`);
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const target = targets.find(item => item.type === 'page');
  assert(target?.webSocketDebuggerUrl, 'Chromium no expuso una página CDP.');
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');

  const evaluate = async expression => {
    const out = await cdp.call('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.text || 'Error evaluando en Chromium');
    return out.result?.value;
  };
  const waitFor = async (expression, timeoutMs = 10000) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      try { if (await evaluate(`Boolean(${expression})`)) return; } catch {}
      await wait(80);
    }
    const href = await evaluate('location.href').catch(() => 'sin URL');
    throw new Error(`Timeout esperando: ${expression}. URL=${href}`);
  };

  const navigation = await cdp.call('Page.navigate', { url: base + '/demo' });
  if (String(navigation.errorText || '').includes('ERR_BLOCKED_BY_ADMINISTRATOR')) {
    console.log('PRUEBA CHROMIUM REAL: OMITIDA (el entorno bloquea localhost por política del navegador).');
    cdp.close();
    return;
  }
  assert(!navigation.errorText, `Chromium no pudo navegar: ${navigation.errorText}`);
  await waitFor("document.readyState === 'complete' && document.querySelector('#demoForm')");
  await evaluate("document.querySelector('#demoForm').requestSubmit()");
  await waitFor("location.pathname.startsWith('/demo/jugar/demoentry_') && !location.pathname.endsWith('/partida')", 10000);
  await waitFor("document.querySelectorAll('input[name^=card_]').length >= 2");
  await evaluate(`(()=>{const n=document.querySelector('input[name=name]');n.value='Navegador Demo';n.dispatchEvent(new Event('input',{bubbles:true}));const boxes=[...document.querySelectorAll('input[name^=card_]')].slice(0,2);boxes.forEach(b=>{b.disabled=false;b.checked=true;b.dispatchEvent(new Event('change',{bubbles:true}));});document.querySelector('form').requestSubmit(document.querySelector('#confirmBtn'));})()`);
  await waitFor("location.pathname.endsWith('/partida') && new URLSearchParams(location.search).get('demo') === '1'", 10000);
  await waitFor("window.__BINGO_DEMO_BOOT_READY__ === true && document.body.classList.contains('playerLogged')", 10000);

  // En un perfil limpio el tutorial de controles debe aparecer. Lo salteamos como lo haría un jugador.
  await waitFor("document.querySelector('#guideOverlay') && document.querySelector('#guideOverlay').classList.contains('show')", 7000);
  await evaluate("document.querySelector('#guideSkipBtn').click()");

  // Debe aparecer la cuenta controlada por el servidor, no un timer que inicia desde el navegador.
  await waitFor("document.querySelector('#demoStartCountdown') || document.querySelector('#connectionStatus')?.textContent === 'PREPARANDO'", 4000);
  await waitFor("document.querySelector('#connectionStatus')?.textContent === 'EN JUEGO'", 7000);
  const result = await evaluate(`({status:document.querySelector('#connectionStatus')?.textContent,waitingHidden:document.querySelector('#waitingPanel')?.classList.contains('hidden'),playVisible:!document.querySelector('#playPanel')?.classList.contains('hidden'),url:location.href})`);
  assert.equal(result.status, 'EN JUEGO');
  assert.equal(result.waitingHidden, true);
  assert.equal(result.playVisible, true);
  console.log('PRUEBA CHROMIUM REAL · DEMO → TUTORIAL → JUGANDO: OK');
  cdp.close();
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { chromium?.kill('SIGTERM'); } catch {}
  try { server.kill('SIGTERM'); } catch {}
  await wait(100);
  fs.rmSync(dataDir, { recursive:true, force:true });
  fs.rmSync(chromeDir, { recursive:true, force:true });
});
