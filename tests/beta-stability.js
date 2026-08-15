const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const player=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
const html=fs.readFileSync(path.join(root,'player.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css/platform.css'),'utf8');
const community=fs.readFileSync(path.join(root,'comunidad.html'),'utf8');
const must=(ok,msg)=>{if(!ok){console.error('BETA STABILITY FAIL:',msg);process.exit(1)}};

must(html.includes('id="playerShell"'),'La pantalla debe tener un shell permanente.');
must(html.indexOf('id="chatPanel"')>html.indexOf('</main>'),'El chat debe vivir fuera del main que re-renderiza el juego.');
must(!player.includes('appendChild(panel)'),'El chat no debe moverse con appendChild durante render.');
must(!player.includes('insertBefore(panel'),'El chat no debe moverse con insertBefore durante render.');
must(player.includes("shell.classList.toggle('gameDesktop'"),'El layout escritorio debe ser CSS/clases, no mover DOM.');
must(player.includes('Bolilla ${drawnArr.length} / ${total}'),'El progreso debe decir claramente Bolilla X / total.');
must(player.includes('showDrawn=isMarked||isDrawn&&(!manualMode||helpDue||!interactive)'),'Manual no debe mostrar una bolilla antes de la ayuda de 20 s.');
must(player.includes("this.manualHelpDue(n,marks)"),'Debe conservar la ayuda manual retardada.');
must(player.includes('class="ticketColumns"'),'75 bolas debe renderizar B-I-N-G-O.');
for(const c of ['bingo-b','bingo-i','bingo-n','bingo-g','bingo-o']){
  must(player.includes(c),`Falta clase ${c} en el cliente.`);
  must(css.includes(`.${c}`),`Falta estilo ${c}.`);
}
must(player.includes("total===75&&last!=null?this.bingoColumnClass(last)"),'La bolilla 75 debe tomar el color de su letra.');
must(player.includes("mode===75?'★':'LIBRE'"),'La casilla libre de 75 debe usar estrella.');
must(css.includes('.playerShell.gameDesktop')&&css.includes('.playerShell.gameMobile'),'Debe haber layouts específicos para PC y móvil.');
must(css.includes('grid-template-columns:minmax(0,1fr) 340px'),'PC debe reservar columna lateral para chat.');
must(!community.includes('id="communityThemeBtn"'),'Comunidad no debe ofrecer selector de tema.');
must(community.includes("document.documentElement.dataset.theme='night'"),'Comunidad debe forzar modo nocturno.');
must(!community.includes("localStorage.setItem('bingo_theme','night')"),'Comunidad no debe borrar la preferencia de tema del juego.');
console.log('PRUEBA BETA ESTABILIDAD UI: OK');
