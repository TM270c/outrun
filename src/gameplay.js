
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
    traffic: trafficConfig = {},
    forceLandingOnCarImpact = false,
  } = Config;

  const {
    base: tiltBase = { tiltDir: 1, tiltCurveWeight: 0, tiltEase: 0.1, tiltSens: 0, tiltMaxDeg: 0 },
    additive: tiltAdd = { tiltAddEnabled: false, tiltAddMaxDeg: null },
  } = tiltConfig;

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
    pushZone,
    buildTrackFromCSV,
    buildCliffsFromCSV_Lite,
    enforceCliffWrap,
  } = World;

  const {
    clampBoostLane = (v) => v,
  } = lane;

  const segments = data.segments;
  const segmentLength = track.segmentSize;
  const trackLengthRef = () => data.trackLength || 0;

  const hasSegments = () => segments.length > 0;

  const wrapByLength = (value, length) => {
    if (length <= 0) return value;
    const mod = value % length;
    return mod < 0 ? mod + length : mod;
  };

  const wrapSegmentIndex = (idx) => {
    if (!hasSegments()) return idx;
    const count = segments.length;
    const mod = idx % count;
    return mod < 0 ? mod + count : mod;
  };

  const ensureArray = (obj, key) => {
    if (!obj) return [];
    if (!Array.isArray(obj[key])) obj[key] = [];
    return obj[key];
  };

  function atlasFrameUv(frameIndex, columns, totalFrames){
    const total = Math.max(1, Math.floor(totalFrames));
    const cols = Math.max(1, Math.floor(columns));
    const rows = Math.max(1, Math.ceil(total / cols));
    const idx = Math.max(0, Math.min(total - 1, Math.floor(frameIndex)));
    const uStep = 1 / cols;
    const vStep = 1 / rows;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const u0 = col * uStep;
    const v0 = row * vStep;
    const u1 = u0 + uStep;
    const v1 = v0 + vStep;
    return { u1: u0, v1: v0, u2: u1, v2: v0, u3: u1, v3: v1, u4: u0, v4: v1 };
  }

  const DEFAULT_SPRITE_META = {
    PLAYER: { wN: 0.16, aspect: 0.7, tint: [0.9, 0.22, 0.21, 1], tex: () => null },
    CAR:    { wN: 0.28, aspect: 0.7, tint: [0.2, 0.7, 1.0, 1], tex: () => null },
    SEMI:   { wN: 0.34, aspect: 1.6, tint: [0.85, 0.85, 0.85, 1], tex: () => null },
    TREE:   { wN: 0.5,  aspect: 3.0, tint: [0.22, 0.7, 0.22, 1], tex: () => null },
    SIGN:   { wN: 0.55, aspect: 1.0, tint: [1, 1, 1, 1], tex: () => null },
    PALM:   { wN: 0.38, aspect: 3.2, tint: [0.25, 0.62, 0.27, 1], tex: () => null },
    PICKUP: { wN: 0.10, aspect: 1.0, tint: [1, 0.92, 0.2, 1], tex: () => null },
    ANIM_PLATE: {
      wN: 0.24,
      aspect: 1.0,
      tint: [1, 1, 1, 1],
      tex: () => (World && World.assets && World.assets.textures)
        ? World.assets.textures.animPlate
        : null,
      frameCount: 16,
      framesPerRow: 4,
      frameUv(frameIndex = 0){
        const cols = Number.isFinite(this.framesPerRow) && this.framesPerRow > 0
          ? this.framesPerRow
          : 4;
        const total = Number.isFinite(this.frameCount) && this.frameCount > 0
          ? this.frameCount
          : 16;
        return atlasFrameUv(frameIndex, cols, total);
      },
    },
  };

  const NPC_DEFAULTS = { total: 20, edgePad: 0.02, avoidLookaheadSegs: 20 };
  const NPC = { ...NPC_DEFAULTS, ...trafficConfig };
  const CAR_TYPES = ['CAR', 'SEMI'];

  const CAR_COLLISION_COOLDOWN = 1 / 120;
  const COLLISION_PUSH_DURATION = 0.45;
  const NPC_COLLISION_PUSH_FORWARD_MAX_SEGMENTS = 10;
  const NPC_COLLISION_PUSH_LATERAL_MAX = 0.85;
  const INTERACTABLE_COLLISION_PUSH_FORWARD_MAX_SEGMENTS = 12;
  const INTERACTABLE_COLLISION_PUSH_LATERAL_MAX = 1;
  const CAR_COLLISION_STAMP = Symbol('carCollisionStamp');

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

  const CLIFF_LIMIT_DEG = Number.isFinite(cliffs.cliffLimit) ? cliffs.cliffLimit : null;
  const CLIFF_ANGLE_SAMPLES = [0, 0.5, 1];

  function getSpriteMeta(kind) {
    const metaStack = state.spriteMeta || {};
    return metaStack[kind] || DEFAULT_SPRITE_META[kind] || { wN: 0.2, aspect: 1, tint: [1, 1, 1, 1], tex: () => null };
  }

  function segmentAtS(s) {
    const length = trackLengthRef();
    if (!hasSegments() || length <= 0) return null;
    const wrapped = wrapByLength(s, length);
    const idx = Math.floor(wrapped / segmentLength) % segments.length;
    return segments[idx];
  }

  function segmentAtIndex(idx) {
    if (!hasSegments()) return null;
    return segments[wrapSegmentIndex(idx)];
  }

  function elevationAt(s) {
    const length = trackLengthRef();
    if (!hasSegments() || length <= 0) return 0;
    const ss = wrapByLength(s, length);
    const i = Math.floor(ss / segmentLength);
    const seg = segments[i % segments.length];
    const t = (ss - seg.p1.world.z) / segmentLength;
    return lerp(seg.p1.world.y, seg.p2.world.y, t);
  }

  function groundProfileAt(s) {
    const y = elevationAt(s);
    if (!hasSegments()) return { y, dy: 0, d2y: 0 };
    const h = Math.max(5, segmentLength * 0.1);
    const y1 = elevationAt(s - h);
    const y2 = elevationAt(s + h);
    const dy = (y2 - y1) / (2 * h);
    const d2y = (y2 - 2 * y + y1) / (h * h);
    return { y, dy, d2y };
  }

  function playerFloorHeightAt(s = state.phys.s, nNorm = state.playerN, groundProfile = null) {
    if (typeof floorElevationAt === 'function') {
      const floor = floorElevationAt(s, nNorm);
      if (Number.isFinite(floor)) {
        return floor;
      }
    }
    const profile = groundProfile || groundProfileAt(s);
    return profile.y;
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

  function carMeta(car) {
    const kind = car && car.type ? car.type : 'CAR';
    return (car && car.meta) ? car.meta : getSpriteMeta(kind);
  }

  function carHalfWN(car) {
    const meta = carMeta(car);
    return (meta.wN || 0) * 0.5;
  }

  function currentPlayerForwardSpeed() {
    const vt = state && state.phys ? state.phys.vtan : 0;
    return Math.max(0, Number.isFinite(vt) ? vt : 0);
  }

  function npcForwardSpeed(car) {
    if (!car || !Number.isFinite(car.speed)) return 0;
    return Math.max(0, car.speed);
  }

  function computeCollisionPush(
    forwardSpeed,
    playerOffset,
    targetOffset,
    forwardMaxSegments = NPC_COLLISION_PUSH_FORWARD_MAX_SEGMENTS,
    lateralMax = NPC_COLLISION_PUSH_LATERAL_MAX,
  ) {
    const baseSpeed = Math.max(0, Number.isFinite(forwardSpeed) ? forwardSpeed : 0);
    const maxSpeed = (player && Number.isFinite(player.topSpeed)) ? Math.max(player.topSpeed, 0) : 0;
    if (baseSpeed <= 1e-4 || maxSpeed <= 1e-4 || !Number.isFinite(segmentLength) || segmentLength <= 0) {
      return null;
    }

    const speedRatio = clamp01(baseSpeed / maxSpeed);
    const forwardDistance = speedRatio * forwardMaxSegments * segmentLength;

    let lateralDistance = 0;
    let lateralDir = 0;
    if (Number.isFinite(playerOffset) && Number.isFinite(targetOffset)) {
      const delta = playerOffset - targetOffset;
      const absDelta = Math.abs(delta);
      if (absDelta > 1e-4) {
        lateralDir = -(Math.sign(delta) || 1);
        const offsetRatio = 1 - clamp01(absDelta);
        lateralDistance = speedRatio * lateralMax * offsetRatio;
      }
    }

    if (forwardDistance <= 1e-4 && lateralDistance <= 1e-4) return null;

    const duration = Math.max(COLLISION_PUSH_DURATION, 1e-4);
    return {
      forwardVel: forwardDistance / duration,
      lateralVel: (lateralDistance * lateralDir) / duration,
    };
  }

  function configureImpactableSprite(sprite) {
    if (!sprite || !sprite.impactable) return null;

    if (!sprite.impactState) {
      sprite.impactState = { timer: 0, lateralVel: 0, forwardVel: 0 };
    }

    const impact = sprite.impactState;
    if (!Number.isFinite(impact.timer)) impact.timer = 0;
    if (!Number.isFinite(impact.lateralVel)) impact.lateralVel = 0;
    if (!Number.isFinite(impact.forwardVel)) impact.forwardVel = 0;

    return impact;
  }

  function applyImpactPushToSprite(sprite) {
    if (!sprite || !sprite.impactable) return;

    const impact = configureImpactableSprite(sprite);
    if (!impact) return;

    const push = computeCollisionPush(
      currentPlayerForwardSpeed(),
      state.playerN,
      sprite.offset,
      INTERACTABLE_COLLISION_PUSH_FORWARD_MAX_SEGMENTS,
      INTERACTABLE_COLLISION_PUSH_LATERAL_MAX,
    );
    if (!push) return;

    impact.lateralVel = push.lateralVel;
    impact.forwardVel = push.forwardVel;
    impact.timer = COLLISION_PUSH_DURATION;
  }

  function updateImpactableSprite(sprite, dt, currentSeg = null) {
    if (!sprite || !sprite.impactable) return null;
    const impact = configureImpactableSprite(sprite);
    if (!impact) return null;

    let nextSeg = null;

    if (impact.timer > 0 && dt > 0) {
      const step = Math.min(dt, impact.timer);

      const duration = Math.max(COLLISION_PUSH_DURATION, 1e-4);
      const startRatio = clamp01(impact.timer / duration);
      const endRatio = clamp01((impact.timer - step) / duration);
      const avgRatio = 0.5 * (startRatio + endRatio);

      if (impact.lateralVel) {
        sprite.offset += impact.lateralVel * avgRatio * step;
      }

      if (impact.forwardVel) {
        const trackLength = trackLengthRef();
        if (trackLength > 0) {
          const baseSeg = currentSeg || segmentAtIndex(sprite.segIndex ?? 0);
          const baseS = Number.isFinite(sprite.s)
            ? sprite.s
            : (baseSeg ? baseSeg.p1.world.z : state.phys.s);
          const nextS = wrapDistance(baseS, impact.forwardVel * avgRatio * step, trackLength);
          sprite.s = nextS;
          const candidate = segmentAtS(nextS);
          if (candidate && currentSeg && candidate !== currentSeg) {
            nextSeg = candidate;
          }
        }
      }

      impact.timer = Math.max(0, impact.timer - step);
      if (impact.timer <= 0) {
        impact.lateralVel = 0;
        impact.forwardVel = 0;
      }
    }

    return nextSeg;
  }

  function carHitboxHeight(car, s = state.phys.s) {
    const meta = carMeta(car);
    const hitbox = meta.hitbox || {};
    const widthN = (hitbox.widthN != null) ? hitbox.widthN : (meta.wN || 0);
    const aspect = (hitbox.aspect != null) ? hitbox.aspect : (meta.aspect || 1);
    const roadW = roadWidthAt ? roadWidthAt(s) : track.roadWidth;
    if (hitbox.height != null) return hitbox.height;
    if (hitbox.heightN != null) return hitbox.heightN * roadW;
    const width = widthN * roadW;
    return width * aspect;
  }

  function carHitboxTopY(car) {
    const s = (car && Number.isFinite(car.z)) ? car.z : state.phys.s;
    const n = (car && Number.isFinite(car.offset)) ? car.offset : 0;
    const baseY = floorElevationAt ? floorElevationAt(s, n) : elevationAt(s);
    return baseY + carHitboxHeight(car, s);
  }

  function applyNpcCollisionPush(car, playerForwardSpeed) {
    if (!car) return;

    const push = computeCollisionPush(
      playerForwardSpeed,
      state.playerN,
      car.offset,
      NPC_COLLISION_PUSH_FORWARD_MAX_SEGMENTS,
      NPC_COLLISION_PUSH_LATERAL_MAX,
    );
    if (!push) return;

    if (!car.collisionPush) {
      car.collisionPush = { lateralVel: 0, forwardVel: 0, timer: 0 };
    }
    car.collisionPush.lateralVel = push.lateralVel;
    car.collisionPush.forwardVel = push.forwardVel;
    car.collisionPush.timer = COLLISION_PUSH_DURATION;
  }

  function playerBaseHeight() {
    const { phys } = state;
    if (phys.grounded && floorElevationAt) {
      return floorElevationAt(phys.s, state.playerN);
    }
    return phys.y;
  }

  function npcLateralLimit(segIndex, car) {
    const half = carHalfWN(car);
    const base = 1 - half - NPC.edgePad;
    const seg = segmentAtIndex(segIndex);
    if (seg && seg.features && seg.features.rail) {
      const railInner = track.railInset - half - NPC.edgePad;
      return Math.min(base, railInner);
    }
    return base;
  }

  function slopeAngleDeg(slope) {
    if (!Number.isFinite(slope)) return 0;
    return Math.abs(Math.atan(slope) * 180 / Math.PI);
  }

  function slopeLimitRatio(slope) {
    if (CLIFF_LIMIT_DEG == null || CLIFF_LIMIT_DEG <= 0) return 0;
    const angleDeg = slopeAngleDeg(slope);
    return angleDeg / CLIFF_LIMIT_DEG;
  }

  function slopeExceedsLimit(slope) {
    if (CLIFF_LIMIT_DEG == null || CLIFF_LIMIT_DEG <= 0) return false;
    return slopeLimitRatio(slope) > 1;
  }

  function cliffSectionExceedsLimit(section) {
    if (!section) return false;
    const dx = Math.abs(section.dx ?? 0);
    const dy = Math.abs(section.dy ?? 0);
    if (dx <= 1e-6 && dy <= 1e-6) return false;
    const slope = dy / Math.max(dx, 1e-6);
    return slopeExceedsLimit(slope);
  }

  const CLIFF_LIMIT_N_SAMPLES = Object.freeze([-1.05, 1.05, -1.5, 1.5]);

  function cliffInfoExceedsLimit(info) {
    if (!info) return false;
    if (slopeExceedsLimit(info.slope)) return true;
    if (slopeExceedsLimit(info.slopeA)) return true;
    if (slopeExceedsLimit(info.slopeB)) return true;
    return false;
  }

  function segmentHasSteepCliff(segIndex) {
    if (CLIFF_LIMIT_DEG == null || typeof cliffParamsAt !== 'function') return false;
    for (let i = 0; i < CLIFF_ANGLE_SAMPLES.length; i += 1) {
      const t = CLIFF_ANGLE_SAMPLES[i];
      const params = cliffParamsAt(segIndex, t);
      if (!params) continue;
      if (
        cliffSectionExceedsLimit(params.leftA) ||
        cliffSectionExceedsLimit(params.rightA) ||
        cliffSectionExceedsLimit(params.leftB) ||
        cliffSectionExceedsLimit(params.rightB)
      ) {
        return true;
      }
      for (let j = 0; j < CLIFF_LIMIT_N_SAMPLES.length; j += 1) {
        const n = CLIFF_LIMIT_N_SAMPLES[j];
        const info = cliffSurfaceInfoAt(segIndex, n, t);
        if (cliffInfoExceedsLimit(info)) {
          return true;
        }
      }
    }
    return false;
  }

  function wrapDistance(v, dv, max) {
    return wrapByLength(v + dv, max);
  }

  function nearestSegmentCenter(s) {
    return Math.round(s / segmentLength) * segmentLength + segmentLength * 0.5;
  }

  const cliffInfoDefaults = Object.freeze({
    heightOffset: 0,
    slope: 0,
    section: null,
    slopeA: 0,
    slopeB: 0,
    coverageA: 0,
    coverageB: 0,
  });

  const createCliffInfo = (overrides = {}) => ({ ...cliffInfoDefaults, ...overrides });

  function cliffSurfaceInfoAt(segIndex, nNorm, t = 0) {
    const absN = Math.abs(nNorm);
    if (absN <= 1) return createCliffInfo();

    const params = cliffParamsAt ? cliffParamsAt(segIndex, t) : null;
    if (!params) return createCliffInfo();

    const left = nNorm < 0;
    const sign = Math.sign(nNorm) || 1;

    const dyA = left ? params.leftA.dy : params.rightA.dy;
    const dyB = left ? params.leftB.dy : params.rightB.dy;
    const dxA = Math.abs(left ? params.leftA.dx : params.rightA.dx);
    const dxB = Math.abs(left ? params.leftB.dx : params.rightB.dx);

    const segData = segmentAtIndex(segIndex);
    const baseZ = segData ? segData.p1.world.z : segIndex * segmentLength;
    const roadW = roadWidthAt ? roadWidthAt(baseZ + clamp01(t) * segmentLength) : track.roadWidth;
    const beyond = Math.max(0, (absN - 1) * roadW);

    const widthA = Math.max(0, dxA);
    const widthB = Math.max(0, dxB);
    const totalWidth = widthA + widthB;

    const slopeA = widthA > 1e-6 ? sign * (dyA / widthA) : 0;
    const slopeB = widthB > 1e-6 ? sign * (dyB / widthB) : 0;

    if (beyond <= 1e-6) return createCliffInfo({ slopeA, slopeB });

    if (totalWidth <= 1e-6) {
      return createCliffInfo({ heightOffset: dyA + dyB, slopeA, slopeB });
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
      return createCliffInfo({ heightOffset: dyA + dyB, slopeA, slopeB });
    }

    if (distB > 1e-6 && widthB > 1e-6) {
      return createCliffInfo({
        heightOffset,
        slope: slopeB,
        section: 'B',
        slopeA,
        slopeB,
        coverageA,
        coverageB,
      });
    }

    if (distA > 1e-6 && widthA > 1e-6) {
      return createCliffInfo({
        heightOffset,
        slope: slopeA,
        section: 'A',
        slopeA,
        slopeB,
        coverageA,
        coverageB,
      });
    }

    return createCliffInfo({ heightOffset, slopeA, slopeB, coverageA, coverageB });
  }

  function cliffLateralSlopeAt(segIndex, nNorm, t = 0) {
    const info = cliffSurfaceInfoAt(segIndex, nNorm, t);
    return info.slope;
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

  function cliffSteepnessMultiplier(slope) {
    if (!Number.isFinite(slope)) return 1;
    if (CLIFF_LIMIT_DEG == null || CLIFF_LIMIT_DEG <= 0) return 1;
    const angleDeg = slopeAngleDeg(slope);
    if (angleDeg <= 1e-4) return 1;
    const ratio = slopeLimitRatio(slope);
    if (ratio <= 0) return 1;
    const clampedRatio = Math.min(ratio, 0.999);
    const ease = clampedRatio * clampedRatio;
    const escalation = ease / Math.max(0.001, 1 - clampedRatio);
    if (ratio <= 1) {
      return 1 + escalation;
    }
    const excess = ratio - 1;
    return 1 + escalation + excess * (2 + escalation);
  }

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
    const gain = 1 + cliffs.distanceGain * s;
    const steepGain = cliffSteepnessMultiplier(slope);
    let delta = dir * step * cliffs.pushStep * gain * steepGain;
    delta = Math.max(-cliffs.capPerFrame, Math.min(cliffs.capPerFrame, delta));
    state.playerN += delta;
  }

  const overlap = (ax, aw, bx, bw, scale = 1) => Math.abs(ax - bx) < (aw + bw) * scale;

  function doHop() {
    const { phys } = state;
    if (!phys.grounded || phys.t < phys.nextHopTime) return false;
    const jumpZone = jumpZoneForPlayer();
    const ground = groundProfileAt(phys.s);
    const { dy } = ground;
    const { tx, ty, nx, ny } = tangentNormalFromSlope(dy);
    const baseVx = phys.vtan * tx;
    const baseVy = phys.vtan * ty;
    const newVx = baseVx + nx * player.hopImpulse;
    const newVy = baseVy + ny * player.hopImpulse;
    phys.vx = newVx;
    phys.vy = newVy;
    phys.y = playerFloorHeightAt(phys.s, state.playerN, ground);
    phys.grounded = false;
    phys.nextHopTime = phys.t + player.hopCooldown;
    applyJumpZoneBoost(jumpZone);
    return true;
  }

  function playerLateralLimit(segIndex) {
    const halfW = playerHalfWN();
    const baseLimit = Math.min(Math.abs(lanes.road.min), Math.abs(lanes.road.max));
    const base = baseLimit - halfW - 0.015;
    const seg = segmentAtIndex(segIndex);
    if (seg && seg.features && seg.features.rail) {
      const railInner = track.railInset - halfW - 0.015;
      return Math.min(base, railInner);
    }
    if (segmentHasSteepCliff(segIndex)) {
      const cliffBound = Math.max(0, 1 - halfW - 0.015);
      return Math.min(base, cliffBound);
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

  function resolvePickupCollisionsAround(seg) {
    if (!seg || !hasSegments()) return;
    const seen = new Set();
    const neighbors = [seg, segmentAtIndex(seg.index + 1), segmentAtIndex(seg.index - 1)];
    for (const neighbor of neighbors) {
      if (!neighbor) continue;
      if (seen.has(neighbor.index)) continue;
      seen.add(neighbor.index);
      resolvePickupCollisionsInSeg(neighbor);
    }
  }

  function resolveSpriteInteractionsInSeg(seg) {
    if (!seg || !Array.isArray(seg.sprites) || !seg.sprites.length) return;
    const pHalf = playerHalfWN();
    for (const spr of seg.sprites) {
      if (!spr) continue;
      if (spr.interactable && spr.animation) {
        const meta = getSpriteMeta(spr.kind);
        const spriteHalf = Math.max(0, (meta.wN || 0) * 0.5);
        if (spriteHalf > 0 && overlap(state.playerN, pHalf, spr.offset, spriteHalf, 1)) {
          if (spr.animation.finished && spr.impactable) {
            spr.animation.frame = 0;
            spr.animation.accumulator = 0;
            spr.animation.finished = false;
          }
          if (!spr.animation.finished) {
            spr.animation.playing = true;
          }
          if (spr.impactable) applyImpactPushToSprite(spr);
        }
      } else if (spr.impactable) {
        const meta = getSpriteMeta(spr.kind);
        const spriteHalf = Math.max(0, (meta.wN || 0) * 0.5);
        if (spriteHalf > 0 && overlap(state.playerN, pHalf, spr.offset, spriteHalf, 1)) {
          applyImpactPushToSprite(spr);
        }
      }
    }
  }

  function resolveCarCollisionsInSeg(seg) {
    const { phys } = state;
    if (!seg || !Array.isArray(seg.cars) || !seg.cars.length) return false;
    const pHalf = playerHalfWN();
    for (let i = 0; i < seg.cars.length; i += 1) {
      const car = seg.cars[i];
      if (!car) continue;
      if (!overlap(state.playerN, pHalf, car.offset, carHalfWN(car), 1)) continue;

      if (!phys.grounded && playerBaseHeight() >= carHitboxTopY(car)) continue;

      const now = phys.t;
      const lastHit = car[CAR_COLLISION_STAMP] ?? -Infinity;
      if ((now - lastHit) <= CAR_COLLISION_COOLDOWN) continue;

      const { dy } = groundProfileAt(car.z);
      const tangent = tangentNormalFromSlope(dy);
      const wasGrounded = phys.grounded;
      const currentVx = phys.vx;
      const currentVy = phys.vy;
      const rawPlayerForward = wasGrounded ? phys.vtan : (currentVx * tangent.tx + currentVy * tangent.ty);
      const playerForwardSpeed = Math.max(0, Number.isFinite(rawPlayerForward) ? rawPlayerForward : 0);
      const npcForward = npcForwardSpeed(car);

      if (!(playerForwardSpeed > npcForward)) continue;

      const vt = npcForward;
      phys.vtan = vt;

      const landingProfile = groundProfileAt(phys.s);
      const landingTangent = tangentNormalFromSlope(landingProfile.dy);
      let perpComponent = currentVx * landingTangent.nx + currentVy * landingTangent.ny;
      const shouldForceLanding = forceLandingOnCarImpact && !wasGrounded;

      if (shouldForceLanding) {
        phys.grounded = true;
        phys.y = playerFloorHeightAt(phys.s, state.playerN, landingProfile);
        phys.nextHopTime = phys.t;
        perpComponent = 0;
      }

      phys.vx = landingTangent.tx * vt + landingTangent.nx * perpComponent;
      phys.vy = landingTangent.ty * vt + landingTangent.ny * perpComponent;

      applyNpcCollisionPush(car, playerForwardSpeed);

      car[CAR_COLLISION_STAMP] = now;
      return true;
    }
    return false;
  }

  function resolveSegmentCollisions(seg) {
    if (!seg) return false;
    const carHit = resolveCarCollisionsInSeg(seg);
    resolvePickupCollisionsAround(seg);
    resolveSpriteInteractionsInSeg(seg);
    return carHit;
  }

  function resolveCollisions() {
    const seg = segmentAtS(state.phys.s);
    if (!seg) return false;
    return resolveSegmentCollisions(seg);
  }

  function updateSpriteAnimations(dt) {
    if (!hasSegments()) return;
    for (const seg of segments) {
      if (!seg || !Array.isArray(seg.sprites) || !seg.sprites.length) continue;
      for (let i = 0; i < seg.sprites.length; ) {
        const spr = seg.sprites[i];
        if (!spr) {
          i += 1;
          continue;
        }

        spr.segIndex = seg.index;

        if (spr.animation) {
          const anim = spr.animation;
          const frameDuration = (anim && anim.frameDuration > 0) ? anim.frameDuration : (1 / 60);
          if (anim.frameDuration !== frameDuration) anim.frameDuration = frameDuration;
          const totalFrames = (anim && Number.isFinite(anim.totalFrames) && anim.totalFrames > 0)
            ? Math.floor(anim.totalFrames)
            : 1;
          if (anim.totalFrames !== totalFrames) anim.totalFrames = totalFrames;
          if (anim.playing && !anim.finished) {
            anim.accumulator += dt;
            while (anim.accumulator >= frameDuration && !anim.finished) {
              anim.accumulator -= frameDuration;
              if (anim.frame < totalFrames - 1) {
                anim.frame += 1;
              } else {
                anim.frame = totalFrames - 1;
                anim.finished = true;
                anim.playing = false;
                anim.accumulator = 0;
              }
            }
          }
          if (!Number.isFinite(anim.frame) || anim.frame < 0) anim.frame = 0;
          if (anim.frame >= totalFrames) anim.frame = totalFrames - 1;
          spr.animFrame = anim.frame;
        }
        const transferSeg = updateImpactableSprite(spr, dt, seg);
        if (transferSeg && transferSeg !== seg) {
          const destination = ensureArray(transferSeg, 'sprites');
          seg.sprites.splice(i, 1);
          destination.push(spr);
          spr.segIndex = transferSeg.index;
          continue;
        }
        i += 1;
      }
    }
  }

  function collectSegmentsCrossed(startS, endS) {
    if (!hasSegments() || !Number.isFinite(segmentLength) || segmentLength <= 0) return [];
    const startIndex = Math.floor(startS / segmentLength);
    const endIndex = Math.floor(endS / segmentLength);
    const deltaSegments = endIndex - startIndex;
    if (deltaSegments === 0) return [];
    const direction = deltaSegments > 0 ? 1 : -1;
    const touched = [];
    for (let step = direction; direction > 0 ? step <= deltaSegments : step >= deltaSegments; step += direction) {
      const idx = wrapSegmentIndex(startIndex + step);
      const seg = segmentAtIndex(idx);
      if (seg) touched.push(seg);
    }
    return touched;
  }

  function updatePhysics(dt) {
    const { phys, input } = state;
    if (!hasSegments()) return;

    if (input.hop) {
      doHop();
      input.hop = false;
    }

    const steerAxis = (input.left && input.right) ? 0 : (input.left ? -1 : (input.right ? 1 : 0));
    const boosting = state.boostTimer > 0;
    if (boosting) state.boostTimer = Math.max(0, state.boostTimer - dt);
    const speed01 = clamp(Math.abs(phys.vtan) / player.topSpeed, 0, 1);
    let steerDx = dt * player.steerRate * speed01;
    if (boosting) steerDx *= drift.steerScale;

    if (state.driftState === 'drifting') {
      let k = drift.lockBase;
      if (steerAxis === state.driftDirSnapshot) k = drift.lockWith;
      else if (steerAxis === -state.driftDirSnapshot) k = drift.lockAgainst;
      state.playerN += steerDx * k * state.driftDirSnapshot;
    } else if (steerAxis !== 0) {
      state.playerN += steerDx * steerAxis;
    }

    const segAhead = segmentAtS(phys.s + state.camera.playerZ);
    if (segAhead) {
      state.playerN -= steerDx * speed01 * segAhead.curve * player.curveLean;
    }

    applyCliffPushForce(steerDx);
    state.playerN = clamp(state.playerN, lanes.road.min, lanes.road.max);

    const startS = phys.s;
    let segmentsCrossedDuringStep = [];
    let segNow = segmentAtS(phys.s);
    const segFeatures = segNow ? segNow.features : null;
    const zonesHere = boostZonesForPlayer(segNow, state.playerN);
    const hasZonesHere = zonesHere.length > 0;
    const driveZoneHere = zonesHere.find((zone) => zone.type === boost.types.drive) || null;
    const zoneMultBase = hasZonesHere
      ? ((segFeatures && segFeatures.boostMultiplier != null) ? segFeatures.boostMultiplier : player.crestBoost)
      : 1;

    const prevGrounded = phys.grounded;
    if (phys.grounded) {
      const groundNow = groundProfileAt(phys.s);
      const { dy } = groundNow;
      const { tx, ty } = tangentNormalFromSlope(dy);
      const boostedMaxSpeed = player.topSpeed * (boosting ? drift.boostScale : 1);
      const accel = player.accelForce * (boosting ? drift.boostScale : 1);
      const brake = player.brakeForce * (boosting ? drift.boostScale : 1);
      let a = 0;
      if (input.up) a += accel;
      if (input.down) a -= brake;
      a += -player.gravity * ty;
      a += -player.rollDrag * phys.vtan;
      phys.vtan = clamp(phys.vtan + a * dt, -boostedMaxSpeed, boostedMaxSpeed);

      if (driveZoneHere) {
        if (state.activeDriveZoneId !== driveZoneHere.id) {
          state.boostTimer = Math.max(state.boostTimer, drift.boostTime);
          applyBoostImpulse();
          state.activeDriveZoneId = driveZoneHere.id;
        }
      } else {
        state.activeDriveZoneId = null;
      }

      const zoneMult = zoneMultBase;
      const travelV = phys.vtan * zoneMult;
      phys.s += travelV * tx * dt;
      const groundNext = groundProfileAt(phys.s);
      phys.y = playerFloorHeightAt(phys.s, state.playerN, groundNext);

      const { dy: ndy, d2y } = groundNext;
      const kap = computeCurvature(ndy, d2y);
      if (kap < 0) {
        const need = phys.vtan * phys.vtan * -kap;
        const support = player.gravity * tangentNormalFromSlope(ndy).ny;
        if (need > support) {
          phys.grounded = false;
          const tn = tangentNormalFromSlope(ndy);
          phys.vx = phys.vtan * tn.tx;
          phys.vy = phys.vtan * tn.ty;
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

      const groundContact = groundProfileAt(phys.s);
      const gy = playerFloorHeightAt(phys.s, state.playerN, groundContact);
      const { dy } = groundContact;
      if (phys.y <= gy && phys.vy <= phys.vx * dy) {
        const tn = tangentNormalFromSlope(dy);
        const vtanNew = phys.vx * tn.tx + phys.vy * tn.ty;
        const landCap = boosting ? player.topSpeed * drift.boostScale : player.topSpeed;
        phys.vtan = clamp(vtanNew, -landCap, landCap);
        phys.y = gy;
        phys.grounded = true;
      }
    }

    const integrationEndS = phys.s;
    segmentsCrossedDuringStep = collectSegmentsCrossed(startS, integrationEndS);

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
          if (state.driftCharge >= drift.chargeMin) {
            state.driftCharge = drift.chargeMin;
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

    const aY = 1 - Math.exp(-dt / camera.heightEase);
    let targetCamY = phys.y + camera.height;
    if (phys.grounded) {
      const floorY = floorElevationAt ? floorElevationAt(phys.s, state.playerN) : phys.y;
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
      const scraping = Math.abs(preClamp) > bound - 1e-6 || Math.abs(state.playerN) >= bound - 1e-6;
      if (scraping) {
        const offRoadDecelLimit = player.topSpeed / 4;
        if (Math.abs(phys.vtan) > offRoadDecelLimit) {
          const sign = Math.sign(phys.vtan) || 1;
          phys.vtan -= sign * (player.topSpeed * 0.8) * (1 / 60);
        }
      }
    }

    for (const seg of segmentsCrossedDuringStep) {
      if (!seg) continue;
      if (resolveSegmentCollisions(seg)) {
        break;
      }
    }
    const landingSeg = segmentAtS(phys.s);
    if (landingSeg) {
      resolveSegmentCollisions(landingSeg);
    }

    updateSpriteAnimations(dt);

    if (!state.resetMatteActive) {
      const roadY = elevationAt(phys.s);
      const bodyY = phys.grounded ? (floorElevationAt ? floorElevationAt(phys.s, state.playerN) : phys.y) : phys.y;
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
      const type = CAR_TYPES[Math.random() < 0.75 ? 0 : 1];
      const meta = getSpriteMeta(type);
      const tmpCar = { type, meta };
      const seg = segmentAtS(s);
      if (!seg) continue;
      const b = npcLateralLimit(seg.index, tmpCar);
      const side = Math.random() < 0.5 ? -1 : 1;
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
      let forwardTravel = dt * car.speed;
      if (car.collisionPush && car.collisionPush.timer > 0) {
        const push = car.collisionPush;
        const pushDt = Math.min(dt, push.timer);
        const duration = Math.max(COLLISION_PUSH_DURATION, 1e-4);
        const startRatio = clamp01(push.timer / duration);
        const endRatio = clamp01((push.timer - pushDt) / duration);
        const avgRatio = 0.5 * (startRatio + endRatio);
        car.offset += push.lateralVel * avgRatio * pushDt;
        forwardTravel += push.forwardVel * avgRatio * pushDt;
        push.timer = Math.max(0, push.timer - pushDt);
        if (push.timer <= 1e-4) delete car.collisionPush;
      } else if (car.collisionPush) {
        delete car.collisionPush;
      }
      car.z = wrapDistance(car.z, forwardTravel, trackLengthRef());
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

  function addProp(segIdx, kind, offset, options = {}) {
    if (!hasSegments()) return;
    const seg = segmentAtIndex(segIdx);
    if (!seg) return;
    const baseZ = seg.p1 && seg.p1.world ? seg.p1.world.z : segIdx * segmentLength;
    const sprite = { kind, offset, segIndex: seg.index, s: baseZ };
    let animationConfig = null;
    if (options && typeof options === 'object') {
      const { animation, ...rest } = options;
      Object.assign(sprite, rest);
      animationConfig = animation || null;
    }
    if (sprite.interactable) {
      const animConfig = animationConfig || {};
      const totalFrames = Number.isFinite(animConfig.totalFrames) && animConfig.totalFrames > 0
        ? Math.floor(animConfig.totalFrames)
        : 1;
      const duration = Number.isFinite(animConfig.frameDuration) && animConfig.frameDuration > 0
        ? animConfig.frameDuration
        : (1 / 60);
      const startFrame = Number.isFinite(animConfig.frame)
        ? Math.max(0, Math.min(totalFrames - 1, Math.floor(animConfig.frame)))
        : 0;
      sprite.animation = {
        frame: startFrame,
        totalFrames,
        frameDuration: duration,
        accumulator: 0,
        playing: !!animConfig.playing,
        finished: animConfig.finished === true && startFrame === totalFrames - 1,
      };
      sprite.animFrame = sprite.animation.frame;
    }
    if (sprite.impactable) {
      if (!Number.isFinite(sprite.baseOffset)) sprite.baseOffset = sprite.offset;
      configureImpactableSprite(sprite);
    }
    ensureArray(seg, 'sprites').push(sprite);
    return sprite;
  }

  function spawnProps() {
    if (!hasSegments()) return;
    const segCount = segments.length;
    for (const seg of segments) {
      if (seg && Array.isArray(seg.sprites)) seg.sprites.length = 0;
    }
    for (let i = 8; i < segCount; i += 6) {
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

    const plateCount = Math.max(4, Math.floor(segCount / 40));
    for (let i = 0; i < plateCount; i += 1) {
      const segIdx = Math.floor(Math.random() * Math.max(1, segCount));
      const centerOffset = (Math.random() - 0.5) * 0.6;
      addProp(segIdx, 'ANIM_PLATE', centerOffset, {
        interactable: true,
        impactable: true,
        animation: { totalFrames: 16, frameDuration: 1 / 60, frame: 0 },
      });
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
    KeyR: () => { queueReset(); },
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
      if (state.allowedBoost) state.boostTimer = drift.boostTime;
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
    cameraHeight = camera.height,
    timers = null,
  } = {}) {
    const { phys } = state;
    phys.s = s;
    const nextPlayerN = (playerNOverride != null) ? playerNOverride : state.playerN;
    state.playerN = nextPlayerN;
    phys.y = playerFloorHeightAt(phys.s, nextPlayerN);
    phys.grounded = true;
    phys.vx = 0;
    phys.vy = 0;
    phys.vtan = 0;

    if (timers) {
      if (timers.t != null) phys.t = timers.t;
      if (timers.nextHopTime != null) phys.nextHopTime = timers.nextHopTime;
      if (timers.boostFlashTimer != null) phys.boostFlashTimer = timers.boostFlashTimer;
    }

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

  function applyDefaultFieldOfView() {
    const cameraState = state && state.camera ? state.camera : null;
    const update = cameraState && cameraState.updateFromFov;
    if (typeof update === 'function') {
      update(camera.fovDeg);
    } else if (cameraState && camera.fovDeg != null) {
      cameraState.fieldOfView = camera.fovDeg;
    }
  }

  async function resetScene() {
    applyDefaultFieldOfView();

    if (typeof buildTrackFromCSV === 'function') {
      try {
        await buildTrackFromCSV('tracks/test-track.csv');
      } catch (err) {
        console.warn('CSV build failed, keeping existing track', err);
      }
    }

    if (typeof buildCliffsFromCSV_Lite === 'function') {
      try {
        await buildCliffsFromCSV_Lite('tracks/cliffs.csv');
      } catch (err) {
        // Ignore optional cliff data errors
      }
    }

    if (typeof enforceCliffWrap === 'function') {
      enforceCliffWrap(1);
    }

    const segmentsNow = data && Array.isArray(data.segments) ? data.segments : [];
    const segmentCount = segmentsNow.length;
    const roadZones = ensureArray(data, 'roadTexZones');
    const railZones = ensureArray(data, 'railTexZones');
    const cliffZones = ensureArray(data, 'cliffTexZones');

    roadZones.length = 0;
    railZones.length = 0;
    cliffZones.length = 0;

    if (segmentCount > 0 && typeof pushZone === 'function') {
      pushZone(roadZones, 0, segmentCount - 1, 20);
      pushZone(railZones, 0, segmentCount - 1, 20);
      pushZone(cliffZones, 0, segmentCount - 1, 3);
    }

    spawnProps();
    spawnCars();
    spawnPickups();
    resetPlayerState({
      s: camera.backSegments * track.segmentSize,
      playerN: 0,
      timers: { t: 0, nextHopTime: 0, boostFlashTimer: 0 },
    });
  }

  function queueReset() {
    if (state.resetMatteActive) return;
    state.pendingRespawn = null;
    if (typeof state.callbacks.onQueueReset === 'function') {
      state.callbacks.onQueueReset();
    }
  }

  function queueRespawn(sAtFail) {
    if (state.resetMatteActive) return;
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
    resetScene,
    queueReset,
    queueRespawn,
  };
})(window);
