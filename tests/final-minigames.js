const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
const js=fs.readFileSync(path.join(root,'js','community.js'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('/js/community.js?v=final-minijuegos-20260826'),'FINAL debe invalidar caché de community.js.');
ok(js.includes('dealerHand:[]'),'21 debe guardar la mano de La Gorda.');
ok(js.includes("mini.hand=[draw21Ball(),draw21Ball()]")&&js.includes("mini.dealerHand=[draw21Ball(),draw21Ball()]"),'21 debe repartir dos bolillas iniciales a ambos.');
ok(js.includes("if(mini.dealerTotal<=16)")&&js.includes("mini.dealerTotal>=17?'SE PLANTA CON 17+'"),'La Gorda debe pedir con 16 o menos y plantarse con 17 o más.');
ok(js.includes('data-mini-start="ghost_ball"')&&js.includes('data-mini-start="secret_number"')&&js.includes('data-mini-start="intruder_ball"'),'Los tres juegos deben tener INICIAR.');
ok(js.includes('function startIntruderCountdown()')&&js.includes('mini.countdown=3'),'Intrusa debe tener cuenta 3-2-1.');
ok(js.includes('function intruderRoundSeconds(){if(mini.score<3)return 6;if(mini.score<6)return 5;return 4}'),'Intrusa debe usar tiempos estables por nivel.');
ok(html.includes('intruderTimerBar')&&html.includes('final-minigames-polish'),'Intrusa debe tener temporizador visual.');
ok(html.includes('.cardIndex.top{left:5.5%;top:4.8%}')&&html.includes('.cardIndex.bottom{right:5.5%;bottom:4.8%'),'Los índices de carta deben quedar reposicionados.');
console.log('OK EL BINGO DE LA GORDA FINAL · minijuegos');
