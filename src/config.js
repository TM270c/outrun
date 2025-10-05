const TUNE_PLAYER = {
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
  playerScale: 1.00,
};

const ROAD_COLS_NEAR = 6;
const ROAD_COLS_FAR  = 2;
const COL_PX_TARGET  = 96;
const ROW_PX_TARGET  = 18;
const ROW_MAX        = 64;

const TUNE_TRACK = {
  segmentLength: 200,
  roadWidth: 2400,
  drawDistance: 200,
  fov: 140,
  cameraHeight: 700,
  camBackSegments: 2,
  camYTau: 0.1,
  cliffPush: 0.5,
  railInset: 0.95,
  wallShortLeft:  400,
  wallShortRight: 400,
  MPerPxX: 8,
  MPerPxY: 40,
};

const CLIFF_PUSH = { distanceGain: 0.6, capPerFrame: 0.5 };
const CLIFF_CAMERA_FRACTION = 1 / 3;
const FAILSAFE   = { belowRoadUnits: 600 };

const FOG = {
  enabled: true,
  nearSegs: 0,
  farSegs: 160,
  color: [0.1, 0.5, 0.8],
};

const DEFAULT_COLORS = {
  road: [0.5, 0.5, 0.5, 1],
  wall: [0.5, 0.5, 0.5, 1],
  rail: [0.5, 0.5, 0.5, 1],
};

const DEBUG = { mode: 'off', span: 3, colors: { a:[1,1,1,1], b:[0.82,0.90,1,1] } };

const SPRITE_FAR = { shrinkTo: 0.1, power: 0.4 };

const PARALLAX_LAYERS = [
  { key:'horizon1', parallaxX: 0.05, uvSpanX: 1.0, uvSpanY: 1.0 },
  { key:'horizon2', parallaxX: 0.10, uvSpanX: 1.0, uvSpanY: 1.0 },
  { key:'horizon3', parallaxX: 0.18, uvSpanX: 1.0, uvSpanY: 1.0 },
];

const DRIFT = {
  boostChargeMin: 0.60,
  boostTime: 0.35,
  boostMult: 1.8,
  boostSteerScale: 0.6,
  boostLockBase: 0.75,
  boostLockWith: 1.25,
  boostLockAgainst: 0.25,
};

const BOOST_ZONE_EFFECT = {
  speedAdd: 1500,
};

const BOOST_ZONE_TYPES = { JUMP: 'jump', DRIVE: 'drive' };
const BOOST_ZONE_FALLBACK_COLOR = {
  fill: 'rgb(255,255,255)',
  stroke: '#fafafa',
  solid: [1, 1, 1, 1],
};
const BOOST_ZONE_COLORS = {
  [BOOST_ZONE_TYPES.JUMP]: {
    fill: 'rgb(255,152,0)',
    stroke: '#ff9800',
    solid: [1, 152/255, 0, 1],
  },
  [BOOST_ZONE_TYPES.DRIVE]: {
    fill: 'rgb(33,150,243)',
    stroke: '#2196f3',
    solid: [33/255, 150/255, 243/255, 1],
  },
};
const BOOST_ZONE_TEXTURE_KEYS = {
  [BOOST_ZONE_TYPES.JUMP]: 'boostJump',
  [BOOST_ZONE_TYPES.DRIVE]: 'boostDrive',
};
const BOOST_LANE_LIMITS = { MIN: -1, MAX: 1 };
const ROAD_LANE_LIMITS = { MIN: -2, MAX: 2 };

const cfgTilt = { tiltMaxDeg: 45, tiltSens: -3, tiltCurveWeight: -.2, tiltEase: 0.08, tiltDir: 1 };
const cfgTiltAdd = { tiltAddEnabled: true, tiltAddMaxDeg: null };

const OVERLAP = { x: 0.75, y: 0.75 };

window.Config = {
  TUNE_PLAYER,
  ROAD_COLS_NEAR,
  ROAD_COLS_FAR,
  COL_PX_TARGET,
  ROW_PX_TARGET,
  ROW_MAX,
  TUNE_TRACK,
  CLIFF_PUSH,
  CLIFF_CAMERA_FRACTION,
  FAILSAFE,
  FOG,
  DEFAULT_COLORS,
  DEBUG,
  SPRITE_FAR,
  PARALLAX_LAYERS,
  DRIFT,
  BOOST_ZONE_EFFECT,
  BOOST_ZONE_TYPES,
  BOOST_ZONE_FALLBACK_COLOR,
  BOOST_ZONE_COLORS,
  BOOST_ZONE_TEXTURE_KEYS,
  BOOST_LANE_LIMITS,
  ROAD_LANE_LIMITS,
  cfgTilt,
  cfgTiltAdd,
  OVERLAP,
};

Object.freeze(window.Config);
