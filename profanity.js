'use strict';

// Keep this list deliberately focused on profanity and slurs. Broad terms such as
// "tonto" create too many false positives for player names.
const BLOCKED_WORDS = new Set([
  // Insultos generales
  'idiota',
  'idiotas',
  'imbecil',
  'imbeciles',
  'estupido',
  'estupida',
  'estupidos',
  'estupidas',
  'tarado',
  'tarada',
  'tarados',
  'taradas',
  'gilipollas',
  'gilipolla',
  'capullo',
  'capulla',
  'capullos',
  'cabron',
  'cabrona',
  'cabrones',
  'cabronas',
  'culero',
  'culera',
  'culeros',
  'culeras',
  'pelotudo',
  'pelotuda',
  'pelotudos',
  'pelotudas',
  'boludo',
  'boluda',
  'boludos',
  'boludas',
  'pendejo',
  'pendeja',
  'pendejos',
  'pendejas',
  'mamerto',
  'mamerta',
  'baboso',
  'babosa',

  // Variantes de puta / prostitución como insulto
  'puta',
  'putas',
  'puto',
  'putos',
  'putona',
  'puton',
  'putazo',
  'putaza',
  'putita',
  'putito',
  'hijaputa',
  'hijoputa',
  'hijodeputa',
  'hijadeputa',
  'hdp',

  // México / Centroamérica
  'chingar',
  'chingado',
  'chingada',
  'chingados',
  'chingadas',
  'chingon',
  'chingona',
  'chingadera',
  'chingaderas',
  'pinche',
  'pinches',
  'culero',
  'culera',
  'culeros',
  'culeras',
  'mamon',
  'mamona',
  'mamones',
  'mamadas',
  'mamador',
  'mamadora',
  'verga',
  'vergas',
  'vergazo',
  'vergazos',

  // España
  'joder',
  'hostia',
  'hostias',
  'cojon',
  'cojones',
  'gilipollas',
  'gilipolla',
  'capullo',
  'capullos',
  'polla',
  'pollas',
  'pollon',

  // Argentina / Uruguay / Paraguay
  'pelotudo',
  'pelotuda',
  'pelotudos',
  'pelotudas',
  'boludo',
  'boluda',
  'boludos',
  'boludas',
  'forro',
  'forra',
  'forros',
  'forras',
  'conchudo',
  'conchuda',
  'conchudos',
  'conchudas',
  'concha',
  'ortiva',

  // República Dominicana / Caribe
  'tatu',
  'tembo',
  'tevi',

  // Genitales / términos explícitos usados como insulto
  'culo',
  'culos',
  'polla',
  'pollas',
  'verga',
  'vergas',
  'pene',
  'penes',
  'coño',
  'coños',
  'cono',
  'conos',
  'cojones',

  // Excrementos
  'mierda',
  'mierdas',
  'cagada',
  'cagadas',
  'cagado',
  'cagada',
  'cagar',
  'cagon',
  'cagona',

  // Insultos sexuales / homófobos
  'marica',
  'maricas',
  'maricon',
  'maricona',
  'maricones',
  'mariconas',

  // Otros
  'zorra',
  'zorras',
  'zorro',
  'perra',
  'perras',
  'malparido',
  'malparida',
  'malparidos',
  'malparidas',
  'gay',
  'gays',
  'travesti',
  'pilin'
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
