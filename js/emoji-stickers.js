(() => {
'use strict';

const COMMON_EMOJIS = ['😀','😁','😂','😉','😊','😎','😮','😭','😤','🤞','🙏','👏','👍','❤️','🔥','🎉','🍀','🎱','⭐','💰'];
const STICKERS = [
  { id:'gorda-risa', label:'Risa', src:'/assets/stickers/la-gorda-risa.webp', fallback:'😂' },
  { id:'gorda-festejo', label:'Festejos', src:'/assets/stickers/la-gorda-festejo.webp', fallback:'🎉' },
  { id:'gorda-dinero', label:'La Gorda dinero', src:'/assets/stickers/la-gorda-dinero.webp', fallback:'💸' },
  { id:'gorda-ay-no', label:'Ay no', src:'/assets/stickers/la-gorda-ay-no.webp', fallback:'😱' },
  { id:'gorda-enojada', label:'Enojada', src:'/assets/stickers/la-gorda-enojada.webp', fallback:'😤' },
  { id:'corazon', label:'Corazón', src:'/assets/stickers/corazon.webp', fallback:'❤️' },
  { id:'aplausos', label:'Aplausos', src:'/assets/stickers/aplausos.webp', fallback:'👏' },
  { id:'suerte', label:'Suerte', src:'/assets/stickers/suerte.webp', fallback:'🍀' },
  { id:'dinero', label:'Dinero', src:'/assets/stickers/dinero.webp', fallback:'💰' },
  { id:'ira', label:'Ira', src:'/assets/stickers/ira.webp', fallback:'💢' },
  { id:'explosion', label:'Explosión', src:'/assets/stickers/explosion.webp', fallback:'💥' },
  { id:'cerveza', label:'Cerveza', src:'/assets/stickers/cerveza.webp', fallback:'🍺' }
];
const BY_ID = Object.fromEntries(STICKERS.map(item => [item.id, item]));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

function sticker(id, options = {}) {
  const info = BY_ID[String(id || '')];
  if (!info) return '';
  const classes = ['premiumSticker', `premiumSticker-${info.id}`];
  if (options.animate) classes.push('is-animated');
  if (options.preview) classes.push('preview');
  if (options.className) classes.push(String(options.className).replace(/[^a-zA-Z0-9 _-]/g, ''));
  const replay = options.replay === false ? '0' : '1';
  return `<span class="${classes.join(' ')}" data-sticker-id="${info.id}" data-replay="${replay}" role="img" aria-label="${escapeHtml(info.label)}"><img src="${info.src}" alt="" draggable="false"></span>`;
}

function renderText(value) {
  return escapeHtml(String(value ?? '')).replace(/\n/g, '<br>');
}

function renderMessage(message, options = {}) {
  if (message && message.type === 'sticker' && BY_ID[String(message.stickerId || '')]) {
    return sticker(message.stickerId, { animate:Boolean(options.animate), replay:options.replay !== false });
  }
  return renderText(message?.text ?? '');
}

function isStickerMessage(message) {
  return Boolean(message && message.type === 'sticker' && BY_ID[String(message.stickerId || '')]);
}

function replay(target) {
  const element = target?.closest?.('[data-sticker-id]');
  if (!element || element.dataset.replay === '0') return false;
  element.classList.remove('is-animated','preview');
  void element.offsetWidth;
  element.classList.add('is-animated');
  window.setTimeout?.(() => element.classList.remove('is-animated'), 980);
  return true;
}

function injectStyles() {
  if (document.getElementById('premiumStickerStyles')) return;
  const style = document.createElement('style');
  style.id = 'premiumStickerStyles';
  style.textContent = `
    .premiumSticker{--sticker-size:104px;position:relative;display:inline-grid;place-items:center;width:var(--sticker-size);height:var(--sticker-size);vertical-align:middle;line-height:1;transform-origin:center;isolation:isolate;user-select:none;-webkit-user-select:none;touch-action:manipulation}
    .premiumSticker img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;filter:drop-shadow(0 8px 9px #0005);transform-origin:center;will-change:transform,filter}
    .premiumSticker::after{content:"";position:absolute;inset:12%;z-index:-1;border-radius:50%;background:radial-gradient(circle,#ffd45c55 0,#f09b1930 35%,transparent 72%);opacity:0;transform:scale(.7);pointer-events:none}
    .premiumSticker[data-replay="1"]{cursor:pointer}
    .premiumStickerMenuIcon{--sticker-size:72px}.premiumStickerComposerIcon{--sticker-size:30px}.premiumStickerBroadcast{--sticker-size:88px}.premiumStickerAdmin{--sticker-size:82px}
    .premiumStickerButton{display:grid;place-items:center;min-width:0;min-height:88px;padding:5px;border:1px solid #ffffff22;border-radius:16px;background:#0c1222;color:inherit;cursor:pointer;overflow:visible;transition:transform .15s ease,border-color .15s ease,background .15s ease}
    .premiumStickerButton:hover,.premiumStickerButton:focus-visible{transform:translateY(-2px);border-color:#ffca2f88;background:#171c2d}.premiumStickerButton:active{transform:scale(.96)}
    .premiumStickerButton .premiumSticker{pointer-events:none}
    .premiumSticker.is-animated img,.premiumSticker.preview img{animation:stickerPop .82s cubic-bezier(.2,.85,.22,1.2)}
    .premiumSticker.is-animated::after,.premiumSticker.preview::after{animation:stickerGlow .82s ease}
    .premiumSticker-gorda-risa.is-animated img,.premiumSticker-gorda-risa.preview img{animation:gordaRisa .84s ease}
    .premiumSticker-gorda-festejo.is-animated img,.premiumSticker-gorda-festejo.preview img{animation:gordaFestejo .86s cubic-bezier(.2,.9,.25,1.15)}
    .premiumSticker-gorda-dinero.is-animated img,.premiumSticker-gorda-dinero.preview img{animation:gordaDinero .9s ease}
    .premiumSticker-gorda-ay-no.is-animated img,.premiumSticker-gorda-ay-no.preview img{animation:gordaAyNo .82s cubic-bezier(.18,.9,.2,1.22)}
    .premiumSticker-gorda-enojada.is-animated img,.premiumSticker-gorda-enojada.preview img{animation:gordaEnojada .78s ease}
    .premiumSticker-corazon.is-animated img,.premiumSticker-corazon.preview img{animation:premiumHeart .86s ease}
    .premiumSticker-aplausos.is-animated img,.premiumSticker-aplausos.preview img{animation:premiumClap .78s ease}
    .premiumSticker-suerte.is-animated img,.premiumSticker-suerte.preview img{animation:premiumLucky .92s cubic-bezier(.2,.8,.2,1.15)}
    .premiumSticker-dinero.is-animated img,.premiumSticker-dinero.preview img{animation:premiumMoney .88s ease}
    .premiumSticker-ira.is-animated img,.premiumSticker-ira.preview img{animation:premiumRage .7s ease}
    .premiumSticker-explosion.is-animated img,.premiumSticker-explosion.preview img{animation:premiumExplosion .78s cubic-bezier(.12,.8,.18,1.15)}
    .premiumSticker-cerveza.is-animated img,.premiumSticker-cerveza.preview img{animation:premiumBeer .88s ease}
    @keyframes stickerPop{0%{opacity:0;transform:scale(.55) translateY(12px)}55%{opacity:1;transform:scale(1.1) translateY(-4px)}78%{transform:scale(.96)}100%{transform:scale(1)}}
    @keyframes stickerGlow{0%,100%{opacity:0;transform:scale(.65)}42%{opacity:1;transform:scale(1.18)}}
    @keyframes gordaRisa{0%{opacity:0;transform:scale(.7) rotate(-4deg)}30%{opacity:1;transform:scale(1.06) rotate(4deg)}45%{transform:rotate(-4deg)}60%{transform:rotate(3deg)}75%{transform:rotate(-2deg)}100%{transform:scale(1) rotate(0)}}
    @keyframes gordaFestejo{0%{opacity:0;transform:translateY(18px) scale(.7)}46%{opacity:1;transform:translateY(-12px) scale(1.08)}70%{transform:translateY(3px) scale(.98)}100%{transform:none}}
    @keyframes gordaDinero{0%{opacity:0;transform:scale(.7) rotate(-8deg)}35%{opacity:1;transform:scale(1.08) rotate(6deg)}58%{transform:rotate(-4deg)}78%{transform:rotate(2deg)}100%{transform:none}}
    @keyframes gordaAyNo{0%{opacity:0;transform:scale(.55)}42%{opacity:1;transform:scale(1.13)}58%{transform:translateX(-4px) scale(1.02)}70%{transform:translateX(4px)}82%{transform:translateX(-2px)}100%{transform:none}}
    @keyframes gordaEnojada{0%{opacity:0;transform:scale(.75)}30%{opacity:1;transform:scale(1.05)}43%,63%{transform:translateX(-5px) rotate(-1deg)}53%,73%{transform:translateX(5px) rotate(1deg)}100%{transform:none}}
    @keyframes premiumHeart{0%{opacity:0;transform:scale(.55)}34%{opacity:1;transform:scale(1.16)}48%{transform:scale(.93)}68%{transform:scale(1.13)}84%{transform:scale(.97)}100%{transform:scale(1)}}
    @keyframes premiumClap{0%{opacity:0;transform:scale(.72) rotate(-7deg)}28%{opacity:1;transform:scale(1.08) rotate(5deg)}45%{transform:scale(.94) rotate(-4deg)}62%{transform:scale(1.07) rotate(4deg)}80%{transform:scale(.97) rotate(-2deg)}100%{transform:none}}
    @keyframes premiumLucky{0%{opacity:0;transform:scale(.62) rotate(-25deg)}50%{opacity:1;transform:scale(1.1) rotate(8deg)}72%{transform:scale(.97) rotate(-4deg)}100%{transform:none}}
    @keyframes premiumMoney{0%{opacity:0;transform:translateY(12px) scale(.65)}38%{opacity:1;transform:translateY(-8px) scale(1.12)}58%{transform:translateY(3px) rotate(-3deg)}78%{transform:translateY(-2px) rotate(2deg)}100%{transform:none}}
    @keyframes premiumRage{0%{opacity:0;transform:scale(.5)}30%{opacity:1;transform:scale(1.15)}42%,62%{transform:translateX(-6px) scale(1.02)}52%,72%{transform:translateX(6px) scale(1.04)}100%{transform:none}}
    @keyframes premiumExplosion{0%{opacity:0;transform:scale(.2);filter:brightness(2.4) blur(2px)}45%{opacity:1;transform:scale(1.2);filter:brightness(1.5) blur(0)}68%{transform:scale(.95)}100%{transform:scale(1);filter:none}}
    @keyframes premiumBeer{0%{opacity:0;transform:translateY(12px) rotate(-9deg) scale(.72)}36%{opacity:1;transform:translateY(-5px) rotate(7deg) scale(1.08)}58%{transform:rotate(-4deg) scale(.98)}78%{transform:rotate(2deg)}100%{transform:none}}
    @media(max-width:620px){.premiumSticker{--sticker-size:92px}.premiumStickerMenuIcon{--sticker-size:66px}.premiumStickerAdmin{--sticker-size:76px}.premiumStickerBroadcast{--sticker-size:80px}}
    @media(prefers-reduced-motion:reduce){.premiumSticker.is-animated img,.premiumSticker.preview img,.premiumSticker.is-animated::after,.premiumSticker.preview::after{animation:none!important}}
  `;
  document.head.appendChild(style);
}

injectStyles();
window.BingoEmojiStickers = {
  commonEmojis: COMMON_EMOJIS.slice(),
  stickers: STICKERS.map(item => ({ ...item })),
  get: id => BY_ID[String(id || '')] || null,
  sticker,
  icon: sticker,
  renderText,
  renderMessage,
  isStickerMessage,
  replay
};
})();
