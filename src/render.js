(function(global){
  const { Config, MathUtil, World, Gameplay, RenderGL, RenderDebug } = global;

  if (!Config || !MathUtil || !World || !Gameplay || !RenderGL) {
    throw new Error('Renderer module requires Config, MathUtil, World, Gameplay, and RenderGL globals');
  }

  const {
    player,
    track,
    camera,
    grid,
    fog,
    debug,
    sprites,
    parallaxLayers,
    boost,
    drift,
    tilt: tiltConfig = {},
    build = {},
    snowScreenDistance = 0,
    snowScreenDensity = 1,
    snowDensity = 1,
    snowSize = { min: 1, max: 1.5 },
    snowSpeed = { min: 0.1, max: 0.2 },
    snowStretch = 1,
    snowScreenSize = 1,
  } = Config;

  const {
    base: tiltBase = { tiltMaxDeg: 0, tiltSens: 0, tiltCurveWeight: 0, tiltEase: 0, tiltDir: 1 },
    additive: tiltAdd = { tiltAddEnabled: false, tiltAddMaxDeg: null },
  } = tiltConfig;

  const {
    clamp,
    lerp,
    pctRem,
    wrap,
    shortestSignedDelta,
    computeCurvature,
  } = MathUtil;
  const clamp01 = (v) => clamp(v, 0, 1);

  const {
    data,
    assets,
    segmentAtS,
    elevationAt,
    groundProfileAt,
    roadWidthAt,
    floorElevationAt,
    cliffParamsAt,
    vSpanForSeg,
    lane = {},
  } = World;

  const {
    laneToRoadRatio = (n) => n,
    getZoneLaneBounds = () => null,
  } = lane;

  const { padQuad, makeRotatedQuad } = RenderGL;

  const textures = assets ? assets.textures : {};
  const state = Gameplay.state;
  const areTexturesEnabled = () => debug.textures !== false && debug.mode !== 'fill';

  const PLAYER_ATLAS_COLUMNS = 5;
  const PLAYER_ATLAS_ROWS = 5;
  const PLAYER_SPRITE_DEADZONE = 0;
  const PLAYER_SPRITE_HEIGHT_DEADZONE = 0;
  const PLAYER_SPRITE_SMOOTH_TIME = 0.12;
  const PLAYER_SPRITE_LATERAL_MAX = 0.045;
  const PLAYER_SPRITE_INPUT_WEIGHT = 0.55;
  const PLAYER_SPRITE_LATERAL_WEIGHT = 0.3;
  const PLAYER_SPRITE_CURVE_WEIGHT = 0.15;
  const PLAYER_SPRITE_SPEED_FLOOR = 0.25;
  const PLAYER_SPRITE_SLOPE_MAX_ANGLE_DEG = (sprites.slope && sprites.slope.maxAngleDeg) || 18;
  const PLAYER_SPRITE_SLOPE_MAX_ANGLE_RAD = (PLAYER_SPRITE_SLOPE_MAX_ANGLE_DEG * Math.PI) / 180;
  const PLAYER_SPRITE_HEIGHT_TIGHTEN = (sprites.slope && sprites.slope.heightTighten) || 0.7;
  const NPC_ATLAS_COLUMNS = 9;
  const NPC_ATLAS_ROWS = 9;
  const NPC_COLOR_GRID_SIZE = 9;

  const playerSpriteBlendState = {
    steer: 0,
    height: 0,
    initialized: false,
    lastTime: null,
  };

  const playerAnimState = {
    wasGrounded: true,
    activeAnim: null,
    tick: 0,
    scaleY: 1.0,
    airDuration: 0.15,
  };

  const randomColorFor = (() => {
    const cache = new Map();
    const rng = mulberry32(0x6a09e667);
    const makeColor = () => {
      const hue = rng();
      const saturation = clamp(0.75 + rng() * 0.25, 0, 1);
      const value = clamp(0.8 + rng() * 0.2, 0, 1);
      const h = (hue * 6) % 6;
      const sector = Math.floor(h);
      const fraction = h - sector;
      const p = value * (1 - saturation);
      const q = value * (1 - fraction * saturation);
      const t = value * (1 - (1 - fraction) * saturation);
      let r = value;
      let g = t;
      let b = p;
      switch (sector) {
        case 0:
          r = value;
          g = t;
          b = p;
          break;
        case 1:
          r = q;
          g = value;
          b = p;
          break;
        case 2:
          r = p;
          g = value;
          b = t;
          break;
        case 3:
          r = p;
          g = q;
          b = value;
          break;
        case 4:
          r = t;
          g = p;
          b = value;
          break;
        case 5:
        default:
          r = value;
          g = p;
          b = q;
          break;
      }
      return [r, g, b, 1];
    };
    return (key) => {
      const id = key || 'default';
      if (!cache.has(id)) cache.set(id, makeColor());
      return cache.get(id);
    };
  })();

  function npcLateralAngleLimit(){
    const fovDeg = (state && state.camera && state.camera.fieldOfView)
      ? state.camera.fieldOfView
      : ((camera && camera.fovDeg != null) ? camera.fovDeg : 60);
    return clamp(Math.abs(fovDeg) * Math.PI / 180 * 0.5, 0.01, Math.PI / 2);
  }

  function bucketFromNormalized(norm){
    const t = clamp01((norm + 1) * 0.5);
    return clamp(Math.round(t * (NPC_COLOR_GRID_SIZE - 1)) + 1, 1, NPC_COLOR_GRID_SIZE);
  }

  function hueFromBucket(bucket){
    const t = clamp01((bucket - 1) / (NPC_COLOR_GRID_SIZE - 1));
    if (t <= 0.5) {
      const local = t / 0.5;
      return [
        lerp(0, 0, local),   // R stays 0
        lerp(0, 1, local),   // G up
        lerp(1, 0, local),   // B down
      ];
    }
    const local = (t - 0.5) / 0.5;
    return [
      lerp(0, 1, local),    // R up
      lerp(1, 0, local),    // G down
      lerp(0, 0, local),    // B stays 0
    ];
  }

  function lightnessFromBucket(bucket){
    const MIN_L = 0.35;
    const MAX_L = 0.9;
    const t = clamp01((bucket - 1) / (NPC_COLOR_GRID_SIZE - 1));
    return clamp01(lerp(MAX_L, MIN_L, t));
  }

  function npcBucketsFromPose(lateralAngle, slopeNorm){
    const lateralLimit = npcLateralAngleLimit();
    const xBucket = bucketFromNormalized(
      clamp(lateralAngle / Math.max(lateralLimit, 1e-3), -1, 1)
    );
    const yBucket = bucketFromNormalized(clamp(slopeNorm, -1, 1));
    return { xBucket, yBucket };
  }

  function npcColorFromBuckets(xBucket, yBucket, alpha = 1){
    const baseRgb = hueFromBucket(xBucket);
    const lightness = lightnessFromBucket(yBucket);
    const rgb = [
      clamp01(baseRgb[0] * lightness),
      clamp01(baseRgb[1] * lightness),
      clamp01(baseRgb[2] * lightness),
    ];
    return {
      color: [rgb[0], rgb[1], rgb[2], alpha],
      index: (yBucket - 1) * NPC_COLOR_GRID_SIZE + (xBucket - 1),
    };
  }

  function npcAtlasUvFromBuckets(buckets){
    const colRaw = clamp(Math.floor((buckets && buckets.x ? buckets.x : 1) - 1), 0, NPC_ATLAS_COLUMNS - 1);
    const col = (NPC_ATLAS_COLUMNS - 1) - colRaw;
    const row = clamp(Math.floor((buckets && buckets.y ? buckets.y : 1) - 1), 0, NPC_ATLAS_ROWS - 1);
    return atlasUvFromRowCol(row, col, NPC_ATLAS_COLUMNS, NPC_ATLAS_ROWS);
  }

  function npcColorForCar(car, camX, camY, sCam){
    const roadW = roadWidthAt(car.z || 0);
    const carX = (Number.isFinite(car.offset) ? car.offset : 0) * roadW;
    const carY = floorElevationAt(car.z || 0);
    const trackLength = typeof data.trackLength === 'number' ? data.trackLength : (data.trackLength || 0);
    const dz = shortestSignedDelta(car.z || 0, sCam, trackLength);
    const dx = carX - camX;
    const lateralAngle = Math.atan2(dx, Math.max(Math.abs(dz), 1e-6));
    const profile = groundProfileAt(car.z || 0);
    const rawSlope = profile && Number.isFinite(profile.dy) ? profile.dy : 0;
    const slopeAngle = Math.atan(rawSlope);
    const denom = PLAYER_SPRITE_SLOPE_MAX_ANGLE_RAD > 1e-6 ? PLAYER_SPRITE_SLOPE_MAX_ANGLE_RAD : (Math.PI * 0.25);
    const slopeNorm = clamp((-slopeAngle / denom) * PLAYER_SPRITE_HEIGHT_TIGHTEN, -1, 1);
    const { xBucket, yBucket } = npcBucketsFromPose(lateralAngle, slopeNorm);
    const alpha = (car && car.meta && Array.isArray(car.meta.tint) && car.meta.tint.length > 3)
      ? car.meta.tint[3]
      : 1;
    const colorInfo = npcColorFromBuckets(xBucket, yBucket, alpha);
    return {
      ...colorInfo,
      buckets: { x: xBucket, y: yBucket },
    };
  }

  function applyDeadzone(value, deadzone = 0){
    const dz = Number.isFinite(deadzone) ? Math.min(Math.max(deadzone, 0), 0.99) : 0;
    const abs = Math.abs(value);
    if (abs <= dz) return 0;
    const range = 1 - dz;
    if (range <= 1e-6) return 0;
    const adjusted = (abs - dz) / range;
    const sign = value < 0 ? -1 : 1;
    return clamp(sign * adjusted, -1, 1);
  }

  function smoothTowards(current, target, dt, timeConstant){
    if (!Number.isFinite(timeConstant) || timeConstant <= 0) return target;
    if (!Number.isFinite(dt) || dt <= 0) return target;
    const alpha = 1 - Math.exp(-dt / timeConstant);
    const clampedAlpha = clamp(alpha, 0, 1);
    return current + (target - current) * clampedAlpha;
  }

  function atlasUvFromRowCol(row, col, columns, rows){
    const cols = Math.max(1, Math.floor(columns));
    const rws = Math.max(1, Math.floor(rows));
    const c = clamp(Math.floor(col), 0, cols - 1);
    const r = clamp(Math.floor(row), 0, rws - 1);
    const u0 = c / cols;
    const v0 = r / rws;
    const u1 = (c + 1) / cols;
    const v1 = (r + 1) / rws;
    return { u1: u0, v1: v0, u2: u1, v2: v0, u3: u1, v3: v1, u4: u0, v4: v1 };
  }

  function computePlayerAtlasSamples(steerValue, heightValue, columns, rows){
    const cols = Math.max(1, Math.floor(columns));
    const rws = Math.max(1, Math.floor(rows));
    const maxCol = cols - 1;
    const maxRow = rws - 1;
    const colPos = clamp(((steerValue + 1) * 0.5) * maxCol, 0, maxCol);
    const rowPos = clamp(((-heightValue + 1) * 0.5) * maxRow, 0, maxRow);
    const col = clamp(Math.round(colPos), 0, maxCol);
    const row = clamp(Math.round(rowPos), 0, maxRow);

    return [{
      col,
      row,
      weight: 1,
      uv: atlasUvFromRowCol(row, col, cols, rws),
    }];
  }

  function computePlayerSpriteSamples(frame, meta){
    const timeNow = (state && state.phys && Number.isFinite(state.phys.t)) ? state.phys.t : 0;
    const prevTime = playerSpriteBlendState.lastTime;
    const dt = (prevTime != null) ? Math.max(0, timeNow - prevTime) : 0;
    playerSpriteBlendState.lastTime = timeNow;

    if (!meta || typeof meta.tex !== 'function') {
      playerSpriteBlendState.initialized = false;
      return null;
    }

    if (!areTexturesEnabled()) {
      playerSpriteBlendState.initialized = false;
      return null;
    }

    const texture = meta.tex();
    if (!texture) {
      playerSpriteBlendState.initialized = false;
      return null;
    }

    const columns = Math.max(1, (meta.atlas && meta.atlas.columns) || PLAYER_ATLAS_COLUMNS);
    const totalFrames = Math.max(1, (meta.atlas && meta.atlas.totalFrames) || (PLAYER_ATLAS_COLUMNS * PLAYER_ATLAS_ROWS));
    const rows = Math.max(1, Math.ceil(totalFrames / columns));

    const { phys } = frame;
    const speedPct = clamp(Math.abs(phys.vtan) / player.topSpeed, 0, 1);

    const input = state.input || {};
    let steerAxis = (input.left && input.right) ? 0 : (input.left ? -1 : (input.right ? 1 : 0));
    if (state.race && state.race.active && state.race.phase === 'finished') {
      steerAxis = 0;
    }
    const lateralNorm = clamp(
      PLAYER_SPRITE_LATERAL_MAX > 0
        ? state.lateralRate / PLAYER_SPRITE_LATERAL_MAX
        : state.lateralRate,
      -1,
      1,
    );
    const segAhead = segmentAtS(phys.s + state.camera.playerZ) || { curve: 0 };
    const curveNorm = clamp((segAhead.curve || 0) / 6, -1, 1);

    const steerBlend = clamp(
      steerAxis * PLAYER_SPRITE_INPUT_WEIGHT
        + lateralNorm * PLAYER_SPRITE_LATERAL_WEIGHT
        + curveNorm * PLAYER_SPRITE_CURVE_WEIGHT,
      -1,
      1,
    );
    const speedScale = clamp(PLAYER_SPRITE_SPEED_FLOOR + (1 - PLAYER_SPRITE_SPEED_FLOOR) * speedPct, 0, 1);
    const steerRaw = steerBlend * speedScale;
    const steerTarget = applyDeadzone(clamp(steerRaw, -1, 1), PLAYER_SPRITE_DEADZONE);

    const profile = groundProfileAt ? groundProfileAt(phys.s) : null;
    let slopeComponent = 0;
    if (profile && Number.isFinite(profile.dy)) {
      const slopeAngle = Math.atan(profile.dy);
      const denom = PLAYER_SPRITE_SLOPE_MAX_ANGLE_RAD > 1e-6
        ? PLAYER_SPRITE_SLOPE_MAX_ANGLE_RAD
        : (Math.PI * 0.25);
      slopeComponent = clamp(slopeAngle / denom, -1, 1);
    }
    const tightenedHeight = clamp(slopeComponent * PLAYER_SPRITE_HEIGHT_TIGHTEN, -1, 1);
    const heightTarget = applyDeadzone(tightenedHeight, PLAYER_SPRITE_HEIGHT_DEADZONE);

    if (!playerSpriteBlendState.initialized) {
      playerSpriteBlendState.steer = steerTarget;
      playerSpriteBlendState.height = heightTarget;
      playerSpriteBlendState.initialized = true;
    } else {
      playerSpriteBlendState.steer = smoothTowards(
        playerSpriteBlendState.steer,
        steerTarget,
        dt,
        PLAYER_SPRITE_SMOOTH_TIME,
      );
      playerSpriteBlendState.height = smoothTowards(
        playerSpriteBlendState.height,
        heightTarget,
        dt,
        PLAYER_SPRITE_SMOOTH_TIME,
      );
    }

    const rawSteerValue = clamp(playerSpriteBlendState.steer, -1, 1);
    const isDrifting = state && state.driftState === 'drifting';
    const steerLimit = isDrifting ? 1 : 0.5;
    const steerValue = clamp(rawSteerValue, -steerLimit, steerLimit);
    const heightValue = clamp(playerSpriteBlendState.height, -1, 1);
    const samples = computePlayerAtlasSamples(steerValue, heightValue, columns, rows);

    return {
      texture,
      columns,
      rows,
      steer: steerValue,
      height: heightValue,
      samples,
    };
  }

  function createPerfTracker(){
    const makeFrameStats = () => ({
      drawCalls: 0,
      quadCount: 0,
      solidQuadCount: 0,
      texturedQuadCount: 0,
      drawListSize: 0,
      stripCount: 0,
      spriteCount: 0,
      npcCount: 0,
      propCount: 0,
      playerCount: 0,
      snowScreenCount: 0,
      snowQuadCount: 0,
      boostQuadCount: 0,
      physicsSteps: 0,
      segments: 0,
      solidBreakdown: {},
    });

    const stats = {
      current: makeFrameStats(),
      last: makeFrameStats(),
      fps: 0,
      frameTimeMs: 0,
      solidDepth: 0,
    };

    const tracker = {
      beginFrame(dt){
        stats.current = makeFrameStats();
        stats.solidDepth = 0;
        if (Number.isFinite(dt) && dt > 0){
          const fpsNow = 1 / dt;
          if (Number.isFinite(fpsNow)){
            stats.fps = stats.fps + (fpsNow - stats.fps) * (stats.fps ? 0.15 : 1);
          }
          const frameMs = dt * 1000;
          if (Number.isFinite(frameMs)){
            stats.frameTimeMs = stats.frameTimeMs + (frameMs - stats.frameTimeMs) * (stats.frameTimeMs ? 0.15 : 1);
          }
        }
      },
      endFrame(){
        stats.last = { ...stats.current };
      },
      wrapRenderer(renderer){
        if (!renderer || renderer.__perfWrapped) return;
        const originalTextured = renderer.drawQuadTextured.bind(renderer);
        const originalSolid = renderer.drawQuadSolid.bind(renderer);
        renderer.drawQuadTextured = function(tex, quad, uv, tint, fog){
          const isSolid = tracker.isSolidActive() || tex === renderer.whiteTex;
          tracker.countDrawCall({ solid: isSolid });
          return originalTextured(tex, quad, uv, tint, fog);
        };
        renderer.drawQuadSolid = function(...args){
          tracker.markSolidStart();
          try {
            return originalSolid(...args);
          } finally {
            tracker.markSolidEnd();
          }
        };
        renderer.__perfWrapped = true;
      },
      markSolidStart(){
        stats.solidDepth += 1;
      },
      markSolidEnd(){
        stats.solidDepth = Math.max(0, stats.solidDepth - 1);
      },
      isSolidActive(){
        return stats.solidDepth > 0;
      },
      countDrawCall({ solid = false } = {}){
        stats.current.drawCalls += 1;
        stats.current.quadCount += 1;
        if (solid){
          stats.current.solidQuadCount += 1;
        } else {
          stats.current.texturedQuadCount += 1;
        }
      },
      registerDrawListSize(size){
        stats.current.drawListSize = Number.isFinite(size) ? size : 0;
      },
      registerStrip(){
        stats.current.stripCount += 1;
      },
      registerSprite(kind){
        stats.current.spriteCount += 1;
        if (kind === 'npc') stats.current.npcCount += 1;
        else if (kind === 'prop') stats.current.propCount += 1;
        else if (kind === 'player') stats.current.playerCount += 1;
      },
      registerSnowScreen(){
        stats.current.snowScreenCount += 1;
      },
      registerSnowQuad(){
        stats.current.snowQuadCount += 1;
      },
      registerBoostQuad(){
        stats.current.boostQuadCount += 1;
      },
      registerPhysicsSteps(count){
        if (Number.isFinite(count) && count > 0){
          stats.current.physicsSteps += count;
        }
      },
      registerSegment(){
        stats.current.segments += 1;
      },
      registerSolidType(type){
        const count = stats.current.solidBreakdown[type] || 0;
        stats.current.solidBreakdown[type] = count + 1;
      },
      getLastFrameStats(){
        return {
          fps: stats.fps,
          frameTimeMs: stats.frameTimeMs,
          ...stats.last,
        };
      },
    };

    return tracker;
  }

  const perf = createPerfTracker();

  function isSnowFeatureEnabled(){
    const app = global.App;
    if (app && typeof app.isSnowEnabled === 'function') {
      try {
        return !!app.isSnowEnabled();
      } catch (err) {
        console.warn('App.isSnowEnabled threw', err);
        return true;
      }
    }
    return true;
  }

  function numericOr(value, fallback){
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function orderedRange(minVal, maxVal){
    return minVal <= maxVal
      ? { min: minVal, max: maxVal }
      : { min: maxVal, max: minVal };
  }

  function rangeFromConfig(value, fallbackMin, fallbackMax){
    if (Array.isArray(value) && value.length >= 2){
      const minVal = numericOr(value[0], fallbackMin);
      const maxVal = numericOr(value[1], fallbackMax);
      return orderedRange(minVal, maxVal);
    }
    if (value && typeof value === 'object'){
      const minVal = numericOr(value.min, fallbackMin);
      const maxVal = numericOr(value.max, fallbackMax);
      return orderedRange(minVal, maxVal);
    }
    return orderedRange(fallbackMin, numericOr(value, fallbackMax));
  }
  const snowSizeRange = rangeFromConfig(snowSize, 10, 30);
  const snowSpeedRange = rangeFromConfig(snowSpeed, 0.3, 1.0);
  const snowDensityFactor = Math.max(0, numericOr(snowDensity, 1));
  const snowStretchFactor = Math.max(0, numericOr(snowStretch, 1));
  const snowScreenSizeFactor = Math.max(0, numericOr(snowScreenSize, 1));
  const SNOW_SCREEN_MIN_RADIUS = 12;
  const SNOW_SCREEN_FOOTPRINT_SCALE = 0.8;
  const SNOW_SCREEN_BASE_EXPANSION = 5; // expand the base snow screen footprint without altering per-axis scaling math
  const SNOW_FIELD_POOL_SIZE = 12;
  const SNOW_FIELD_SEED_STEP = 0x45d9f3b;
  const EMPTY_SNOW_FIELD = { flakes: [], phaseOffset: 0 };

  function computeSnowScreenBaseRadius(scale, roadWidth){
    const base = Math.max(
      SNOW_SCREEN_MIN_RADIUS,
      scale * roadWidth * HALF_VIEW * SNOW_SCREEN_FOOTPRINT_SCALE,
    );
    return base * SNOW_SCREEN_BASE_EXPANSION * snowScreenSizeFactor;
  }

  function mulberry32(seed){
    let t = seed >>> 0;
    return function(){
      t = (t + 0x6D2B79F5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  const snowFieldPool = [];

  function buildSnowField(seed){
    const rng = mulberry32(seed);
    const baseCount = 80 * snowDensityFactor;
    const variance = 40 * snowDensityFactor;
    const flakeCount = Math.max(0, Math.round(baseCount + rng() * variance));
    const flakes = new Array(flakeCount);
    for (let i = 0; i < flakeCount; i++){
      flakes[i] = {
        baseX: rng(),
        baseY: rng(),
        speed: lerp(snowSpeedRange.min, snowSpeedRange.max, rng()),
        swayAmp: 0.05 + rng() * 0.08,
        swayFreq: 0.5 + rng() * 1.5,
        phase: rng() * Math.PI * 2,
        size: rng(),
      };
    }
    return { flakes, phaseOffset: rng() * 1000 };
  }

  function ensureSnowFieldPool(){
    if (snowFieldPool.length > 0) return;
    for (let i = 0; i < SNOW_FIELD_POOL_SIZE; i++){
      const seed = 0x9E3779B9 ^ ((i + 1) * SNOW_FIELD_SEED_STEP);
      snowFieldPool.push(buildSnowField(seed));
    }
  }

  function snowFieldFor(segIndex = 0){
    ensureSnowFieldPool();
    if (snowFieldPool.length === 0) return EMPTY_SNOW_FIELD;
    const idx = Math.abs(segIndex) % snowFieldPool.length;
    return snowFieldPool[idx] || EMPTY_SNOW_FIELD;
  }

  const segments = data.segments;
  const segmentLength = track.segmentSize;

  const SPRITE_PAD = {
    padLeft: sprites.overlap.x,
    padRight: sprites.overlap.x,
    padTop: sprites.overlap.y,
    padBottom: sprites.overlap.y,
  };

  let glr = null;
  let canvas3D = null;
  let canvasHUD = null;
  let ctxHUD = null;

  let W = 0;
  let H = 0;
  let HALF_VIEW = 0;
  let HUD_W = 0;
  let HUD_H = 0;
  let HUD_COVER_RADIUS = 0;
  let pitchOffset = 0;

  // Object Pool for projected points to reduce GC pressure
  const pointPool = [];
  let pointPoolIndex = 0;

  function resetPointPool() {
    pointPoolIndex = 0;
  }

  function allocPoint() {
    if (pointPoolIndex >= pointPool.length) {
      for (let i = 0; i < 256; i++) {
        pointPool.push({ world: { x:0, y:0, z:0 }, camera: { x:0, y:0, z:0 }, screen: { x:0, y:0, w:0, scale:0 } });
      }
    }
    return pointPool[pointPoolIndex++];
  }

  // Object Pool for strip items to reduce GC pressure
  const stripItemPool = [];
  let stripItemPoolIndex = 0;
  const currentStripItems = [];

  function resetStripItemPool() {
    stripItemPoolIndex = 0;
  }

  function allocStripItem(type, obj, i) {
    if (stripItemPoolIndex >= stripItemPool.length) {
      for (let k = 0; k < 64; k++) {
        stripItemPool.push({ type: null, obj: null, i: 0 });
      }
    }
    const item = stripItemPool[stripItemPoolIndex++];
    item.type = type;
    item.obj = obj;
    item.i = i;
    return item;
  }

  let overlayApi = {
    setOverlayCanvas(){},
    syncOverlayVisibility(){ return false; },
    computeOverlayEnabled(){ return false; },
    renderOverlay(){},
  };

  const overlayEnabled = () => (
    overlayApi && typeof overlayApi.computeOverlayEnabled === 'function'
      ? overlayApi.computeOverlayEnabled()
      : false
  );

  const syncOverlayVisibility = (force = false) => (
    overlayApi && typeof overlayApi.syncOverlayVisibility === 'function'
      ? overlayApi.syncOverlayVisibility(force)
      : false
  );

  function projectWorldPoint(world, camX, camY, camS){
    const point = allocPoint();
    point.world.x = world.x || 0;
    point.world.y = world.y || 0;
    point.world.z = world.z || 0;
    projectPoint(point, camX, camY, camS);
    return point;
  }

  function projectSegPoint(segPoint, yOffset, camX, camY, camS){
    const world = (segPoint && segPoint.world) ? segPoint.world : {};
    const point = allocPoint();
    point.world.x = world.x || 0;
    point.world.y = (world.y || 0) + (yOffset || 0);
    point.world.z = world.z || 0;
    projectPoint(point, camX, camY, camS);
    return point;
  }

  function padWithSpriteOverlap(quad, overrides = {}){
    return padQuad(quad, { ...SPRITE_PAD, ...overrides });
  }

  function computeCliffLaneProgress(segIndex, offset, t, roadWidth){
    if (!cliffParamsAt || !Number.isFinite(segIndex)) return null;
    const absOffset = Math.abs(offset);
    if (absOffset <= 1) return null;

    const params = cliffParamsAt(segIndex, clamp(t, 0, 1));
    const fallback = clamp(absOffset - 1, 0, 2);
    if (!params) return { o: fallback };

    const roadW = Math.max(roadWidth || 0, 0);
    if (roadW <= 1e-6) return { o: fallback };

    const beyond = Math.max(0, (absOffset - 1) * roadW);
    if (beyond <= 1e-6) return { o: 0 };

    const left = offset < 0;
    const sectionA = left ? params.leftA : params.rightA;
    const sectionB = left ? params.leftB : params.rightB;
    const widthA = Math.max(0, Math.abs(sectionA && sectionA.dx));
    const widthB = Math.max(0, Math.abs(sectionB && sectionB.dx));
    const totalWidth = widthA + widthB;

    if (totalWidth <= 1e-6) return { o: fallback };

    const span = Math.min(beyond, totalWidth);

    if (widthA > 1e-6) {
      if (span <= widthA || widthB <= 1e-6) {
        const coverageA = clamp(span / Math.max(widthA, 1e-6), 0, 1);
        return { o: coverageA };
      }
      const remain = span - widthA;
      const coverageB = clamp(remain / Math.max(widthB, 1e-6), 0, 1);
      return { o: clamp(1 + coverageB, 0, 2) };
    }

    if (widthB > 1e-6) {
      const coverageB = clamp(span / Math.max(widthB, 1e-6), 0, 1);
      return { o: clamp(1 + coverageB, 0, 2) };
    }

    return { o: fallback };
  }

  function fogArray(zNear, zFar = zNear){
    const near = fogFactorFromZ(zNear);
    const far = fogFactorFromZ(typeof zFar === 'number' ? zFar : zNear);
    return [near, near, far, far];
  }

  function getTrackLength(){
    const raw = data.trackLength;
    return typeof raw === 'number' ? raw : (typeof raw === 'function' ? raw() : (raw || 0));
  }

  function projectPoint(p, camX, camY, camS){
    const cameraDepth = state.camera.cameraDepth || 1;
    p.camera.x = (p.world.x || 0) - camX;
    p.camera.y = (p.world.y || 0) - camY;
    p.camera.z = (p.world.z || 0) - camS;
    p.screen.scale = cameraDepth / p.camera.z;
    p.screen.x = (HALF_VIEW + p.screen.scale * p.camera.x * HALF_VIEW) | 0;
    p.screen.y = ((H / 2 + pitchOffset) - p.screen.scale * p.camera.y * (H / 2)) | 0;
    const rw = roadWidthAt(p.world.z || 0);
    p.screen.w = (p.screen.scale * rw * HALF_VIEW) | 0;
  }

  function makeCliffLeftQuads(x1,y1,w1, x2,y2,w2, yA1,yA2, yB1,yB2, dxA0, dxA1, dxB0, dxB1, u0,u1, rw1, rw2){
    const k1 = w1 / Math.max(1e-6, rw1), k2 = w2 / Math.max(1e-6, rw2);
    const x1_inner = x1 - w1, y1_inner = y1;
    const x2_inner = x2 - w2, y2_inner = y2;
    const x1_A = x1_inner - dxA0 * k1;
    const x2_A = x2_inner - dxA1 * k2;
    const x1_B = x1_A     - dxB0 * k1;
    const x2_B = x2_A     - dxB1 * k2;
    const quadA = { x1:x1_A, y1:yA1, x2:x1_inner, y2:y1_inner, x3:x2_inner, y3:y2_inner, x4:x2_A, y4:yA2 };
    const uvA   = { u1:u0, v1:0, u2:u0, v2:0, u3:u1, v3:1, u4:u1, v4:1 };
    const quadB = { x1:x1_B, y1:yB1, x2:x1_A, y2:yA1, x3:x2_A, y3:yA2, x4:x2_B, y4:yB2 };
    const uvB   = { u1:u0, v1:0, u2:u0, v2:0, u3:u1, v3:1, u4:u1, v4:1 };
    return {quadA, uvA, quadB, uvB, x1_inner, x2_inner, x1_A, x2_A, x1_B, x2_B};
  }
  function makeCliffRightQuads(x1,y1,w1, x2,y2,w2, yA1,yA2, yB1,yB2, dxA0, dxA1, dxB0, dxB1, u0,u1, rw1, rw2){
    const k1 = w1 / Math.max(1e-6, rw1), k2 = w2 / Math.max(1e-6, rw2);
    const x1_inner = x1 + w1, y1_inner = y1;
    const x2_inner = x2 + w2, y2_inner = y2;
    const x1_A = x1_inner + dxA0 * k1;
    const x2_A = x2_inner + dxA1 * k2;
    const x1_B = x1_A     + dxB0 * k1;
    const x2_B = x2_A     + dxB1 * k2;
    const quadA = { x1:x1_inner, y1:y1_inner, x2:x1_A, y2:yA1, x3:x2_A, y3:yA2, x4:x2_inner, y4:y2_inner };
    const uvA   = { u1:u0, v1:0, u2:u0, v2:0, u3:u1, v3:1, u4:u1, v4:1 };
    const quadB = { x1:x1_A, y1:yA1, x2:x1_B, y2:yB1, x3:x2_B, y3:yB2, x4:x2_A, y4:yA2 };
    const uvB   = { u1:u0, v1:0, u2:u0, v2:0, u3:u1, v3:1, u4:u1, v4:1 };
    return {quadA, uvA, quadB, uvB, x1_inner, x2_inner, x1_A, x2_A, x1_B, x2_B};
  }

  const fogNear = () => fog.nearSegments * segmentLength;
  const fogFar  = () => fog.farSegments  * segmentLength;
  function fogFactorFromZ(z){
    if (!fog.enabled) return 0;
    const n = fogNear(), f = fogFar();
    if (f <= n) return z >= f ? 1 : 0;
    return clamp((z - n) / (f - n), 0, 1);
  }
  const BACKDROP_SCALE = 1.25;

  function drawParallaxLayer(tex, cfg){
    if (!glr) return;
    const uOffset = (state.bgScrollX || 0) * cfg.parallaxX;
    const scaledW = W * BACKDROP_SCALE;
    const scaledH = H * BACKDROP_SCALE;
    const centerX = W * 0.5;
    const centerY = H * 0.5;
    const halfScaledW = scaledW * 0.5;
    const halfScaledH = scaledH * 0.5;
    const quad = {
      x1: centerX - halfScaledW,
      y1: centerY - halfScaledH,
      x2: centerX + halfScaledW,
      y2: centerY - halfScaledH,
      x3: centerX + halfScaledW,
      y3: centerY + halfScaledH,
      x4: centerX - halfScaledW,
      y4: centerY + halfScaledH,
    };
    const uv = {u1: uOffset, v1: 0, u2: uOffset+cfg.uvSpanX, v2: 0, u3: uOffset+cfg.uvSpanX, v3: cfg.uvSpanY, u4: uOffset, v4: cfg.uvSpanY};
    const useTextures = areTexturesEnabled() && tex;
    if (useTextures){
      glr.drawQuadTextured(tex, quad, uv);
    } else {
      perf.registerSolidType('horizon');
      glr.drawQuadSolid(quad, randomColorFor(`parallax:${cfg.key || 'layer'}`));
    }
  }
  function renderHorizon(){
    for (const layer of parallaxLayers){
      drawParallaxLayer(textures[layer.key], layer);
    }
  }

  function drawRoadStrip(x1,y1,w1, x2,y2,w2, v0, v1, fogRoad, tex, segIndex){
    if (!glr) return;
    const texturesEnabled = areTexturesEnabled();
    let roadTex = tex;
    if (texturesEnabled) roadTex = roadTex || glr.whiteTex;
    const roadColorKey = `road:${segIndex}`;

    const dy   = Math.abs(y1 - y2);
    const rows = Math.max(1, Math.min(grid.maxRows, Math.ceil(dy / grid.rowHeightPx)));

    const avgW = 0.5 * (w1 + w2);
    let cols = Math.max(1, Math.round(avgW / grid.colWidthPx));
    cols = clamp(cols, grid.roadColsFar, grid.roadColsNear);

    const fNear = fogRoad[0], fFar = fogRoad[2];
    const isSolid = !texturesEnabled || !roadTex || roadTex === glr.whiteTex;

    for (let i = 0; i < rows; i++){
      const t0 = i / rows, t1 = (i + 1) / rows;

      const xa = lerp(x1, x2, t0), ya = lerp(y1, y2, t0), wa = lerp(w1, w2, t0);
      const xb = lerp(x1, x2, t1), yb = lerp(y1, y2, t1), wb = lerp(w1, w2, t1);

      const vv0 = lerp(v0, v1, t0), vv1 = lerp(v0, v1, t1);
      const fA  = lerp(fNear, fFar, t0), fB = lerp(fNear, fFar, t1);

      for (let j = 0; j < cols; j++){
        const u0 = j / cols, u1 = (j + 1) / cols;
        const k0 = -1 + 2 * (j / cols);
        const k1 = -1 + 2 * ((j + 1) / cols);

        const quadBase = {
          x1: xa + wa * k0, y1: ya,
          x2: xa + wa * k1, y2: ya,
          x3: xb + wb * k1, y3: yb,
          x4: xb + wb * k0, y4: yb
        };

        const colPadL = (j === 0)        ? sprites.overlap.x : sprites.overlap.x * 0.5;
        const colPadR = (j === cols - 1) ? sprites.overlap.x : sprites.overlap.x * 0.5;
        const quad = padWithSpriteOverlap(quadBase, {
          padLeft:  colPadL,
          padRight: colPadR,
        });
        const uv = { u1:u0, v1:vv0, u2:u1, v2:vv0, u3:u1, v3:vv1, u4:u0, v4:vv1 };
        const fogValues = [fA, fA, fB, fB];
        if (isSolid) perf.registerSolidType('road');
        if (texturesEnabled && roadTex){
          glr.drawQuadTextured(roadTex, quad, uv, undefined, fogValues);
        } else {
          glr.drawQuadSolid(quad, randomColorFor(roadColorKey), fogValues);
        }
      }
    }
  }

  function drawBoostZonesOnStrip(zones, xNear, yNear, xFar, yFar, wNear, wFar, fogRoad, segIndex){
    if (!glr || !zones || !zones.length) return;
    const texturesEnabled = areTexturesEnabled();

    const dy   = Math.abs(yNear - yFar);
    const rows = Math.max(1, Math.min(grid.maxRows, Math.ceil(dy / grid.rowHeightPx)));
    const fNear = fogRoad[0], fFar = fogRoad[2];

    for (const zone of zones){
      const bounds = getZoneLaneBounds(zone);
      if (!bounds) continue;

      const nearMin = xNear + wNear * bounds.centerOffsetMin;
      const nearMax = xNear + wNear * bounds.centerOffsetMax;
      const farMin  = xFar  + wFar  * bounds.centerOffsetMin;
      const farMax  = xFar  + wFar  * bounds.centerOffsetMax;

      const nearWidth = Math.max(1e-6, nearMax - nearMin);
      const farWidth  = Math.max(1e-6, farMax - farMin);
      let cols = Math.max(1, Math.round(0.5 * (nearWidth + farWidth) / grid.colWidthPx));
      cols = clamp(cols, grid.roadColsFar, grid.roadColsNear);

      const zoneColors = boost.colors[zone.type] || boost.fallbackColor;
      const solid = Array.isArray(zoneColors.solid) ? zoneColors.solid : boost.fallbackColor.solid;
      const texKey = boost.textures[zone.type];
      const tex = texKey ? textures[texKey] : null;

      for (let i = 0; i < rows; i++){
        const t0 = i / rows, t1 = (i + 1) / rows;
        const y0 = lerp(yNear, yFar, t0);
        const y1 = lerp(yNear, yFar, t1);

        const leftNear  = lerp(nearMin, farMin, t0);
        const rightNear = lerp(nearMax, farMax, t0);
        const leftFar   = lerp(nearMin, farMin, t1);
        const rightFar  = lerp(nearMax, farMax, t1);
        const fA = lerp(fNear, fFar, t0);
        const fB = lerp(fNear, fFar, t1);

        for (let j = 0; j < cols; j++){
          const u0 = j / cols, u1 = (j + 1) / cols;
          const x1 = lerp(leftNear, rightNear, u0);
          const x2 = lerp(leftNear, rightNear, u1);
          const x3 = lerp(leftFar, rightFar, u1);
          const x4 = lerp(leftFar, rightFar, u0);

          const quadBase = { x1, y1:y0, x2, y2:y0, x3, y3:y1, x4, y4:y1 };
          const colPadL = (j === 0) ? sprites.overlap.x : sprites.overlap.x * 0.5;
          const colPadR = (j === cols - 1) ? sprites.overlap.x : sprites.overlap.x * 0.5;
          const quad = padWithSpriteOverlap(quadBase, {
            padLeft:  colPadL,
            padRight: colPadR,
          });
          const uv = { u1:u0, v1:t0, u2:u1, v2:t0, u3:u1, v3:t1, u4:u0, v4:t1 };
          const fog = [fA, fA, fB, fB];

          const solidColor = Array.isArray(solid) ? solid : boost.fallbackColor.solid;
          const fallbackColor = texturesEnabled
            ? solidColor
            : randomColorFor(`boost:${segIndex}:${zone.type || 'zone'}`);
          perf.registerBoostQuad();
          const isSolid = !texturesEnabled || !tex || tex === glr.whiteTex;
          if (isSolid) perf.registerSolidType('boost');
          if (texturesEnabled && tex) {
            glr.drawQuadTextured(tex, quad, uv, undefined, fog);
          } else {
            glr.drawQuadSolid(quad, fallbackColor, fog);
          }
        }
      }
    }
  }

  function drawBillboard(
    anchorX,
    baseY,
    wPx,
    hPx,
    fogZ,
    tint = [1, 1, 1, 1],
    texture = null,
    uvOverride = null,
    colorKey = null,
  ){
    if (!glr) return;
    const texturesEnabled = areTexturesEnabled();
    const x1 = anchorX - wPx/2;
    const x2 = anchorX + wPx/2;
    const y1 = baseY - hPx, y2 = baseY;
    const uv = uvOverride || {u1:0,v1:0,u2:1,v2:0,u3:1,v3:1,u4:0,v4:1};
    const fog = fogArray(fogZ);
    const quad = {x1:x1, y1:y1, x2:x2, y2:y1, x3:x2, y3:y2, x4:x1, y4:y2};
    const useTexture = texturesEnabled && texture;
    const isSolid = !useTexture || texture === glr.whiteTex;
    if (isSolid) perf.registerSolidType('sprite');
    if (useTexture) {
      glr.drawQuadTextured(texture, quad, uv, undefined, fog);
    } else {
      const solidTint = Array.isArray(tint)
        ? tint
        : randomColorFor(colorKey || 'billboard');
      glr.drawQuadSolid(quad, solidTint, fog);
    }
  }

  function drawBillboardRotated(
    anchorX,
    baseY,
    wPx,
    hPx,
    fogZ,
    tint = [1, 1, 1, 1],
    texture = null,
    uvOverride = null,
    colorKey = null,
    angleRad = 0,
  ){
    if (!glr) return;
    const texturesEnabled = areTexturesEnabled();
    const uv = uvOverride || { u1: 0, v1: 0, u2: 1, v2: 0, u3: 1, v3: 1, u4: 0, v4: 1 };
    const fog = fogArray(fogZ);
    const centerX = anchorX;
    const centerY = baseY - hPx * 0.5;
    const quad = makeRotatedQuad(centerX, centerY, wPx, hPx, angleRad || 0);
    const useTexture = texturesEnabled && texture;
    const isSolid = !useTexture || texture === glr.whiteTex;
    if (isSolid) perf.registerSolidType('sprite');
    if (useTexture) {
      glr.drawQuadTextured(texture, quad, uv, undefined, fog);
    } else {
      const solidTint = Array.isArray(tint)
        ? tint
        : randomColorFor(colorKey || 'billboard');
      glr.drawQuadSolid(quad, solidTint, fog);
    }
  }

  function boostZonesOnSegment(seg) {
    if (!seg || !seg.features) return [];
    const zones = seg.features.boostZones;
    return Array.isArray(zones) ? zones : [];
  }

  if (RenderDebug && typeof RenderDebug.createOverlay === 'function') {
    overlayApi = RenderDebug.createOverlay({
      state,
      track,
      laneToRoadRatio,
      getZoneLaneBounds,
      boost,
      drift,
      build,
      computeCurvature,
      groundProfileAt,
      elevationAt,
      segmentAtS,
      boostZonesOnSegment,
      perf,
    });
  }

  function zonesFor(key){
    const direct = data[`${key}TexZones`];
    if (Array.isArray(direct)) return direct;
    const texZones = data.texZones;
    if (texZones && Array.isArray(texZones[key])) return texZones[key];
    return [];
  }

  const flyingPickups = [];
  let hudIconPulse = 0;

  function triggerPickupAnimation() {
    // Spawn at center of screen
    flyingPickups.push({
      t: 0,
      duration: 0.8,
      startX: W * 0.5 - 32,
      startY: H * 0.5,
    });
  }

  function renderHUD(dt){
    if (state.isMenu) return;
    if (!areTexturesEnabled()) return;
    const hudTex = textures.hud;
    if (!hudTex) return;

    glr.setRollPivot(0, 0, 0);

    if (hudIconPulse > 0) {
      hudIconPulse = Math.max(0, hudIconPulse - dt);
    }

    const metrics = state.metrics;
    const count = metrics ? metrics.pickupsCollected : 0;

    const texW = 512;
    const texH = 512;

    // Icon: Bottom right 2x2 cells (256x256) starting at 256,256
    const iconUV = {
      u1: 256 / texW, v1: 256 / texH,
      u2: 512 / texW, v2: 256 / texH,
      u3: 512 / texW, v3: 512 / texH,
      u4: 256 / texW, v4: 512 / texH
    };

    const margin = 16;
    const iconSize = 64;
    const numSize = 32;
    const numPad = -6;

    const iconX = margin;
    const iconY = margin;

    const pulseDuration = 0.2;
    const scale = hudIconPulse > 0 ? 1 + 0.05 * (hudIconPulse / pulseDuration) : 1;
    const cx = iconX + iconSize * 0.5;
    const cy = iconY + iconSize * 0.5;
    const halfS = (iconSize * scale) * 0.5;

    const iconQuad = {
      x1: cx - halfS, y1: cy - halfS,
      x2: cx + halfS, y2: cy - halfS,
      x3: cx + halfS, y3: cy + halfS,
      x4: cx - halfS, y4: cy + halfS
    };

    glr.drawQuadTextured(hudTex, iconQuad, iconUV);

    const str = String(Math.max(0, Math.floor(count)));
    let cursorX = iconX + iconSize + 4;
    const cursorY = iconY + (iconSize - numSize) / 2;

    for (let i = 0; i < str.length; i++) {
      const digit = parseInt(str[i], 10);
      if (Number.isNaN(digit)) continue;

      const cellS = 128;
      const col = digit % 4;
      const row = Math.floor(digit / 4);
      const uX = col * cellS;
      const uY = row * cellS;

      const numUV = {
        u1: uX / texW, v1: uY / texH,
        u2: (uX + cellS) / texW, v2: uY / texH,
        u3: (uX + cellS) / texW, v3: (uY + cellS) / texH,
        u4: uX / texW, v4: (uY + cellS) / texH
      };

      const numQuad = {
        x1: cursorX, y1: cursorY,
        x2: cursorX + numSize, y2: cursorY,
        x3: cursorX + numSize, y3: cursorY + numSize,
        x4: cursorX, y4: cursorY + numSize
      };

      glr.drawQuadTextured(hudTex, numQuad, numUV);
      cursorX += numSize + numPad;
    }

    // Render flying pickups
    for (let i = flyingPickups.length - 1; i >= 0; i--) {
      const p = flyingPickups[i];
      p.t += dt;
      if (p.t >= p.duration) {
        flyingPickups.splice(i, 1);
        hudIconPulse = pulseDuration;
        continue;
      }

      const progress = p.t / p.duration;
      const ease = progress * progress; // EaseInQuad for speed up

      // Quadratic Bezier for arc
      // P0: Start, P2: Target (iconX, iconY), P1: Control (TargetX, StartY)
      const p0x = p.startX;
      const p0y = p.startY;
      const p2x = iconX;
      const p2y = iconY;
      const p1x = p2x;
      const p1y = p0y;

      const invT = 1 - ease;
      const b0 = invT * invT;
      const b1 = 2 * invT * ease;
      const b2 = ease * ease;

      const curX = b0 * p0x + b1 * p1x + b2 * p2x;
      const curY = b0 * p0y + b1 * p1y + b2 * p2y;

      const flyQuad = {
        x1: curX, y1: curY,
        x2: curX + iconSize, y2: curY,
        x3: curX + iconSize, y3: curY + iconSize,
        x4: curX, y4: curY + iconSize
      };
      glr.drawQuadTextured(hudTex, flyQuad, iconUV);
    }

    // Render Timer
    if (state.race.active && Config.game.mode === 'timeTrial') {
      const timeVal = Math.ceil(Math.max(0, state.race.timeRemaining || 0));
      const timeStr = String(timeVal);
      const tNumSize = 32;
      const tNumPad = -6;
      const totalW = timeStr.length * (tNumSize + tNumPad) - tNumPad;
      let tCursorX = (W - totalW) * 0.5;
      const tCursorY = 16;

      for (let i = 0; i < timeStr.length; i++) {
        const digit = parseInt(timeStr[i], 10);
        if (Number.isNaN(digit)) continue;

        const cellS = 128;
        const col = digit % 4;
        const row = Math.floor(digit / 4);
        const uX = col * cellS;
        const uY = row * cellS;

        const numUV = {
          u1: uX / texW, v1: uY / texH,
          u2: (uX + cellS) / texW, v2: uY / texH,
          u3: (uX + cellS) / texW, v3: (uY + cellS) / texH,
          u4: uX / texW, v4: (uY + cellS) / texH
        };

        const numQuad = {
          x1: tCursorX, y1: tCursorY,
          x2: tCursorX + tNumSize, y2: tCursorY,
          x3: tCursorX + tNumSize, y3: tCursorY + tNumSize,
          x4: tCursorX, y4: tCursorY + tNumSize
        };

        glr.drawQuadTextured(hudTex, numQuad, numUV);
        tCursorX += tNumSize + tNumPad;
      }
    }

    // Render Drift Charge
    if (state.driftState === 'drifting') {
      const barW = 120;
      const barH = 8;
      const cx = W * 0.5;
      const cy = H - 80;

      const maxCharge = drift.chargeMin || 1;
      const pct = clamp(state.driftCharge / maxCharge, 0, 1);

      // Background
      const bgQuad = {
        x1: cx - barW * 0.5, y1: cy - barH * 0.5,
        x2: cx + barW * 0.5, y2: cy - barH * 0.5,
        x3: cx + barW * 0.5, y3: cy + barH * 0.5,
        x4: cx - barW * 0.5, y4: cy + barH * 0.5,
      };
      perf.registerSolidType('hud');
      glr.drawQuadSolid(bgQuad, [0, 0, 0, 0.5]);

      // Fill
      if (pct > 0.01) {
        const margin = 2;
        const fillW = (barW - margin * 2) * pct;
        const fillH = barH - margin * 2;
        const xL = cx - barW * 0.5 + margin;
        const yT = cy - barH * 0.5 + margin;

        const fillQuad = {
          x1: xL,         y1: yT,
          x2: xL + fillW, y2: yT,
          x3: xL + fillW, y3: yT + fillH,
          x4: xL,         y4: yT + fillH,
        };

        const color = state.allowedBoost ? [0.2, 1, 0.4, 1] : [1, 0.7, 0, 1];
        perf.registerSolidType('hud');
        glr.drawQuadSolid(fillQuad, color);
      }
    }
  }

  function renderScene(dt){
    if (!glr || !canvas3D) return;

    if (canvas3D.width !== W || canvas3D.height !== H) {
      W = canvas3D.width;
      H = canvas3D.height;
      HALF_VIEW = W * 0.5;
    }
    if (canvasHUD && (canvasHUD.width !== HUD_W || canvasHUD.height !== HUD_H)) {
      HUD_W = canvasHUD.width;
      HUD_H = canvasHUD.height;
      HUD_COVER_RADIUS = Math.hypot(HUD_W, HUD_H) * 0.5 + 2;
    }

    pitchOffset = state.isMenu ? (state.menuPitch || 0) : -20;

    // Temporarily disable fog in menu mode for clarity
    const originalFogEnabled = Config.fog.enabled;
    if (state.isMenu) Config.fog.enabled = false;
    glr.begin([0.9,0.95,1.0,1]);
    if (state.isMenu) Config.fog.enabled = originalFogEnabled;
    resetPointPool();
    resetStripItemPool();

    // Update Player Animation State (Squash & Stretch)
    const phys = state.phys;
    const isGrounded = phys.grounded;

    if (!isGrounded) {
      playerAnimState.airDuration += dt;
    }

    const isHopping = phys.nextHopTime > phys.t;

    if (state.jumpPrepTimer > 0) {
      playerAnimState.activeAnim = 'jump';
      playerAnimState.tick = 0.15 - state.jumpPrepTimer;
    }

    if (!isGrounded && playerAnimState.wasGrounded && phys.vy > 0 && isHopping) {
      if (playerAnimState.activeAnim !== 'jump') {
        playerAnimState.activeAnim = 'jump';
        playerAnimState.tick = 0;
      }
    } else if (isGrounded && !playerAnimState.wasGrounded) {
      if (playerAnimState.airDuration > 0.15) {
        playerAnimState.activeAnim = 'land';
        playerAnimState.tick = 0;
      }
    }
    if (isGrounded) playerAnimState.airDuration = 0;
    playerAnimState.wasGrounded = isGrounded;

    if (playerAnimState.activeAnim === 'jump') {
      playerAnimState.tick += dt;
      const t = playerAnimState.tick;
      if (t <= 0.05) {
        playerAnimState.scaleY = MathUtil.easeOutQuad(1.0, 0.7, t / 0.05);
      } else if (t <= 0.15) {
        playerAnimState.scaleY = MathUtil.easeOutQuad(0.7, 1.1, (t - 0.05) / 0.1);
      } else if (t <= 0.25) {
        playerAnimState.scaleY = MathUtil.easeOutQuad(1.2, 1.0, (t - 0.15) / 0.1);
      } else {
        playerAnimState.scaleY = 1.0;
        playerAnimState.activeAnim = null;
      }
    } else if (playerAnimState.activeAnim === 'land') {
      playerAnimState.tick += dt;
      const t = playerAnimState.tick;
      if (t <= 0.05) {
        playerAnimState.scaleY = MathUtil.easeOutQuad(1.0, 0.6, t / 0.05);
      } else if (t <= 0.15) {
        playerAnimState.scaleY = MathUtil.easeOutQuad(0.6, 1.0, (t - 0.05) / 0.1);
      } else {
        playerAnimState.scaleY = 1.0;
        playerAnimState.activeAnim = null;
      }
    } else {
      playerAnimState.scaleY = 1.0;
    }

    const frame = createCameraFrame();
    renderHorizon();

    // Fix for loop jitter: Wrap sCam to [0, trackLength] for world segment generation.
    // This ensures basePct and segment depth calculations remain consistent when sCam is negative.
    const trackLength = getTrackLength();
    let sCamWorld = frame.sCam;
    if (trackLength > 0) {
      sCamWorld = wrap(sCamWorld, trackLength);
    }

    const baseSeg = segmentAtS(sCamWorld);
    if (!baseSeg) {
      glr.end();
      return;
    }

    const basePct = pctRem(sCamWorld, segmentLength);
    const zoneData = {
      road: zonesFor('road'),
      rail: zonesFor('rail'),
      cliff: zonesFor('cliff'),
    };

    // Use wrapped sCam for world generation, but original linear sCam for player projection
    const worldFrame = { ...frame, sCam: sCamWorld };
    const drawList = buildWorldDrawList(baseSeg, basePct, worldFrame, zoneData);
    enqueuePlayer(drawList, frame);
    enqueueMenuGhost(drawList, frame);

    drawList.sort((a, b) => b.depth - a.depth);
    renderDrawList(drawList);

    // Render Title Dash
    if (state.titleOpacity > 0.01 && textures.dash) {
      const dashTex = textures.dash;
      const opacity = state.titleOpacity;
      const texW = 512; // Assuming standard size, or we could use aspect ratio
      const texH = 256;
      const scale = 1.0;
      const w = texW * scale;
      const h = texH * scale;
      
      // Lock to sky position:
      // When pitch is 320 (Menu), we want it centered (H/2).
      // pitchOffset adds to the center Y.
      // y = CenterY + (pitchOffset - MenuPitch)
      const menuPitch = 320;
      const yOffset = pitchOffset - menuPitch;
      const cx = W * 0.5;
      const cy = H * 0.5 + yOffset;

      const quad = { x1: cx - w/2, y1: cy - h/2, x2: cx + w/2, y2: cy - h/2, x3: cx + w/2, y3: cy + h/2, x4: cx - w/2, y4: cy + h/2 };
      const uv = { u1: 0, v1: 0, u2: 1, v2: 0, u3: 1, v3: 1, u4: 0, v4: 1 };
      glr.drawQuadTextured(dashTex, quad, uv, [1, 1, 1, opacity]);
    }

    renderHUD(dt);

    glr.end();
  }

  function createCameraFrame(){
    const phys = state.phys;
    const sCar = phys.s;
    const sCam = sCar - camera.backSegments * segmentLength;
    let camX = state.playerN * roadWidthAt(sCar);
    let camY = state.camYSmooth;

    if (state.isMenu) {
      camY += state.menuCameraHeight;
      camX += 400;
    }

    applyCameraTilt({ camX, camY, sCam, phys });

    return { phys, sCar, sCam, camX, camY };
  }

  function applyCameraTilt({ camX, camY, sCam, phys }){
    const bodyTmp = projectWorldPoint({ x: camX, y: phys.y, z: phys.s }, camX, camY, sCam);
    const speedPct = clamp(Math.abs(phys.vtan) / player.topSpeed, 0, 1);
    const segAhead = segmentAtS(phys.s + state.camera.playerZ) || { curve: 0 };
    const curveNorm = clamp((segAhead.curve || 0) / 6, -1, 1);
    const combined = clamp(
      state.lateralRate * tiltBase.tiltSens + curveNorm * tiltBase.tiltCurveWeight,
      -1,
      1,
    );
    const baseTargetDeg = tiltBase.tiltDir * clamp(combined * speedPct, -1, 1) * tiltBase.tiltMaxDeg;
    state.camRollDeg += (baseTargetDeg - state.camRollDeg) * tiltBase.tiltEase;
    const pivotX = W * 0.5;
    const pivotY = Math.min(bodyTmp.screen.y + 12, H * 0.95);
    glr.setRollPivot((state.camRollDeg * Math.PI) / 180, pivotX, pivotY);
    const cliffDeg = typeof state.getAdditiveTiltDeg === 'function' ? state.getAdditiveTiltDeg() : 0;
    state.playerTiltDeg += (cliffDeg - state.playerTiltDeg) * 0.35;
  }

  function buildWorldDrawList(baseSeg, basePct, frame, zoneData){
    const { sCam, camX, camY } = frame;
    const drawList = [];
    const trackLength = getTrackLength();
    const SPRITE_META = state.spriteMeta;
    const snowMaxSegments = Number.isFinite(snowScreenDistance)
      ? Math.max(0, Math.floor(snowScreenDistance))
      : track.drawDistance;
    const snowStride = Math.max(1, Math.floor(snowScreenDensity || 1));
    const snowEnabled = isSnowFeatureEnabled();
    let x = 0;
    let dx = -(baseSeg.curve * basePct);

    let p1 = projectSegPoint(baseSeg.p1, 0, camX - x, camY, sCam);

    const startIdx = baseSeg.index;
    const startCliff = baseSeg.cliffData || cliffParamsAt(startIdx, 0);
    let p1LA = projectSegPoint(baseSeg.p1, startCliff.leftA.dy, camX - x, camY, sCam);
    let p1LB = projectSegPoint(baseSeg.p1, startCliff.leftA.dy + startCliff.leftB.dy, camX - x, camY, sCam);
    let p1RA = projectSegPoint(baseSeg.p1, startCliff.rightA.dy, camX - x, camY, sCam);
    let p1RB = projectSegPoint(baseSeg.p1, startCliff.rightA.dy + startCliff.rightB.dy, camX - x, camY, sCam);
    let p1LS = projectSegPoint(baseSeg.p1, track.wallShort.left, camX - x, camY, sCam);
    let p1RS = projectSegPoint(baseSeg.p1, track.wallShort.right, camX - x, camY, sCam);

    let n = 0;
    while (n < track.drawDistance) {
      let step = 1;
      if (n >= 120) step = 20;
      else if (n >= 80) step = 16;
      else if (n >= 50) step = 8;
      else if (n >= 20) step = 4;

      if (n + step > track.drawDistance) {
        step = track.drawDistance - n;
      }

      const idx = (baseSeg.index + n) % segments.length;
      const seg = segments[idx];
      const looped = seg.index < baseSeg.index;
      const camSRef = sCam - (looped ? trackLength : 0);

      const camX1 = camX - x;

      let currentX = x;
      let currentDx = dx;
      currentStripItems.length = 0;
      const boostZonesSet = new Set();

      for (let i = 0; i < step; i++) {
        const subIdx = (baseSeg.index + n + i) % segments.length;
        const subSeg = segments[subIdx];
        if (subSeg.cars.length > 0) {
          for (const car of subSeg.cars) currentStripItems.push(allocStripItem('car', car, i));
        }
        if (subSeg.sprites.length > 0) {
          for (const spr of subSeg.sprites) currentStripItems.push(allocStripItem('sprite', spr, i));
        }
        if (snowEnabled && subSeg.snowScreen && (n + i) < snowMaxSegments && (subSeg.index % snowStride === 0)) {
          currentStripItems.push(allocStripItem('snowScreen', subSeg, i));
        }
        const bz = boostZonesOnSegment(subSeg);
        for (const z of bz) boostZonesSet.add(z);
        currentX += currentDx;
        currentDx += subSeg.curve;
      }

      const idxEnd = (baseSeg.index + n + step - 1) % segments.length;
      const segEnd = segments[idxEnd];
      const loopedEnd = segEnd.index < baseSeg.index;
      const camSRefEnd = sCam - (loopedEnd ? trackLength : 0);

      const camX2 = camX - currentX;
      const p2 = projectSegPoint(segEnd.p2, 0, camX2, camY, camSRefEnd);

      x = currentX;
      dx = currentDx;

      let p2LA, p2LB, p2RA, p2RB, p2LS, p2RS;

      if (p1.camera.z <= state.camera.nearZ) {
        n += step;
        p1 = p2;
        p1LA = null; p1LB = null; p1RA = null; p1RB = null;
        p1LS = null; p1RS = null;
        continue;
      }

      perf.registerSegment();

      const depth = Math.max(p1.camera.z, p2.camera.z);
      const visibleRoad = p2.screen.y < p1.screen.y;

      const rw1 = roadWidthAt(p1.world.z);
      const rw2 = roadWidthAt(p2.world.z);
      const w1 = p1.screen.scale * rw1 * HALF_VIEW;
      const w2 = p2.screen.scale * rw2 * HALF_VIEW;

      const fogRoad = fogArray(p1.camera.z, p2.camera.z);

      const boostZonesHere = Array.from(boostZonesSet);

      const cliffStart = seg.cliffData || cliffParamsAt(idx, 0);
      const nextSeg = segments[(idxEnd + 1) % segments.length];
      const cliffEnd = nextSeg.cliffData || cliffParamsAt(idxEnd, 1);

      // Optimization: Only project cliff points if cliffs are present/visible
      const hasLeft = Math.abs(cliffStart.leftA.dx) > 0.1 || Math.abs(cliffStart.leftA.dy) > 0.1 || 
                      Math.abs(cliffEnd.leftA.dx) > 0.1 || Math.abs(cliffEnd.leftA.dy) > 0.1 ||
                      Math.abs(cliffStart.leftB.dx) > 0.1 || Math.abs(cliffStart.leftB.dy) > 0.1;
      
      const hasRight = Math.abs(cliffStart.rightA.dx) > 0.1 || Math.abs(cliffStart.rightA.dy) > 0.1 || 
                       Math.abs(cliffEnd.rightA.dx) > 0.1 || Math.abs(cliffEnd.rightA.dy) > 0.1 ||
                       Math.abs(cliffStart.rightB.dx) > 0.1 || Math.abs(cliffStart.rightB.dy) > 0.1;

      if (hasLeft) {
        if (!p1LA) p1LA = projectSegPoint(seg.p1, cliffStart.leftA.dy, camX1, camY, camSRef);
        p2LA = projectSegPoint(segEnd.p2, cliffEnd.leftA.dy, camX2, camY, camSRefEnd);
        
        if (!p1LB) p1LB = projectSegPoint(seg.p1, cliffStart.leftA.dy + cliffStart.leftB.dy, camX1, camY, camSRef);
        p2LB = projectSegPoint(segEnd.p2, cliffEnd.leftA.dy + cliffEnd.leftB.dy, camX2, camY, camSRefEnd);
      }
      if (hasRight) {
        if (!p1RA) p1RA = projectSegPoint(seg.p1, cliffStart.rightA.dy, camX1, camY, camSRef);
        p2RA = projectSegPoint(segEnd.p2, cliffEnd.rightA.dy, camX2, camY, camSRefEnd);
        
        if (!p1RB) p1RB = projectSegPoint(seg.p1, cliffStart.rightA.dy + cliffStart.rightB.dy, camX1, camY, camSRef);
        p2RB = projectSegPoint(segEnd.p2, cliffEnd.rightA.dy + cliffEnd.rightB.dy, camX2, camY, camSRefEnd);
      }

      if (!p1LS) p1LS = projectSegPoint(seg.p1, track.wallShort.left, camX1, camY, camSRef);
      p2LS = projectSegPoint(segEnd.p2, track.wallShort.left, camX2, camY, camSRefEnd);
      
      if (!p1RS) p1RS = projectSegPoint(seg.p1, track.wallShort.right, camX1, camY, camSRef);
      p2RS = projectSegPoint(segEnd.p2, track.wallShort.right, camX2, camY, camSRefEnd);
      
      const L = hasLeft ? makeCliffLeftQuads(
        p1.screen.x, p1.screen.y, w1,
        p2.screen.x, visibleRoad ? p2.screen.y : (p1.screen.y - 1),
        w2,
        p1LA.screen.y, p2LA.screen.y,
        p1LB.screen.y, p2LB.screen.y,
        cliffStart.leftA.dx, cliffEnd.leftA.dx,
        cliffStart.leftB.dx, cliffEnd.leftB.dx,
        0, 1,
        rw1, rw2
      ) : null;

      const R = hasRight ? makeCliffRightQuads(
        p1.screen.x, p1.screen.y, w1,
        p2.screen.x, visibleRoad ? p2.screen.y : (p1.screen.y - 1),
        w2,
        p1RA.screen.y, p2RA.screen.y,
        p1RB.screen.y, p2RB.screen.y,
        cliffStart.rightA.dx, cliffEnd.rightA.dx,
        cliffStart.rightB.dx, cliffEnd.rightB.dx,
        0, 1,
        rw1, rw2
      ) : null;

      let [v0Road, v1Road] = vSpanForSeg(zoneData.road, idx);
      v1Road = v0Road + (v1Road - v0Road) * step;
      let [v0Rail, v1Rail] = vSpanForSeg(zoneData.rail, idx);
      v1Rail = v0Rail + (v1Rail - v0Rail) * step;
      let [v0Cliff, v1Cliff] = vSpanForSeg(zoneData.cliff, idx);
      v1Cliff = v0Cliff + (v1Cliff - v0Cliff) * step;

      drawList.push({
        type: 'strip',
        depth,
        segIndex: idx,
        seg,
        cameraOffset: n,
        visibleRoad,
        boostZones: boostZonesHere,
        p1,
        p2,
        w1,
        w2,
        L,
        R,
        v0Road,
        v1Road,
        v0Rail,
        v1Rail,
        v0Cliff,
        v1Cliff,
        fogRoad,
        p1LS,
        p2LS,
        p1RS,
        p2RS,
      });

      for (const item of currentStripItems) {
        if (item.type === 'car') {
          const car = item.obj;
          const localT = wrap(car.z - segments[(baseSeg.index + n + item.i) % segments.length].p1.world.z, trackLength) / segmentLength;
          const t = (item.i + localT) / step;
        const scale = lerp(p1.screen.scale, p2.screen.scale, t);
        const rw = lerp(rw1, rw2, t);
        const xCenter = lerp(p1.screen.x, p2.screen.x, t) + scale * car.offset * rw * HALF_VIEW;

        // Optimization: Cull tiny or off-screen cars
        const wPxRaw = scale * car.meta.wN * rw * HALF_VIEW;
        if (wPxRaw < 10) continue;
        if (xCenter + wPxRaw < 0 || xCenter - wPxRaw > W) continue;

        const yBase = lerp(p1.screen.y, p2.screen.y, t);
        const zObj = lerp(p1.camera.z, p2.camera.z, t);
        const wPx = scale * car.meta.wN * rw * HALF_VIEW;
        const hPx = wPx * car.meta.aspect;
        const npcColor = npcColorForCar(car, camX, camY, sCam);
        const npcTex = (() => {
          const texKey = car && car.texKey;
          if (texKey && textures[texKey]) return textures[texKey];
          const fallbackKeys = [
            'npcCar01', 'npcCar02', 'npcCar03',
            'npcVan01', 'npcVan02', 'npcVan03',
            'npcSemi01', 'npcSemi02', 'npcSemi03',
            'npcSpecial01',
          ];
          for (const key of fallbackKeys) {
            if (textures[key]) return textures[key];
          }
          return textures.car || (car.meta && typeof car.meta.tex === 'function' ? car.meta.tex() : null);
        })();
        const npcUv = npcAtlasUvFromBuckets(npcColor.buckets);
        drawList.push({
          type: 'npc',
          depth: zObj,
          x: xCenter,
          y: yBase,
          w: wPx,
          h: hPx,
          z: zObj,
          tint: npcColor.color,
          tex: npcTex,
          uv: npcUv,
          colorKey: `npc:${car.type || 'car'}`,
          npcColorIndex: npcColor.index,
          npcColorBuckets: npcColor.buckets,
        });
        } else if (item.type === 'snowScreen') {
          const subSeg = item.obj;
          const t = (item.i + 0.5) / step;
          const scale = lerp(p1.screen.scale, p2.screen.scale, t);
          const rw = lerp(rw1, rw2, t);
          const centerX = lerp(p1.screen.x, p2.screen.x, t);
          const centerY = lerp(p1.screen.y, p2.screen.y, t);
          const zMid = lerp(p1.camera.z, p2.camera.z, t);

          const baseRadius = computeSnowScreenBaseRadius(scale, rw);
          const sizePx = baseRadius * 2;
          const color = (subSeg.snowScreen && Array.isArray(subSeg.snowScreen.color))
            ? subSeg.snowScreen.color
            : [1, 1, 1, 1];

          if (sizePx > 0) {
            drawList.push({
              type: 'snowScreen',
              depth: zMid + 1e-3,
              x: centerX,
              y: centerY,
              size: sizePx,
              color,
              z: zMid,
              segIndex: subSeg.index,
            });
          }
        } else if (item.type === 'sprite') {
          const spr = item.obj;
        const meta = SPRITE_META[spr.kind] || SPRITE_META.SIGN || { wN: 0.2, aspect: 1, tint: [1, 1, 1, 1] };
          const segStartZ = segments[(baseSeg.index + n + item.i) % segments.length].p1.world.z;
          const spriteS = Number.isFinite(spr.s) ? spr.s : segStartZ;
          const deltaS = wrap(spriteS - segStartZ, trackLength);
          const localT = clamp(deltaS / Math.max(1e-6, segmentLength), 0, 1);
          const t = (item.i + localT) / step;
        const scale = lerp(p1.screen.scale, p2.screen.scale, t);
        const rw = lerp(rw1, rw2, t);

        // Optimization: Cull tiny sprites early
        const scaleFactor = Number.isFinite(spr.scale) ? spr.scale : 1;
        const wPxRaw = scale * meta.wN * rw * HALF_VIEW * scaleFactor;
        // Dynamic threshold: Cull large objects (trees) at a larger pixel size to match draw distance of smaller objects
        const cullThreshold = Math.max(2, 12 * meta.wN);
        if (wPxRaw < cullThreshold) continue;

        const baseX = lerp(p1.screen.x, p2.screen.x, t);
        const baseY = lerp(p1.screen.y, p2.screen.y, t);
        const sAbs = Math.abs(spr.offset);
        let xCenter;
        let yBase;
        let cliffProgress = null;
        if (sAbs > 1.0){
            cliffProgress = computeCliffLaneProgress(seg.index, spr.offset, localT, rw);
        }
        if (sAbs <= 1.0){
          xCenter = baseX + scale * spr.offset * rw * HALF_VIEW;
          yBase = baseY;
        } else {
          const sideLeft = spr.offset < 0;
          const o = (cliffProgress && Number.isFinite(cliffProgress.o))
            ? cliffProgress.o
            : Math.min(2, Math.max(0, sAbs - 1.0));
          if (sideLeft && L){
            const xInner = lerp(L.x1_inner, L.x2_inner, t);
            const xA = lerp(L.x1_A, L.x2_A, t);
            const xB = lerp(L.x1_B, L.x2_B, t);
            const yInner = lerp(p1.screen.y, p2.screen.y, t);
            const yA = p1LA && p2LA ? lerp(p1LA.screen.y, p2LA.screen.y, t) : yInner;
            const yB = p1LB && p2LB ? lerp(p1LB.screen.y, p2LB.screen.y, t) : yInner;
            if (o <= 1){
              xCenter = lerp(xInner, xA, o);
              yBase = lerp(yInner, yA, o);
            } else {
              const t2 = o - 1;
              xCenter = lerp(xA, xB, t2);
              yBase = lerp(yA, yB, t2);
            }
          } else if (!sideLeft && R) {
            const xInner = lerp(R.x1_inner, R.x2_inner, t);
            const xA = lerp(R.x1_A, R.x2_A, t);
            const xB = lerp(R.x1_B, R.x2_B, t);
            const yInner = lerp(p1.screen.y, p2.screen.y, t);
            const yA = p1RA && p2RA ? lerp(p1RA.screen.y, p2RA.screen.y, t) : yInner;
            const yB = p1RB && p2RB ? lerp(p1RB.screen.y, p2RB.screen.y, t) : yInner;
            if (o <= 1){
              xCenter = lerp(xInner, xA, o);
              yBase = lerp(yInner, yA, o);
            } else {
              const t2 = o - 1;
              xCenter = lerp(xA, xB, t2);
              yBase = lerp(yA, yB, t2);
            }
          } else {
            // Fallback if cliffs are missing but sprite is far out
            xCenter = baseX + scale * spr.offset * rw * HALF_VIEW;
            yBase = baseY;
          }
        }
        const zObj = lerp(p1.camera.z, p2.camera.z, t) + 1e-3;
        const stretchFactor = Number.isFinite(spr.stretch) ? spr.stretch : 1;
        let wPx = scale * meta.wN * rw * HALF_VIEW;
        let hPx = wPx * meta.aspect;
        wPx *= scaleFactor;
        hPx *= scaleFactor * stretchFactor;

        // Optimization: Cull off-screen sprites
        const screenOffsetX = Number.isFinite(spr.screenOffsetX) ? spr.screenOffsetX : 0;
        if ((xCenter + screenOffsetX) + wPx < 0 || (xCenter + screenOffsetX) - wPx > W) continue;

        let angle = null;
        const screenOffsetY = Number.isFinite(spr.screenOffsetY) ? spr.screenOffsetY : 0;
        const drawX = xCenter + screenOffsetX;
        const drawY = yBase + screenOffsetY;
        const texture = typeof meta.tex === 'function' ? meta.tex(spr) : (meta.tex || null);
        let uv = null;
        if (texture && typeof meta.frameUv === 'function'){
          const frameIdx = Number.isFinite(spr && spr.animFrame)
            ? spr.animFrame
            : ((spr && spr.animation && Number.isFinite(spr.animation.frame)) ? spr.animation.frame : 0);
          uv = meta.frameUv.call(meta, frameIdx, spr);
        } else if (spr && spr.uv) {
          uv = spr.uv;
        }
        drawList.push({
          type: 'prop',
          depth: zObj,
          x: drawX,
          y: drawY,
          w: wPx,
          h: hPx,
          z: zObj,
          tint: meta.tint,
          tex: texture,
          uv,
          angle,
          kind: spr.kind || null,
          colorKey: `prop:${spr.kind || 'generic'}`,
        });
      }
      }
      n += step;
      p1 = p2;
      p1LA = p2LA; p1LB = p2LB;
      p1RA = p2RA; p1RB = p2RB;
      p1LS = p2LS; p1RS = p2RS;
    }
    return drawList;
  }

  function computeCurvatureOffset(sStart, dist) {
    if (dist <= 0) return 0;
    const trackLength = getTrackLength();
    let sCurrent = sStart;
    if (trackLength > 0) {
      sCurrent = wrap(sCurrent, trackLength);
    }

    const startSeg = segmentAtS(sCurrent);
    if (!startSeg) return 0;

    const basePct = pctRem(sCurrent, segmentLength);
    let x = 0;
    let dx = -(startSeg.curve * basePct);

    let currentDist = 0;
    const maxSegments = Math.ceil(dist / segmentLength) + 2;

    for (let i = 0; i < maxSegments; i++) {
      const segIndex = (startSeg.index + i) % segments.length;
      const seg = segments[segIndex];

      if (currentDist + segmentLength > dist) {
        const remaining = dist - currentDist;
        const pct = remaining / segmentLength;
        return x + dx * pct;
      }

      x += dx;
      dx += seg.curve;
      currentDist += segmentLength;
    }
    return x;
  }

  function enqueuePlayer(drawList, frame){
    const { phys, camX, camY, sCam } = frame;
    const SPRITE_META = state.spriteMeta;
    const playerMeta = SPRITE_META.PLAYER || {};
    const carX = state.playerN * roadWidthAt(phys.s);
    const floor = floorElevationAt(phys.s, state.playerN);
    const bodyWorldY = phys.grounded ? floor : phys.y;
    const offsetZ = (state.isMenu && Number.isFinite(state.menuCarOffsetZ)) ? state.menuCarOffsetZ : 0;

    let curveOffsetX = 0;
    if (Math.abs(offsetZ) > 1) {
      const dist = (phys.s + offsetZ) - sCam;
      curveOffsetX = computeCurvatureOffset(sCam, dist);
    }

    const body = projectWorldPoint({ x: carX + curveOffsetX, y: bodyWorldY, z: phys.s + offsetZ }, camX, camY, sCam);
    const shadow = projectWorldPoint({ x: carX + curveOffsetX, y: floor, z: phys.s + offsetZ }, camX, camY, sCam);
    if (body.camera.z > state.camera.nearZ){
      const pixScale = body.screen.scale * HALF_VIEW;
      const widthNorm = Number.isFinite(playerMeta.wN) ? playerMeta.wN : 0.16;
      const aspect = Number.isFinite(playerMeta.aspect) ? playerMeta.aspect : 0.7;
      const w = widthNorm * state.getKindScale('PLAYER') * roadWidthAt(phys.s) * pixScale;
      const h = w * aspect * playerAnimState.scaleY;
      const sprite = computePlayerSpriteSamples(frame, playerMeta);
      drawList.push({
        type: 'player',
        depth: body.camera.z - 1e-3,
        x: body.screen.x,
        w,
        h,
        bodyY: body.screen.y,
        shadowY: shadow.screen.y,
        zBody: body.camera.z,
        zShadow: shadow.camera.z,
        meta: playerMeta,
        sprite,
      });
    }
  }

  function enqueueMenuGhost(drawList, frame){
    if (!state.isMenu || !state.menuGhostCar) return;
    const ghost = state.menuGhostCar;
    const { phys, camX, camY, sCam } = frame;
    const SPRITE_META = state.spriteMeta;
    const playerMeta = SPRITE_META.PLAYER || {};
    const carX = state.playerN * roadWidthAt(phys.s);
    const floor = floorElevationAt(phys.s, state.playerN);
    const bodyWorldY = phys.grounded ? floor : phys.y;
    const offsetZ = Number.isFinite(ghost.offsetZ) ? ghost.offsetZ : 0;

    let curveOffsetX = 0;
    if (Math.abs(offsetZ) > 1) {
      const dist = (phys.s + offsetZ) - sCam;
      curveOffsetX = computeCurvatureOffset(sCam, dist);
    }

    const body = projectWorldPoint({ x: carX + curveOffsetX, y: bodyWorldY, z: phys.s + offsetZ }, camX, camY, sCam);
    const shadow = projectWorldPoint({ x: carX + curveOffsetX, y: floor, z: phys.s + offsetZ }, camX, camY, sCam);
    
    if (body.camera.z > state.camera.nearZ){
      const pixScale = body.screen.scale * HALF_VIEW;
      const widthNorm = Number.isFinite(playerMeta.wN) ? playerMeta.wN : 0.16;
      const aspect = Number.isFinite(playerMeta.aspect) ? playerMeta.aspect : 0.7;
      const w = widthNorm * state.getKindScale('PLAYER') * roadWidthAt(phys.s) * pixScale;
      const h = w * aspect;
      
      const ghostTex = textures[ghost.textureKey] || textures.car;
      const sprite = computePlayerSpriteSamples(frame, { ...playerMeta, tex: () => ghostTex });
      
      drawList.push({
        type: 'player',
        depth: body.camera.z - 1e-3,
        x: body.screen.x,
        w, h,
        bodyY: body.screen.y, shadowY: shadow.screen.y,
        zBody: body.camera.z, zShadow: shadow.camera.z,
        meta: playerMeta,
        sprite: { ...sprite, texture: ghostTex }
      });
    }
  }

  function renderDrawList(drawList){
    const SPRITE_META = state.spriteMeta;
    const items = Array.isArray(drawList) ? drawList : [];
    perf.registerDrawListSize(items.length);
    if (!items.length) return;
    for (const item of items){
      if (item.type === 'strip'){
        perf.registerStrip();
        renderStrip(item);
      } else if (item.type === 'npc'){
        perf.registerSprite('npc');
        
        drawBillboard(
          item.x,
          item.y,
          item.w,
          item.h,
          item.z,
          item.tint,
          item.tex,
          item.uv,
          item.colorKey,
        );
      } else if (item.type === 'prop'){
        perf.registerSprite('prop');
        const hasAngle = Number.isFinite(item.angle) && Math.abs(item.angle) > 1e-4;
        if (hasAngle) {
          drawBillboardRotated(
            item.x,
            item.y,
            item.w,
            item.h,
            item.z,
            item.tint,
            item.tex,
            item.uv,
            item.colorKey,
            item.angle,
          );
        } else {
          drawBillboard(
            item.x,
            item.y,
            item.w,
            item.h,
            item.z,
            item.tint,
            item.tex,
            item.uv,
            item.colorKey,
          );
        }
      } else if (item.type === 'snowScreen'){
        perf.registerSnowScreen();
        renderSnowScreen(item);
      } else if (item.type === 'player'){
        perf.registerSprite('player');
        renderPlayer(item);
      }
    }
  }

  function renderSnowScreen(item){
    if (!glr) return;
    if (!isSnowFeatureEnabled()) return;
    const { x, y, size, color = [1, 1, 1, 1], z, segIndex } = item;
    if (size <= 0) return;
    const radius = size * 0.5;
    const diameter = radius * 2;

    const fogVals = fogArray(z || 0);
    const { flakes, phaseOffset } = snowFieldFor(segIndex);
    const time = (state && state.phys && typeof state.phys.t === 'number')
      ? state.phys.t
      : ((typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now() / 1000
        : 0);
    const animTime = time + phaseOffset;
    const alpha = Array.isArray(color) && color.length >= 4 ? color[3] : 1;
    const flakeColor = [1, 1, 1, alpha];

    const topSpeed = (player && Number.isFinite(player.topSpeed) && player.topSpeed !== 0)
      ? Math.abs(player.topSpeed)
      : 1;
    const phys = state && state.phys ? state.phys : null;
    const speedPct = clamp(Math.abs(phys && Number.isFinite(phys.vtan) ? phys.vtan : 0) / topSpeed, 0, 1);
    const closeness = clamp(1 - fogFactorFromZ(z || 0), 0, 1);
    const viewCenterX = (HALF_VIEW && HALF_VIEW > 0) ? HALF_VIEW : (W * 0.5);
    const viewCenterY = (H && H > 0) ? H * 0.5 : y;
    const maxRadius = Math.max(1, Math.hypot(viewCenterX || 0, viewCenterY || 0));
    const snowTex = textures.snowFlake;
    const useTexture = areTexturesEnabled() && snowTex;

    for (let i = 0; i < flakes.length; i++){
        if (!useTexture || snowTex === glr.whiteTex) perf.registerSolidType('snow');
      const flake = flakes[i];
      const fallT = animTime * flake.speed;
      let normY = (flake.baseY + fallT) % 1;
      if (normY < 0) normY += 1;
      const sway = Math.sin(animTime * flake.swayFreq + flake.phase) * flake.swayAmp;
      const normX = clamp((flake.baseX - 0.5) + sway, -0.6, 0.6);
      const localY = normY - 0.5;
      const menuHeightMult = state.isMenu ? 4.0 : 1.0;
      const px = x + normX * diameter;
      const py = y + localY * diameter * menuHeightMult;
      const baseSizePx = lerp(snowSizeRange.min, snowSizeRange.max, clamp(flake.size, 0, 1));
      const perspectiveScale = clamp(radius / 128, 0.25, 2.0);
      const flakeSizePx = Math.max(1, Math.round(baseSizePx * perspectiveScale));
      const fHalf = flakeSizePx * 0.5;

      const quadVerts = [
        { keyX: 'x1', keyY: 'y1', x: px - fHalf, y: py - fHalf },
        { keyX: 'x2', keyY: 'y2', x: px + fHalf, y: py - fHalf },
        { keyX: 'x3', keyY: 'y3', x: px + fHalf, y: py + fHalf },
        { keyX: 'x4', keyY: 'y4', x: px - fHalf, y: py + fHalf },
      ];

      if (speedPct > 0 && closeness > 0){
        const dirX = px - viewCenterX;
        const dirY = py - viewCenterY;
        const dirLen = Math.hypot(dirX, dirY);
        if (dirLen > 1e-3){
          const normDirX = dirX / dirLen;
          const normDirY = dirY / dirLen;
          const radialFactor = clamp(dirLen / maxRadius, 0, 1);
          const stretchScale = snowStretchFactor;
          const stretchBase = flakeSizePx * speedPct * closeness * stretchScale;
          const edgeBias = Math.pow(radialFactor, 1.75);
          const stretchAmount = Math.min(
            flakeSizePx * 4 * stretchScale,
            stretchBase * lerp(0.05, 1.5, edgeBias)
          );

          if (stretchAmount > 0.01){
            const vertsByDot = quadVerts
              .map((v) => ({
                vert: v,
                dot: (v.x - viewCenterX) * normDirX + (v.y - viewCenterY) * normDirY,
              }))
              .sort((a, b) => a.dot - b.dot);

            for (let j = 2; j < vertsByDot.length; j++){
              const { vert } = vertsByDot[j];
              vert.x += normDirX * stretchAmount;
              vert.y += normDirY * stretchAmount;
            }
          }
        }
      }

      const quad = quadVerts.reduce((acc, v) => {
        acc[v.keyX] = v.x;
        acc[v.keyY] = v.y;
        return acc;
      }, {});

      perf.registerSnowQuad();
      if (useTexture) {
        glr.drawQuadTextured(snowTex, quad, {u1:0,v1:0,u2:1,v2:0,u3:1,v3:1,u4:0,v4:1}, flakeColor, fogVals);
      } else {
        glr.drawQuadSolid(quad, flakeColor, fogVals);
      }
    }
  }

  function renderStrip(it){
    const {
      p1,
      p2,
      w1,
      w2,
      L,
      R,
      v0Road,
      v1Road,
      v0Rail,
      v1Rail,
      v0Cliff,
      v1Cliff,
      fogRoad,
      visibleRoad,
      segIndex,
      seg,
      boostZones,
      p1LS,
      p2LS,
      p1RS,
      p2RS,
      clipT = 0,
    } = it;

    const texturesEnabled = areTexturesEnabled();

    const x1 = p1.screen.x;
    const y1 = p1.screen.y;
    const x2 = p2.screen.x;
    const y2 = visibleRoad ? p2.screen.y : p1.screen.y - 1;

    const leftAvgY = L ? 0.25 * (L.quadA.y1 + L.quadA.y4 + L.quadB.y1 + L.quadB.y4) : 0;
    const rightAvgY = R ? 0.25 * (R.quadA.y2 + R.quadA.y3 + R.quadB.y2 + R.quadB.y3) : 0;
    const roadMidY = 0.5 * (y1 + y2);
    const leftIsNegative = L && leftAvgY > roadMidY;
    const rightIsNegative = R && rightAvgY > roadMidY;

    const fogCliff = fogArray(p1.camera.z, p2.camera.z);
    const group = ((segIndex / debug.span) | 0) % 2;
    const tint = group ? debug.colors.a : debug.colors.b;
    const debugFill = debug.mode === 'fill';
    const cliffTex = texturesEnabled ? (textures.cliff || glr.whiteTex) : null;
    const fillCliffs = debugFill || !texturesEnabled;

    const leftQuadA = L ? padWithSpriteOverlap(L.quadA) : null;
    const leftQuadB = L ? padWithSpriteOverlap(L.quadB) : null;
    const rightQuadA = R ? padWithSpriteOverlap(R.quadA) : null;
    const rightQuadB = R ? padWithSpriteOverlap(R.quadB) : null;

    const drawLeftCliffs = (solid = false) => {
      if (!L) return;
      const uvA = { ...L.uvA, v1: v0Cliff, v2: v0Cliff, v3: v1Cliff, v4: v1Cliff };
      const uvB = { ...L.uvB, v1: v0Cliff, v2: v0Cliff, v3: v1Cliff, v4: v1Cliff };

      // If outer (B) is higher (smaller Y) than inner (A), draw A then B.
      // If outer (B) is lower (larger Y) than inner (A), draw B then A.
      const bIsHigher = L.quadB.y1 < L.quadA.y1;
      const first = bIsHigher ? leftQuadA : leftQuadB;
      const second = bIsHigher ? leftQuadB : leftQuadA;
      const uv1 = bIsHigher ? uvA : uvB;
      const uv2 = bIsHigher ? uvB : uvA;

      if (solid || !cliffTex) {
        const solidTint = debugFill ? tint : randomColorFor(`cliffL:${segIndex}`);
        perf.registerSolidType('cliff');
        perf.registerSolidType('cliff');
        glr.drawQuadSolid(first, solidTint, fogCliff);
        glr.drawQuadSolid(second, solidTint, fogCliff);
      } else {
        if (cliffTex === glr.whiteTex) { perf.registerSolidType('cliff'); perf.registerSolidType('cliff'); }
        glr.drawQuadTextured(cliffTex, first, uv1, undefined, fogCliff);
        glr.drawQuadTextured(cliffTex, second, uv2, undefined, fogCliff);
      }
    };

    const drawRightCliffs = (solid = false) => {
      if (!R) return;
      const uvA = { ...R.uvA, v1: v0Cliff, v2: v0Cliff, v3: v1Cliff, v4: v1Cliff };
      const uvB = { ...R.uvB, v1: v0Cliff, v2: v0Cliff, v3: v1Cliff, v4: v1Cliff };

      // If outer (B) is higher (smaller Y) than inner (A), draw A then B.
      // If outer (B) is lower (larger Y) than inner (A), draw B then A.
      const bIsHigher = R.quadB.y2 < R.quadA.y2;
      const first = bIsHigher ? rightQuadA : rightQuadB;
      const second = bIsHigher ? rightQuadB : rightQuadA;
      const uv1 = bIsHigher ? uvA : uvB;
      const uv2 = bIsHigher ? uvB : uvA;

      if (solid || !cliffTex) {
        const solidTint = debugFill ? tint : randomColorFor(`cliffR:${segIndex}`);
        perf.registerSolidType('cliff');
        perf.registerSolidType('cliff');
        glr.drawQuadSolid(first, solidTint, fogCliff);
        glr.drawQuadSolid(second, solidTint, fogCliff);
      } else {
        if (cliffTex === glr.whiteTex) { perf.registerSolidType('cliff'); perf.registerSolidType('cliff'); }
        glr.drawQuadTextured(cliffTex, first, uv1, undefined, fogCliff);
        glr.drawQuadTextured(cliffTex, second, uv2, undefined, fogCliff);
      }
    };

    if (leftIsNegative) drawLeftCliffs(fillCliffs);
    if (rightIsNegative) drawRightCliffs(fillCliffs);

    if (debugFill || !texturesEnabled){
      const quad = {
        x1: x1 - w1,
        y1: y1,
        x2: x1 + w1,
        y2: y1,
        x3: x2 + w2,
        y3: y2,
        x4: x2 - w2,
        y4: y2,
      };
      const roadTint = debugFill ? tint : randomColorFor(`road:${segIndex}`);
      perf.registerSolidType('road');
      glr.drawQuadSolid(quad, roadTint, fogRoad);
      if (!debugFill && !texturesEnabled){
        drawBoostZonesOnStrip(boostZones, x1, y1, x2, y2, w1, w2, fogRoad, segIndex);
      }
    } else {
      const roadTex = textures.road || glr.whiteTex;
      drawRoadStrip(x1, y1, w1, x2, y2, w2, v0Road, v1Road, fogRoad, roadTex, segIndex);
      drawBoostZonesOnStrip(boostZones, x1, y1, x2, y2, w1, w2, fogRoad, segIndex);
    }

    if (L && !leftIsNegative) drawLeftCliffs(fillCliffs);
    if (R && !rightIsNegative) drawRightCliffs(fillCliffs);

    if (seg && seg.features && seg.features.rail){
      const texRail = texturesEnabled ? (textures.rail || glr.whiteTex) : null;

      const xL1 = x1 - w1 * track.railInset;
      const xL2 = x2 - w2 * track.railInset;
      const quadL = {
        x1: xL1, y1: p1LS.screen.y,
        x2: xL1, y2: y1,
        x3: xL2, y3: y2,
        x4: xL2, y4: p2LS.screen.y,
      };
      const uvL = { u1: 0, v1: v0Rail, u2: 1, v2: v0Rail, u3: 1, v3: v1Rail, u4: 0, v4: v1Rail };
      const railFogL = fogArray(p1LS.camera.z, p2LS.camera.z);
      const quadLPadded = padWithSpriteOverlap(quadL);
      if (texturesEnabled && texRail){
        glr.drawQuadTextured(texRail, quadLPadded, uvL, undefined, railFogL);
        if (texRail === glr.whiteTex) perf.registerSolidType('rail');
      } else {
        glr.drawQuadSolid(quadLPadded, randomColorFor(`railL:${segIndex}`), railFogL);
        perf.registerSolidType('rail');
      }

      const xR1 = x1 + w1 * track.railInset;
      const xR2 = x2 + w2 * track.railInset;
      const quadR = {
        x1: xR1,
        y1: y1,
        x2: xR1,
        y2: p1RS.screen.y,
        x3: xR2,
        y3: p2RS.screen.y,
        x4: xR2,
        y4: y2,
      };
      const uvR = { u1: 0, v1: v0Rail, u2: 1, v2: v0Rail, u3: 1, v3: v1Rail, u4: 0, v4: v1Rail };
      const railFogR = fogArray(p1RS.camera.z, p2RS.camera.z);
      const quadRPadded = padWithSpriteOverlap(quadR);
      if (texturesEnabled && texRail){
        glr.drawQuadTextured(texRail, quadRPadded, uvR, undefined, railFogR);
        if (texRail === glr.whiteTex) perf.registerSolidType('rail');
      } else {
        glr.drawQuadSolid(quadRPadded, randomColorFor(`railR:${segIndex}`), railFogR);
        perf.registerSolidType('rail');
      }
    }
  }

  function renderPlayer(item){
    const texturesEnabled = areTexturesEnabled();
    const fogShadow = fogArray(item.zShadow || 0);
    const fogBody = fogArray(item.zBody || 0);
    const shH = item.w;

    const bodyCX = item.x;
    const bodyCY = item.bodyY - item.h * 0.5;
    const shCX = item.x;
    const shCY = item.shadowY - shH * 0.5;

    const ang = (state.playerTiltDeg * Math.PI) / 180;

    const shQuad = makeRotatedQuad(shCX, shCY, item.w, shH, ang);
    const shadowTex = texturesEnabled ? textures.shadow : null;
    if (shadowTex) {
      const shUV = { u1: 0, v1: 0, u2: 1, v2: 0, u3: 1, v3: 1, u4: 0, v4: 1 };
      if (shadowTex === glr.whiteTex) perf.registerSolidType('shadow');
      glr.drawQuadTextured(shadowTex, shQuad, shUV, [1, 1, 1, 1], fogShadow);
    } else {
      perf.registerSolidType('shadow');
      const shadowColor = texturesEnabled ? [0.13, 0.13, 0.13, 1] : randomColorFor('player:shadow');
      glr.drawQuadSolid(shQuad, shadowColor, fogShadow);
    }

    const bodyQuad = makeRotatedQuad(bodyCX, bodyCY, item.w, item.h, ang);
    const meta = (item && item.meta) || (state.spriteMeta && state.spriteMeta.PLAYER) || {};
    const spriteInfo = item && item.sprite ? item.sprite : null;
    const texture = spriteInfo && spriteInfo.texture
      ? spriteInfo.texture
      : (typeof meta.tex === 'function' ? meta.tex() : null);
    const atlasColumns = Math.max(1, spriteInfo && spriteInfo.columns
      ? spriteInfo.columns
      : ((meta.atlas && meta.atlas.columns) || PLAYER_ATLAS_COLUMNS));
    const atlasTotalFrames = Math.max(1, spriteInfo && spriteInfo.rows
      ? spriteInfo.rows * atlasColumns
      : ((meta.atlas && meta.atlas.totalFrames) || (PLAYER_ATLAS_COLUMNS * PLAYER_ATLAS_ROWS)));
    const atlasRows = Math.max(1, spriteInfo && spriteInfo.rows
      ? spriteInfo.rows
      : Math.ceil(atlasTotalFrames / atlasColumns));
    const centerCol = Math.floor(atlasColumns * 0.5);
    const centerRow = Math.floor(atlasRows * 0.5);
    let samples = spriteInfo && Array.isArray(spriteInfo.samples)
      ? spriteInfo.samples.slice()
      : [];
    if ((!samples || !samples.length) && texture) {
      samples = [{
        col: centerCol,
        row: centerRow,
        weight: 1,
        uv: atlasUvFromRowCol(centerRow, centerCol, atlasColumns, atlasRows),
      }];
    }

    if (!texturesEnabled || !texture || texture === glr.whiteTex) perf.registerSolidType('player');
    if (texturesEnabled && texture && samples && samples.length) {
      const sortedSamples = samples
        .slice()
        .sort((a, b) => (b.weight || 0) - (a.weight || 0))
        .filter((entry) => entry && entry.uv);
      if (sortedSamples.length) {
        const gl = glr && glr.gl ? glr.gl : null;
        if (gl) {
          const [first, ...rest] = sortedSamples;
          const firstWeight = clamp(first.weight || 0, 0, 1);
          if (firstWeight > 1e-4) {
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ZERO);
            glr.drawQuadTextured(
              texture,
              bodyQuad,
              first.uv,
              [firstWeight, firstWeight, firstWeight, 1],
              fogBody,
            );
          }
          if (rest.length) {
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
            for (const sample of rest) {
              const weight = clamp(sample.weight || 0, 0, 1);
              if (weight <= 1e-4) continue;
              glr.drawQuadTextured(
                texture,
                bodyQuad,
                sample.uv,
                [weight, weight, weight, 1],
                fogBody,
              );
            }
          }
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else {
          const sample = sortedSamples[0];
          glr.drawQuadTextured(texture, bodyQuad, sample.uv, undefined, fogBody);
        }
      } else {
        const fallbackTint = Array.isArray(meta.tint) ? meta.tint : [1, 1, 1, 1];
        glr.drawQuadSolid(bodyQuad, fallbackTint, fogBody);
      }
    } else {
      const fallbackTint = Array.isArray(meta.tint) ? meta.tint : [1, 1, 1, 1];
      const bodyColor = texturesEnabled ? fallbackTint : randomColorFor('player:body');
      glr.drawQuadSolid(bodyQuad, bodyColor, fogBody);
    }
  }

  function renderOverlay(){
    if (overlayApi && typeof overlayApi.renderOverlay === 'function') {
      overlayApi.renderOverlay();
    }
  }

  const resetMatte = (() => {
    const D_SHRINK = 32/60, D_WAIT = 10/60, D_EXPAND = 34/60;
    const D_TOTAL = D_SHRINK + D_WAIT + D_EXPAND;
    let active = false, timer = 0, scale = 1, didAction = false, mode = 'reset';
    let respawnS = 0, respawnN = 0;
    let transitionCallback = null;
    function start(nextMode='reset', sForRespawn=null, nForRespawn=0, cb=null){
      if (active) return;
      active = true; timer = 0; scale = 1; didAction = false; mode = nextMode;
      transitionCallback = cb;
      if (nextMode === 'respawn') { respawnS = (sForRespawn == null) ? state.phys.s : sForRespawn; respawnN = nForRespawn; }
      state.resetMatteActive = true;
    }
    function tick(dt){
      if (!active) return;
      timer += dt;
      if (timer < D_SHRINK) scale = 1 - (timer / D_SHRINK);
      else if (timer < D_SHRINK + D_WAIT) scale = 0;
      else if (timer < D_TOTAL) { const u = timer - (D_SHRINK + D_WAIT); scale = u / D_EXPAND; }
      else scale = 1;

      if (!didAction && timer >= D_SHRINK) {
        if (mode === 'reset') {
          if (typeof state.callbacks.onResetScene === 'function') state.callbacks.onResetScene();
        } else if (mode === 'respawn') {
          if (typeof Gameplay.respawnPlayerAt === 'function') Gameplay.respawnPlayerAt(respawnS, respawnN);
        } else if (mode === 'transition') {
          if (typeof transitionCallback === 'function') transitionCallback();
        }
        didAction = true;
      }
      if (timer >= D_TOTAL) { active = false; scale = 1; didAction = false; state.resetMatteActive = false; if (ctxHUD) ctxHUD.clearRect(0,0,HUD_W,HUD_H); }
    }
    function draw(){
      if (!active || !ctxHUD) return;
      ctxHUD.clearRect(0,0,HUD_W,HUD_H);
      ctxHUD.fillStyle = '#000';
      ctxHUD.fillRect(0,0,HUD_W,HUD_H);
      const r = HUD_COVER_RADIUS * scale;
      if (r > 0){
        ctxHUD.save(); ctxHUD.globalCompositeOperation = 'destination-out';
        ctxHUD.beginPath(); ctxHUD.arc(HUD_W*0.5, HUD_H*0.5, r, 0, Math.PI*2); ctxHUD.fill();
        ctxHUD.restore();
      }
    }
    return {
      start,
      tick,
      draw,
      get active(){ return active; }
    };
  })();

  function attach(glRenderer, dom){
    glr = glRenderer;
    perf.wrapRenderer(glr);
    canvas3D = dom && dom.canvas || null;
    canvasHUD = dom && dom.hud || null;
    const overlayCanvas = dom && dom.overlay || null;

    if (canvas3D){
      W = canvas3D.width;
      H = canvas3D.height;
      HALF_VIEW = W * 0.5;
    }
    overlayApi.setOverlayCanvas(overlayCanvas);
    syncOverlayVisibility(true);
    if (canvasHUD){
      ctxHUD = canvasHUD.getContext('2d', { alpha:true });
      HUD_W = canvasHUD.width;
      HUD_H = canvasHUD.height;
      HUD_COVER_RADIUS = Math.hypot(HUD_W, HUD_H) * 0.5 + 2;
    }
  }

  function frame(stepFn){
    const fps = 60, step = 1/fps;
    let last=performance.now(), acc=0;
    function loop(now){
      const rawDt = (now-last)/1000;
      const dt=Math.min(0.25,rawDt);
      last=now; acc+=dt;
      perf.beginFrame(rawDt);
      let stepsThisFrame = 0;
      while(acc>=step){
        if (typeof stepFn === 'function') stepFn(step);
        resetMatte.tick(step);
        acc-=step;
        stepsThisFrame += 1;
      }
      perf.registerPhysicsSteps(stepsThisFrame);
      renderScene(dt);
      perf.endFrame();
      renderOverlay();
      resetMatte.draw();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  async function updateTrackTextures(theme) {
    if (!glr || !theme) return;
    const { road, cliff, rail, horizon } = theme;
    
    const load = async (key, url) => {
      if (!url) return;
      const resolved = (World && typeof World.resolveAssetUrl === 'function') 
        ? World.resolveAssetUrl(url) 
        : url;
      const tex = await glr.loadTexture(resolved);
      if (tex && textures) {
        textures[key] = tex;
      }
    };

    const promises = [];
    if (road) promises.push(load('road', road));
    if (cliff) promises.push(load('cliff', cliff));
    if (rail) promises.push(load('rail', rail));
    if (Array.isArray(horizon)) {
      if (horizon[0]) promises.push(load('horizon1', horizon[0]));
      if (horizon[1]) promises.push(load('horizon2', horizon[1]));
      if (horizon[2]) promises.push(load('horizon3', horizon[2]));
    }
    
    await Promise.all(promises);
  }

  global.Renderer = {
    attach,
    frame,
    matte: {
      startReset(){ resetMatte.start('reset'); },
      startRespawn(s, n=0){ resetMatte.start('respawn', s, n); },
      startTransition(cb){ resetMatte.start('transition', null, 0, cb); },
      tick(dt){ resetMatte.tick(dt); },
      draw(){ resetMatte.draw(); },
    },
    renderScene,
    renderOverlay,
    triggerPickupAnimation,
    updateTrackTextures,
  };
})(window);
