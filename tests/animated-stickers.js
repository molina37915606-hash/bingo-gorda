'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'emoji-stickers.js'), 'utf8');
const appended = [];
const document = {
  getElementById: () => null,
  createElement: tag => ({ tag, id:'', textContent:'', setAttribute(){}, appendChild(){} }),
  head: { appendChild: node => appended.push(node) }
};
const window = { setTimeout(){} };
vm.runInNewContext(source, { window, document, console, String, Array, Object, Boolean });
const stickers = window.BingoEmojiStickers;
assert(stickers, 'El módulo de stickers no fue expuesto.');
assert.equal(stickers.commonEmojis.length, 20);
assert.equal(stickers.stickers.length, 12);
for (const info of stickers.stickers) {
  const html = stickers.sticker(info.id, { animate:true });
  assert(html.includes('<img'));
  assert(html.includes('is-animated'));
  assert(html.includes(`/assets/stickers/`));
  assert(fs.existsSync(path.join(__dirname, '..', info.src.replace(/^\//,''))), `Falta asset ${info.src}`);
}
const text = stickers.renderText('<hola> ❤️ 🎉');
assert(text.includes('&lt;hola&gt;'));
assert(text.includes('❤️'));
assert(!text.includes('premiumSticker'));
const message = { type:'sticker', stickerId:'corazon', text:'' };
const rendered = stickers.renderMessage(message, { animate:true });
assert(rendered.includes('premiumSticker-corazon'));
assert(stickers.isStickerMessage(message));
assert(!stickers.isStickerMessage({ type:'text', text:'❤️' }));
assert.equal(appended.length, 1);
console.log('PRUEBA STICKERS PREMIUM: OK');
