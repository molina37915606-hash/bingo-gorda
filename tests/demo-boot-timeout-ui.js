'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const playerJs = fs.readFileSync(path.join(root, 'js', 'online-room-player.js'), 'utf8');
const playerHtml = fs.readFileSync(path.join(root, 'jugador.html'), 'utf8');
const demoHtml = fs.readFileSync(path.join(root, 'demo.html'), 'utf8');

assert(playerHtml.includes('window.__BINGO_DEMO_BOOTSTRAP__ = null;'), 'El HTML base debe incluir el punto de inyección del estado DEMO.');
assert(playerJs.includes('const initialDemoState = window.__BINGO_DEMO_BOOTSTRAP__'), 'La DEMO debe intentar bootstrap local antes de la red.');
assert(playerJs.includes('this.applyState(initialDemoState)'), 'El estado embebido debe poder abrir la sala inmediatamente.');
assert(playerJs.includes("await this.resume({ demoBoot:true })"), 'Debe existir recuperación por red si falta el bootstrap.');
assert(playerJs.includes('timeoutMs:4500, retries:1'), 'La recuperación de red debe tener timeout y un reintento.');
assert(playerJs.includes("error.code = 'REQUEST_TIMEOUT'"));
assert(playerJs.includes('this.loadPublicInfo();'));
assert(playerHtml.includes('id="demoBootError"'));
assert(playerHtml.includes('id="demoBootRetryBtn"'));
assert(playerHtml.includes('id="demoBootBackBtn"'));
assert(playerHtml.includes('8000'), 'Debe existir watchdog independiente de 8 segundos.');
assert(playerHtml.includes('online-room-player.js?v=2.9.0'));
assert(demoHtml.includes('method="post" action="/demo/start"'));
assert(!demoHtml.includes("fetch('/api/demo/create'"));

console.log('PRUEBA ARRANQUE DIRECTO/WATCHDOG DE DEMO: OK');
