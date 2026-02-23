// Build metadata for tracking deployed versions.
const build = Object.freeze({
  version: '0.1.0',
});

// Core handling and tuning for the player car.
const player = {
  accelForce: 4000,     // forward push strength
  brakeForce: 4000,     // braking strength
  topSpeed: 9000,       // on-road speed cap
  gravity: 9000,        // vertical pull amount
  rollDrag: 0.3,        // sideways speed dampener
  airDrag: 0,           // airborne drag factor
  steerRate: 2.0,       // base steering response
  curveLean: 0.1,       // curve lean contribution
  hopImpulse: 1400,     // hop launch strength
  hopCooldown: 0.25,    // seconds between hops
  crestBoost: 1.25,     // crest boost multiplier
  scale: 1.0,           // sprite scale factor
};

// Screen-space grid targets for drawing the road mesh.
const grid = {
  roadColsNear: 6,
  roadColsFar: 2,
  colWidthPx: 18,
  rowHeightPx: 18,
  maxRows: 4,
};

// Track geometry and texture sampling values.
const track = {
  segmentSize: 250,
  roadWidth: 2400,
  drawDistance: 120,
  railInset: 0.95,
  wallShort: { left: 400, right: 400 },
  metersPerPixel: { x: 8, y: 40 },
};

// Camera placement and smoothing while following the player.
const camera = {
  fovDeg: 140,
  height: 800,
  backSegments: 2,
  heightEase: 0.1,
};

// Cliff behaviour and camera bias when approaching drops.
const cliffs = {
  pushStep: 0.5,
  distanceGain: 0.6,
  capPerFrame: 0.5,
  cameraBlend: 1 / 3,
  cliffLimit: 60,
};

// Guard rails for falling through the world.
const failsafe = {
  dropUnits: 600,
};

// Atmospheric fog blending.
const fog = {
  enabled: true,
  nearSegments: 0,
  farSegments: 160,
  color: [0.1, 0.5, 0.8],
};

// Default fallback tint values for world primitives.
// Snow screen rendering controls.
const snowScreenDistance = 40;
const snowScreenDensity = 4;
const snowScreenSize = 1;
const snowDensity = 0.3;
const snowSize = { min: 0.75, max: 1.25 };
const snowSpeed = { min: 0.1, max: .2 };
const snowStretch = 10;

// Debug overlay defaults for development builds.
const debug = {
  mode: 'off',
  span: 3,
  colors: { a: [1, 1, 1, 1], b: [0.82, 0.9, 1, 1] },
  textures: true,
};

// Sprite rendering adjustments.
const sprites = {
  far: { shrinkTo: 0.05, power: 0.4 },
  overlap: { x: 0.75, y: 0.75 },
};

// Background parallax layers rendered behind the horizon.
const parallaxLayers = [
  { key: 'horizon1', parallaxX: 0.05, uvSpanX: 1.0, uvSpanY: 1.0 },
  { key: 'horizon2', parallaxX: 0.1,  uvSpanX: 1.0, uvSpanY: 1.0 },
  { key: 'horizon3', parallaxX: 0.18, uvSpanX: 1.0, uvSpanY: 1.0 },
];

// Road traffic tuning for non-player cars.
const traffic = {
  total: 30,
  edgePad: 0.02,
  avoidLookaheadSegs: 20,
  vehicleWeights: {
    car: 1,
    truck: 0.7,
    semi: 0.4,
    special: 0.2,
  },
  vehicleSpeeds: {
    car: { base: 0.16, variance: 0.18 },
    truck: { base: 0.14, variance: 0.14 },
    semi: { base: 0.12, variance: 0.1 },
    special: { base: 0.2, variance: 0.15 },
  },
  specials: {
    npcSpecial01: { wN: 0.34, hitboxWN: 0.2, speed: { base: 0.22, variance: 0.1 } },
    npcSpecial02: { wN: 0.35, hitboxWN: 0.2, speed: { base: 0.21, variance: 0.1 } },
    npcSpecial03: { wN: 0.36, hitboxWN: 0.21, speed: { base: 0.23, variance: 0.11 } },
    npcSpecial04: { wN: 0.32, hitboxWN: 0.19, speed: { base: 0.2, variance: 0.1 } },
    npcSpecial05: { wN: 0.4,  hitboxWN: 0.24, speed: { base: 0.24, variance: 0.12 } },
    npcSpecial06: { wN: 0.33, hitboxWN: 0.2, speed: { base: 0.19, variance: 0.09 } },
    npcSpecial07: { wN: 0.37, hitboxWN: 0.22, speed: { base: 0.23, variance: 0.11 } },
    npcSpecial08: { wN: 0.35, hitboxWN: 0.21, speed: { base: 0.22, variance: 0.1 } },
    npcSpecial09: { wN: 0.38, hitboxWN: 0.23, speed: { base: 0.25, variance: 0.12 } },
  },
};

// Drift boost tuning.
const drift = {
  chargeMin: 0.6,
  boostTime: 0.35,
  boostScale: 1.8,
  steerScale: 0.6,
  lockBase: 0.75,
  lockWith: 1.25,
  lockAgainst: 0.25,
};

// Boost zone visuals and behaviour.
const boost = {
  speedGain: 1500,
  types: { jump: 'jump', drive: 'drive' },
  fallbackColor: {
    fill: 'rgb(255,255,255)',
    stroke: '#fafafa',
    solid: [1, 1, 1, 1],
  },
  colors: {
    jump: {
      fill: 'rgb(255,152,0)',
      stroke: '#ff9800',
      solid: [1, 152 / 255, 0, 1],
    },
    drive: {
      fill: 'rgb(33,150,243)',
      stroke: '#2196f3',
      solid: [33 / 255, 150 / 255, 243 / 255, 1],
    },
  },
  manual: {
    impulse: 2500,
    duration: 2.0,
    fovPeak: 148,
  },
  textures: { jump: 'boostJump', drive: 'boostDrive' },
};

// Lane constraints for vehicles and boost strips.
const lanes = {
  road: { min: -2, max: 2 },
  boost: { min: -1, max: 1 },
};

// Tilt behaviour used by the camera and UI.
const tilt = {
  base: { tiltMaxDeg: 45, tiltSens: -3, tiltCurveWeight: -0.2, tiltEase: 0.08, tiltDir: 1 },
  additive: { tiltAddEnabled: true, tiltAddMaxDeg: null },
};

// Near miss tuning controls.
const nearMiss = {
  forwardDistanceScale: 0.5,
  forwardDistanceMin: 5,
  forwardDistanceFallback: 12,
};

const game = {
  mode: 'timeTrial', // 'race' | 'timeTrial'
  timeTrial: {
    startTime: 30,
  },
};

const forceLandingOnCarImpact = false;

window.Config = {
  build,
  player,
  grid,
  track,
  camera,
  cliffs,
  failsafe,
  fog,
  debug,
  sprites,
  parallaxLayers,
  traffic,
  drift,
  boost,
  lanes,
  tilt,
  nearMiss,
  game,
  forceLandingOnCarImpact,
  snowScreenDistance,
  snowScreenDensity,
  snowScreenSize,
  snowDensity,
  snowSize,
  snowSpeed,
  snowStretch,
};

Object.freeze(window.Config);
