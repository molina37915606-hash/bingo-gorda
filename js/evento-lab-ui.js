(() => {
'use strict';
const $ = id => document.getElementById(id);

function notify(text){
  const h=$('toast');
  if(!h) return;
  h.textContent=text;
  h.classList.add('show');
  clearTimeout(notify.t);
  notify.t=setTimeout(()=>h.classList.remove('show'),2600);
}

function openBolilleroPreview(){
  const modal=$('previewModal');
  if(!modal) return;
  modal.classList.remove('hidden');
  document.body.classList.add('previewOpen');
}

function closeBolilleroPreview(){
  const modal=$('previewModal');
  if(!modal) return;
  modal.classList.add('hidden');
  document.body.classList.remove('previewOpen');
}

function encodePayload(obj){
  const bytes=new TextEncoder().encode(JSON.stringify(obj));
  let bin='';
  bytes.forEach(b=>bin+=String.fromCharCode(b));
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function readCurrentCard(){
  const host=$('cardHost');
  const card=host?.querySelector('.bingoCard');
  if(!card) return null;
  const number=Number(card.querySelector('.cardNo')?.textContent?.trim());
  const cells=[...card.querySelectorAll('.cardCell')];
  if(!Number.isFinite(number)||!cells.length) return null;
  const cols=cells.length===27?9:5;
  const rows=Math.max(1,Math.round(cells.length/cols));
  const grid=[];
  for(let r=0;r<rows;r++){
    const row=[];
    for(let c=0;c<cols;c++){
      const cell=cells[r*cols+c];
      if(!cell||cell.classList.contains('blank')) row.push(null);
      else {
        const value=Number(cell.textContent.trim());
        row.push(Number.isFinite(value)?value:null);
      }
    }
    grid.push(row);
  }
  return {globalNumber:number,grid,mode:cols===9?90:75};
}

function currentOwner(){
  const first=$('cardHost')?.querySelector('.cardHead > div:first-child');
  if(!first) return '';
  const parts=[...first.children];
  return (parts[1]?.textContent||'').trim();
}

function openPlayerPreview(){
  const original=readCurrentCard();
  const name=currentOwner();
  if(!original) return notify('Primero seleccioná un cartón.');
  if(!name) return notify('Ese cartón todavía no está asignado a un participante.');

  const originalNo=original.globalNumber;
  const rows=[...document.querySelectorAll('#assignments .personRow')]
    .filter(row=>(row.children[1]?.textContent||'').trim().toLowerCase()===name.toLowerCase());
  const cards=[];
  const seen=new Set();

  for(const row of rows){
    const button=row.querySelector('[data-view]');
    if(!button) continue;
    button.click();
    const card=readCurrentCard();
    if(card&&!seen.has(card.globalNumber)){
      seen.add(card.globalNumber);
      cards.push(card);
    }
  }

  const restore=document.querySelector(`#assignments [data-view="${originalNo}"]`);
  if(restore) restore.click();
  if(!cards.length) cards.push(original);

  const title=$('eventTitle')?.value.trim()||'EVENTO';
  const payload={v:1,title,name,mode:cards[0]?.mode||90,cards,broadcastUrl:''};
  const url=`${location.origin}/assets/evento-jugar.html#${encodePayload(payload)}`;
  const win=window.open(url,'_blank','noopener');
  if(!win) notify('Permití ventanas emergentes para abrir la vista del jugador.');
}

function bind(){
  $('openPreview')?.addEventListener('click',openBolilleroPreview);
  $('closePreview')?.addEventListener('click',closeBolilleroPreview);
  $('openPlayerPreview')?.addEventListener('click',openPlayerPreview);
  $('previewModal')?.addEventListener('click',e=>{if(e.target===$('previewModal')) closeBolilleroPreview();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape') closeBolilleroPreview();});
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind);
else bind();
})();