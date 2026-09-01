'use strict';

// Keep this list deliberately focused on profanity and slurs. Broad terms such as
// "tonto" create too many false positives for player names.
const BLOCKED_WORDS = new Set([
  'cabron', 'cabrona', 'cabrones',
  'chingada', 'chingado', 'chingar',
  'cojones', 'culera', 'culero', 'culo',
  'gilipollas', 'hijaputa', 'hijoputa',
  'joder', 'marica', 'maricon', 'maricona',
  'mierda', 'mierdas', 'pendeja', 'pendejo', 'pendejos',
  'polla', 'put4', 'puta', 'putas', 'puto', 'putos',
  'verga', 'vergas', 'zorra', 'zorras',
]);

// Common legitimate Spanish words containing a short blocked sequence.
const ALLOWED_WORDS = new Set([
  'calculo', 'computacion', 'computador', 'computadora', 'diputado', 'reputacion',
]);

const LEET = Object.freeze({
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
});

function moderationCandidates(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[01345789]/g, character => LEET[character]);
  const lettersOnly = normalized.replace(/[^a-z]/g, '');
  const phoneticLeet = normalized.replace(/v/g, 'u');
  return new Set([
    normalized,
    lettersOnly,
    phoneticLeet,
    phoneticLeet.replace(/[^a-z]/g, ''),
    normalized.replace(/(.)\1{2,}/g, '$1'),
    lettersOnly.replace(/(.)\1{2,}/g, '$1'),
    phoneticLeet.replace(/(.)\1{2,}/g, '$1'),
  ]);
}

function hasProfanity(value) {
  for (const candidate of moderationCandidates(value)) {
    if (!candidate || ALLOWED_WORDS.has(candidate)) continue;
    for (const word of BLOCKED_WORDS) {
      if (candidate === word || candidate.startsWith(word) || candidate.endsWith(word)) return true;
      // Longer terms are safe enough to detect even when embedded in a username.
      if (word.length >= 5 && candidate.includes(word)) return true;
    }
  }
  return false;
}

module.exports = { hasProfanity };
