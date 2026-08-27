'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'js','bingo-voice.js'),'utf8');
const spoken=[];const listeners={};
function Utterance(text){this.text=String(text);this.lang='';this.rate=1;this.pitch=1;this.volume=1;this.voice=null;this.onend=null;this.onerror=null;}
const window={
  LGI18N:{language:'es'},
  SpeechSynthesisUtterance:Utterance,
  speechSynthesis:{
    getVoices:()=>[
      {name:'Google español',lang:'es-AR'},
      {name:'Google português do Brasil',lang:'pt-BR'},
      {name:'Google US English',lang:'en-US'}
    ],
    addEventListener(){},cancel(){},
    speak(u){spoken.push({text:u.text,lang:u.lang,voice:u.voice?.lang||''});setTimeout(()=>u.onend?.(),0)}
  },
  addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn)},
  dispatchEvent(evt){for(const fn of listeners[evt.type]||[])fn(evt)}
};
const sandbox={window,localStorage:{getItem:()=>''},navigator:{language:'es-AR'},console,setTimeout,clearTimeout,CustomEvent:function(type,init){this.type=type;this.detail=init?.detail}};
vm.runInNewContext(code,sandbox);
const engine=window.BingoVoice.create({gapMs:0});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  for(const [language,expectedLocale,needle] of [
    ['es','es-AR','Bienvenidos'],
    ['pt','pt-BR','Bem-vindos'],
    ['en','en-US','Welcome']
  ]){
    spoken.length=0;window.LGI18N.language=language;window.dispatchEvent({type:'lg:languagechange',detail:{language}});
    engine.playEvent('inicio_bienvenida');await wait(10);
    assert(spoken.length,`Debe hablar en ${language}`);
    assert.equal(spoken[0].lang,expectedLocale,`Locale incorrecto para ${language}`);
    assert.equal(spoken[0].voice,expectedLocale,`Voz seleccionada incorrecta para ${language}`);
    assert(spoken[0].text.includes(needle),`Texto incorrecto para ${language}: ${spoken[0].text}`);
  }
  spoken.length=0;window.LGI18N.language='pt';window.dispatchEvent({type:'lg:languagechange'});engine.playBall(1,75);await wait(130);
  assert(spoken.length>=2,'Bingo 75 debe cantar letra y número');assert.equal(spoken[0].lang,'pt-BR');assert(spoken[0].text.includes('Bê'));
  spoken.length=0;window.LGI18N.language='en';window.dispatchEvent({type:'lg:languagechange'});engine.playPrize('corners',{mode:75,confirmed:true});await wait(10);
  assert.equal(spoken[0].lang,'en-US');assert(spoken[0].text.includes('Four corners'));
  console.log('VOZ INTERNACIONAL RUNTIME: OK · ES es-AR · PT pt-BR · ENG en-US');
})().catch(err=>{console.error(err);process.exitCode=1});
