const fs=require('fs');
function assert(cond,msg){if(!cond)throw new Error(msg)}
const playerHtml=fs.readFileSync('player.html','utf8');
const playerJs=fs.readFileSync('js/player.js','utf8');
const playerCss=fs.readFileSync('css/platform.css','utf8');
const adminHtml=fs.readFileSync('admin.html','utf8');
const adminJs=fs.readFileSync('js/admin.js','utf8');

assert(playerHtml.includes('id="chatVoiceBtn"'),'Jugador conserva el micrófono dentro del chat.');
assert(!playerHtml.includes('id="chatVoiceSend"'),'Jugador no debe mostrar un botón extra para enviar audio.');
assert(playerJs.includes("$('chatForm').onsubmit=e=>{e.preventDefault();this.submitChatComposer()}"),'La flecha normal del chat debe resolver texto o audio.');
assert(playerJs.includes('this.voiceSendAfterStop=true')&&playerJs.includes('queueMicrotask(()=>this.sendVoiceMessage())'),'La flecha debe poder enviar incluso mientras el micrófono sigue grabando.');
assert(playerJs.includes('duration=Math.min(maxDuration'),'La duración real debe recortarse al máximo para no fallar por milisegundos de demora del MediaRecorder.');
assert(playerJs.includes('voiceMessage voicePlayer')&&playerJs.includes('ensureChatAudioPlayer()'),'Los audios recibidos deben usar reproductor propio y persistente.');
assert(playerJs.includes('data-voice-seek')&&playerCss.includes('.voicePlayBtn')&&playerCss.includes('.voiceSeek'),'El reproductor debe tener Play/Pausa grande y barra de progreso táctil.');
assert(!playerJs.includes('<audio controls preload="metadata" src="/chat-audio/'),'El chat del jugador no debe recrear reproductores nativos en cada render.');
assert(playerHtml.includes('id="chatVoicePreviewPlay"')&&playerHtml.includes('id="chatVoicePreviewSeek"'),'El audio grabado debe poder escucharse fácilmente antes de enviarlo.');

assert(adminHtml.includes('id="adminVoiceBtn"'),'Admin conserva micrófono en su chat.');
assert(!adminHtml.includes('id="adminVoiceSend"'),'Admin tampoco debe tener un segundo botón de envío de audio.');
assert(adminJs.includes("$('adminChatSend').onclick=()=>this.submitAdminChatComposer()"),'El botón ENVIAR de Admin debe resolver texto o audio.');
assert(adminJs.includes('data-admin-voice-play')&&adminJs.includes('ensureAdminChatAudioPlayer()'),'Admin debe usar el reproductor estable para audios recibidos.');
assert(!adminJs.includes('<audio controls preload="metadata" src="/chat-audio/'),'Admin no debe recrear reproductores nativos del chat.');

console.log('OK community chat audio V9.2.10 · envío unificado + reproductor estable');
