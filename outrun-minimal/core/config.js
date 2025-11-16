export const segmentLength = 40;
export const roadWidth = 2.0; // world units, normalized for lateral u in [-1, 1]
export const maxSpeed = 120;
export const acceleration = 90;
export const brakeForce = 160;
export const drag = 25;
export const offRoadPenalty = 0.4;
export const guardrailBounce = 0.5;
export const steerStrength = 1.4;
export const cameraHeight = 1.5;
export const cameraDepth = 1.2;
export const cameraDistance = 60;
export const curveScale = 1.2;
export const guardrailWidth = 0.15;
export const boostLaneWidth = 0.35;
export const boostDriveImpulse = 35;
export const boostJumpImpulse = 55;
export const cliffHorizontalOffset = 0.35;

export const colors = {
  background: [0.03, 0.05, 0.12, 1.0],
  road: [0.14, 0.14, 0.16, 1.0],
  lane: [0.18, 0.18, 0.22, 1.0],
  guardrail: [0.82, 0.1, 0.1, 1.0],
  boostDrive: [0.1, 0.6, 0.1, 1.0],
  boostJump: [0.1, 0.45, 0.9, 1.0],
  cliff: [0.3, 0.24, 0.18, 1.0],
  car: [0.9, 0.22, 0.2, 1.0]
};
