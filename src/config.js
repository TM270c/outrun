// ------------------------------
// Gameplay and rendering config
// ------------------------------

// Player tuning controls driving feel and boost behaviour.
export const TUNE_PLAYER = {
  accel: 3000,
  brake: 3000,
  maxSpeed: 7000,
  gravity: 6400,
  rollFriction: 0.3,
  airDrag: 0,
  steerBase: 2.0,
  leanCentrifugal: 0.1,
  hopImpulse: 1400,
  hopCooldown: 0.25,
  crestBoostMultiplier: 1.25,
  playerScale: 1.0,
};

// Subdivision targets for the adaptive road mesh.
export const ROAD_SUBDIVISION = {
  colsNear: 6,
  colsFar: 2,
  colPxTarget: 96,
  rowPxTarget: 18,
  rowMax: 64,
};

// Track layout / camera tuning.
export const TUNE_TRACK = {
  segmentLength: 200,
  roadWidth: 2400,
  drawDistance: 200,
  fov: 140,
  cameraHeight: 700,
  camBackSegments: 2,
  camYTau: 0.1,
  cliffPush: 0.5,
  railInset: 0.95,
  wallShortLeft: 400,
  wallShortRight: 400,
  MPerPxX: 8,
  MPerPxY: 40,
};

export const CLIFF_PUSH = { distanceGain: 0.6, capPerFrame: 0.5 };
export const CLIFF_CAMERA_FRACTION = 1 / 3;
export const FAILSAFE = { belowRoadUnits: 600 };

export const FOG = {
  enabled: true,
  nearSegs: 0,
  farSegs: 160,
  color: [0.1, 0.5, 0.8],
};

export const DEFAULT_COLORS = {
  road: [0.5, 0.5, 0.5, 1],
  wall: [0.5, 0.5, 0.5, 1],
  rail: [0.5, 0.5, 0.5, 1],
};

export const DEBUG = { mode: 'off', span: 3, colors: { a: [1, 1, 1, 1], b: [0.82, 0.9, 1, 1] } };

export const SPRITE_FAR = { shrinkTo: 0.1, power: 0.4 };

export const PARALLAX_LAYERS = [
  { key: 'horizon1', parallaxX: 0.05, uvSpanX: 1.0, uvSpanY: 1.0 },
  { key: 'horizon2', parallaxX: 0.1, uvSpanX: 1.0, uvSpanY: 1.0 },
  { key: 'horizon3', parallaxX: 0.18, uvSpanX: 1.0, uvSpanY: 1.0 },
];

export const DRIFT = {
  boostChargeMin: 0.6,
  boostTime: 0.35,
  boostMult: 1.8,
  boostSteerScale: 0.6,
  boostLockBase: 0.75,
  boostLockWith: 1.25,
  boostLockAgainst: 0.25,
};

export const BOOST_ZONE_EFFECT = { speedAdd: 1500 };

export const BOOST_ZONE_TYPES = { JUMP: 'jump', DRIVE: 'drive' };

export const BOOST_ZONE_COLORS = {
  [BOOST_ZONE_TYPES.JUMP]: {
    fill: 'rgb(255,152,0)',
    stroke: '#ff9800',
    solid: [1, 152 / 255, 0, 1],
  },
  [BOOST_ZONE_TYPES.DRIVE]: {
    fill: 'rgb(33,150,243)',
    stroke: '#2196f3',
    solid: [33 / 255, 150 / 255, 243 / 255, 1],
  },
};

export const BOOST_ZONE_TEXTURE_KEYS = {
  [BOOST_ZONE_TYPES.JUMP]: 'boostJump',
  [BOOST_ZONE_TYPES.DRIVE]: 'boostDrive',
};

export const BOOST_LANE_LIMITS = { MIN: -1, MAX: 1 };
export const ROAD_LANE_LIMITS = { MIN: -2, MAX: 2 };

export const cfgTilt = { tiltMaxDeg: 45, tiltSens: -3, tiltCurveWeight: -0.2, tiltEase: 0.08, tiltDir: 1 };
export const cfgTiltAdd = { tiltAddEnabled: true, tiltAddMaxDeg: null };

export const BOOST_ZONE_FALLBACK_COLOR = {
  fill: 'rgb(255,255,255)',
  stroke: '#fafafa',
  solid: [1, 1, 1, 1],
};

export const clampBoostLane = (v) => {
  if (v == null) return v;
  const { MIN, MAX } = BOOST_LANE_LIMITS;
  if (v < MIN) return MIN;
  if (v > MAX) return MAX;
  return v;
};

export const clampRoadLane = (v, fallback = 0) => {
  if (v == null) return fallback;
  const { MIN, MAX } = ROAD_LANE_LIMITS;
  if (v < MIN) return MIN;
  if (v > MAX) return MAX;
  return v;
};

export const laneToCenterOffset = (n, fallback = 0) => clampRoadLane(n, fallback) * 0.5;

export const laneToRoadRatio = (n, fallback = 0) => {
  const clamped = clampRoadLane(n, fallback);
  return (clamped - ROAD_LANE_LIMITS.MIN) / (ROAD_LANE_LIMITS.MAX - ROAD_LANE_LIMITS.MIN);
};

export function parseBoostZoneType(raw) {
  if (raw == null) return null;
  const norm = raw.toString().trim().toLowerCase();
  if (!norm) return null;
  if (['jump', 'orange', 'crest', 'air'].includes(norm)) return BOOST_ZONE_TYPES.JUMP;
  if (['drive', 'ground', 'auto', 'blue'].includes(norm)) return BOOST_ZONE_TYPES.DRIVE;
  return null;
}

export function parseBoostLaneValue(raw) {
  if (raw == null || raw === '') return null;
  const num = Number.parseFloat(raw);
  if (!Number.isFinite(num)) return null;
  const { MIN, MAX } = BOOST_LANE_LIMITS;
  if (num < MIN) return MIN;
  if (num > MAX) return MAX;
  return num;
}
