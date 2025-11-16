const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const clamp01 = (value) => clamp(value, 0, 1);

const lerp = (start, end, t) => start + (end - start) * t;
const pctRem = (value, total) => (value % total) / total;

// Single easing curve used everywhere (curves, height, cliffs).
const easeInOut01 = (t) => {
  const clamped = clamp01(t);
  if (clamped <= 0.5) {
    return 2 * clamped * clamped;
  }
  const u = 1 - clamped;
  return 1 - 2 * u * u;
};

const easeInOut = (start, end, t) => lerp(start, end, easeInOut01(t));

const computeCurvature = (dy, d2y) => d2y / Math.pow(1 + dy * dy, 1.5);

const tangentNormalFromSlope = (dy) => {
  const invLength = 1 / Math.sqrt(1 + dy * dy);
  return {
    tx: invLength,
    ty: dy * invLength,
    nx: -dy * invLength,
    ny: invLength,
  };
};

window.MathUtil = {
  clamp,
  clamp01,
  lerp,
  pctRem,
  easeInOut01,
  easeInOut,
  computeCurvature,
  tangentNormalFromSlope,
};

Object.freeze(window.MathUtil);
