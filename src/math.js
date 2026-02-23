const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const clamp01 = (value) => clamp(value, 0, 1);

const lerp = (start, end, t) => start + (end - start) * t;
const pctRem = (value, total) => (value % total) / total;

const createEaseIn = (power) => (t) => Math.pow(clamp01(t), power);
const createEaseOut = (power) => (t) => 1 - Math.pow(1 - clamp01(t), power);
const createEaseInOut = (power) => (t) => {
  const clamped = clamp01(t);
  if (clamped <= 0.5) {
    return Math.pow(clamped * 2, power) / 2;
  }
  return 1 - Math.pow((1 - clamped) * 2, power) / 2;
};

const easeLinear01 = (t) => clamp01(t);
const easeInQuad01 = createEaseIn(2);
const easeOutQuad01 = createEaseOut(2);
const easeInOutQuad01 = createEaseInOut(2);
const easeInCub01 = createEaseIn(3);
const easeOutCub01 = createEaseOut(3);
const easeInOutCub01 = createEaseInOut(3);

const createCurveEase = (fn01) => (start, end, t) => lerp(start, end, fn01(t));

const easeLinear = createCurveEase(easeLinear01);
const easeInQuad = createCurveEase(easeInQuad01);
const easeOutQuad = createCurveEase(easeOutQuad01);
const easeInCub = createCurveEase(easeInCub01);
const easeOutCub = createCurveEase(easeOutCub01);

const EASE_CURVES_01 = {
  linear: { in: easeLinear01, out: easeLinear01, io: easeLinear01 },
  smooth: { in: easeInQuad01, out: easeOutQuad01, io: easeInOutQuad01 },
  sharp: { in: easeInCub01, out: easeOutCub01, io: easeInOutCub01 },
};

const getEase01 = (spec = "smooth:io") => {
  const [curve = "smooth", mode = "io"] = spec.toLowerCase().trim().split(":");
  const family = EASE_CURVES_01[curve] || EASE_CURVES_01.smooth;
  return family[mode] || family.io;
};

const CURVE_EASE = {
  linear: { in: easeLinear, out: easeLinear },
  smooth: { in: easeInQuad, out: easeOutQuad },
  sharp: { in: easeInCub, out: easeOutCub },
};

const computeCurvature = (dy, d2y) => d2y / Math.pow(1 + dy * dy, 1.5);

const wrap = (v, m) => {
  if (m <= 0) return v;
  const r = v % m;
  return r < 0 ? r + m : r;
};

const shortestSignedDelta = (a, b, m) => {
  if (m <= 0) return a - b;
  let d = (a - b) % m;
  if (d > m * 0.5) d -= m;
  if (d < -m * 0.5) d += m;
  return d;
};

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
  easeLinear,
  easeInQuad,
  easeOutQuad,
  easeInCub,
  easeOutCub,
  easeInOutQuad01,
  easeInOutCub01,
  getEase01,
  CURVE_EASE,
  computeCurvature,
  wrap,
  shortestSignedDelta,
  tangentNormalFromSlope,
};

Object.freeze(window.MathUtil);
