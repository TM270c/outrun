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

const parseEaseSpec01 = (spec = "smooth:io", fallbackMode = "io") => {
  const [curveRaw = "smooth", modeRaw = fallbackMode] = spec.toLowerCase().trim().split(":");
  const family = EASE_CURVES_01[curveRaw] || EASE_CURVES_01.smooth;
  const mode = family[modeRaw] ? modeRaw : fallbackMode;
  return { family, mode };
};

const getEaseFamily01 = (spec = "smooth:io") => {
  const { family } = parseEaseSpec01(spec);
  return family;
};

const getEase01 = (spec = "smooth:io") => {
  const { family, mode } = parseEaseSpec01(spec);
  return family[mode] || family.io;
};

const createCurveEaseFamily = (family01) => ({
  in: createCurveEase(family01.in),
  out: createCurveEase(family01.out),
  io: createCurveEase(family01.io),
});

const getCurveEaseFamily = (spec = "smooth:io") => createCurveEaseFamily(getEaseFamily01(spec));

const CURVE_EASE = {
  linear: getCurveEaseFamily("linear"),
  smooth: getCurveEaseFamily("smooth"),
  sharp: getCurveEaseFamily("sharp"),
};

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
  easeLinear,
  easeInQuad,
  easeOutQuad,
  easeInCub,
  easeOutCub,
  easeInOutQuad01,
  easeInOutCub01,
  parseEaseSpec01,
  getEaseFamily01,
  getEase01,
  getCurveEaseFamily,
  CURVE_EASE,
  computeCurvature,
  tangentNormalFromSlope,
};

Object.freeze(window.MathUtil);
