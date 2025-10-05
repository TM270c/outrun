
(function(global){
  const { Config, MathUtil, World } = global;

  if (!Config || !MathUtil || !World) {
    throw new Error('Gameplay module requires Config, MathUtil, and World globals');
  }

  const {
    player,
    track,
    camera,
    cliffs,
    failsafe,
    drift,
    boost,
    lanes,
    tilt: tiltConfig = {},
  } = Config;

  const {
    base: tiltBase = { tiltDir: 1, tiltCurveWeight: 0, tiltEase: 0.1, tiltSens: 0, tiltMaxDeg: 0 },
    additive: tiltAdd = { tiltAddEnabled: false, tiltAddMaxDeg: null },
  } = tiltConfig;

  const {
    clamp,
    clamp01,
    computeCurvature,
    tangentNormalFromSlope,
    wrap,
    wrapIndex,
    wrapDistance,
  } = MathUtil;

  const {
    data,
    roadWidthAt,
    floorElevationAt,
    cliffSurfaceInfoAt,
    cliffLateralSlopeAt,
    segmentAtS,
    elevationAt,
    groundProfileAt,
    boostZonesOnSegment,
    lane = {},
  } = World;

  const {
    clampBoostLane = (v) => v,
  } = lane;

  const segments = data.segments;
  const segmentLength = track.segmentSize;
  const trackLengthRef = () => data.trackLength || 0;

  const hasSegments = () => segments.length > 0;

  const EPS = 1e-6; // Small epsilon to avoid repeated literals.

  const BASE_SPRITE_META = { wN: 0.2, aspect: 1, tint: [1, 1, 1, 1], tex: () => null };
  const createSpriteMeta = (overrides = {}) => ({ ...BASE_SPRITE_META, ...overrides });

  // Detect if a segment carries guard rails.
  const hasRail = (seg) => Boolean(seg && seg.features && seg.features.rail);

  // Resolve floor height sampler if provided.
  const sampleFloorElevation = (s, nNorm, fallback) => (
    typeof floorElevationAt === 'function' ? floorElevationAt(s, nNorm) : fallback
  );

  // Translate steering input flags into a signed axis.
  const steerAxisFromInput = (input) => {
    if (input.left && input.right) return 0;
    if (input.left) return -1;
    if (input.right) return 1;
    return 0;
  };

  // Clear drift bookkeeping when exiting the state machine.
  const resetDriftState = () => {
    state.driftState = 'idle';
    state.driftDirSnapshot = 0;
    state.driftCharge = 0;
    state.allowedBoost = false;
  };

  // Initialize drift state while preserving the reset behavior.
  const beginDrift = (dir) => {
    state.driftState = 'drifting';
    state.driftDirSnapshot = dir;
    state.driftCharge = 0;
    state.allowedBoost = false;
  };

  const ensureArray = (obj, key) => {
    if (!obj) return [];
    if (!Array.isArray(obj[key])) obj[key] = [];
    return obj[key];
  };

  const DEFAULT_SPRITE_META = {
    PLAYER: createSpriteMeta({ wN: 0.16, aspect: 0.7, tint: [0.9, 0.22, 0.21, 1] }),
    CAR:    createSpriteMeta({ wN: 0.28, aspect: 0.7, tint: [0.2, 0.7, 1.0, 1] }),
    SEMI:   createSpriteMeta({ wN: 0.34, aspect: 1.6, tint: [0.85, 0.85, 0.85, 1] }),
    TREE:   createSpriteMeta({ wN: 0.5,  aspect: 3.0, tint: [0.22, 0.7, 0.22, 1] }),
    SIGN:   createSpriteMeta({ wN: 0.55, aspect: 1.0, tint: [1, 1, 1, 1] }),
    PALM:   createSpriteMeta({ wN: 0.38, aspect: 3.2, tint: [0.25, 0.62, 0.27, 1] }),
    PICKUP: createSpriteMeta({ wN: 0.10, aspect: 1.0, tint: [1, 0.92, 0.2, 1] }),
  };

  const NPC = { total: 20, edgePad: 0.02, avoidLookaheadSegs: 20 };
  const CAR_TYPES = ['CAR', 'SEMI'];

  const randomChoice = (list) => {
    if (!Array.isArray(list) || list.length === 0) return undefined;
    const index = Math.floor(Math.random() * list.length);
    return list[index];
  };

  const randomSign = () => (Math.random() < 0.5 ? -1 : 1);
  const chooseCarType = () => (Math.random() < 0.75 ? CAR_TYPES[0] : CAR_TYPES[1]);
  const PROP_KIND_CHOICES = ['TREE', 'PALM'];
  const randomPropKind = () => randomChoice(PROP_KIND_CHOICES);

  const defaultGetKindScale = (kind) => (kind === 'PLAYER' ? player.scale : 1);

  const state = {
    phys: { s: 0, y: 0, vx: 0, vy: 0, vtan: 0, grounded: true, t: 0, nextHopTime: 0, boostFlashTimer: 0 },
    playerN: 0,
    camYSmooth: 0,
    hopHeld: false,
    driftState: 'idle',
    driftDirSnapshot: 0,
    driftCharge: 0,
    allowedBoost: false,
    boostTimer: 0,
    activeDriveZoneId: null,
    lateralRate: 0,
    prevPlayerN: 0,
    camRollDeg: 0,
    playerTiltDeg: 0,
    resetMatteActive: false,
    pendingRespawn: null,
    pickupCollected: 0,
    pickupTotal: 0,
    cars: [],
    spriteMeta: DEFAULT_SPRITE_META,
    getKindScale: defaultGetKindScale,
    input: { left: false, right: false, up: false, down: false, hop: false },
    callbacks: {
      onQueueReset: null,
      onToggleOverlay: null,
      onResetScene: null,
      onQueueRespawn: null,
    },
    camera: {
      fieldOfView: camera.fovDeg,
      cameraDepth: 0,
      nearZ: 0,
      playerZ: 0,
      updateFromFov: null,
    },
  };

  function getSpriteMeta(kind) {
    const metaStack = state.spriteMeta || {};
    return metaStack[kind] || DEFAULT_SPRITE_META[kind] || { wN: 0.2, aspect: 1, tint: [1, 1, 1, 1], tex: () => null };
  }

  function segmentAtIndex(idx) {
    if (!hasSegments()) return null;
    return segments[wrapIndex(idx, segments.length)];
  }

  // Check whether the player lateral position falls inside a zone.
  function playerWithinBoostZone(zone, nNorm) {
    if (!zone) return false;
    const { nStart = clampBoostLane(-2), nEnd = clampBoostLane(2) } = zone;
    const min = Math.min(nStart, nEnd);
    const max = Math.max(nStart, nEnd);
    return nNorm >= min && nNorm <= max;
  }

  // Return all zones intersecting the current player offset.
  function boostZonesForPlayer(seg, nNorm) {
    const zones = boostZonesOnSegment(seg);
    return zones.filter((zone) => playerWithinBoostZone(zone, nNorm));
  }

  function jumpZoneForPlayer() {
    const segNow = segmentAtS(state.phys.s);
    if (!segNow) return null;
    const zonesHere = boostZonesForPlayer(segNow, state.playerN);
    return zonesHere.find((zone) => zone.type === boost.types.jump) || null;
  }

  function applyBoostImpulse() {
    const { phys } = state;
    const boostCap = player.topSpeed * drift.boostScale;
    const currentForward = Math.max(phys.vtan, 0);
    const boosted = currentForward + boost.speedGain;
    phys.vtan = clamp(boosted, 0, boostCap);
  }

  function applyJumpZoneBoost(zone) {
    if (!zone) return;
    state.boostTimer = Math.max(state.boostTimer, drift.boostTime);
    applyBoostImpulse();
    state.phys.boostFlashTimer = Math.max(state.phys.boostFlashTimer, 0.3);
  }

  function playerHalfWN() {
    return getSpriteMeta('PLAYER').wN * state.getKindScale('PLAYER') * 0.5;
  }

  // Half-width in normalized space for an NPC car sprite.
  function carHalfWN(car) {
    const type = car && car.type ? car.type : 'CAR';
    const meta = (car && car.meta) || getSpriteMeta(type);
    return (meta.wN || 0) * 0.5;
  }

  // Apply guard-rail constraints to a lateral bound.
  const clampToRailLimit = (segIndex, baseLimit, halfWidth, pad) => {
    const seg = segmentAtIndex(segIndex);
    if (hasRail(seg)) {
      const railInner = track.railInset - halfWidth - pad;
      return Math.min(baseLimit, railInner);
    }
    return baseLimit;
  };

  // NPC drift bound to avoid clipping geometry.
  function npcLateralLimit(segIndex, car) {
    const half = carHalfWN(car);
    const base = 1 - half - NPC.edgePad;
    return clampToRailLimit(segIndex, base, half, NPC.edgePad);
  }

  function nearestSegmentCenter(s) {
    return Math.round(s / segmentLength) * segmentLength + segmentLength * 0.5;
  }

  function getAdditiveTiltDeg() {
    if (!tiltAdd.tiltAddEnabled) return 0;
    const seg = segmentAtS(state.phys.s);
    if (!seg) return 0;
    const segT = clamp01((state.phys.s - seg.p1.world.z) / segmentLength);
    const info = cliffSurfaceInfoAt(seg.index, state.playerN, segT);
    const slopeA = info.slopeA ?? 0;
    const slopeB = info.slopeB ?? 0;
    let slope = info.slope ?? 0;
    if (info.section === 'A') {
      slope = slopeA;
    } else if (info.section === 'B') {
      slope = slopeB;
    }
    const angleDeg = -(180 / Math.PI) * Math.atan(slope);
    const tiltDeg = tiltBase.tiltDir * angleDeg;
    if (tiltAdd.tiltAddMaxDeg == null) return tiltDeg;
    return clamp(tiltDeg, -tiltAdd.tiltAddMaxDeg, tiltAdd.tiltAddMaxDeg);
  }

  state.getAdditiveTiltDeg = getAdditiveTiltDeg;

  function updateCameraFromFieldOfView() {
    const halfRad = (state.camera.fieldOfView * 0.5) * Math.PI / 180;
    const cameraDepth = 1 / Math.tan(halfRad);
    state.camera.cameraDepth = cameraDepth;
    state.camera.nearZ = 1 / cameraDepth;
    state.camera.playerZ = camera.height * cameraDepth;
  }

  function setFieldOfView(fov) {
    state.camera.fieldOfView = fov;
    updateCameraFromFieldOfView();
  }

  state.camera.updateFromFov = setFieldOfView;
  updateCameraFromFieldOfView();

  function applyCliffPushForce(step) {
    const ax = Math.abs(state.playerN);
    if (ax <= 1) return;
    const seg = segmentAtS(state.phys.s);
    if (!seg) return;
    const idx = seg.index;
    const segT = clamp01((state.phys.s - seg.p1.world.z) / segmentLength);
    const slope = cliffLateralSlopeAt(idx, state.playerN, segT);
    if (Math.abs(slope) <= EPS) return;
    const dir = -Math.sign(slope);
    if (dir === 0) return;
    const s = Math.max(0, Math.min(1.5, ax - 1));
    const gain = 1 + cliffs.distanceGain * s;
    const delta = clamp(dir * step * cliffs.pushStep * gain, -cliffs.capPerFrame, cliffs.capPerFrame);
    state.playerN += delta;
  }

  const overlap = (ax, aw, bx, bw, scale = 1) => Math.abs(ax - bx) < (aw + bw) * scale;

  function doHop() {
    const { phys } = state;
    if (!phys.grounded || phys.t < phys.nextHopTime) return false;
    const jumpZone = jumpZoneForPlayer();
    const { dy } = groundProfileAt(phys.s);
    const { tx, ty, nx, ny } = tangentNormalFromSlope(dy);
    const baseVx = phys.vtan * tx;
    const baseVy = phys.vtan * ty;
    const newVx = baseVx + nx * player.hopImpulse;
    const newVy = baseVy + ny * player.hopImpulse;
    phys.vx = newVx;
    phys.vy = newVy;
    phys.grounded = false;
    phys.nextHopTime = phys.t + player.hopCooldown;
    applyJumpZoneBoost(jumpZone);
    return true;
  }

  // Player edge constraint based on road lanes and guard rails.
  function playerLateralLimit(segIndex) {
    const halfW = playerHalfWN();
    const baseLimit = Math.min(Math.abs(lanes.road.min), Math.abs(lanes.road.max));
    const base = baseLimit - halfW - 0.015;
    return clampToRailLimit(segIndex, base, halfW, 0.015);
  }

  function resolvePickupCollisionsInSeg(seg) {
    if (!seg || !Array.isArray(seg.pickups) || !seg.pickups.length) return;
    const pHalf = playerHalfWN();
    const pickHalf = getSpriteMeta('PICKUP').wN * 0.5;
    for (const p of seg.pickups) {
      if (!p || p.collected) continue;
      if (overlap(state.playerN, pHalf, p.offset, pickHalf, 1)) {
        p.collected = true;
        state.pickupCollected++;
      }
    }
  }

  function resolveCollisions() {
    const { phys } = state;
    const seg = segmentAtS(phys.s);
    if (!seg) return;
    const pHalf = playerHalfWN();

    for (let i = 0; i < seg.cars.length; i++) {
      const car = seg.cars[i];
      if (!car) continue;
      if (Math.abs(phys.vtan) > car.speed) {
        if (overlap(state.playerN, pHalf, car.offset, carHalfWN(car), 1)) {
          const capped = car.speed / Math.max(1, Math.abs(phys.vtan));
          phys.vtan = car.speed * capped;
          phys.s = wrapDistance(car.z, -2, trackLengthRef());
          break;
        }
      }
    }

    if (!hasSegments()) return;
    const neighbors = [seg, segmentAtIndex(seg.index + 1), segmentAtIndex(seg.index - 1)];
    neighbors.forEach(resolvePickupCollisionsInSeg);
  }

  function updatePhysics(dt) {
    const { phys, input } = state;
    if (!hasSegments()) return;

    if (input.hop) {
      doHop();
      input.hop = false;
    }

    const steerAxis = steerAxisFromInput(input);
    const boosting = state.boostTimer > 0;
    if (boosting) state.boostTimer = Math.max(0, state.boostTimer - dt);
    const speed01 = clamp(Math.abs(phys.vtan) / player.topSpeed, 0, 1);
    let steerDx = dt * player.steerRate * speed01;
    if (boosting) steerDx *= drift.steerScale;

    if (state.driftState === 'drifting') {
      let lock = drift.lockBase;
      if (steerAxis === state.driftDirSnapshot) lock = drift.lockWith;
      else if (steerAxis === -state.driftDirSnapshot) lock = drift.lockAgainst;
      state.playerN += steerDx * lock * state.driftDirSnapshot;
    } else if (steerAxis !== 0) {
      state.playerN += steerDx * steerAxis;
    }

    const segAhead = segmentAtS(phys.s + state.camera.playerZ);
    if (segAhead) {
      state.playerN -= steerDx * speed01 * segAhead.curve * player.curveLean;
    }

    applyCliffPushForce(steerDx);
    state.playerN = clamp(state.playerN, lanes.road.min, lanes.road.max);

    let segNow = segmentAtS(phys.s);
    const segFeatures = segNow ? segNow.features : null;
    const zonesHere = boostZonesForPlayer(segNow, state.playerN);
    const driveZoneHere = zonesHere.find((zone) => zone.type === boost.types.drive) || null;
    const zoneBoost = (segFeatures && segFeatures.boostMultiplier != null) ? segFeatures.boostMultiplier : player.crestBoost;
    const zoneMultBase = zonesHere.length ? zoneBoost : 1;

    const prevGrounded = phys.grounded;
    if (phys.grounded) {
      const groundNow = groundProfileAt(phys.s);
      const tnNow = tangentNormalFromSlope(groundNow.dy);
      const boostScale = boosting ? drift.boostScale : 1;
      const boostedMaxSpeed = player.topSpeed * boostScale;
      const accel = player.accelForce * boostScale;
      const brake = player.brakeForce * boostScale;
      let accelSum = 0;
      if (input.up) accelSum += accel;
      if (input.down) accelSum -= brake;
      accelSum += -player.gravity * tnNow.ty;
      accelSum += -player.rollDrag * phys.vtan;
      phys.vtan = clamp(phys.vtan + accelSum * dt, -boostedMaxSpeed, boostedMaxSpeed);

      const driveZoneId = driveZoneHere ? driveZoneHere.id : null;
      if (driveZoneId && state.activeDriveZoneId !== driveZoneId) {
        state.boostTimer = Math.max(state.boostTimer, drift.boostTime);
        applyBoostImpulse();
      }
      state.activeDriveZoneId = driveZoneId;

      const travelV = phys.vtan * zoneMultBase;
      phys.s += travelV * tnNow.tx * dt;

      const groundNext = groundProfileAt(phys.s);
      const tnNext = tangentNormalFromSlope(groundNext.dy);
      phys.y = groundNext.y;

      const kap = computeCurvature(groundNext.dy, groundNext.d2y);
      if (kap < 0) {
        const need = phys.vtan * phys.vtan * -kap;
        const support = player.gravity * tnNext.ny;
        if (need > support) {
          phys.grounded = false;
          phys.vx = phys.vtan * tnNext.tx;
          phys.vy = phys.vtan * tnNext.ty;
        }
      }
    } else {
      phys.vy -= player.gravity * dt;
      if (player.airDrag) {
        phys.vx -= player.airDrag * phys.vx * dt;
        phys.vy -= player.airDrag * phys.vy * dt;
      }
      phys.s += phys.vx * dt;
      phys.y += phys.vy * dt;

      state.activeDriveZoneId = null;

      const groundNext = groundProfileAt(phys.s);
      const gy = groundNext.y;
      const { dy } = groundNext;
      if (phys.y <= gy && phys.vy <= phys.vx * dy) {
        const tn = tangentNormalFromSlope(dy);
        const landCap = boosting ? player.topSpeed * drift.boostScale : player.topSpeed;
        const vtanNew = phys.vx * tn.tx + phys.vy * tn.ty;
        phys.vtan = clamp(vtanNew, -landCap, landCap);
        phys.y = gy;
        phys.grounded = true;
      }
    }

    if (!prevGrounded && phys.grounded) {
      const steerAxisLanding = steerAxisFromInput(input);
      if (state.hopHeld && steerAxisLanding !== 0) {
        beginDrift(steerAxisLanding);
      } else {
        resetDriftState();
      }
    }

    if (state.driftState === 'drifting') {
      if (state.hopHeld) {
        if (!state.allowedBoost) {
          state.driftCharge += dt;
          if (state.driftCharge >= drift.chargeMin) {
            state.driftCharge = drift.chargeMin;
            state.allowedBoost = true;
          }
        }
      } else {
        resetDriftState();
      }
    }

    phys.t += dt;

    const length = trackLengthRef();
    if (length > 0) {
      phys.s = wrap(phys.s, length);
    }

    const aY = 1 - Math.exp(-dt / camera.heightEase);
    let targetCamY = phys.y + camera.height;
    if (phys.grounded) {
      const floorY = sampleFloorElevation(phys.s, state.playerN, phys.y);
      targetCamY += (floorY - phys.y) * cliffs.cameraBlend;
    }
    state.camYSmooth += aY * (targetCamY - state.camYSmooth);

    state.lateralRate = state.playerN - state.prevPlayerN;
    state.prevPlayerN = state.playerN;

    segNow = segmentAtS(phys.s);
    if (segNow) {
      const bound = playerLateralLimit(segNow.index);
      const preClamp = state.playerN;
      state.playerN = clamp(state.playerN, -bound, bound);
      const scraping = Math.abs(preClamp) > bound - EPS || Math.abs(state.playerN) >= bound - EPS;
      if (scraping) {
        const offRoadDecelLimit = player.topSpeed / 4;
        if (Math.abs(phys.vtan) > offRoadDecelLimit) {
          const sign = Math.sign(phys.vtan) || 1;
          phys.vtan -= sign * (player.topSpeed * 0.8) * (1 / 60);
        }
      }
    }

    resolveCollisions();

    if (!state.resetMatteActive) {
      const roadY = elevationAt(phys.s);
      const bodyY = phys.grounded ? sampleFloorElevation(phys.s, state.playerN, phys.y) : phys.y;
      if (bodyY != null && (roadY - bodyY) > failsafe.dropUnits) {
        queueRespawn(phys.s);
      }
    }
  }

  function clearSegmentCars() {
    if (!hasSegments()) return;
    for (const seg of segments) {
      if (seg && Array.isArray(seg.cars)) seg.cars.length = 0;
    }
  }

  function spawnCars() {
    if (!hasSegments()) {
      state.cars.length = 0;
      return;
    }
    clearSegmentCars();
    state.cars.length = 0;
    const segCount = segments.length;
    for (let i = 0; i < NPC.total; i += 1) {
      const s = Math.floor(Math.random() * segCount) * segmentLength;
      const type = chooseCarType();
      const meta = getSpriteMeta(type);
      const tmpCar = { type, meta };
      const seg = segmentAtS(s);
      if (!seg) continue;
      const b = npcLateralLimit(seg.index, tmpCar);
      const side = randomSign();
      const offset = side * (Math.random() * (b * 0.9));
      const isSemi = type === 'SEMI';
      const speed = (player.topSpeed / 6) + Math.random() * player.topSpeed / (isSemi ? 5 : 3);
      const car = { z: s, offset, type, meta, speed };
      ensureArray(seg, 'cars').push(car);
      state.cars.push(car);
    }
  }

  function steerAvoidance(car, carSeg, playerSeg, playerW) {
    if (!carSeg || !playerSeg) return 0;
    const cHalf = carHalfWN(car);
    const lookahead = NPC.avoidLookaheadSegs;
    const segCount = segments.length || 1;
    if (((carSeg.index - playerSeg.index + segCount) % segCount) > track.drawDistance) {
      return 0;
    }
    for (let i = 1; i < lookahead; i += 1) {
      const seg = segmentAtIndex(carSeg.index + i);
      if (!seg) continue;
      if (seg === playerSeg && (car.speed > Math.abs(state.phys.vtan)) && overlap(state.playerN, playerW, car.offset, cHalf, 1)) {
        let dir;
        if (state.playerN > 0.5) dir = -1;
        else if (state.playerN < -0.5) dir = 1;
        else dir = (car.offset > state.playerN) ? 1 : -1;
        return dir * (1 / i) * (car.speed - Math.abs(state.phys.vtan)) / player.topSpeed;
      }
      for (let j = 0; j < seg.cars.length; j += 1) {
        const other = seg.cars[j];
        if (!other || other === car) continue;
        if ((car.speed > other.speed) && overlap(car.offset, cHalf, other.offset, carHalfWN(other), 1)) {
          let dir;
          if (other.offset > 0.5) dir = -1;
          else if (other.offset < -0.5) dir = 1;
          else dir = (car.offset > other.offset) ? 1 : -1;
          return dir * (1 / i) * (car.speed - other.speed) / player.topSpeed;
        }
      }
    }
    const b = npcLateralLimit(carSeg.index, car);
    if (car.offset < -b) return Math.min(0.15, (-b - car.offset) * 0.6);
    if (car.offset > b) return -Math.min(0.15, (car.offset - b) * 0.6);
    return 0;
  }

  function tickCars(dt) {
    if (!hasSegments() || !state.cars.length) return;
    const playerSeg = segmentAtS(state.phys.s);
    const segCount = segments.length;
    for (let n = 0; n < state.cars.length; n += 1) {
      const car = state.cars[n];
      if (!car) continue;
      const oldSeg = segmentAtS(car.z);
      const avoidance = steerAvoidance(car, oldSeg, playerSeg, playerHalfWN());
      car.offset += avoidance;
      car.z = wrapDistance(car.z, dt * car.speed, trackLengthRef());
      const newSeg = segmentAtS(car.z);
      if (oldSeg && newSeg && oldSeg !== newSeg) {
        const idx = oldSeg.cars.indexOf(car);
        if (idx >= 0) oldSeg.cars.splice(idx, 1);
        ensureArray(newSeg, 'cars').push(car);
      }
      if (newSeg) {
        const bNext = npcLateralLimit(newSeg.index, car);
        car.offset = clamp(car.offset, -bNext, bNext);
      }
    }
  }

  function addProp(segIdx, kind, offset) {
    if (!hasSegments()) return;
    const seg = segmentAtIndex(segIdx);
    if (!seg) return;
    ensureArray(seg, 'sprites').push({ kind, offset });
  }

  function spawnProps() {
    if (!hasSegments()) return;
    const segCount = segments.length;
    for (let i = 8; i < segCount; i += 6) {
      addProp(i, randomPropKind(), -1.25 - Math.random() * 0.15);
      addProp(i, randomPropKind(), 1.25 + Math.random() * 0.15);
      if (i % 12 === 0) {
        addProp(i, 'SIGN', -1.05);
        addProp(i, 'SIGN', 1.05);
      }
      if (i % 18 === 0) {
        const extra = 1.6 + Math.random() * 1.6;
        addProp(i, randomPropKind(), -extra);
        addProp(i, randomPropKind(), extra);
      }
    }
  }

  function addPickup(segIdx, offset = 0) {
    if (!hasSegments()) return;
    const seg = segmentAtIndex(segIdx);
    if (!seg) return;
    ensureArray(seg, 'pickups').push({ offset, collected: false });
  }

  function addPickupTrail(startSeg, count, spacing = 2, offset = 0) {
    for (let i = 0; i < count; i += 1) {
      addPickup(startSeg + i * spacing, offset);
    }
  }

  function spawnPickups() {
    if (!hasSegments()) {
      state.pickupCollected = 0;
      state.pickupTotal = 0;
      return;
    }
    for (const seg of segments) {
      if (!seg) continue;
      const list = ensureArray(seg, 'pickups');
      list.length = 0;
    }
    state.pickupCollected = 0;
    const boostSegments = segments.filter((seg) => seg?.features?.boost);
    if (boostSegments.length > 0) {
      for (const seg of boostSegments) {
        const offset = (seg.features && seg.features.boostPickupOffset != null)
          ? seg.features.boostPickupOffset
          : 0;
        addPickup(seg.index, offset);
      }
    } else {
      addPickupTrail(12, 24, 2, 0.00);
      addPickupTrail(80, 30, 2, -0.35);
      addPickupTrail(140, 30, 2, 0.35);
      addPickupTrail(segments.length >> 1, 16, 1, 0.0);
    }
    state.pickupTotal = segments.reduce((acc, seg) => acc + (Array.isArray(seg.pickups) ? seg.pickups.length : 0), 0);
  }

  function keyActionFromFlag(flag, value) {
    return () => { state.input[flag] = value; };
  }

  const KEY_DIRECTION_CODES = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
  };

  function applyDirectionalBindings(actions, value) {
    Object.entries(KEY_DIRECTION_CODES).forEach(([flag, codes]) => {
      const action = keyActionFromFlag(flag, value);
      codes.forEach((code) => {
        actions[code] = action;
      });
    });
  }

  const keydownActions = {
    Space: () => {
      if (!state.hopHeld) {
        if (state.phys.grounded && state.phys.t >= state.phys.nextHopTime) {
          applyJumpZoneBoost(jumpZoneForPlayer());
        }
        state.input.hop = true;
      }
      state.hopHeld = true;
    },
    KeyR: () => { if (typeof state.callbacks.onQueueReset === 'function') state.callbacks.onQueueReset(); },
    KeyB: () => { if (typeof state.callbacks.onToggleOverlay === 'function') state.callbacks.onToggleOverlay(); },
    KeyL: () => { if (typeof state.callbacks.onResetScene === 'function') state.callbacks.onResetScene(); },
  };

  applyDirectionalBindings(keydownActions, true);

  const keyupActions = {
    Space: () => {
      state.hopHeld = false;
      if (state.allowedBoost) state.boostTimer = drift.boostTime;
      resetDriftState();
    },
  };

  applyDirectionalBindings(keyupActions, false);

  function createKeyHandler(actions) {
    return (e) => {
      const handler = actions[e.code];
      if (handler) handler(e);
    };
  }

  const keydownHandler = createKeyHandler(keydownActions);
  const keyupHandler = createKeyHandler(keyupActions);

  function resetPlayerState({
    s = state.phys.s,
    playerN: playerNOverride,
    cameraHeight = camera.height,
    timers = null,
  } = {}) {
    const { phys } = state;
    phys.s = s;
    phys.y = elevationAt(phys.s);
    phys.grounded = true;
    phys.vx = 0;
    phys.vy = 0;
    phys.vtan = 0;

    if (timers) {
      if (timers.t != null) phys.t = timers.t;
      if (timers.nextHopTime != null) phys.nextHopTime = timers.nextHopTime;
      if (timers.boostFlashTimer != null) phys.boostFlashTimer = timers.boostFlashTimer;
    }

    const nextPlayerN = (playerNOverride != null) ? playerNOverride : state.playerN;
    state.playerN = nextPlayerN;
    state.camYSmooth = phys.y + cameraHeight;

    state.hopHeld = false;
    resetDriftState();
    state.boostTimer = 0;

    state.camRollDeg = 0;
    state.playerTiltDeg = 0;
    state.prevPlayerN = state.playerN;
    state.lateralRate = 0;
    state.pendingRespawn = null;
  }

  function respawnPlayerAt(sTarget, nNorm = 0) {
    const length = trackLengthRef();
    const sWrapped = wrap(sTarget, length);
    const seg = segmentAtS(sWrapped);
    const segIdx = seg ? seg.index : 0;
    const bound = playerLateralLimit(segIdx);
    const nextPlayerN = clamp(nNorm, -bound, bound);
    resetPlayerState({ s: sWrapped, playerN: nextPlayerN });
  }

  function queueRespawn(sAtFail) {
    const targetS = nearestSegmentCenter(sAtFail);
    state.pendingRespawn = { targetS, targetN: 0 };
    if (typeof state.callbacks.onQueueRespawn === 'function') {
      state.callbacks.onQueueRespawn(state.pendingRespawn);
    }
  }

  function step(dt) {
    updatePhysics(dt);
    tickCars(dt);
  }

  global.Gameplay = {
    state,
    keydownHandler,
    keyupHandler,
    step,
    spawnCars,
    spawnProps,
    spawnPickups,
    resetPlayerState,
    respawnPlayerAt,
    queueRespawn,
  };
})(window);
