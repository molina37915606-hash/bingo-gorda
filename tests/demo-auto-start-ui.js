'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const player = fs.readFileSync(path.join(__dirname, '..', 'js', 'online-room-player.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'jugador.html'), 'utf8');

assert(!player.includes('>COMENZAR DEMO</button>'), 'La demo no debe depender de un botón COMENZAR DEMO.');
assert(player.includes('demoTutorialResolved()'), 'Debe comprobar que el tutorial terminó o fue salteado.');
assert(player.includes('demoAutoStartEligible()'), 'Debe existir una condición explícita de inicio automático seguro.');
assert(player.includes('this.demoAutoStartDeadline = Date.now() + 5000'), 'La cuenta automática debe durar 5 segundos.');
assert(player.includes("this.state.player.nameSet && this.state.player.selectionConfirmed"), 'No debe iniciar antes de nombre y cartones confirmados.');
assert(player.includes("!this.guideOpen"), 'No debe iniciar mientras el tutorial está abierto.');
assert(player.includes("timeoutMs:6500, retries:1"), 'El arranque debe tener timeout y un reintento de red.');
assert(player.includes('No pudimos iniciar la demo'), 'Un fallo debe mostrar un estado recuperable.');
assert(player.includes('id="demoStartRetryBtn"'), 'Debe existir REINTENTAR si falla el inicio.');
assert(player.includes('La demo comienza en'), 'La espera debe explicar claramente la cuenta regresiva.');
assert(html.includes('online-room-player.js?v=2.8.0'), 'El jugador debe invalidar caché con la versión 2.8.0.');

console.log('PRUEBA INICIO AUTOMÁTICO DEMO: OK');
