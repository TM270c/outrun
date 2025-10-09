// Build metadata for tracking deployed versions.
const build = Object.freeze({
  version: '0.1.0',
});

// Core handling and tuning for the player car.
const player = {
  accelForce: 3000,     // forward push strength
  brakeForce: 3000,     // braking strength
  topSpeed: 7000,       // on-road speed cap
  gravity: 6400,        // vertical pull amount
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
  colWidthPx: 96,
  rowHeightPx: 18,
  maxRows: 64,
};

// Track geometry and texture sampling values.
const track = {
  segmentSize: 200,
  roadWidth: 2400,
  drawDistance: 200,
  railInset: 0.95,
  wallShort: { left: 400, right: 400 },
  metersPerPixel: { x: 8, y: 40 },
};

// Camera placement and smoothing while following the player.
const camera = {
  fovDeg: 140,
  height: 700,
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
const colors = {
  road: [0.5, 0.5, 0.5, 1],
  wall: [0.5, 0.5, 0.5, 1],
  rail: [0.5, 0.5, 0.5, 1],
};

// Debug overlay defaults for development builds.
const debug = {
  mode: 'off',
  span: 3,
  colors: { a: [1, 1, 1, 1], b: [0.82, 0.9, 1, 1] },
};

// Sprite rendering adjustments.
const sprites = {
  far: { shrinkTo: 0.1, power: 0.4 },
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
  total: 20,
  edgePad: 0.02,
  avoidLookaheadSegs: 20,
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

const forceLandingOnCarImpact = false;

const snowScreenDistance = 60;
const snowScreenDensity = 1;

window.Config = {
  build,
  player,
  grid,
  track,
  camera,
  cliffs,
  failsafe,
  fog,
  colors,
  debug,
  sprites,
  parallaxLayers,
  traffic,
  drift,
  boost,
  lanes,
  tilt,
  forceLandingOnCarImpact,
  snowScreenDistance,
  snowScreenDensity,
};

Object.freeze(window.Config);
