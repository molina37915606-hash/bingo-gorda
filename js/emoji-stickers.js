(() => {
'use strict';
const EMOJIS = ['😀','😂','😭','👏','❤️','🍀','🎱','🎉'];
const INFO = {
  '😀': { id:'happy', label:'Alegría' },
  '😂': { id:'laugh', label:'Risa' },
  '😭': { id:'cry', label:'Llanto' },
  '👏': { id:'clap', label:'Aplausos' },
  '❤️': { id:'heart', label:'Corazón' },
  '🍀': { id:'clover', label:'Suerte' },
  '🎱': { id:'ball', label:'Bolilla' },
  '🎉': { id:'party', label:'Fiesta' }
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

function svgBody(id) {
  if (id === 'happy') return `
    <circle class="sticker-face" cx="50" cy="50" r="40" fill="#FFD451" stroke="#F0A928" stroke-width="4"/>
    <ellipse cx="36" cy="67" rx="8" ry="5" fill="#FF8C9D" opacity=".52"/><ellipse cx="64" cy="67" rx="8" ry="5" fill="#FF8C9D" opacity=".52"/>
    <path d="M30 42c4-7 10-7 14 0M56 42c4-7 10-7 14 0" fill="none" stroke="#63361C" stroke-width="5" stroke-linecap="round"/>
    <path d="M29 56c4 19 38 20 42 0-12 8-30 8-42 0Z" fill="#7D2E26" stroke="#63361C" stroke-width="3" stroke-linejoin="round"/>
    <path d="M39 69c7 5 15 5 22 0" fill="none" stroke="#FF7688" stroke-width="5" stroke-linecap="round"/>
    <ellipse class="sticker-shine" cx="34" cy="27" rx="10" ry="5" fill="#FFF" opacity=".62" transform="rotate(-25 34 27)"/>`;
  if (id === 'laugh') return `
    <g class="sticker-face"><circle cx="50" cy="50" r="39" fill="#FFD451" stroke="#F0A928" stroke-width="4"/>
    <path d="M27 43l9-7 9 7M55 43l9-7 9 7" fill="none" stroke="#63361C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M27 55c5 25 41 25 46 0-13 8-33 8-46 0Z" fill="#71302A" stroke="#63361C" stroke-width="3"/>
    <path d="M39 71c7 4 15 4 22 0" fill="none" stroke="#FF718A" stroke-width="5" stroke-linecap="round"/></g>
    <path class="sticker-tear sticker-tear-left" d="M18 49c-9 10-8 18 0 20 8-2 9-10 0-20Z" fill="#58C8FF" stroke="#248FC8" stroke-width="3"/>
    <path class="sticker-tear sticker-tear-right" d="M82 49c-9 10-8 18 0 20 8-2 9-10 0-20Z" fill="#58C8FF" stroke="#248FC8" stroke-width="3"/>`;
  if (id === 'cry') return `
    <g class="sticker-face"><circle cx="50" cy="46" r="38" fill="#FFD451" stroke="#F0A928" stroke-width="4"/>
    <path d="M28 34c6-5 12-4 16 1M56 35c4-5 10-6 16-1" fill="none" stroke="#63361C" stroke-width="4" stroke-linecap="round"/>
    <path d="M29 47c5 4 10 4 15 0M56 47c5 4 10 4 15 0" fill="none" stroke="#63361C" stroke-width="5" stroke-linecap="round"/>
    <path d="M38 68c7-8 17-8 24 0" fill="none" stroke="#63361C" stroke-width="5" stroke-linecap="round"/></g>
    <path class="sticker-tear sticker-tear-left" d="M31 49c-10 16-8 36 0 42 8-6 10-26 0-42Z" fill="#5CCBFF" stroke="#248FC8" stroke-width="3"/>
    <path class="sticker-tear sticker-tear-right" d="M69 49c-10 16-8 36 0 42 8-6 10-26 0-42Z" fill="#5CCBFF" stroke="#248FC8" stroke-width="3"/>`;
  if (id === 'clap') return `
    <g class="sticker-hand sticker-hand-left" transform="rotate(-13 38 54)"><rect x="18" y="36" width="35" height="45" rx="16" fill="#F2B37C" stroke="#C87847" stroke-width="4"/><rect x="14" y="25" width="11" height="35" rx="6" fill="#F2B37C" stroke="#C87847" stroke-width="3"/><rect x="25" y="19" width="11" height="38" rx="6" fill="#F2B37C" stroke="#C87847" stroke-width="3"/><rect x="36" y="21" width="11" height="36" rx="6" fill="#F2B37C" stroke="#C87847" stroke-width="3"/></g>
    <g class="sticker-hand sticker-hand-right" transform="rotate(13 62 54)"><rect x="47" y="36" width="35" height="45" rx="16" fill="#FFD09E" stroke="#C87847" stroke-width="4"/><rect x="75" y="25" width="11" height="35" rx="6" fill="#FFD09E" stroke="#C87847" stroke-width="3"/><rect x="64" y="19" width="11" height="38" rx="6" fill="#FFD09E" stroke="#C87847" stroke-width="3"/><rect x="53" y="21" width="11" height="36" rx="6" fill="#FFD09E" stroke="#C87847" stroke-width="3"/></g>
    <g class="sticker-sparks" fill="none" stroke="#FFD24A" stroke-width="5" stroke-linecap="round"><path d="M50 9v11M27 13l6 9M73 13l-6 9"/></g>`;
  if (id === 'heart') return `
    <path class="sticker-heart-shape" d="M50 88C15 67 8 48 14 31c7-20 31-22 36-5 5-17 29-15 36 5 6 17-1 36-36 57Z" fill="#F04468" stroke="#B91D48" stroke-width="5" stroke-linejoin="round"/>
    <path class="sticker-shine" d="M27 35c4-8 11-10 17-7" fill="none" stroke="#FFF" stroke-width="7" stroke-linecap="round" opacity=".65"/>`;
  if (id === 'clover') return `
    <path class="sticker-stem" d="M49 52c3 14 2 27-8 37" fill="none" stroke="#167948" stroke-width="8" stroke-linecap="round"/>
    <g class="sticker-clover"><circle cx="37" cy="37" r="20" fill="#41C978" stroke="#168F4D" stroke-width="4"/><circle cx="63" cy="37" r="20" fill="#55D987" stroke="#168F4D" stroke-width="4"/><circle cx="37" cy="61" r="20" fill="#32B968" stroke="#168F4D" stroke-width="4"/><circle cx="63" cy="61" r="20" fill="#46CB76" stroke="#168F4D" stroke-width="4"/><circle cx="50" cy="49" r="9" fill="#198C4D"/></g>
    <g class="sticker-spark" fill="#FFD65A"><path d="M82 15l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/><circle cx="78" cy="42" r="4"/></g>`;
  if (id === 'ball') return `
    <circle class="sticker-ball-shadow" cx="53" cy="55" r="39" fill="#331057" opacity=".25"/>
    <circle class="sticker-ball-shape" cx="50" cy="50" r="40" fill="#4D176E" stroke="#251033" stroke-width="5"/>
    <ellipse cx="37" cy="28" rx="12" ry="7" fill="#FFF" opacity=".33" transform="rotate(-25 37 28)"/>
    <circle cx="50" cy="52" r="22" fill="#F7F4FF" stroke="#D6C7E9" stroke-width="3"/>
    <text x="50" y="61" text-anchor="middle" font-family="Arial Black,Impact,sans-serif" font-size="28" font-weight="900" fill="#35104E">8</text>`;
  return `
    <g class="sticker-confetti"><circle cx="21" cy="22" r="5" fill="#50D7C4"/><rect x="65" y="13" width="8" height="15" rx="3" fill="#FFCE42" transform="rotate(27 69 20)"/><path d="M44 8l4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" fill="#F54D8B"/><path d="M81 36l8-7" stroke="#8E58E8" stroke-width="6" stroke-linecap="round"/><path d="M18 43l-9-5" stroke="#FF8A48" stroke-width="6" stroke-linecap="round"/></g>
    <path class="sticker-party-cone" d="M28 45 76 83 18 91Z" fill="#8D45D5" stroke="#57219B" stroke-width="5" stroke-linejoin="round"/>
    <path d="m31 49 12 10-20 9M50 64l12 10-26 8" fill="none" stroke="#FFD34F" stroke-width="7"/>
    <path class="sticker-pop" d="M34 45c10-12 28-18 47-13" fill="none" stroke="#FF557F" stroke-width="8" stroke-linecap="round"/>`;
}

function icon(emoji, options = {}) {
  const info = INFO[emoji] || INFO['😀'];
  const animated = options.animate ? ' is-animated' : '';
  const extra = options.className ? ` ${escapeHtml(options.className)}` : '';
  return `<span class="bingoSticker sticker-${info.id}${animated}${extra}" data-sticker="${info.id}" role="img" aria-label="${info.label}"><svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">${svgBody(info.id)}</svg></span>`;
}

function renderText(value, options = {}) {
  const text = String(value ?? '');
  let output = '';
  let index = 0;
  while (index < text.length) {
    const emoji = EMOJIS.find(item => text.startsWith(item, index));
    if (emoji) {
      output += icon(emoji, { animate: Boolean(options.animate) });
      index += emoji.length;
      continue;
    }
    const char = text[index];
    output += char === '\n' ? '<br>' : escapeHtml(char);
    index += 1;
  }
  return output;
}

function isStickerOnly(value) {
  let rest = String(value ?? '');
  for (const emoji of EMOJIS) rest = rest.split(emoji).join('');
  return rest.trim() === '' && EMOJIS.some(emoji => String(value ?? '').includes(emoji));
}

function injectStyles() {
  if (document.getElementById('bingoStickerStyles')) return;
  const style = document.createElement('style');
  style.id = 'bingoStickerStyles';
  style.textContent = `
    .bingoSticker{display:inline-grid;place-items:center;width:36px;height:36px;vertical-align:middle;margin:0 2px;transform-origin:center;line-height:1;will-change:transform}.bingoSticker svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 4px 5px #0003)}
    .stickerOnly{display:flex!important;flex-wrap:wrap;align-items:center;gap:5px;min-height:66px}.stickerOnly .bingoSticker{width:68px;height:68px;margin:1px}.stickerMenuIcon{width:58px;height:58px;margin:0}.stickerMenuButton{display:grid;place-items:center;min-width:0!important;height:70px!important;padding:4px!important;overflow:visible;cursor:pointer}.stickerMenuButton:hover .bingoSticker,.stickerMenuButton:focus-visible .bingoSticker{transform:translateY(-3px) scale(1.08)}
    .bingoSticker.is-animated.sticker-happy,.bingoSticker.preview.sticker-happy{animation:stickerHappy .7s cubic-bezier(.2,.9,.25,1.2)}
    .bingoSticker.is-animated.sticker-laugh,.bingoSticker.preview.sticker-laugh{animation:stickerLaugh .72s ease}.bingoSticker.is-animated.sticker-laugh .sticker-tear-left,.bingoSticker.preview.sticker-laugh .sticker-tear-left{animation:tearLeft .72s ease}.bingoSticker.is-animated.sticker-laugh .sticker-tear-right,.bingoSticker.preview.sticker-laugh .sticker-tear-right{animation:tearRight .72s ease}
    .bingoSticker.is-animated.sticker-cry,.bingoSticker.preview.sticker-cry{animation:stickerCry .82s ease}.bingoSticker.is-animated.sticker-cry .sticker-tear,.bingoSticker.preview.sticker-cry .sticker-tear{animation:tearFall .82s ease}
    .bingoSticker.is-animated.sticker-clap .sticker-hand-left,.bingoSticker.preview.sticker-clap .sticker-hand-left{animation:clapLeft .72s ease}.bingoSticker.is-animated.sticker-clap .sticker-hand-right,.bingoSticker.preview.sticker-clap .sticker-hand-right{animation:clapRight .72s ease}.bingoSticker.is-animated.sticker-clap .sticker-sparks,.bingoSticker.preview.sticker-clap .sticker-sparks{animation:sparkFlash .72s ease}
    .bingoSticker.is-animated.sticker-heart,.bingoSticker.preview.sticker-heart{animation:heartBeat .78s ease}.bingoSticker.is-animated.sticker-heart .sticker-shine,.bingoSticker.preview.sticker-heart .sticker-shine{animation:shineSweep .78s ease}
    .bingoSticker.is-animated.sticker-clover,.bingoSticker.preview.sticker-clover{animation:cloverSpin .82s cubic-bezier(.2,.8,.2,1)}.bingoSticker.is-animated.sticker-clover .sticker-spark,.bingoSticker.preview.sticker-clover .sticker-spark{animation:sparkFlash .82s ease}
    .bingoSticker.is-animated.sticker-ball,.bingoSticker.preview.sticker-ball{animation:ballRoll .82s cubic-bezier(.2,.8,.25,1)}
    .bingoSticker.is-animated.sticker-party,.bingoSticker.preview.sticker-party{animation:partyPop .78s cubic-bezier(.2,.9,.3,1.15)}.bingoSticker.is-animated.sticker-party .sticker-confetti,.bingoSticker.preview.sticker-party .sticker-confetti{animation:confettiBurst .78s ease}
    @keyframes stickerHappy{0%{transform:scale(.55);opacity:0}45%{transform:scale(1.18) rotate(-5deg);opacity:1}72%{transform:scale(.94) rotate(3deg)}100%{transform:scale(1)}}
    @keyframes stickerLaugh{0%,100%{transform:rotate(0)}22%{transform:rotate(-8deg) translateX(-2px)}44%{transform:rotate(8deg) translateX(2px)}66%{transform:rotate(-5deg)}82%{transform:rotate(4deg)}}
    @keyframes tearLeft{0%,25%{transform:translate(4px,-5px) scale(.4);opacity:0}65%{transform:translate(-4px,2px) scale(1.15);opacity:1}100%{transform:none}}@keyframes tearRight{0%,25%{transform:translate(-4px,-5px) scale(.4);opacity:0}65%{transform:translate(4px,2px) scale(1.15);opacity:1}100%{transform:none}}
    @keyframes stickerCry{0%,100%{transform:translateX(0)}20%{transform:translateX(-2px) rotate(-2deg)}40%{transform:translateX(2px) rotate(2deg)}60%{transform:translateX(-2px)}80%{transform:translateX(2px)}}@keyframes tearFall{0%{transform:translateY(-13px) scaleY(.5);opacity:0}45%{opacity:1}100%{transform:translateY(4px);opacity:.9}}
    @keyframes clapLeft{0%,100%{transform:rotate(-13deg) translateX(0)}28%,65%{transform:rotate(-2deg) translateX(10px)}}@keyframes clapRight{0%,100%{transform:rotate(13deg) translateX(0)}28%,65%{transform:rotate(2deg) translateX(-10px)}}@keyframes sparkFlash{0%,22%,70%,100%{opacity:.25;transform:scale(.7)}35%,58%{opacity:1;transform:scale(1.18)}}
    @keyframes heartBeat{0%,100%{transform:scale(1)}24%{transform:scale(1.2)}43%{transform:scale(.96)}66%{transform:scale(1.13)}82%{transform:scale(1)}}@keyframes shineSweep{0%{opacity:0;transform:translateX(-8px)}50%{opacity:.9}100%{opacity:.35;transform:translateX(8px)}}
    @keyframes cloverSpin{0%{transform:rotate(-28deg) scale(.62);opacity:0}55%{transform:rotate(12deg) scale(1.14);opacity:1}78%{transform:rotate(-5deg) scale(.96)}100%{transform:none}}
    @keyframes ballRoll{0%{transform:translateX(-42px) rotate(-160deg) scale(.72);opacity:0}64%{transform:translateX(5px) rotate(18deg) scale(1.08);opacity:1}82%{transform:translateX(-2px) rotate(-7deg)}100%{transform:none}}
    @keyframes partyPop{0%{transform:scale(.55) rotate(-12deg);opacity:0}55%{transform:scale(1.16) rotate(6deg);opacity:1}78%{transform:scale(.96) rotate(-2deg)}100%{transform:none}}@keyframes confettiBurst{0%,18%{transform:translateY(20px) scale(.3);opacity:0}58%{transform:translateY(-5px) scale(1.18);opacity:1}100%{transform:none}}
    @media(max-width:620px){.stickerMenuIcon{width:52px;height:52px}.stickerMenuButton{height:62px!important}.stickerOnly .bingoSticker{width:62px;height:62px}}
    @media(prefers-reduced-motion:reduce){.bingoSticker,.bingoSticker *{animation:none!important;transition:none!important}}
  `;
  document.head.appendChild(style);
}

injectStyles();
window.BingoEmojiStickers = { emojis:EMOJIS, info:INFO, icon, renderText, isStickerOnly, injectStyles };
})();
