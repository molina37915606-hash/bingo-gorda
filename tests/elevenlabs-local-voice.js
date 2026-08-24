const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const voice=fs.readFileSync(path.join(root,'js','bingo-voice.js'),'utf8');
const player=fs.readFileSync(path.join(root,'js','player.js'),'utf8');
const tv=fs.readFileSync(path.join(root,'js','tv.js'),'utf8');
const transmission=fs.readFileSync(path.join(root,'js','transmision.js'),'utf8');
const community=fs.readFileSync(path.join(root,'js','community-tools.js'),'utf8');
const admin=fs.readFileSync(path.join(root,'js','admin.js'),'utf8');
const must=(ok,msg)=>{if(!ok){console.error('VOZ NAVEGADOR FAIL:',msg);process.exit(1)}};
must(voice.includes('SpeechSynthesisUtterance')&&voice.includes('speechSynthesis'),'el motor debe usar Web Speech / voz del navegador');
must(voice.includes("utterance.lang = 'es-AR'")&&voice.includes("name(v).includes('google')"),'debe priorizar voz Google española cuando esté disponible');
must(!voice.includes('fetch(')&&!voice.includes('decodeAudioData')&&!voice.includes('new Audio('),'el motor no debe descargar ni reproducir MP3');
must(voice.includes('playBall(number, mode = 90')&&voice.includes('playFinal(options = {})'),'debe conservar la API BingoVoice');
const sandbox={window:{speechSynthesis:{getVoices:()=>[],addEventListener(){},cancel(){},speak(){}},SpeechSynthesisUtterance:function(t){this.text=t}},console,setTimeout};
vm.runInNewContext(voice,sandbox);const api=sandbox.window.BingoVoice;
must(api&&typeof api.create==='function'&&api.eventText('inicio_bienvenida').includes('Bingo de la Gorda'),'API de voz incompleta');
for(const [type,mode,prizeNumber] of [['ambo',90,1],['line',90,1],['line',90,2],['doubleLine',75,1],['tripleLine',75,1],['corners',75,1],['bingo',90,1]]){
  must(api.prizeEvent(type,{mode,prizeNumber,confirmed:true}),'mapeo de premio incompleto');
}
must(player.includes('window.BingoVoice')&&player.includes('playConfirmed')&&player.includes('playFinal'),'Jugador debe seguir usando la API compartida');
must(tv.includes('window.BingoVoice')&&transmission.includes('window.BingoVoice'),'TV y Transmisión deben seguir usando la API compartida');
must(admin.includes('window.BingoVoice')&&admin.includes('playBall(42,90)'),'Admin debe conservar prueba de voz');
must(community.includes('window.BingoVoice')&&community.includes('browserSpeak(number)'),'Comunidad debe conservar compatibilidad con Bolillero Libre');
for(const page of ['player.html','tv.html','transmision.html','comunidad.html','admin.html','evento-tv.html','evento-transmision.html']){
  const html=fs.readFileSync(path.join(root,page),'utf8');
  must(html.includes('bingo-voice.js?v=google-tts-v1-20260824'),`${page} debe forzar la nueva versión de voz`);
}
console.log('PRUEBA VOZ NAVEGADOR / GOOGLE TTS · SIN MP3 EN RUNTIME: OK');
