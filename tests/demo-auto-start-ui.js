'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const player = fs.readFileSync(path.join(__dirname, '..', 'js', 'online-room-player.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'jugador.html'), 'utf8');

assert(!player.includes('>COMENZAR DEMO</button>'), 'La demo no debe depender de un botón COMENZAR DEMO.');
assert(player.includes("'/api/player/demo/tutorial'"), 'El tutorial debe avisar al servidor cuando termina o se salta.');
assert(player.includes("'/api/player/demo/retry'"), 'REINTENTAR debe volver a pedir el inicio al servidor.');
assert(server.includes('DEMO_READY_COUNTDOWN_MS'), 'La cuenta previa debe vivir en el servidor.');
assert(server.includes("flow.phase = 'countdown'"), 'El servidor debe representar explícitamente la cuenta regresiva.');
assert(server.includes('scheduleDemoStartCountdown'), 'El servidor debe programar el inicio de la demo.');
assert(server.includes('completeDemoStartCountdown'), 'El servidor debe completar el inicio sin depender del navegador.');
assert(server.includes('demo_server_start_requested'), 'El inicio del servidor debe quedar auditado.');
assert(player.includes('La cuenta la controla el servidor'), 'La interfaz debe explicar que el inicio ya no depende del navegador.');
assert(player.includes('No pudimos iniciar la demo'), 'Un fallo debe mostrar un estado recuperable.');
assert(player.includes('id="demoStartRetryBtn"'), 'Debe existir REINTENTAR si falla el inicio.');
assert(player.includes('La demo comienza en'), 'La espera debe explicar claramente la cuenta regresiva.');
assert(html.includes('online-room-player.js?v=3.1.0'), 'El jugador debe invalidar caché con la versión 3.1.0.');

console.log('PRUEBA INICIO DEMO CONTROLADO POR SERVIDOR: OK');
