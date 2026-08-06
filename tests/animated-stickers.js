'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'emoji-stickers.js'), 'utf8');
const appended = [];
const document = {
  getElementById: () => null,
  createElement: tag => ({ tag, id:'', textContent:'', setAttribute(){}, appendChild(){} }),
  head: { appendChild: node => appended.push(node) }
};
const window = {};
vm.runInNewContext(source, { window, document, console, String, Array, Object, Boolean });
const stickers = window.BingoEmojiStickers;
assert(stickers, 'El módulo de stickers no fue expuesto.');
assert.equal(stickers.emojis.length, 8);
for (const emoji of stickers.emojis) {
  const icon = stickers.icon(emoji, { animate:true });
  assert(icon.includes('<svg'));
  assert(icon.includes('is-animated'));
}
const rendered = stickers.renderText('<hola> ❤️ 🎉', { animate:true });
assert(rendered.includes('&lt;hola&gt;'));
assert(rendered.includes('sticker-heart'));
assert(rendered.includes('sticker-party'));
assert(!rendered.includes('<hola>'));
assert.equal(stickers.isStickerOnly('❤️ 🎉'), true);
assert.equal(stickers.isStickerOnly('Vamos ❤️'), false);
assert.equal(appended.length, 1);
console.log('PRUEBA STICKERS ANIMADOS: OK');
