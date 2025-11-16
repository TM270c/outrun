const FIELD_OF_VIEW = 90;

export const World = {
  width: 960,
  height: 640,
  roadWidth: 2400,
  lanes: 3,
  segmentLength: 180,
  drawDistance: 140,
  fieldOfView: FIELD_OF_VIEW,
  cameraHeight: 1100,
  cameraDepth: 1, // recalculated below
  playerZ: 900,
  accel: 7000,
  brake: 4500,
  decel: 2000,
  maxSpeed: 6000,
  offRoadLimit: 2.2,
  turnSpeed: 2.6,
};

World.cameraDepth = (World.height / 2) / Math.tan((World.fieldOfView * Math.PI) / 180 / 2);

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function percentRemaining(position, segmentLength) {
  return (position % segmentLength) / segmentLength;
}

export function createState() {
  return {
    position: 0,
    speed: 0,
    playerX: 0,
    segments: [],
    distance: 0,
  };
}
