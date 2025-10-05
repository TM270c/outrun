
(function(global){
  const { Config, MathUtil, World } = global;

  if (!Config || !MathUtil || !World) {
    throw new Error('Gameplay module requires Config, MathUtil, and World globals');
  }

  const {
    TUNE_PLAYER,
    TUNE_TRACK,
    CLIFF_PUSH,
    CLIFF_CAMERA_FRACTION,
    FAILSAFE,
    DRIFT,
    BOOST_ZONE_EFFECT,
    BOOST_ZONE_TYPES,
    cfgTilt = { tiltDir: 1, tiltCurveWeight: 0, tiltEase: 0.1, tiltSens: 0 },
    cfgTiltAdd = { tiltAddEnabled: false, tiltAddMaxDeg: null },
  } = Config;

  const {
    clamp,
    clamp01,
    lerp,
    computeCurvature,
    tangentNormalFromSlope,
  } = MathUtil;

  const {
    data,
    roadWidthAt,
    floorElevationAt,
    cliffParamsAt,
    lane = {},
  } = World;

  const {
    clampBoostLane = (v) => v,
  } = lane;

  const segments = data.segments;
  const segmentLength = TUNE_TRACK.segmentLength;
  const trackLengthRef = () => data.trackLength || 0;

  const DEFAULT_SPRITE_META = {
    PLAYER: { wN: 0.16, aspect: 0.7, tint: [0.9, 0.22, 0.21, 1], tex: () => null },
    CAR:    { wN: 0.28, aspect: 0.7, tint: [0.2, 0.7, 1.0, 1], tex: () => null },
    SEMI:   { wN: 0.34, aspect: 1.6, tint: [0.85, 0.85, 0.85, 1], tex: () => null },
    TREE:   { wN: 0.5,  aspect: 3.0, tint: [0.22, 0.7, 0.22, 1], tex: () => null },
    SIGN:   { wN: 0.55, aspect: 1.0, tint: [1, 1, 1, 1], tex: () => null },
    PALM:   { wN: 0.38, aspect: 3.2, tint: [0.25, 0.62, 0.27, 1], tex: () => null },
    PICKUP: { wN: 0.10, aspect: 1.0, tint: [1, 0.92, 0.2, 1], tex: () => null },
  };

  const NPC = { total: 20, edgePad: 0.02, avoidLookaheadSegs: 20 };
  const CAR_TYPES = ['CAR', 'SEMI'];

  const defaultGetKindScale = (kind) => (kind === 'PLAYER' ? TUNE_PLAYER.playerScale : 1);

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
      fieldOfView: TUNE_TRACK.fov,
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

  function segmentAtS(s) {
    const length = trackLengthRef();
    if (!segments.length || length <= 0) return null;
    let wrapped = s % length;
    if (wrapped < 0) wrapped += length;
    const idx = Math.floor(wrapped / segmentLength) % segments.length;
    return segments[idx];
  }

  function segmentAtIndex(idx) {
    if (!segments.length) return null;
    const count = segments.length;
    const wrapped = ((idx % count) + count) % count;
    return segments[wrapped];
  }

  function elevationAt(s) {
    const length = trackLengthRef();
    if (!segments.length || length <= 0) return 0;
    let ss = s % length;
    if (ss < 0) ss += length;
    const i = Math.floor(ss / segmentLength);
    const seg = segments[i % segments.length];
    const t = (ss - seg.p1.world.z) / segmentLength;
    return lerp(seg.p1.world.y, seg.p2.world.y, t);
  }

  function groundProfileAt(s) {
    const y = elevationAt(s);
    if (!segments.length) return { y, dy: 0, d2y: 0 };
    const h = Math.max(5, segmentLength * 0.1);
    const y1 = elevationAt(s - h);
    const y2 = elevationAt(s + h);
    const dy = (y2 - y1) / (2 * h);
    const d2y = (y2 - 2 * y + y1) / (h * h);
    return { y, dy, d2y };
  }

  function boostZonesOnSegment(seg) {
    if (!seg || !seg.features) return [];
    const zones = seg.features.boostZones;
    return Array.isArray(zones) ? zones : [];
  }

  function playerWithinBoostZone(zone, nNorm) {
    if (!zone) return false;
    const fallbackStart = clampBoostLane(-2);
    const fallbackEnd = clampBoostLane(2);
    const start = (zone.nStart != null) ? zone.nStart : fallbackStart;
    const end = (zone.nEnd != null) ? zone.nEnd : fallbackEnd;
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    return nNorm >= min && nNorm <= max;
  }

  function boostZonesForPlayer(seg, nNorm) {
    const zones = boostZonesOnSegment(seg);
    if (!zones.length) return [];
    return zones.filter((zone) => playerWithinBoostZone(zone, nNorm));
  }

  function jumpZoneForPlayer() {
    const segNow = segmentAtS(state.phys.s);
    if (!segNow) return null;
    const zonesHere = boostZonesForPlayer(segNow, state.playerN);
    return zonesHere.find((zone) => zone.type === BOOST_ZONE_TYPES.JUMP) || null;
  }

  function applyBoostImpulse() {
    const { phys } = state;
    const boostCap = TUNE_PLAYER.maxSpeed * DRIFT.boostMult;
    const currentForward = Math.max(phys.vtan, 0);
    const boosted = currentForward + BOOST_ZONE_EFFECT.speedAdd;
    phys.vtan = clamp(boosted, 0, boostCap);
  }

  function applyJumpZoneBoost(zone) {
    if (!zone) return;
    state.boostTimer = Math.max(state.boostTimer, DRIFT.boostTime);
    applyBoostImpulse();
    state.phys.boostFlashTimer = Math.max(state.phys.boostFlashTimer, 0.3);
  }

  function playerHalfWN() {
    return getSpriteMeta('PLAYER').wN * state.getKindScale('PLAYER') * 0.5;
  }

  function carHalfWN(car) {
    const meta = car && car.meta ? car.meta : getSpriteMeta(car && car.type ? car.type : 'CAR');
    return (meta.wN || 0) * 0.5;
  }

  function npcLateralLimit(segIndex, car) {
    const half = carHalfWN(car);
    const base = 1 - half - NPC.edgePad;
    const seg = segmentAtIndex(segIndex);
    if (seg && seg.features && seg.features.rail) {
      const railInner = TUNE_TRACK.railInset - half - NPC.edgePad;
      return Math.min(base, railInner);
    }
    return base;
  }

  function wrapDistance(v, dv, max) {
    let out = v + dv;
    if (max <= 0) return out;
    while (out >= max) out -= max;
    while (out < 0) out += max;
    return out;
  }

  function nearestSegmentCenter(s) {
    return Math.round(s / segmentLength) * segmentLength + segmentLength * 0.5;
  }

  function cliffSurfaceInfoAt(segIndex, nNorm, t = 0) {
    const absN = Math.abs(nNorm);
    if (absN <= 1) {
      return {
        heightOffset: 0,
        slope: 0,
        section: null,
        slopeA: 0,
        slopeB: 0,
        coverageA: 0,
        coverageB: 0,
      };
    }

    const params = cliffParamsAt ? cliffParamsAt(segIndex, t) : null;
    if (!params) {
      return {
        heightOffset: 0,
        slope: 0,
        section: null,
        slopeA: 0,
        slopeB: 0,
        coverageA: 0,
        coverageB: 0,
      };
    }

    const left = nNorm < 0;
    const sign = Math.sign(nNorm) || 1;

    const dyA = left ? params.leftA.dy : params.rightA.dy;
    const dyB = left ? params.leftB.dy : params.rightB.dy;
    const dxA = Math.abs(left ? params.leftA.dx : params.rightA.dx);
    const dxB = Math.abs(left ? params.leftB.dx : params.rightB.dx);

    const segCount = segments.length || 1;
    const segNorm = ((segIndex % segCount) + segCount) % segCount;
    const segData = segments[segNorm];
    const baseZ = segData ? segData.p1.world.z : segIndex * segmentLength;
    const roadW = roadWidthAt ? roadWidthAt(baseZ + clamp01(t) * segmentLength) : TUNE_TRACK.roadWidth;
    const beyond = Math.max(0, (absN - 1) * roadW);

    const widthA = Math.max(0, dxA);
    const widthB = Math.max(0, dxB);
    const totalWidth = widthA + widthB;

    const slopeA = widthA > 1e-6 ? sign * (dyA / widthA) : 0;
    const slopeB = widthB > 1e-6 ? sign * (dyB / widthB) : 0;

    if (beyond <= 1e-6) {
      return { heightOffset: 0, slope: 0, section: null, slopeA, slopeB, coverageA: 0, coverageB: 0 };
    }

    if (totalWidth <= 1e-6) {
      return { heightOffset: dyA + dyB, slope: 0, section: null, slopeA, slopeB, coverageA: 0, coverageB: 0 };
    }

    const distA = Math.min(beyond, widthA);
    const distB = Math.max(0, Math.min(beyond - widthA, widthB));

    let heightOffset = 0;
    let coverageA = 0;
    let coverageB = 0;
    if (widthA > 1e-6) {
      coverageA = distA / widthA;
      heightOffset += dyA * coverageA;
    }
    if (widthB > 1e-6) {
      coverageB = distB / widthB;
      heightOffset += dyB * coverageB;
    }

    if (beyond >= totalWidth - 1e-6) {
      return { heightOffset: dyA + dyB, slope: 0, section: null, slopeA, slopeB, coverageA: 0, coverageB: 0 };
    }

    if (distB > 1e-6 && widthB > 1e-6) {
      const slope = slopeB;
      return { heightOffset, slope, section: 'B', slopeA, slopeB, coverageA, coverageB };
    }

    if (distA > 1e-6 && widthA > 1e-6) {
      const slope = slopeA;
      return { heightOffset, slope, section: 'A', slopeA, slopeB, coverageA, coverageB };
    }

    return { heightOffset, slope: 0, section: null, slopeA, slopeB, coverageA, coverageB };
  }

  function cliffLateralSlopeAt(segIndex, nNorm, t = 0) {
    const info = cliffSurfaceInfoAt(segIndex, nNorm, t);
    return info.slope;
  }

  function getAdditiveTiltDeg() {
    if (!cfgTiltAdd.tiltAddEnabled) return 0;
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
    const tiltDeg = cfgTilt.tiltDir * angleDeg;
    if (cfgTiltAdd.tiltAddMaxDeg == null) return tiltDeg;
    return clamp(tiltDeg, -cfgTiltAdd.tiltAddMaxDeg, cfgTiltAdd.tiltAddMaxDeg);
  }

  state.getAdditiveTiltDeg = getAdditiveTiltDeg;

  function updateCameraFromFieldOfView() {
    const halfRad = (state.camera.fieldOfView * 0.5) * Math.PI / 180;
    const cameraDepth = 1 / Math.tan(halfRad);
    state.camera.cameraDepth = cameraDepth;
    state.camera.nearZ = 1 / cameraDepth;
    state.camera.playerZ = TUNE_TRACK.cameraHeight * cameraDepth;
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
    if (Math.abs(slope) <= 1e-6) return;
    const dir = -Math.sign(slope);
    if (dir === 0) return;
    const s = Math.max(0, Math.min(1.5, ax - 1));
    const gain = 1 + CLIFF_PUSH.distanceGain * s;
    let delta = dir * step * TUNE_TRACK.cliffPush * gain;
    delta = Math.max(-CLIFF_PUSH.capPerFrame, Math.min(CLIFF_PUSH.capPerFrame, delta));
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
    const newVx = baseVx + nx * TUNE_PLAYER.hopImpulse;
    const newVy = baseVy + ny * TUNE_PLAYER.hopImpulse;
    phys.vx = newVx;
    phys.vy = newVy;
    phys.grounded = false;
    phys.nextHopTime = phys.t + TUNE_PLAYER.hopCooldown;
    applyJumpZoneBoost(jumpZone);
    return true;
  }

  function playerLateralLimit(segIndex) {
    const halfW = playerHalfWN();
    const base = 2 - halfW - 0.015;
    const seg = segmentAtIndex(segIndex);
    if (seg && seg.features && seg.features.rail) {
      const railInner = TUNE_TRACK.railInset - halfW - 0.015;
      return Math.min(base, railInner);
    }
    return base;
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

    if (!segments.length) return;
    resolvePickupCollisionsInSeg(seg);
    const nextSeg = segments[(seg.index + 1) % segments.length];
    const prevSeg = segments[(seg.index - 1 + segments.length) % segments.length];
    resolvePickupCollisionsInSeg(nextSeg);
    resolvePickupCollisionsInSeg(prevSeg);
  }

  function updatePhysics(dt) {
    const { phys, input } = state;
    if (!segments.length) return;

    if (input.hop) {
      doHop();
      input.hop = false;
    }

    const steerAxis = (input.left && input.right) ? 0 : (input.left ? -1 : (input.right ? 1 : 0));
    const boosting = state.boostTimer > 0;
    if (boosting) state.boostTimer = Math.max(0, state.boostTimer - dt);
    const speed01 = clamp(Math.abs(phys.vtan) / TUNE_PLAYER.maxSpeed, 0, 1);
    let steerDx = dt * TUNE_PLAYER.steerBase * speed01;
    if (boosting) steerDx *= DRIFT.boostSteerScale;

    if (state.driftState === 'drifting') {
      let k = DRIFT.boostLockBase;
      if (steerAxis === state.driftDirSnapshot) k = DRIFT.boostLockWith;
      else if (steerAxis === -state.driftDirSnapshot) k = DRIFT.boostLockAgainst;
      state.playerN += steerDx * k * state.driftDirSnapshot;
    } else if (steerAxis !== 0) {
      state.playerN += steerDx * steerAxis;
    }

    const segAhead = segmentAtS(phys.s + state.camera.playerZ);
    if (segAhead) {
      state.playerN -= steerDx * speed01 * segAhead.curve * TUNE_PLAYER.leanCentrifugal;
    }

    applyCliffPushForce(steerDx);
    state.playerN = clamp(state.playerN, -2, 2);

    let segNow = segmentAtS(phys.s);
    const segFeatures = segNow ? segNow.features : null;
    const zonesHere = boostZonesForPlayer(segNow, state.playerN);
    const hasZonesHere = zonesHere.length > 0;
    const driveZoneHere = zonesHere.find((zone) => zone.type === BOOST_ZONE_TYPES.DRIVE) || null;
    const zoneMultBase = hasZonesHere
      ? ((segFeatures && segFeatures.boostMultiplier != null) ? segFeatures.boostMultiplier : TUNE_PLAYER.crestBoostMultiplier)
      : 1;

    const prevGrounded = phys.grounded;
    if (phys.grounded) {
      const { dy } = groundProfileAt(phys.s);
      const { tx, ty } = tangentNormalFromSlope(dy);
      const boostedMaxSpeed = TUNE_PLAYER.maxSpeed * (boosting ? DRIFT.boostMult : 1);
      const accel = TUNE_PLAYER.accel * (boosting ? DRIFT.boostMult : 1);
      const brake = TUNE_PLAYER.brake * (boosting ? DRIFT.boostMult : 1);
      let a = 0;
      if (input.up) a += accel;
      if (input.down) a -= brake;
      a += -TUNE_PLAYER.gravity * ty;
      a += -TUNE_PLAYER.rollFriction * phys.vtan;
      phys.vtan = clamp(phys.vtan + a * dt, -boostedMaxSpeed, boostedMaxSpeed);

      if (driveZoneHere) {
        if (state.activeDriveZoneId !== driveZoneHere.id) {
          state.boostTimer = Math.max(state.boostTimer, DRIFT.boostTime);
          applyBoostImpulse();
          state.activeDriveZoneId = driveZoneHere.id;
        }
      } else {
        state.activeDriveZoneId = null;
      }

      const zoneMult = zoneMultBase;
      const travelV = phys.vtan * zoneMult;
      phys.s += travelV * tx * dt;
      phys.y = groundProfileAt(phys.s).y;

      const { dy: ndy, d2y } = groundProfileAt(phys.s);
      const kap = computeCurvature(ndy, d2y);
      if (kap < 0) {
        const need = phys.vtan * phys.vtan * -kap;
        const support = TUNE_PLAYER.gravity * tangentNormalFromSlope(ndy).ny;
        if (need > support) {
          phys.grounded = false;
          const tn = tangentNormalFromSlope(ndy);
          phys.vx = phys.vtan * tn.tx;
          phys.vy = phys.vtan * tn.ty;
        }
      }
    } else {
      phys.vy -= TUNE_PLAYER.gravity * dt;
      if (TUNE_PLAYER.airDrag) {
        phys.vx -= TUNE_PLAYER.airDrag * phys.vx * dt;
        phys.vy -= TUNE_PLAYER.airDrag * phys.vy * dt;
      }
      phys.s += phys.vx * dt;
      phys.y += phys.vy * dt;

      state.activeDriveZoneId = null;

      const gy = elevationAt(phys.s);
      const { dy } = groundProfileAt(phys.s);
      if (phys.y <= gy && phys.vy <= phys.vx * dy) {
        const tn = tangentNormalFromSlope(dy);
        const vtanNew = phys.vx * tn.tx + phys.vy * tn.ty;
        const landCap = boosting ? TUNE_PLAYER.maxSpeed * DRIFT.boostMult : TUNE_PLAYER.maxSpeed;
        phys.vtan = clamp(vtanNew, -landCap, landCap);
        phys.y = gy;
        phys.grounded = true;
      }
    }

    if (!prevGrounded && phys.grounded) {
      const steerAxis2 = (input.left && input.right) ? 0 : (input.left ? -1 : (input.right ? 1 : 0));
      if (state.hopHeld) {
        const dir = (steerAxis2 === 0) ? 0 : steerAxis2;
        if (dir !== 0) {
          state.driftState = 'drifting';
          state.driftDirSnapshot = dir;
          state.driftCharge = 0;
          state.allowedBoost = false;
        } else {
          state.driftState = 'idle';
          state.driftDirSnapshot = 0;
          state.driftCharge = 0;
          state.allowedBoost = false;
        }
      } else {
        state.driftState = 'idle';
        state.driftDirSnapshot = 0;
        state.driftCharge = 0;
        state.allowedBoost = false;
      }
    }

    if (state.driftState === 'drifting') {
      if (state.hopHeld) {
        if (!state.allowedBoost) {
          state.driftCharge += dt;
          if (state.driftCharge >= DRIFT.boostChargeMin) {
            state.driftCharge = DRIFT.boostChargeMin;
            state.allowedBoost = true;
          }
        }
      } else {
        state.driftState = 'idle';
        state.driftDirSnapshot = 0;
        state.driftCharge = 0;
        state.allowedBoost = false;
      }
    }

    phys.t += dt;

    const length = trackLengthRef();
    if (length > 0) {
      phys.s = ((phys.s % length) + length) % length;
    }

    const aY = 1 - Math.exp(-dt / TUNE_TRACK.camYTau);
    let targetCamY = phys.y + TUNE_TRACK.cameraHeight;
    if (phys.grounded) {
      const floorY = floorElevationAt ? floorElevationAt(phys.s, state.playerN) : phys.y;
      targetCamY += (floorY - phys.y) * CLIFF_CAMERA_FRACTION;
    }
    state.camYSmooth += aY * (targetCamY - state.camYSmooth);

    state.lateralRate = state.playerN - state.prevPlayerN;
    state.prevPlayerN = state.playerN;

    segNow = segmentAtS(phys.s);
    if (segNow) {
      const bound = playerLateralLimit(segNow.index);
      const preClamp = state.playerN;
      state.playerN = clamp(state.playerN, -bound, bound);
      const scraping = Math.abs(preClamp) > bound - 1e-6 || Math.abs(state.playerN) >= bound - 1e-6;
      if (scraping) {
        const offRoadDecelLimit = TUNE_PLAYER.maxSpeed / 4;
        if (Math.abs(phys.vtan) > offRoadDecelLimit) {
          const sign = Math.sign(phys.vtan) || 1;
          phys.vtan -= sign * (TUNE_PLAYER.maxSpeed * 0.8) * (1 / 60);
        }
      }
    }

    resolveCollisions();

    if (!state.resetMatteActive) {
      const roadY = elevationAt(phys.s);
      const bodyY = phys.grounded ? (floorElevationAt ? floorElevationAt(phys.s, state.playerN) : phys.y) : phys.y;
      if (bodyY != null && (roadY - bodyY) > FAILSAFE.belowRoadUnits) {
        queueRespawn(phys.s);
      }
    }
  }

  function clearSegmentCars() {
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      if (seg && Array.isArray(seg.cars)) seg.cars.length = 0;
    }
  }

  function spawnCars() {
    if (!segments.length) {
      state.cars.length = 0;
      return;
    }
    clearSegmentCars();
    state.cars.length = 0;
    for (let i = 0; i < NPC.total; i += 1) {
      const length = Math.max(1, segments.length);
      const s = Math.floor(Math.random() * length) * segmentLength;
      const type = CAR_TYPES[Math.random() < 0.75 ? 0 : 1];
      const meta = getSpriteMeta(type);
      const tmpCar = { type, meta };
      const seg = segmentAtS(s);
      if (!seg) continue;
      const b = npcLateralLimit(seg.index, tmpCar);
      const side = Math.random() < 0.5 ? -1 : 1;
      const offset = side * (Math.random() * (b * 0.9));
      const isSemi = type === 'SEMI';
      const speed = (TUNE_PLAYER.maxSpeed / 6) + Math.random() * TUNE_PLAYER.maxSpeed / (isSemi ? 5 : 3);
      const car = { z: s, offset, type, meta, speed };
      if (!Array.isArray(seg.cars)) seg.cars = [];
      seg.cars.push(car);
      state.cars.push(car);
    }
  }

  function steerAvoidance(car, carSeg, playerSeg, playerW) {
    if (!carSeg || !playerSeg) return 0;
    const cHalf = carHalfWN(car);
    const lookahead = NPC.avoidLookaheadSegs;
    const segCount = segments.length || 1;
    if (((carSeg.index - playerSeg.index + segCount) % segCount) > TUNE_TRACK.drawDistance) {
      return 0;
    }
    for (let i = 1; i < lookahead; i += 1) {
      const seg = segments[(carSeg.index + i) % segCount];
      if (!seg) continue;
      if (seg === playerSeg && (car.speed > Math.abs(state.phys.vtan)) && overlap(state.playerN, playerW, car.offset, cHalf, 1)) {
        let dir;
        if (state.playerN > 0.5) dir = -1;
        else if (state.playerN < -0.5) dir = 1;
        else dir = (car.offset > state.playerN) ? 1 : -1;
        return dir * (1 / i) * (car.speed - Math.abs(state.phys.vtan)) / TUNE_PLAYER.maxSpeed;
      }
      for (let j = 0; j < seg.cars.length; j += 1) {
        const other = seg.cars[j];
        if (!other || other === car) continue;
        if ((car.speed > other.speed) && overlap(car.offset, cHalf, other.offset, carHalfWN(other), 1)) {
          let dir;
          if (other.offset > 0.5) dir = -1;
          else if (other.offset < -0.5) dir = 1;
          else dir = (car.offset > other.offset) ? 1 : -1;
          return dir * (1 / i) * (car.speed - other.speed) / TUNE_PLAYER.maxSpeed;
        }
      }
    }
    const b = npcLateralLimit(carSeg.index, car);
    if (car.offset < -b) return Math.min(0.15, (-b - car.offset) * 0.6);
    if (car.offset > b) return -Math.min(0.15, (car.offset - b) * 0.6);
    return 0;
  }

  function tickCars(dt) {
    if (!segments.length || !state.cars.length) return;
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
        if (!Array.isArray(newSeg.cars)) newSeg.cars = [];
        newSeg.cars.push(car);
      }
      if (newSeg) {
        const bNext = npcLateralLimit(newSeg.index, car);
        car.offset = clamp(car.offset, -bNext, bNext);
      }
    }
  }

  function addProp(segIdx, kind, offset) {
    if (!segments.length) return;
    const seg = segments[((segIdx % segments.length) + segments.length) % segments.length];
    if (!seg) return;
    if (!Array.isArray(seg.sprites)) seg.sprites = [];
    seg.sprites.push({ kind, offset });
  }

  function spawnProps() {
    if (!segments.length) return;
    for (let i = 8; i < segments.length; i += 6) {
      addProp(i, Math.random() < 0.5 ? 'TREE' : 'PALM', -1.25 - Math.random() * 0.15);
      addProp(i, Math.random() < 0.5 ? 'TREE' : 'PALM', 1.25 + Math.random() * 0.15);
      if (i % 12 === 0) {
        addProp(i, 'SIGN', -1.05);
        addProp(i, 'SIGN', 1.05);
      }
      if (i % 18 === 0) {
        const extra = 1.6 + Math.random() * 1.6;
        addProp(i, Math.random() < 0.5 ? 'TREE' : 'PALM', -extra);
        addProp(i, Math.random() < 0.5 ? 'TREE' : 'PALM', extra);
      }
    }
  }

  function addPickup(segIdx, offset = 0) {
    if (!segments.length) return;
    const seg = segments[((segIdx % segments.length) + segments.length) % segments.length];
    if (!seg) return;
    if (!Array.isArray(seg.pickups)) seg.pickups = [];
    seg.pickups.push({ offset, collected: false });
  }

  function addPickupTrail(startSeg, count, spacing = 2, offset = 0) {
    for (let i = 0; i < count; i += 1) {
      addPickup(startSeg + i * spacing, offset);
    }
  }

  function spawnPickups() {
    if (!segments.length) {
      state.pickupCollected = 0;
      state.pickupTotal = 0;
      return;
    }
    for (const seg of segments) {
      if (Array.isArray(seg.pickups)) seg.pickups.length = 0;
      else seg.pickups = [];
    }
    state.pickupCollected = 0;
    const boostSegments = segments.filter((seg) => seg && seg.features && seg.features.boost);
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

  const keydownActions = {
    ArrowLeft: keyActionFromFlag('left', true),
    KeyA: keyActionFromFlag('left', true),
    ArrowRight: keyActionFromFlag('right', true),
    KeyD: keyActionFromFlag('right', true),
    ArrowUp: keyActionFromFlag('up', true),
    KeyW: keyActionFromFlag('up', true),
    ArrowDown: keyActionFromFlag('down', true),
    KeyS: keyActionFromFlag('down', true),
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

  const keyupActions = {
    ArrowLeft: keyActionFromFlag('left', false),
    KeyA: keyActionFromFlag('left', false),
    ArrowRight: keyActionFromFlag('right', false),
    KeyD: keyActionFromFlag('right', false),
    ArrowUp: keyActionFromFlag('up', false),
    KeyW: keyActionFromFlag('up', false),
    ArrowDown: keyActionFromFlag('down', false),
    KeyS: keyActionFromFlag('down', false),
    Space: () => {
      state.hopHeld = false;
      if (state.allowedBoost) state.boostTimer = DRIFT.boostTime;
      state.driftState = 'idle';
      state.driftDirSnapshot = 0;
      state.driftCharge = 0;
      state.allowedBoost = false;
    },
  };

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
    cameraHeight = TUNE_TRACK.cameraHeight,
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
    state.driftState = 'idle';
    state.driftDirSnapshot = 0;
    state.driftCharge = 0;
    state.allowedBoost = false;
    state.boostTimer = 0;

    state.camRollDeg = 0;
    state.playerTiltDeg = 0;
    state.prevPlayerN = state.playerN;
    state.lateralRate = 0;
    state.pendingRespawn = null;
  }

  function respawnPlayerAt(sTarget, nNorm = 0) {
    const length = trackLengthRef();
    const sWrapped = length > 0 ? ((sTarget % length) + length) % length : sTarget;
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
