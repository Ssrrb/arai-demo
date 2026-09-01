'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hasProfanity } = require('../profanity');

test('detects direct and uppercase profanity', () => {
  assert.equal(hasProfanity('Puta'), true);
  assert.equal(hasProfanity('hijoputa'), true);
  for (const word of ['gay', 'tatu', 'tembo', 'tevi', 'pelotudo', 'imbécil']) {
    assert.equal(hasProfanity(word), true, `${word} should be blocked`);
  }
});

test('detects common numeric and repetition evasions', () => {
  assert.equal(hasProfanity('p3nd3jo'), true);
  assert.equal(hasProfanity('PVT4'), true);
  assert.equal(hasProfanity('puuutaaa'), true);
  assert.equal(hasProfanity('mierda123'), true);
});

test('does not block known legitimate words', () => {
  assert.equal(hasProfanity('computadora'), false);
  assert.equal(hasProfanity('calculo'), false);
  assert.equal(hasProfanity('Jugador12'), false);
});
