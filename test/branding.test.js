'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function pngInfo(file) {
  const data = fs.readFileSync(path.join(root, file));
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25]
  };
}

test('uses the definitive TUKU identity and exact shop URL', () => {
  assert.match(html, /<title>TUKU: No Te Caigas<\/title>/);
  assert.match(html, /const SHOP_URL = 'https:\/\/arai-mic-web-390294125906\.us-east1\.run\.app\/'/);
  assert.match(html, /VER \$\{edition\.name\} EN TUKU/);
  assert.match(html, /CERTIFICACIÓN COMPLETADA/);
  assert.match(html, /PRUEBA INTERRUMPIDA/);
});

test('defines all four balanced visual editions and their sprites', () => {
  for (const edition of ['nebula', 'fuego', 'oro', 'metal']) {
    assert.match(html, new RegExp(`id:'${edition}'`));
    assert.match(html, new RegExp(`assets/tuku/ball-${edition}\\.png`));
  }
  assert.match(html, /const SELECTED_EDITION_KEY = 'tuku_selected_edition'/);
});

test('does not reference legacy character or collectible assets at runtime', () => {
  for (const oldAsset of ['ape.png', 'cart.png', 'banana.png', 'mega-banana.png', 'tnt-barrel.png', 'enemy-cart.png', 'cave-bg.png']) {
    assert.equal(html.includes(`assets/${oldAsset}`), false, oldAsset);
  }
});

test('inline game JavaScript is syntactically valid', () => {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'inline script missing');
  assert.doesNotThrow(() => new vm.Script(match[1], { filename: 'index.html' }));
});

test('TUKU sprites have expected size and RGBA output', () => {
  const sprites = {
    'assets/tuku/ball-nebula.png': [127, 128],
    'assets/tuku/ball-fuego.png': [126, 128],
    'assets/tuku/ball-oro.png': [126, 128],
    'assets/tuku/ball-metal.png': [127, 128],
    'assets/tuku/performance-token.png': [63, 64],
    'assets/tuku/certification-core.png': [83, 96],
    'assets/tuku/impact-block.png': [59, 96],
    'assets/tuku/calibration-drone.png': [128, 70],
    'assets/tuku/impact-wave.png': [128, 124]
  };

  for (const [file, expectedSize] of Object.entries(sprites)) {
    const info = pngInfo(file);
    assert.deepEqual([info.width, info.height], expectedSize, file);
    assert.equal(info.colorType, 6, `${file} must be RGBA`);
  }

  const background = pngInfo('assets/tuku/lab-background.png');
  assert.deepEqual([background.width, background.height], [1983, 793]);
});
