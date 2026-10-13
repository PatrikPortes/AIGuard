// Approved character delivery manifest (maintenance decision 2026-10-13).
// Every entry in public/character-assets.js must appear here and vice versa,
// so no unexpected asset can be added without updating this reviewed list.
// The 14 approved character states and the legacy hero stay lossless WebP.
// Only the three named responsive hero derivatives may be lossy, each with a
// hard byte ceiling; their alpha channel must still equal the resampled source.
export const APPROVED_CHARACTER_STATES = {
  verka: ['welcome', 'thinking', 'explaining', 'warning', 'success'],
  robo: ['default', 'analyzing', 'searching', 'warning', 'success', 'tip', 'capacity', 'error'],
};
export const APPROVED_LOSSLESS_SOURCES = [
  ...Object.entries(APPROVED_CHARACTER_STATES).flatMap(([character, states]) =>
    states.map(state => `assets/characters/${character}/${character}-${state}.png`)),
  'assets/characters/verkarob.png',
];
export const APPROVED_RESPONSIVE_SOURCES = {
  'assets/characters/responsive/verkarob-420.png': { width: 420, maxBytes: 80 * 1024 },
  'assets/characters/responsive/verkarob-640.png': { width: 640, maxBytes: 140 * 1024 },
  'assets/characters/responsive/verkarob-840.png': { width: 840, maxBytes: 200 * 1024 },
};
// Ceilings for lossless deliveries: character states and the legacy hero.
export const MAX_STATE_BYTES = 160 * 1024;
export const MAX_LEGACY_HERO_BYTES = 720 * 1024;
export const APPROVED_SOURCES = [...APPROVED_LOSSLESS_SOURCES, ...Object.keys(APPROVED_RESPONSIVE_SOURCES)];
