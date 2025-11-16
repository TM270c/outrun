export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function ease01(t) {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}
