'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const playerJs = fs.readFileSync(path.join(root, 'js', 'online-room-player.js'), 'utf8');
const playerHtml = fs.readFileSync(path.join(root, 'jugador.html'), 'utf8');

assert(playerJs.includes("await this.resume({ demoBoot:true })"), 'La sesión DEMO debe usar el arranque protegido.');
assert(playerJs.includes("timeoutMs:4500, retries:1"), 'La sesión DEMO debe tener timeout y un reintento automático.');
assert(playerJs.includes("error.code = 'REQUEST_TIMEOUT'"), 'Los timeouts deben distinguirse de otros errores.');
assert(playerJs.includes("this.loadPublicInfo();"), 'La información pública debe seguir cargándose en segundo plano.');
assert(playerJs.indexOf("await this.resume({ demoBoot:true })") < playerJs.indexOf("this.loadPublicInfo();"), 'La sesión DEMO debe intentarse antes de cargar información pública secundaria.');
assert(playerHtml.includes('id="demoBootError"'), 'Debe existir un estado visual de error de arranque.');
assert(playerHtml.includes('id="demoBootRetryBtn"'), 'Debe existir REINTENTAR.');
assert(playerHtml.includes('id="demoBootBackBtn"'), 'Debe existir VOLVER A DEMO.');
assert(playerHtml.includes('online-room-player.js?v=2.7.0'), 'Debe invalidarse la caché del JS del jugador.');

console.log('PRUEBA TIMEOUT/REINTENTO VISUAL DE DEMO: OK');
