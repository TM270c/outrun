const BOOL_TRUE = ['1', 'true', 'yes', 'y', 'on'];
const BOOL_FALSE = ['0', 'false', 'no', 'n', 'off'];
const BOOL_WORDS = [...BOOL_TRUE, ...BOOL_FALSE];

export const splitLines = (text) =>
  text
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('//'));

export const splitCells = (line) => line.split(',').map((s) => (s ?? '').trim());

export const toInt = (value, fallback = 0) => {
  if (value === '' || value == null) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
};

export const toFloat = (value, fallback = 0) => {
  if (value === '' || value == null) return fallback;
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? fallback : n;
};

export const toBool = (value, fallback = true) => {
  if (value === '' || value == null) return fallback;
  const norm = value.toLowerCase();
  if (BOOL_TRUE.includes(norm)) return true;
  if (BOOL_FALSE.includes(norm)) return false;
  return fallback;
};

export const isBoolToken = (value) => {
  if (value === '' || value == null) return false;
  return BOOL_WORDS.includes(value.toLowerCase());
};
