(() => {
'use strict';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[ch]));
const ADMIN_KEY='bingoOnlineAdminToken:owner';
const DB_NAME='lgEventoLab';
const DB_STORE='kv';
const SPONSOR_KEY='sponsors';
const TOP_TEXT_KEY='evento_lab_top_text';
const LINE_PRIZE_KEY='evento_lab_line_prize';
const BINGO_PRIZE_KEY='evento_lab_bingo_prize';

let sponsors=[];
let sponsorIndex=0;
let sponsorTimer=null;
let labState=null;
let community=null;
let lot=null;
let cards=[];
let syncTimer=null;
let previewObserver=null;
let sponsorSourceLoaded=false;

function notify(text){
  const host=$('toast');
  if(!host)return;
  host.textContent=text;
  host.classList.add('show');
  clearTimeout(notify.t);
  notify.t=setTimeout(()=>host.classList.remove('show'),2600);
}
function adminToken(){return sessionStorage.getItem(ADMIN_KEY)||''}
async function adminFetch(url,opt={}){
  const token=adminToken();
  const headers={...(opt.body?{'Content-Type':'application/json'}:{}),...(token?{'X-Admin-Token':token}:{}),...(opt.headers||{})};
  const response=await fetch(url,{...opt,headers,cache:'no-store'});
  const type=response.headers.get('content-type')||'';
  const data=type.includes('application/json')?await response.json():null;
  if(!response.ok)throw new Error(data?.error||`Error ${response.status}`);
  return data;
}
function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(DB_STORE))req.result.createObjectStore(DB_STORE,{keyPath:'key'})};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function dbGet(key){
  try{
    const db=await openDb();
    return await new Promise((resolve,reject)=>{const req=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).get(key);req.onsuccess=()=>resolve(req.result?.value);req.onerror=()=>reject(req.error)});
  }catch{return null}
}
async function dbPut(key,value){
  const db=await openDb();
  return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put({key,value,updatedAt:new Date().toISOString()});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
}
function uid(){return globalThis.crypto?.randomUUID?crypto.randomUUID():`sp_${Date.now()}_${Math.random().toString(36).slice(2)}`}

async function imageData(file,maxW=1200,maxH=500){
  if(!file?.type?.startsWith('image/'))throw new Error('Elegí una imagen.');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const node=new Image();node.onload=()=>resolve(node);node.onerror=reject;node.src=url});
    const scale=Math.min(maxW/img.naturalWidth,maxH/img.naturalHeight,1),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    canvas.getContext('2d').drawImage(img,0,0,w,h);
    return canvas.toDataURL('image/webp',.86);
  }finally{URL.revokeObjectURL(url)}
}

function injectStyles(){
  if($('eventoLabUiStyles'))return;
  const style=document.createElement('style');style.id='eventoLabUiStyles';
  style.textContent=`
  #sponsorGrid.eventUnlimited{grid-template-columns:1fr 1fr;max-height:226px;overflow:auto;padding-right:2px}
  .eventSponsorItem{display:grid;grid-template-columns:96px minmax(0,1fr);gap:7px;align-items:center;padding:7px;border:1px solid var(--line);border-radius:9px;background:var(--p3)}
  .eventSponsorItem .thumb{width:96px;aspect-ratio:12/5;margin:0;background:transparent}.eventSponsorItem .thumb img{background:transparent}
  .eventSponsorItem .spBody{min-width:0;display:grid;gap:5px}.eventSponsorItem .spHead{display:flex;justify-content:space-between;gap:5px;align-items:center}
  .eventSponsorItem .spHead label{font-size:9px;font-weight:900}.eventSponsorItem input[type=text]{width:100%;background:#0c0910;color:#fff;border:1px solid var(--line);border-radius:8px;padding:6px;font-size:9px}
  .eventSponsorItem .spActions{display:flex;gap:5px}.eventSponsorItem .spActions .btn,.eventSponsorItem button{padding:5px 6px;font-size:8px}#addSponsor{width:100%;margin:5px 0 0}
  .eventMarqueeControl,.eventPrizeControl{margin-top:7px}.eventMarqueeRow{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:5px}.eventMarqueeRow input{min-width:0;width:100%;background:var(--p3);color:#fff;border:1px solid var(--line);border-radius:8px;padding:8px}.eventMarqueeRow button{white-space:nowrap}
  .eventPrizeGrid{display:grid;grid-template-columns:1fr 1fr;gap:5px}.eventPrizeGrid label{display:grid;gap:3px;min-width:0}.eventPrizeGrid label span{font-size:8px;font-weight:950;color:var(--mut)}.eventPrizeGrid input{min-width:0;width:100%;background:var(--p3);color:#fff;border:1px solid var(--line);border-radius:8px;padding:8px}.eventPrizeActions{display:flex;gap:5px;margin-top:5px}.eventPrizeActions button{flex:1}
  #preview.preview{display:grid!important;grid-template-columns:29% 71%!important;grid-template-rows:17% 36% 8% 34%!important;grid-template-areas:'logo marquee' 'ball board' 'recent board' 'sponsors bottom'!important;padding:1%!important;gap:1%!important;background:radial-gradient(circle at 16% 34%,#67206455,transparent 30%),linear-gradient(145deg,#210d2a,#08050d 72%)!important}
  #preview .eventPvLogoBox{grid-area:logo;min-height:0;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #ffffff18;border-radius:12px;background:linear-gradient(145deg,#160d1dcc,#0b0710cc);overflow:hidden;padding:7px;box-shadow:inset 0 1px 0 #ffffff0d}
  #preview .pvLogo{position:static!important;left:auto!important;width:auto!important;height:76%!important;max-width:48%!important;object-fit:contain!important;background:transparent!important;filter:drop-shadow(0 4px 10px #0008)!important}
  #preview .eventPvEvent{min-width:0;font-size:clamp(7px,.78vw,12px);font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #preview .eventPvMarquee{grid-area:marquee;min-height:0;display:flex;align-items:center;justify-content:center;position:relative;border:1px solid #f2c95d30;border-radius:12px;background:linear-gradient(180deg,#17101cdd,#0d0911dd);overflow:hidden;padding:5px 42px 5px 8px;box-shadow:inset 0 1px 0 #ffffff0d}
  #preview .eventPvTopText{width:100%;text-align:center;font-size:clamp(10px,1.25vw,20px);font-weight:1000;color:#ffe18a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.eventPvLive{position:absolute;right:7px;top:6px;color:#67dda1;font-size:clamp(5px,.55vw,8px);font-weight:1000}
  #preview .eventPvBallBox{grid-area:ball;min-height:0;display:grid;grid-template-rows:20px minmax(0,1fr) 18px;place-items:center;gap:4px;border:1px solid #ffffff18;border-radius:12px;background:linear-gradient(145deg,#17101dcc,#0b0710dd);padding:8px 6px;box-shadow:inset 0 1px 0 #ffffff0c}
  #preview .eventPvBallLabel{font-size:clamp(6px,.62vw,9px);font-weight:950;color:#d9cedd;letter-spacing:.09em;align-self:center}
  #preview .pvBall{width:min(46%,154px)!important;max-height:92%!important;aspect-ratio:1!important;font-size:clamp(30px,4.3vw,66px)!important;border-width:3px!important;box-shadow:0 9px 25px #0008,0 0 24px #a4379630!important}
  #preview .eventPvCount{font-size:clamp(6px,.62vw,9px);font-weight:850;color:#d6cad9;align-self:center}
  #preview .eventPvRecentBox{grid-area:recent;min-height:0;display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.eventPvRecentBox i{display:grid;place-items:center;min-width:0;min-height:0;border-radius:7px;background:linear-gradient(145deg,#7b206f,#591650);border:1px solid #c467bb88;font-style:normal;font-size:clamp(6px,.7vw,11px);font-weight:1000;box-shadow:inset 0 1px 0 #ffffff12}.eventPvRecentBox i.empty{background:#17101ccc;border-color:#ffffff18;color:#63596a}
  #preview .eventPvSponsor{grid-area:sponsors;min-height:0;position:relative;display:grid;grid-template-rows:auto minmax(0,1fr) auto;place-items:center;gap:5px;border:1px solid #f2c95d2b;border-radius:12px;background:linear-gradient(145deg,#2c16305c,#0a0710cc);overflow:hidden;padding:8px;box-shadow:inset 0 1px 0 #ffffff10,0 10px 30px #0004;backdrop-filter:blur(8px)}
  #preview .eventPvSponsor:before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 25% 20%,#9d3b8c22,transparent 45%),linear-gradient(180deg,#ffffff08,transparent 45%);pointer-events:none}
  #preview .eventPvSponsorTitle{position:relative;z-index:1;font-size:clamp(6px,.65vw,9px);font-weight:1000;color:#f2cc65;letter-spacing:.08em}
  #preview .eventPvSponsor img{position:relative;z-index:1;width:88%;height:86%;max-height:100%;min-height:0;object-fit:contain;background:#ffffff0a;border:1px solid #ffffff16;border-radius:10px;padding:7px;box-shadow:0 8px 22px #0006,inset 0 1px 0 #ffffff14}
  #preview .eventPvSponsor span{position:relative;z-index:1;max-width:90%;font-size:clamp(5px,.55vw,8px);font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#eee4f0}
  #preview .pvBoard{grid-area:board!important;min-height:0;display:grid!important;gap:3px!important;align-content:stretch!important;padding:5px;border:1px solid #ffffff18;border-radius:12px;background:linear-gradient(145deg,#100a15,#0b0710);box-shadow:inset 0 1px 0 #ffffff0b}.pvNum{aspect-ratio:auto!important;border-radius:5px!important;font-size:clamp(6px,.68vw,11px)!important}.pvNum.hit{background:#8b217f!important;border-color:#e17bd5!important}.pvNum.lastHit{background:#f2c95d!important;color:#241600!important;border-color:#fff0a0!important}
  #preview .eventPvBottom{grid-area:bottom;min-height:0;display:grid;grid-template-columns:35% minmax(0,1fr);gap:1%}.eventPvPot{min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;place-items:center;border:1px solid #ffffff18;border-radius:12px;background:linear-gradient(145deg,#15101a,#0b0710);padding:6px;box-shadow:inset 0 1px 0 #ffffff0b;text-align:center}.eventPvPot b{font-size:clamp(8px,.9vw,14px);color:#f4d477}.eventPvPotValue{max-width:94%;font-size:clamp(15px,2.2vw,34px);font-weight:1000;line-height:1.05;overflow-wrap:anywhere}.eventPvPotValue.long{font-size:clamp(11px,1.55vw,24px)}.eventPvPotValue.xlong{font-size:clamp(8px,1.15vw,18px)}.eventPvPot small{font-size:clamp(5px,.55vw,8px);color:#b9adbe;font-weight:900}
  #preview .eventPvClosest{min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:3px}.eventPvClosestHead{display:flex;justify-content:space-between;gap:5px;font-size:clamp(5px,.55vw,8px);font-weight:950}.eventPvCards{min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:4px}.eventPvCard{min-width:0;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:1px;padding:3px;border:1px solid #ffffff18;border-radius:7px;background:linear-gradient(145deg,#17101e,#110b16);overflow:hidden}.eventPvCard b{font-size:clamp(4px,.43vw,7px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.eventPvCard small{font-size:clamp(4px,.4vw,6px);color:#f1cc65;white-space:nowrap}.eventMiniGrid{min-height:0;display:grid;gap:1px}.eventMiniGrid.m75{grid-template-columns:repeat(5,1fr)}.eventMiniGrid.m90{grid-template-columns:repeat(9,1fr)}.eventMiniGrid i{display:grid;place-items:center;min-width:0;min-height:0;background:#f5f1f7;color:#211426;font-style:normal;font-size:clamp(3px,.31vw,5px);font-weight:950}.eventMiniGrid i.blank{background:#24162b;color:transparent}.eventMiniGrid i.hit{background:#f1ca55;color:#231500}
  #preview #pvSponsor{display:none!important}
  @media(max-width:900px){#sponsorGrid.eventUnlimited{grid-template-columns:1fr}.eventSponsorItem{grid-template-columns:86px minmax(0,1fr)}.eventSponsorItem .thumb{width:86px}.eventPrizeGrid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function installMarqueeControl(){
  if($('eventTopText'))return;
  const sortCard=$('previewReset')?.closest('.card');if(!sortCard)return;
  const firstRow=sortCard.querySelector(':scope > .row');
  const box=document.createElement('div');box.className='controlBlock eventMarqueeControl';
  box.innerHTML='<h4>MARQUESINA · TRANSMISIÓN</h4><div class="eventMarqueeRow"><input id="eventTopText" maxlength="120" placeholder="Teléfono · premios · agradecimientos · información"><button id="updateMarquee" class="primary" type="button">ACTUALIZAR</button><button id="clearMarquee" type="button">LIMPIAR</button></div>';
  firstRow?.insertAdjacentElement('afterend',box);
  const input=$('eventTopText');input.value=localStorage.getItem(TOP_TEXT_KEY)||'';
  const apply=()=>{localStorage.setItem(TOP_TEXT_KEY,input.value.trim());renderPreviewExtras();notify('Marquesina actualizada.')};
  $('updateMarquee').onclick=apply;
  $('clearMarquee').onclick=()=>{input.value='';localStorage.removeItem(TOP_TEXT_KEY);renderPreviewExtras();notify('Marquesina limpia.')};
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply()}});
}

function installPrizeControl(){
  if($('linePrizeText'))return;
  const marquee=$('.eventMarqueeControl')||$('previewReset')?.closest('.card')?.querySelector('.eventMarqueeControl');
  const sortCard=$('previewReset')?.closest('.card');if(!sortCard)return;
  const box=document.createElement('div');box.className='controlBlock eventPrizeControl';
  box.innerHTML='<h4>PREMIOS · TEXTO LIBRE</h4><div class="eventPrizeGrid"><label><span>PREMIO DE LÍNEA</span><input id="linePrizeText" maxlength="140" placeholder="Ej.: Vale de compra por $50.000"></label><label><span>PREMIO DE BINGO</span><input id="bingoPrizeText" maxlength="140" placeholder="Ej.: Smart TV 43 pulgadas"></label></div><div class="eventPrizeActions"><button id="updatePrizes" class="primary" type="button">ACTUALIZAR PREMIOS</button><button id="clearPrizes" type="button">LIMPIAR</button></div>';
  if(marquee)marquee.insertAdjacentElement('afterend',box);else sortCard.querySelector(':scope > .row')?.insertAdjacentElement('afterend',box);
  const line=$('linePrizeText'),bingo=$('bingoPrizeText');
  line.value=localStorage.getItem(LINE_PRIZE_KEY)||'';bingo.value=localStorage.getItem(BINGO_PRIZE_KEY)||'';
  const apply=()=>{localStorage.setItem(LINE_PRIZE_KEY,line.value.trim());localStorage.setItem(BINGO_PRIZE_KEY,bingo.value.trim());renderPreviewExtras();notify('Premios actualizados.')};
  $('updatePrizes').onclick=apply;
  $('clearPrizes').onclick=()=>{line.value='';bingo.value='';localStorage.removeItem(LINE_PRIZE_KEY);localStorage.removeItem(BINGO_PRIZE_KEY);renderPreviewExtras();notify('Premios limpios.')};
  [line,bingo].forEach(input=>input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply()}}));
}

function sponsorMarkup(item,index){
  return `<article class="eventSponsorItem" data-sp="${esc(item.id)}"><div class="thumb">${item.image?`<img src="${esc(item.image)}" alt="">`:'SIN IMAGEN'}</div><div class="spBody"><div class="spHead"><label><input type="checkbox" data-enabled ${item.enabled!==false?'checked':''}> SPONSOR ${index+1}</label><button type="button" data-remove>QUITAR</button></div><input type="text" data-label maxlength="50" value="${esc(item.label||'')}" placeholder="Nombre"><div class="spActions"><label class="btn">CARGAR IMAGEN<input type="file" data-file accept="image/jpeg,image/png,image/webp" hidden></label></div></div></article>`;
}
function renderSponsorEditor(){
  const host=$('sponsorGrid');if(!host)return;host.classList.add('eventUnlimited');
  host.innerHTML=sponsors.length?sponsors.map(sponsorMarkup).join(''):'<div class="status" style="grid-column:1/-1">Todavía no cargaste sponsors. Podés agregar todos los que necesites.</div>';
  host.querySelectorAll('[data-sp]').forEach(node=>{
    const item=sponsors.find(x=>x.id===node.dataset.sp);if(!item)return;
    node.querySelector('[data-enabled]').onchange=e=>{item.enabled=e.target.checked;restartSponsorRotation();renderPreviewExtras()};
    node.querySelector('[data-label]').oninput=e=>{item.label=e.target.value;renderPreviewExtras()};
    node.querySelector('[data-file]').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{item.image=await imageData(file);renderSponsorEditor();restartSponsorRotation();renderPreviewExtras()}catch(error){notify(error.message)}};
    node.querySelector('[data-remove]').onclick=()=>{sponsors=sponsors.filter(x=>x.id!==item.id);renderSponsorEditor();restartSponsorRotation();renderPreviewExtras()};
  });
}
async function seedSponsors(){
  const stored=await dbGet(SPONSOR_KEY);
  if(Array.isArray(stored)){sponsors=stored.map(item=>({id:item.id||uid(),enabled:item.enabled!==false,label:String(item.label||''),image:String(item.image||'')}));sponsorSourceLoaded=true;return}
  try{const data=await adminFetch('/api/admin/community');community=data;const list=data?.event?.sponsors||[];sponsors=list.filter(item=>item?.imageUrl||item?.label).map(item=>({id:uid(),enabled:item.enabled!==false,label:item.label||'',image:item.imageUrl||''}));sponsorSourceLoaded=true}catch{sponsors=[]}
}
async function saveSponsors(){
  try{await dbPut(SPONSOR_KEY,sponsors);notify(`${sponsors.length} sponsor${sponsors.length===1?'':'s'} guardado${sponsors.length===1?'':'s'}.`);restartSponsorRotation();renderPreviewExtras()}catch(error){notify(error.message||'No se pudieron guardar los sponsors.')}
}
function installSponsorUi(){
  const host=$('sponsorGrid');if(!host)return;
  if(!$('legacySponsorCompat')){const compat=document.createElement('div');compat.id='legacySponsorCompat';compat.className='hidden';[...host.querySelectorAll('.sponsor')].forEach(node=>compat.appendChild(node));document.body.appendChild(compat)}
  const position=$('sponsorPosition');if(position){position.value='bottom';position.closest('.field')?.classList.add('hidden')}
  if(!$('addSponsor')){const add=document.createElement('button');add.id='addSponsor';add.type='button';add.textContent='+ AGREGAR SPONSOR';add.onclick=()=>{sponsors.push({id:uid(),enabled:true,label:'',image:''});renderSponsorEditor();setTimeout(()=>host.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'}),30)};host.insertAdjacentElement('beforebegin',add)}
  renderSponsorEditor();if($('saveSponsors'))$('saveSponsors').onclick=saveSponsors;
}

function buildPreview(){
  const preview=$('preview');if(!preview||preview.dataset.eventLayout==='2')return;preview.dataset.eventLayout='2';
  preview.innerHTML=`
    <section class="eventPvLogoBox"><img id="pvLogo" class="pvLogo hidden" alt="Logo del evento"><div id="pvTitle" class="eventPvEvent">EVENTO</div></section>
    <section class="eventPvMarquee"><div id="pvTopText" class="eventPvTopText">EVENTO EN VIVO</div><div class="eventPvLive">● EN VIVO</div></section>
    <section class="eventPvBallBox"><div class="eventPvBallLabel">ÚLTIMA BOLILLA</div><div id="pvBall" class="pvBall">--</div><div id="pvCountCustom" class="eventPvCount">0 de 90</div></section>
    <div id="pvRecentCustom" class="eventPvRecentBox"></div>
    <section id="pvSponsorUnlimited" class="eventPvSponsor"><div class="eventPvSponsorTitle">SPONSORS</div><span>ESPACIO PARA SPONSORS</span></section>
    <div id="pvBoard" class="pvBoard"></div>
    <section class="eventPvBottom"><div class="eventPvPot"><b>PREMIO ACTUAL</b><div id="pvPrizeValue" class="eventPvPotValue">LÍNEA</div><small id="pvPrizeNow">LÍNEA</small></div><div class="eventPvClosest"><div class="eventPvClosestHead"><span>CARTONES CERCA DE GANAR</span><span id="pvPrizeTarget">LÍNEA</span></div><div id="pvCards" class="eventPvCards"></div></div></section>
    <div id="pvSponsor" class="pvSponsor"></div>`;
}
function openBolilleroPreview(){const modal=$('previewModal');if(!modal)return;modal.classList.remove('hidden');document.body.classList.add('previewOpen');renderPreviewExtras()}
function closeBolilleroPreview(){const modal=$('previewModal');if(!modal)return;modal.classList.add('hidden');document.body.classList.remove('previewOpen')}
function encodePayload(obj){const bytes=new TextEncoder().encode(JSON.stringify(obj));let bin='';bytes.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}

function readCurrentCard(){
  const card=$('cardHost')?.querySelector('.bingoCard');if(!card)return null;const number=Number(card.querySelector('.cardNo')?.textContent?.trim()),cells=[...card.querySelectorAll('.cardCell')];if(!Number.isFinite(number)||!cells.length)return null;
  const cols=cells.length===27?9:5,rows=Math.max(1,Math.round(cells.length/cols)),grid=[];
  for(let r=0;r<rows;r++){const row=[];for(let c=0;c<cols;c++){const cell=cells[r*cols+c];if(!cell||cell.classList.contains('blank'))row.push(null);else{const value=Number(cell.textContent.trim());row.push(Number.isFinite(value)?value:null)}}grid.push(row)}
  return {globalNumber:number,grid,mode:cols===9?90:75};
}
function currentOwner(){const first=$('cardHost')?.querySelector('.cardHead > div:first-child');if(!first)return'';return ([...first.children][1]?.textContent||'').trim()}
function openPlayerPreview(){
  const original=readCurrentCard(),name=currentOwner();if(!original)return notify('Primero seleccioná un cartón.');if(!name)return notify('Ese cartón todavía no está asignado.');
  const originalNo=original.globalNumber,rows=[...document.querySelectorAll('#assignments .personRow')].filter(row=>(row.children[1]?.textContent||'').trim().toLowerCase()===name.toLowerCase()),playerCards=[],seen=new Set();
  for(const row of rows){const button=row.querySelector('[data-view]');if(!button)continue;button.click();const card=readCurrentCard();if(card&&!seen.has(card.globalNumber)){seen.add(card.globalNumber);playerCards.push(card)}}
  document.querySelector(`#assignments [data-view="${originalNo}"]`)?.click();if(!playerCards.length)playerCards.push(original);
  const payload={v:1,title:$('eventTitle')?.value.trim()||'EVENTO',name,mode:playerCards[0]?.mode||90,cards:playerCards,broadcastUrl:''};
  const win=window.open(`${location.origin}/assets/evento-jugar.html#${encodePayload(payload)}`,'_blank','noopener');if(!win)notify('Permití ventanas emergentes para abrir la vista del jugador.');
}
function flattenLot(data){return(data?.series||[]).flatMap(series=>(series.cards||[]).map(card=>({...card,globalNumber:Number(card.globalNumber)||0,mode:Number(card.mode)||Number(data.mode)||90}))).sort((a,b)=>a.globalNumber-b.globalNumber)}
async function syncContext(){
  if(!adminToken())return;
  try{
    community=await adminFetch('/api/admin/community');labState=await adminFetch('/api/admin/state');
    if(!sponsorSourceLoaded){const list=community?.event?.sponsors||[];sponsors=list.filter(item=>item?.imageUrl||item?.label).map(item=>({id:uid(),enabled:item.enabled!==false,label:item.label||'',image:item.imageUrl||''}));sponsorSourceLoaded=true;renderSponsorEditor();restartSponsorRotation()}
    const code=community?.event?.lotCode;if(code&&lot?.code!==code){const response=await fetch(`/api/community/cards/lot?lot=${encodeURIComponent(code)}`,{cache:'no-store'}),data=await response.json();if(response.ok){lot=data;cards=flattenLot(data)}}
    renderPreviewExtras();
  }catch{}
}
function assignmentsForLot(){const code=community?.event?.lotCode||lot?.code;if(!code)return{};try{return JSON.parse(localStorage.getItem(`evento_lab_assignments:${code}`)||'{}')||{}}catch{return{}}}
function cardNumbers(card){return(card?.grid||[]).flat().filter(Number.isFinite)}
function lineMissing(card,set){const rows=(card?.grid||[]).map(row=>row.filter(Number.isFinite));return rows.length?Math.min(...rows.map(row=>row.filter(n=>!set.has(n)).length)):999}
function bingoMissing(card,set){return cardNumbers(card).filter(n=>!set.has(n)).length}
function closestAssigned(drawn){
  const assignments=assignmentsForLot(),assigned=cards.filter(card=>assignments[String(Number(card.globalNumber))]?.name),set=new Set((drawn||[]).map(Number));
  if(!assigned.length){const fallback=(labState?.highlightedCards||[]).slice(0,6).map(item=>({card:{globalNumber:item.cardNumber,grid:item.grid,mode:item.mode},name:item.playerName||'Jugador',score:Number(item.raceMissing)||0}));return{target:'PREMIO',ranked:fallback,set}}
  const lineDone=assigned.some(card=>lineMissing(card,set)===0),target=lineDone?'BINGO':'LÍNEA';
  const ranked=assigned.map(card=>{const line=lineMissing(card,set),bingo=bingoMissing(card,set);return{card,name:assignments[String(Number(card.globalNumber))]?.name||'',line,bingo,score:lineDone?bingo:line}}).sort((a,b)=>a.score-b.score||a.bingo-b.bingo||Number(a.card.globalNumber)-Number(b.card.globalNumber)).slice(0,6);
  return{target,ranked,set};
}
function prizeTextFor(target){
  const bingo=String(target||'').toUpperCase()==='BINGO';
  const text=localStorage.getItem(bingo?BINGO_PRIZE_KEY:LINE_PRIZE_KEY)||'';
  return text.trim()|| (bingo?'BINGO':'LÍNEA');
}
function fitPrize(el,text){if(!el)return;el.textContent=text;el.classList.toggle('long',text.length>28&&text.length<=58);el.classList.toggle('xlong',text.length>58)}
function miniCard(item,set){const mode=Number(item.card.mode)===75?75:90,cells=(item.card.grid||[]).flat().map(value=>Number.isFinite(value)?`<i class="${set.has(value)?'hit':''}">${value}</i>`:'<i class="blank">·</i>').join(''),missing=item.score===0?'LISTO':`FALTA${item.score===1?'':'N'} ${item.score}`;return`<article class="eventPvCard"><b>${esc(item.name)} · #${String(item.card.globalNumber||'').padStart(3,'0')}</b><div class="eventMiniGrid m${mode}">${cells}</div><small>${missing}</small></article>`}
function drawnForPreview(){if(labState?.active&&labState?.roomSettings?.eventMode)return labState.game?.drawn||[];return[...document.querySelectorAll('#recent i')].map(node=>Number(node.textContent)).filter(Number.isFinite).reverse()}
function renderPreviewCards(drawn){const host=$('pvCards');if(!host)return;const {target,ranked,set}=closestAssigned(drawn);const stage=String(target).toUpperCase()==='BINGO'?'BINGO':'LÍNEA';if($('pvPrizeTarget'))$('pvPrizeTarget').textContent=stage;if($('pvPrizeNow'))$('pvPrizeNow').textContent=stage;fitPrize($('pvPrizeValue'),prizeTextFor(stage));const items=ranked.map(item=>miniCard(item,set));while(items.length<6)items.push('<article class="eventPvCard" style="place-items:center;color:#6f6475">—</article>');host.innerHTML=items.join('')}
function activeSponsors(){return sponsors.filter(item=>item.enabled!==false&&item.image)}
function restartSponsorRotation(){clearInterval(sponsorTimer);sponsorIndex=0;renderPreviewSponsor();if(activeSponsors().length>1)sponsorTimer=setInterval(()=>{sponsorIndex=(sponsorIndex+1)%Math.max(1,activeSponsors().length);renderPreviewSponsor()},10000)}
function renderPreviewSponsor(){const host=$('pvSponsorUnlimited');if(!host)return;const list=activeSponsors();if(!list.length){host.innerHTML='<div class="eventPvSponsorTitle">SPONSORS</div><span>ESPACIO PARA SPONSORS</span>';return}sponsorIndex=((sponsorIndex%list.length)+list.length)%list.length;const item=list[sponsorIndex];host.innerHTML=`<div class="eventPvSponsorTitle">SPONSORS</div><img src="${esc(item.image)}" alt="${esc(item.label||'Sponsor')}">${item.label?`<span>${esc(item.label)}</span>`:''}`}
function renderPreviewExtras(){
  const preview=$('preview');if(!preview)return;
  const text=localStorage.getItem(TOP_TEXT_KEY)||$('eventTitle')?.value.trim()||'EVENTO EN VIVO';if($('pvTopText'))$('pvTopText').textContent=text;
  const logo=community?.event?.design?.assets?.logo;if(logo?.hasAsset&&logo.url&&$('pvLogo')){$('pvLogo').src=logo.url;$('pvLogo').classList.remove('hidden')}
  const drawn=drawnForPreview(),mode=$('pvBoard')?.children.length===75?75:($('pvBoard')?.children.length===90?90:Number($('eventMode')?.value)||90),board=$('pvBoard');
  if(board){board.style.gridTemplateColumns=`repeat(${mode===75?15:18},minmax(0,1fr))`;board.querySelectorAll('.pvNum').forEach(node=>node.classList.remove('lastHit'));const last=drawn.at(-1);if(last)board.children[last-1]?.classList.add('lastHit')}
  const recent=drawn.slice(-5).reverse().map(n=>`<i>${n}</i>`);while(recent.length<5)recent.push('<i class="empty">—</i>');if($('pvRecentCustom'))$('pvRecentCustom').innerHTML=recent.join('');if($('pvCountCustom'))$('pvCountCustom').textContent=`Bolilla ${drawn.length} de ${mode}`;
  renderPreviewCards(drawn);renderPreviewSponsor();
}

function installLogoUpload(){
  const input=$('logoFile');if(!input)return;
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{const data=await imageData(file,1000,1000);community=await adminFetch('/api/admin/community/event/asset',{method:'POST',body:JSON.stringify({action:'upload',key:'logo',data})});input.value='';renderPreviewExtras();notify('Logo cargado con transparencia.')}catch(error){notify(error.message)}};
}
async function openEventTransmission(){
  try{await syncContext();const url=labState?.broadcastUrl;if(!url)return notify('Primero prepará la sala real.');const alias=String(url).split('/').filter(Boolean).at(-1)||'';if(!alias)return notify('No se encontró el código de transmisión.');const payload={v:3,alias,title:community?.event?.title||$('eventTitle')?.value.trim()||'EVENTO',lotCode:community?.event?.lotCode||lot?.code||'',topText:localStorage.getItem(TOP_TEXT_KEY)||'',linePrize:localStorage.getItem(LINE_PRIZE_KEY)||'',bingoPrize:localStorage.getItem(BINGO_PRIZE_KEY)||'',assignments:assignmentsForLot()};const win=window.open(`${location.origin}/assets/evento-transmision.html#${encodePayload(payload)}`,'_blank');if(!win)notify('Permití ventanas emergentes para abrir la transmisión.')}catch(error){notify(error.message||'No se pudo abrir la transmisión.')}
}
function observePreview(){
  const board=$('pvBoard');if(!board)return;
  previewObserver?.disconnect();
  previewObserver=new MutationObserver(()=>renderPreviewExtras());
  previewObserver.observe(board,{childList:true,subtree:true});
}
async function bind(){
  injectStyles();installMarqueeControl();installPrizeControl();buildPreview();observePreview();await seedSponsors();installSponsorUi();installLogoUpload();restartSponsorRotation();await syncContext();
  $('openPreview')?.addEventListener('click',openBolilleroPreview);$('closePreview')?.addEventListener('click',closeBolilleroPreview);$('openPlayerPreview')?.addEventListener('click',openPlayerPreview);if($('openTx'))$('openTx').onclick=openEventTransmission;
  $('previewModal')?.addEventListener('click',event=>{if(event.target===$('previewModal'))closeBolilleroPreview()});document.addEventListener('keydown',event=>{if(event.key==='Escape')closeBolilleroPreview()});
  syncTimer=setInterval(syncContext,2200);renderPreviewExtras();
}
window.addEventListener('beforeunload',()=>{clearInterval(sponsorTimer);clearInterval(syncTimer);previewObserver?.disconnect()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>bind().catch(error=>notify(error.message)));else bind().catch(error=>notify(error.message));
})();