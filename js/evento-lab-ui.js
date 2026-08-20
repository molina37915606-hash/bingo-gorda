(() => {
'use strict';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const ADMIN_KEY = 'bingoOnlineAdminToken:owner';
const DB_NAME = 'lgEventoLab';
const DB_STORE = 'kv';
const SPONSOR_KEY = 'sponsors';
const TOP_TEXT_KEY = 'evento_lab_top_text';
const POSITION_KEY = 'evento_lab_sponsor_position';

let sponsors = [];
let sponsorIndex = 0;
let sponsorTimer = null;
let labState = null;
let community = null;
let lot = null;
let cards = [];
let syncTimer = null;
let previewObserver = null;
let sponsorSourceLoaded = false;

function notify(text){
  const h=$('toast');
  if(!h) return;
  h.textContent=text;
  h.classList.add('show');
  clearTimeout(notify.t);
  notify.t=setTimeout(()=>h.classList.remove('show'),2600);
}

function adminToken(){
  return sessionStorage.getItem(ADMIN_KEY)||'';
}

async function adminFetch(url,opt={}){
  const token=adminToken();
  const headers={...(opt.body?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{})};
  const response=await fetch(url,{...opt,headers:{...headers,...(opt.headers||{})},cache:'no-store'});
  const type=response.headers.get('content-type')||'';
  const data=type.includes('application/json')?await response.json():null;
  if(!response.ok) throw new Error(data?.error||`Error ${response.status}`);
  return data;
}

function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE,{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function dbGet(key){
  try{
    const db=await openDb();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,'readonly');
      const req=tx.objectStore(DB_STORE).get(key);
      req.onsuccess=()=>resolve(req.result?.value);
      req.onerror=()=>reject(req.error);
    });
  }catch{return null}
}

async function dbPut(key,value){
  const db=await openDb();
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction(DB_STORE,'readwrite');
    tx.objectStore(DB_STORE).put({key,value,updatedAt:new Date().toISOString()});
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}

function uid(){
  if(globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `sp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function imageData(file,maxW=1200,maxH=500){
  if(!file?.type?.startsWith('image/')) throw new Error('Elegí una imagen.');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{
      const node=new Image();
      node.onload=()=>resolve(node);
      node.onerror=reject;
      node.src=url;
    });
    const scale=Math.min(maxW/img.naturalWidth,maxH/img.naturalHeight,1);
    const w=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');
    canvas.width=maxW;
    canvas.height=maxH;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#08050e';
    ctx.fillRect(0,0,maxW,maxH);
    ctx.drawImage(img,(maxW-w)/2,(maxH-h)/2,w,h);
    return canvas.toDataURL('image/webp',.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function injectStyles(){
  if($('eventoLabUiStyles')) return;
  const style=document.createElement('style');
  style.id='eventoLabUiStyles';
  style.textContent=`
    #sponsorGrid.eventUnlimited{grid-template-columns:1fr 1fr;max-height:240px;overflow:auto;padding-right:2px}
    .eventSponsorItem{display:grid;grid-template-columns:108px minmax(0,1fr);gap:7px;align-items:center;padding:7px;border:1px solid var(--line);border-radius:9px;background:var(--p3)}
    .eventSponsorItem .thumb{width:108px;aspect-ratio:12/5;margin:0}
    .eventSponsorItem .spBody{min-width:0;display:grid;gap:5px}
    .eventSponsorItem .spHead{display:flex;justify-content:space-between;gap:6px;align-items:center}
    .eventSponsorItem .spHead label{font-size:10px;font-weight:900}
    .eventSponsorItem input[type=text]{width:100%;background:#0c0910;color:#fff;border:1px solid var(--line);border-radius:8px;padding:7px;font-size:10px}
    .eventSponsorItem .spActions{display:flex;gap:5px;align-items:center}
    .eventSponsorItem .spActions .btn{padding:5px 7px;font-size:9px}
    #addSponsor{width:100%;margin:6px 0 0}
    #preview.preview{display:grid!important;grid-template-columns:28% 72%!important;grid-template-rows:14% minmax(0,1fr) 12% 25%!important;padding:1.25%!important;gap:1.2%!important}
    #preview .eventPvTop{grid-column:1/-1;display:grid;grid-template-columns:16% minmax(0,1fr) 16%;align-items:center;gap:10px;min-height:0}
    #preview .eventPvBrand{min-width:0;display:flex;align-items:center;gap:8px}
    #preview .pvLogo{position:static!important;left:auto!important;height:58px!important;width:58px!important;max-width:58px!important;object-fit:contain}
    #preview .eventPvEvent{font-size:clamp(8px,.9vw,14px);font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #preview .eventPvTopText{text-align:center;font-size:clamp(13px,2vw,30px);font-weight:1000;color:#ffe08d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #preview .eventPvLive{text-align:right;color:#81f0b6;font-size:clamp(8px,.8vw,12px);font-weight:1000}
    #preview .eventPvLeft{grid-column:1;grid-row:2;min-height:0;display:grid;grid-template-rows:minmax(0,1fr) auto auto;place-items:center;gap:5px}
    #preview .pvBall{width:min(72%,230px)!important;font-size:clamp(44px,7vw,108px)!important}
    #preview .eventPvCount{font-size:clamp(8px,.75vw,12px);font-weight:850;color:#d8cddd}
    #preview .eventPvRecent{display:flex;justify-content:center;gap:4px;max-width:100%;overflow:hidden}
    #preview .eventPvRecent i{width:clamp(20px,2vw,31px);height:clamp(20px,2vw,31px);border-radius:50%;display:grid;place-items:center;background:#2a1731;border:1px solid #ffffff20;font-style:normal;font-size:clamp(7px,.7vw,10px);font-weight:950}
    #preview .pvBoard{grid-column:2;grid-row:2;display:grid!important;grid-template-columns:repeat(15,minmax(0,1fr));grid-auto-rows:minmax(0,1fr);gap:3px;align-content:stretch!important;min-height:0}
    #preview .pvNum{aspect-ratio:auto!important;border-radius:6px;font-size:clamp(7px,.8vw,13px)}
    #preview .eventPvSponsor{grid-column:1/-1;grid-row:3;display:flex;align-items:center;justify-content:center;min-height:0;border:1px solid #ffffff13;border-radius:8px;background:#08050d88;overflow:hidden}
    #preview .eventPvSponsor img{height:92%;max-width:64%;object-fit:contain}
    #preview .eventPvSponsor span{font-size:clamp(7px,.7vw,10px);font-weight:900;color:#d8cddd;margin-left:7px}
    #preview.pos-top .eventPvSponsor{position:absolute;top:1.2%;right:1.2%;width:22%;height:10%;z-index:3;grid-column:auto;grid-row:auto}
    #preview.pos-hidden .eventPvSponsor{display:none}
    #preview #pvSponsor{display:none!important}
    #preview .eventPvClosest{grid-column:1/-1;grid-row:4;display:grid;grid-template-rows:auto minmax(0,1fr);gap:3px;min-height:0}
    #preview .eventPvClosestHead{display:flex;justify-content:space-between;gap:8px;font-size:clamp(7px,.7vw,10px);font-weight:950;color:#dbcfe0}
    #preview .eventPvCards{min-height:0;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}
    #preview .eventPvCard{min-width:0;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:2px;padding:4px;border:1px solid #ffffff18;border-radius:7px;background:#130c18;overflow:hidden}
    #preview .eventPvCard b{font-size:clamp(6px,.55vw,9px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #preview .eventPvCard small{font-size:clamp(5px,.5vw,8px);color:#f1cc65;white-space:nowrap}
    #preview .eventMiniGrid{min-height:0;display:grid;gap:1px}
    #preview .eventMiniGrid.m75{grid-template-columns:repeat(5,1fr)}
    #preview .eventMiniGrid.m90{grid-template-columns:repeat(9,1fr)}
    #preview .eventMiniGrid i{display:grid;place-items:center;min-width:0;min-height:0;background:#f5f1f7;color:#211426;font-style:normal;font-size:clamp(4px,.42vw,7px);font-weight:950}
    #preview .eventMiniGrid i.blank{background:#24162b;color:transparent}
    #preview .eventMiniGrid i.hit{background:#f1ca55;color:#231500}
    @media(max-width:900px){
      #sponsorGrid.eventUnlimited{grid-template-columns:1fr}
      .eventSponsorItem{grid-template-columns:92px minmax(0,1fr)}
      .eventSponsorItem .thumb{width:92px}
    }`;
  document.head.appendChild(style);
}

function installTopText(){
  if($('eventTopText')) return;
  const title=$('eventTitle');
  if(!title) return;
  const field=document.createElement('label');
  field.className='field';
  field.innerHTML='<span>TEXTO SUPERIOR DE LA TRANSMISIÓN</span><input id="eventTopText" maxlength="80" placeholder="BINGO SOLIDARIO · GRACIAS POR ACOMPAÑAR">';
  title.closest('.field')?.insertAdjacentElement('afterend',field);
  const input=$('eventTopText');
  input.value=localStorage.getItem(TOP_TEXT_KEY)||'';
  input.addEventListener('input',()=>{
    localStorage.setItem(TOP_TEXT_KEY,input.value.trim());
    renderPreviewExtras();
  });
}

function sponsorMarkup(item,index){
  return `<article class="eventSponsorItem" data-sp="${esc(item.id)}">
    <div class="thumb">${item.image?`<img src="${esc(item.image)}" alt="">`:'SIN IMAGEN'}</div>
    <div class="spBody">
      <div class="spHead"><label><input type="checkbox" data-enabled ${item.enabled!==false?'checked':''}> SPONSOR ${index+1}</label><button type="button" data-remove>QUITAR</button></div>
      <input type="text" data-label maxlength="50" value="${esc(item.label||'')}" placeholder="Nombre del sponsor">
      <div class="spActions"><label class="btn">CARGAR IMAGEN<input type="file" data-file accept="image/jpeg,image/png,image/webp" hidden></label></div>
    </div>
  </article>`;
}

function renderSponsorEditor(){
  const host=$('sponsorGrid');
  if(!host) return;
  host.classList.add('eventUnlimited');
  host.innerHTML=sponsors.length?sponsors.map(sponsorMarkup).join(''):'<div class="status" style="grid-column:1/-1">Todavía no cargaste sponsors. Podés agregar todos los que necesites.</div>';
  host.querySelectorAll('[data-sp]').forEach(node=>{
    const item=sponsors.find(x=>x.id===node.dataset.sp);
    if(!item) return;
    node.querySelector('[data-enabled]').onchange=e=>{item.enabled=e.target.checked;restartSponsorRotation();renderPreviewExtras()};
    node.querySelector('[data-label]').oninput=e=>{item.label=e.target.value;renderPreviewExtras()};
    node.querySelector('[data-file]').onchange=async e=>{
      const file=e.target.files?.[0];
      if(!file) return;
      try{
        item.image=await imageData(file);
        renderSponsorEditor();
        restartSponsorRotation();
        renderPreviewExtras();
      }catch(error){notify(error.message)}
    };
    node.querySelector('[data-remove]').onclick=()=>{
      sponsors=sponsors.filter(x=>x.id!==item.id);
      renderSponsorEditor();
      restartSponsorRotation();
      renderPreviewExtras();
    };
  });
}

async function seedSponsors(){
  const stored=await dbGet(SPONSOR_KEY);
  if(Array.isArray(stored)){
    sponsors=stored.map(item=>({id:item.id||uid(),enabled:item.enabled!==false,label:String(item.label||''),image:String(item.image||'')}));
    sponsorSourceLoaded=true;
    return;
  }
  try{
    const data=await adminFetch('/api/admin/community');
    community=data;
    const list=data?.event?.sponsors||[];
    sponsors=list.filter(item=>item?.imageUrl||item?.label).map(item=>({id:uid(),enabled:item.enabled!==false,label:item.label||'',image:item.imageUrl||''}));
    sponsorSourceLoaded=true;
  }catch{
    sponsors=[];
  }
}

async function saveSponsors(){
  try{
    await dbPut(SPONSOR_KEY,sponsors);
    localStorage.setItem(POSITION_KEY,$('sponsorPosition')?.value||'bottom');
    notify(`${sponsors.length} sponsor${sponsors.length===1?'':'s'} guardado${sponsors.length===1?'':'s'} en el LAB.`);
    restartSponsorRotation();
    renderPreviewExtras();
  }catch(error){
    notify(error.message||'No se pudieron guardar los sponsors.');
  }
}

function installSponsorUi(){
  const host=$('sponsorGrid');
  if(!host) return;
  if(!$('legacySponsorCompat')){
    const compat=document.createElement('div');
    compat.id='legacySponsorCompat';
    compat.className='hidden';
    [...host.querySelectorAll('.sponsor')].forEach(node=>compat.appendChild(node));
    document.body.appendChild(compat);
  }
  const section=host.closest('.card');
  const heading=section?.querySelector('h3');
  if(heading) heading.textContent='3 · SPONSORS';
  if(!$('addSponsor')){
    const add=document.createElement('button');
    add.id='addSponsor';
    add.type='button';
    add.textContent='+ AGREGAR SPONSOR';
    add.onclick=()=>{
      sponsors.push({id:uid(),enabled:true,label:'',image:''});
      renderSponsorEditor();
      setTimeout(()=>host.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'}),30);
    };
    host.insertAdjacentElement('beforebegin',add);
  }
  renderSponsorEditor();
  const save=$('saveSponsors');
  if(save) save.onclick=saveSponsors;
  const position=$('sponsorPosition');
  if(position){
    const saved=localStorage.getItem(POSITION_KEY);
    if(saved&&['bottom','top','hidden'].includes(saved)) position.value=saved;
    position.addEventListener('change',()=>{
      localStorage.setItem(POSITION_KEY,position.value);
      renderPreviewExtras();
    });
  }
}

function buildPreview(){
  const preview=$('preview');
  if(!preview||preview.dataset.eventLayout==='1') return;
  preview.dataset.eventLayout='1';
  preview.innerHTML=`
    <div class="eventPvTop">
      <div class="eventPvBrand"><img id="pvLogo" class="pvLogo hidden" alt=""><div id="pvTitle" class="eventPvEvent">EVENTO</div></div>
      <div id="pvTopText" class="eventPvTopText">EVENTO EN VIVO</div>
      <div class="eventPvLive">● EN VIVO</div>
    </div>
    <div class="eventPvLeft">
      <div id="pvBall" class="pvBall">--</div>
      <div id="pvCountCustom" class="eventPvCount">0 bolillas</div>
      <div id="pvRecentCustom" class="eventPvRecent"></div>
    </div>
    <div id="pvBoard" class="pvBoard"></div>
    <div id="pvSponsorUnlimited" class="eventPvSponsor"></div>
    <section class="eventPvClosest">
      <div class="eventPvClosestHead"><span>6 CARTONES MÁS CERCA DEL PREMIO</span><span id="pvPrizeTarget">LÍNEA</span></div>
      <div id="pvCards" class="eventPvCards"></div>
    </section>
    <div id="pvSponsor" class="pvSponsor"></div>`;
}

function openBolilleroPreview(){
  const modal=$('previewModal');
  if(!modal) return;
  modal.classList.remove('hidden');
  document.body.classList.add('previewOpen');
  renderPreviewExtras();
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
  const playerCards=[];
  const seen=new Set();

  for(const row of rows){
    const button=row.querySelector('[data-view]');
    if(!button) continue;
    button.click();
    const card=readCurrentCard();
    if(card&&!seen.has(card.globalNumber)){
      seen.add(card.globalNumber);
      playerCards.push(card);
    }
  }

  const restore=document.querySelector(`#assignments [data-view="${originalNo}"]`);
  if(restore) restore.click();
  if(!playerCards.length) playerCards.push(original);

  const title=$('eventTitle')?.value.trim()||'EVENTO';
  const payload={v:1,title,name,mode:playerCards[0]?.mode||90,cards:playerCards,broadcastUrl:''};
  const url=`${location.origin}/assets/evento-jugar.html#${encodePayload(payload)}`;
  const win=window.open(url,'_blank','noopener');
  if(!win) notify('Permití ventanas emergentes para abrir la vista del jugador.');
}

function flattenLot(data){
  return (data?.series||[]).flatMap(series=>(series.cards||[]).map(card=>({
    ...card,
    globalNumber:Number(card.globalNumber)||0,
    mode:Number(card.mode)||Number(data.mode)||90
  }))).sort((a,b)=>a.globalNumber-b.globalNumber);
}

async function syncContext(){
  if(!adminToken()) return;
  try{
    community=await adminFetch('/api/admin/community');
    labState=await adminFetch('/api/admin/state');
    if(!sponsorSourceLoaded){
      const list=community?.event?.sponsors||[];
      sponsors=list.filter(item=>item?.imageUrl||item?.label).map(item=>({id:uid(),enabled:item.enabled!==false,label:item.label||'',image:item.imageUrl||''}));
      sponsorSourceLoaded=true;
      renderSponsorEditor();
      restartSponsorRotation();
    }
    const code=community?.event?.lotCode;
    if(code&&lot?.code!==code){
      const response=await fetch(`/api/community/cards/lot?lot=${encodeURIComponent(code)}`,{cache:'no-store'});
      const data=await response.json();
      if(response.ok){
        lot=data;
        cards=flattenLot(data);
      }
    }
    renderPreviewExtras();
  }catch{}
}

function assignmentsForLot(){
  const code=community?.event?.lotCode||lot?.code;
  if(!code) return {};
  try{return JSON.parse(localStorage.getItem(`evento_lab_assignments:${code}`)||'{}')||{}}catch{return {}}
}

function cardNumbers(card){
  return (card?.grid||[]).flat().filter(Number.isFinite);
}

function lineMissing(card,drawnSet){
  const values=(card?.grid||[]).map(row=>row.filter(Number.isFinite));
  if(!values.length) return 999;
  return Math.min(...values.map(row=>row.filter(n=>!drawnSet.has(n)).length));
}

function bingoMissing(card,drawnSet){
  return cardNumbers(card).filter(n=>!drawnSet.has(n)).length;
}

function closestAssigned(drawn){
  const assignments=assignmentsForLot();
  const assigned=cards.filter(card=>assignments[String(Number(card.globalNumber))]?.name);
  const set=new Set((drawn||[]).map(Number));
  const lineDone=assigned.some(card=>lineMissing(card,set)===0);
  const target=lineDone?'BINGO':'LÍNEA';
  const ranked=assigned.map(card=>{
    const line=lineMissing(card,set),bingo=bingoMissing(card,set);
    return {card,name:assignments[String(Number(card.globalNumber))]?.name||'',line,bingo,score:lineDone?bingo:line};
  }).sort((a,b)=>a.score-b.score||a.bingo-b.bingo||Number(a.card.globalNumber)-Number(b.card.globalNumber)).slice(0,6);
  return {target,ranked,set};
}

function miniCard(item,set){
  const mode=Number(item.card.mode)===75?75:90;
  const cells=(item.card.grid||[]).flat().map(value=>{
    if(!Number.isFinite(value)) return '<i class="blank">·</i>';
    return `<i class="${set.has(value)?'hit':''}">${value}</i>`;
  }).join('');
  const missing=item.score===0?'LISTO':`FALTA${item.score===1?'':'N'} ${item.score}`;
  return `<article class="eventPvCard"><b>${esc(item.name)} · #${String(item.card.globalNumber).padStart(3,'0')}</b><div class="eventMiniGrid m${mode}">${cells}</div><small>${missing}</small></article>`;
}

function drawnForPreview(){
  if(labState?.active&&labState?.roomSettings?.eventMode) return labState.game?.drawn||[];
  return [...document.querySelectorAll('#recent i')].map(node=>Number(node.textContent)).filter(Number.isFinite).reverse();
}

function renderPreviewCards(drawn){
  const host=$('pvCards');
  if(!host) return;
  const {target,ranked,set}=closestAssigned(drawn);
  const targetEl=$('pvPrizeTarget');
  if(targetEl) targetEl.textContent=target;
  const items=ranked.map(item=>miniCard(item,set));
  while(items.length<6) items.push('<article class="eventPvCard" style="place-items:center;color:#6f6475">—</article>');
  host.innerHTML=items.join('');
}

function activeSponsors(){
  return sponsors.filter(item=>item.enabled!==false&&item.image);
}

function restartSponsorRotation(){
  clearInterval(sponsorTimer);
  sponsorIndex=0;
  renderPreviewSponsor();
  const list=activeSponsors();
  if(list.length>1) sponsorTimer=setInterval(()=>{
    sponsorIndex=(sponsorIndex+1)%Math.max(1,activeSponsors().length);
    renderPreviewSponsor();
  },10000);
}

function renderPreviewSponsor(){
  const host=$('pvSponsorUnlimited');
  if(!host) return;
  const list=activeSponsors();
  if(!list.length){
    host.innerHTML='<span>ESPACIO PARA SPONSORS</span>';
    return;
  }
  sponsorIndex=((sponsorIndex%list.length)+list.length)%list.length;
  const item=list[sponsorIndex];
  host.innerHTML=`<img src="${esc(item.image)}" alt="${esc(item.label||'Sponsor')}">${item.label?`<span>${esc(item.label)}</span>`:''}`;
}

function renderPreviewExtras(){
  const preview=$('preview');
  if(!preview) return;
  const topText=$('eventTopText')?.value.trim()||localStorage.getItem(TOP_TEXT_KEY)||$('eventTitle')?.value.trim()||'EVENTO EN VIVO';
  if($('pvTopText')) $('pvTopText').textContent=topText;
  const position=$('sponsorPosition')?.value||localStorage.getItem(POSITION_KEY)||'bottom';
  preview.classList.remove('pos-top','pos-bottom','pos-hidden');
  preview.classList.add(`pos-${position}`);
  const drawn=drawnForPreview();
  const mode=$('pvBoard')?.children.length===75?75:($('pvBoard')?.children.length===90?90:Number($('eventMode')?.value)||90);
  if($('pvBoard')) $('pvBoard').style.gridTemplateColumns=`repeat(${mode===75?15:18},minmax(0,1fr))`;
  if($('pvRecentCustom')) $('pvRecentCustom').innerHTML=drawn.slice(-7).reverse().map(n=>`<i>${n}</i>`).join('');
  if($('pvCountCustom')) $('pvCountCustom').textContent=`${drawn.length} de ${mode} bolillas`;
  renderPreviewCards(drawn);
  renderPreviewSponsor();
}

async function openEventTransmission(){
  try{
    await syncContext();
    const url=labState?.broadcastUrl;
    if(!url) return notify('Primero prepará la sala real.');
    const alias=String(url).split('/').filter(Boolean).at(-1)||'';
    if(!alias) return notify('No se encontró el código de transmisión.');
    const assignments=assignmentsForLot();
    const payload={
      v:1,
      alias,
      title:community?.event?.title||$('eventTitle')?.value.trim()||'EVENTO',
      lotCode:community?.event?.lotCode||lot?.code||'',
      topText:$('eventTopText')?.value.trim()||localStorage.getItem(TOP_TEXT_KEY)||'',
      sponsorPosition:$('sponsorPosition')?.value||localStorage.getItem(POSITION_KEY)||'bottom',
      assignments
    };
    const win=window.open(`${location.origin}/assets/evento-transmision.html#${encodePayload(payload)}`,'_blank');
    if(!win) notify('Permití ventanas emergentes para abrir la transmisión.');
  }catch(error){
    notify(error.message||'No se pudo abrir la transmisión.');
  }
}

function observePreview(){
  const board=$('pvBoard');
  if(!board) return;
  previewObserver?.disconnect();
  previewObserver=new MutationObserver(()=>renderPreviewExtras());
  previewObserver.observe(board,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
}

async function bind(){
  injectStyles();
  installTopText();
  buildPreview();
  observePreview();
  await seedSponsors();
  installSponsorUi();
  restartSponsorRotation();
  await syncContext();

  $('openPreview')?.addEventListener('click',openBolilleroPreview);
  $('closePreview')?.addEventListener('click',closeBolilleroPreview);
  $('openPlayerPreview')?.addEventListener('click',openPlayerPreview);
  if($('openTx')) $('openTx').onclick=openEventTransmission;
  $('previewModal')?.addEventListener('click',e=>{if(e.target===$('previewModal')) closeBolilleroPreview()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape') closeBolilleroPreview()});
  syncTimer=setInterval(syncContext,2200);
  renderPreviewExtras();
}

window.addEventListener('beforeunload',()=>{
  clearInterval(sponsorTimer);
  clearInterval(syncTimer);
  previewObserver?.disconnect();
});

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>bind().catch(error=>notify(error.message)));
else bind().catch(error=>notify(error.message));
})();