import {
  acceleration,
  brakeForce,
  drag,
  maxSpeed,
  offRoadPenalty,
  guardrailBounce,
  steerStrength,
  boostLaneWidth,
  boostDriveImpulse,
  boostJumpImpulse,
  segmentLength
} from '../core/config.js';
import { clamp } from '../core/math.js';

function createCarState() {
  return { s: 0, u: 0, v: 0 };
}

function findSegment(segments, distance) {
  const index = Math.floor(distance / segmentLength) % segments.length;
  return segments[index];
}

function applyBoost(car, segment, input) {
  if (!segment.inBoostZone || segment.boostType === 'none') {
    return;
  }

  const inLane = Math.abs(car.u) <= boostLaneWidth;
  if (segment.boostType === 'drive' && inLane) {
    car.v = clamp(car.v + boostDriveImpulse, 0, maxSpeed * 1.25);
  }

  if (segment.boostType === 'jump' && inLane && input.jump) {
    car.v = clamp(car.v + boostJumpImpulse, 0, maxSpeed * 1.25);
  }
}

function handleEdges(car, segment) {
  const limit = 1;
  const guardLeft = segment.guardrails === 'left' || segment.guardrails === 'both';
  const guardRight = segment.guardrails === 'right' || segment.guardrails === 'both';

  if (car.u < -limit) {
    if (guardLeft) {
      car.u = -limit;
      car.v *= guardrailBounce;
    } else {
      car.u = Math.max(car.u, -limit - 0.25);
      car.v *= offRoadPenalty;
    }
  }

  if (car.u > limit) {
    if (guardRight) {
      car.u = limit;
      car.v *= guardrailBounce;
    } else {
      car.u = Math.min(car.u, limit + 0.25);
      car.v *= offRoadPenalty;
    }
  }
}

function stepCar(car, input, segments, trackLength, dt) {
  if (input.throttle) {
    car.v += acceleration * dt;
  } else {
    car.v -= drag * dt;
  }

  if (input.brake) {
    car.v -= brakeForce * dt;
  }

  car.v = clamp(car.v, 0, maxSpeed);
  const steerInput = (input.right ? 1 : 0) + (input.left ? -1 : 0);
  car.u += steerStrength * steerInput * (car.v / maxSpeed) * dt;

  const wrappedS = ((car.s % trackLength) + trackLength) % trackLength;
  const segment = findSegment(segments, wrappedS);
  applyBoost(car, segment, input);
  handleEdges(car, segment);

  car.s = (car.s + car.v * dt) % trackLength;
}

export { createCarState, stepCar, findSegment };
