const fs=require('fs'); const path=require('path'); const root=path.join(__dirname,'..');
const must=(ok,msg)=>{if(!ok){console.error('CUASIFINAL FAIL:',msg);process.exit(1)}};
const html=fs.readFileSync(path.join(root,'player.html'),'utf8');
const js=fs.readFileSync(path.join(root,'js/player.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/platform.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
['soundTool','voiceTool','numbersTool','winnersTool','helpTool','fullscreenTool','chatTool','modalBackdrop'].forEach(id=>must(html.includes(`id="${id}"`),`falta ${id}`));
['commonEmojis','stickers','openTutorial','openNumbers','openWinners','ballProgress','/api/player/acta.pdf','/api/player/integrity.txt'].forEach(x=>must(js.includes(x)||server.includes(x),`falta ${x}`));
must(css.includes('height:min(36dvh,300px)'), 'chat móvil no compacto');
must(css.includes('.ballStage'), 'bolilla moderna faltante');
must(server.includes("player.html"), 'servidor no usa la pantalla unificada');
must(server.includes("ensureUniqueVisibleCardNumbers"), 'no hay garantía adicional de numeración visible única');
console.log('PRUEBA CUASIFINAL UI: OK');

must(js.includes("get('previewSession')"),'El visor admin debe aceptar el token previewSession del servidor.');
must(server.includes("path.join(ROOT, 'player.html')"),'El visor admin debe reutilizar la misma pantalla del jugador.');
