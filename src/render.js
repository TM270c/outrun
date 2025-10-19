(function(global){
  const { Config, MathUtil, World, Gameplay, RenderGL } = global;

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
    computeCurvature,
  } = MathUtil;

  const {
    data,
    assets,
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
  const areTexturesEnabled = () => debug.mode === 'off' && debug.textures !== false;

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
  let canvasOverlay = null;
  let canvasHUD = null;
  let ctxSide = null;
  let ctxHUD = null;

  let W = 0;
  let H = 0;
  let HALF_VIEW = 0;
  let SW = 0;
  let SH = 0;
  let HUD_W = 0;
  let HUD_H = 0;
  let HUD_COVER_RADIUS = 0;

  let overlayOn = true;

  function createPoint(worldOrX, y, z){
    if (typeof worldOrX === 'object' && worldOrX !== null){
      const { x = 0, y: wy = 0, z: wz = 0 } = worldOrX;
      return { world: { x, y: wy, z: wz }, camera: {}, screen: {} };
    }
    return {
      world: { x: worldOrX ?? 0, y: y ?? 0, z: z ?? 0 },
      camera: {},
      screen: {},
    };
  }

  function projectWorldPoint(world, camX, camY, camS){
    const point = createPoint(world);
    projectPoint(point, camX, camY, camS);
    return point;
  }

  function projectSegPoint(segPoint, yOffset, camX, camY, camS){
    const world = (segPoint && segPoint.world) ? segPoint.world : {};
    const offsetY = (typeof yOffset === 'number') ? yOffset : 0;
    const point = createPoint({
      x: world.x,
      y: (world.y || 0) + offsetY,
      z: world.z,
    });
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
    p.camera = p.camera || {};
    p.screen = p.screen || {};
    p.camera.x = (p.world.x || 0) - camX;
    p.camera.y = (p.world.y || 0) - camY;
    p.camera.z = (p.world.z || 0) - camS;
    p.screen.scale = cameraDepth / p.camera.z;
    p.screen.x = (HALF_VIEW + p.screen.scale * p.camera.x * HALF_VIEW) | 0;
    p.screen.y = ((H / 2) - p.screen.scale * p.camera.y * (H / 2)) | 0;
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
  function spriteFarScaleFromZ(z){
    if (!fog.enabled) return 1;
    const f = fogFactorFromZ(z);
    return 1 - (1 - sprites.far.shrinkTo) * Math.pow(f, sprites.far.power);
  }

  const BACKDROP_SCALE = 1.25;

  function drawParallaxLayer(tex, cfg){
    if (!glr) return;
    const uOffset = state.playerN * cfg.parallaxX;
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
    if (useTexture) {
      glr.drawQuadTextured(texture, quad, uv, undefined, fog);
    } else {
      const solidTint = Array.isArray(tint)
        ? tint
        : randomColorFor(colorKey || 'billboard');
      glr.drawQuadSolid(quad, solidTint, fog);
    }
  }

  function segmentAtS(s) {
    const length = getTrackLength();
    if (!segments.length || length <= 0) return null;
    let wrapped = s % length;
    if (wrapped < 0) wrapped += length;
    const idx = Math.floor(wrapped / segmentLength) % segments.length;
    return segments[idx];
  }

  function elevationAt(s) {
    const length = getTrackLength();
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

  function zonesFor(key){
    const direct = data[`${key}TexZones`];
    if (Array.isArray(direct)) return direct;
    const texZones = data.texZones;
    if (texZones && Array.isArray(texZones[key])) return texZones[key];
    return [];
  }

  function renderScene(){
    if (!glr || !canvas3D) return;

    glr.begin([0.9,0.95,1.0,1]);

    const frame = createCameraFrame();
    renderHorizon();

    const baseSeg = segmentAtS(frame.sCam);
    if (!baseSeg) {
      glr.end();
      return;
    }

    const basePct = pctRem(frame.sCam, segmentLength);
    const zoneData = {
      road: zonesFor('road'),
      rail: zonesFor('rail'),
      cliff: zonesFor('cliff'),
    };

    const drawList = buildWorldDrawList(baseSeg, basePct, frame, zoneData);
    enqueuePlayer(drawList, frame);

    drawList.sort((a, b) => b.depth - a.depth);
    renderDrawList(drawList);

    glr.end();
  }

  function createCameraFrame(){
    const phys = state.phys;
    const sCar = phys.s;
    const sCam = sCar - camera.backSegments * segmentLength;
    const camX = state.playerN * roadWidthAt(sCar);
    const camY = state.camYSmooth;

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
    let x = 0;
    let dx = -(baseSeg.curve * basePct);

    for (let n = 0; n < track.drawDistance; n++){
      const idx = (baseSeg.index + n) % segments.length;
      const seg = segments[idx];
      const looped = seg.index < baseSeg.index;
      const camSRef = sCam - (looped ? trackLength : 0);

      const camX1 = camX - x;
      const camX2 = camX - x - dx;
      const p1 = projectSegPoint(seg.p1, 0, camX1, camY, camSRef);
      const p2 = projectSegPoint(seg.p2, 0, camX2, camY, camSRef);

      x += dx;
      dx += seg.curve;
      if (p1.camera.z <= state.camera.nearZ) continue;

      const depth = Math.max(p1.camera.z, p2.camera.z);
      const visibleRoad = p2.screen.y < p1.screen.y;

      const rw1 = roadWidthAt(p1.world.z);
      const rw2 = roadWidthAt(p2.world.z);
      const w1 = p1.screen.scale * rw1 * HALF_VIEW;
      const w2 = p2.screen.scale * rw2 * HALF_VIEW;

      const fogRoad = fogArray(p1.camera.z, p2.camera.z);
      const yScale1 = 1.0 - fogRoad[0];
      const yScale2 = 1.0 - fogRoad[2];

      const boostZonesHere = boostZonesOnSegment(seg);

      const cliffStart = cliffParamsAt(idx, 0);
      const cliffEnd = cliffParamsAt(idx, 1);

      const leftA1 = cliffStart.leftA.dy * yScale1;
      const leftA2 = cliffEnd.leftA.dy * yScale2;
      const leftB1 = (cliffStart.leftA.dy + cliffStart.leftB.dy) * yScale1;
      const leftB2 = (cliffEnd.leftA.dy + cliffEnd.leftB.dy) * yScale2;
      const rightA1 = cliffStart.rightA.dy * yScale1;
      const rightA2 = cliffEnd.rightA.dy * yScale2;
      const rightB1 = (cliffStart.rightA.dy + cliffStart.rightB.dy) * yScale1;
      const rightB2 = (cliffEnd.rightA.dy + cliffEnd.rightB.dy) * yScale2;

      const p1LA = projectSegPoint(seg.p1, leftA1, camX1, camY, camSRef);
      const p2LA = projectSegPoint(seg.p2, leftA2, camX2, camY, camSRef);
      const p1LB = projectSegPoint(seg.p1, leftB1, camX1, camY, camSRef);
      const p2LB = projectSegPoint(seg.p2, leftB2, camX2, camY, camSRef);
      const p1RA = projectSegPoint(seg.p1, rightA1, camX1, camY, camSRef);
      const p2RA = projectSegPoint(seg.p2, rightA2, camX2, camY, camSRef);
      const p1RB = projectSegPoint(seg.p1, rightB1, camX1, camY, camSRef);
      const p2RB = projectSegPoint(seg.p2, rightB2, camX2, camY, camSRef);

      const p1LS = projectSegPoint(seg.p1, track.wallShort.left * yScale1, camX1, camY, camSRef);
      const p2LS = projectSegPoint(seg.p2, track.wallShort.left * yScale2, camX2, camY, camSRef);
      const p1RS = projectSegPoint(seg.p1, track.wallShort.right * yScale1, camX1, camY, camSRef);
      const p2RS = projectSegPoint(seg.p2, track.wallShort.right * yScale2, camX2, camY, camSRef);

      const L = makeCliffLeftQuads(
        p1.screen.x, p1.screen.y, w1,
        p2.screen.x, visibleRoad ? p2.screen.y : (p1.screen.y - 1),
        w2,
        p1LA.screen.y, p2LA.screen.y,
        p1LB.screen.y, p2LB.screen.y,
        cliffStart.leftA.dx, cliffEnd.leftA.dx,
        cliffStart.leftB.dx, cliffEnd.leftB.dx,
        0, 1,
        rw1, rw2
      );
      const R = makeCliffRightQuads(
        p1.screen.x, p1.screen.y, w1,
        p2.screen.x, visibleRoad ? p2.screen.y : (p1.screen.y - 1),
        w2,
        p1RA.screen.y, p2RA.screen.y,
        p1RB.screen.y, p2RB.screen.y,
        cliffStart.rightA.dx, cliffEnd.rightA.dx,
        cliffStart.rightB.dx, cliffEnd.rightB.dx,
        0, 1,
        rw1, rw2
      );

      const [v0Road, v1Road] = vSpanForSeg(zoneData.road, idx);
      const [v0Rail, v1Rail] = vSpanForSeg(zoneData.rail, idx);
      const [v0Cliff, v1Cliff] = vSpanForSeg(zoneData.cliff, idx);

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

      const snowScreenActive =
        isSnowFeatureEnabled()
        && seg && seg.snowScreen && snowMaxSegments > 0 && n < snowMaxSegments && (seg.index % snowStride === 0);
      if (snowScreenActive){
        const midT = 0.5;
        const scaleMid = lerp(p1.screen.scale, p2.screen.scale, midT);
        const rwMid = lerp(rw1, rw2, midT);
        const centerX = lerp(p1.screen.x, p2.screen.x, midT);
        const centerY = lerp(p1.screen.y, p2.screen.y, midT);
        const zMid = lerp(p1.camera.z, p2.camera.z, midT);
        const farScale = spriteFarScaleFromZ(zMid);
        const baseRadius = computeSnowScreenBaseRadius(scaleMid, rwMid);
        const sizePx = baseRadius * farScale * 2;
        const color = (seg.snowScreen && Array.isArray(seg.snowScreen.color))
          ? seg.snowScreen.color
          : [1, 1, 1, 1];
        if (sizePx > 0){
          drawList.push({
            type: 'snowScreen',
            depth: zMid + 1e-3,
            x: centerX,
            y: centerY,
            size: sizePx,
            color,
            z: zMid,
            segIndex: seg.index,
          });
        }
      }

      for (let i = 0; i < seg.cars.length; i++){
        const car = seg.cars[i];
        const t = ((car.z - seg.p1.world.z + trackLength) % trackLength) / segmentLength;
        const scale = lerp(p1.screen.scale, p2.screen.scale, t);
        const rw = lerp(rw1, rw2, t);
        const xCenter = lerp(p1.screen.x, p2.screen.x, t) + scale * car.offset * rw * HALF_VIEW;
        const yBase = lerp(p1.screen.y, p2.screen.y, t);
        const zObj = lerp(p1.camera.z, p2.camera.z, t);
        const farS = spriteFarScaleFromZ(zObj);
        let wPx = Math.max(6, scale * car.meta.wN * rw * HALF_VIEW);
        let hPx = Math.max(10, wPx * car.meta.aspect);
        wPx *= farS;
        hPx *= farS;
        drawList.push({
          type: 'npc',
          depth: zObj,
          x: xCenter,
          y: yBase,
          w: wPx,
          h: hPx,
          z: zObj,
          tint: car.meta.tint,
          tex: car.meta.tex ? car.meta.tex() : null,
          colorKey: `npc:${car.type || 'car'}`,
        });
      }

      for (let i = 0; i < seg.sprites.length; i++){
        const spr = seg.sprites[i];
        const meta = SPRITE_META[spr.kind] || SPRITE_META.SIGN;
        const spriteS = Number.isFinite(spr.s) ? spr.s : seg.p1.world.z;
        const deltaS = (spriteS - seg.p1.world.z + trackLength) % trackLength;
        const t = clamp(deltaS / Math.max(1e-6, segmentLength), 0, 1);
        const scale = lerp(p1.screen.scale, p2.screen.scale, t);
        const rw = lerp(rw1, rw2, t);
        const baseX = lerp(p1.screen.x, p2.screen.x, t);
        const baseY = lerp(p1.screen.y, p2.screen.y, t);
        const sAbs = Math.abs(spr.offset);
        let xCenter;
        let yBase;
        let cliffProgress = null;
        if (sAbs > 1.0){
          cliffProgress = computeCliffLaneProgress(seg.index, spr.offset, t, rw);
        }
        if (sAbs <= 1.0){
          xCenter = baseX + scale * spr.offset * rw * HALF_VIEW;
          yBase = baseY;
        } else {
          const sideLeft = spr.offset < 0;
          const o = (cliffProgress && Number.isFinite(cliffProgress.o))
            ? cliffProgress.o
            : Math.min(2, Math.max(0, sAbs - 1.0));
          if (sideLeft){
            const xInner = lerp(L.x1_inner, L.x2_inner, t);
            const xA = lerp(L.x1_A, L.x2_A, t);
            const xB = lerp(L.x1_B, L.x2_B, t);
            const yInner = lerp(p1.screen.y, p2.screen.y, t);
            const yA = lerp(p1LA.screen.y, p2LA.screen.y, t);
            const yB = lerp(p1LB.screen.y, p2LB.screen.y, t);
            if (o <= 1){
              xCenter = lerp(xInner, xA, o);
              yBase = lerp(yInner, yA, o);
            } else {
              const t2 = o - 1;
              xCenter = lerp(xA, xB, t2);
              yBase = lerp(yA, yB, t2);
            }
          } else {
            const xInner = lerp(R.x1_inner, R.x2_inner, t);
            const xA = lerp(R.x1_A, R.x2_A, t);
            const xB = lerp(R.x1_B, R.x2_B, t);
            const yInner = lerp(p1.screen.y, p2.screen.y, t);
            const yA = lerp(p1RA.screen.y, p2RA.screen.y, t);
            const yB = lerp(p1RB.screen.y, p2RB.screen.y, t);
            if (o <= 1){
              xCenter = lerp(xInner, xA, o);
              yBase = lerp(yInner, yA, o);
            } else {
              const t2 = o - 1;
              xCenter = lerp(xA, xB, t2);
              yBase = lerp(yA, yB, t2);
            }
          }
        }
        const zObj = lerp(p1.camera.z, p2.camera.z, t) + 1e-3;
        const farS = spriteFarScaleFromZ(zObj);
        const scaleFactor = Number.isFinite(spr.scale) ? spr.scale : 1;
        let wPx = Math.max(6, scale * meta.wN * rw * HALF_VIEW);
        let hPx = Math.max(10, wPx * meta.aspect);
        wPx *= scaleFactor;
        hPx *= scaleFactor;
        wPx *= farS;
        hPx *= farS;
        const drawX = xCenter;
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
          y: yBase,
          w: wPx,
          h: hPx,
          z: zObj,
          tint: meta.tint,
          tex: texture,
          uv,
          colorKey: `prop:${spr.kind || 'generic'}`,
        });
      }

      if (seg.pickups && seg.pickups.length){
        const pickupMeta = SPRITE_META.PICKUP;
        for (let pi = 0; pi < seg.pickups.length; pi += 1){
          const pk = seg.pickups[pi];
          if (pk.collected) continue;
          const scale = p1.screen.scale;
          const xCenter = p1.screen.x + scale * pk.offset * rw1 * HALF_VIEW;
          const yBase = p1.screen.y;
          const zObj = p1.camera.z + 1e-3;
          const farS = spriteFarScaleFromZ(zObj);
          let wPx = Math.max(6, scale * pickupMeta.wN * rw1 * HALF_VIEW);
          let hPx = Math.max(6, wPx * pickupMeta.aspect);
          wPx *= farS;
          hPx *= farS;
          drawList.push({
            type: 'pickup',
            depth: zObj,
            x: xCenter,
            y: yBase,
            w: wPx,
            h: hPx,
            z: zObj,
            tint: pickupMeta.tint,
            tex: pickupMeta.tex ? pickupMeta.tex() : null,
            colorKey: `pickup:${seg.index}:${pi}`,
          });
        }
      }
    }

    return drawList;
  }

  function enqueuePlayer(drawList, frame){
    const { phys, camX, camY, sCam } = frame;
    const SPRITE_META = state.spriteMeta;
    const carX = state.playerN * roadWidthAt(phys.s);
    const floor = floorElevationAt(phys.s, state.playerN);
    const bodyWorldY = phys.grounded ? floor : phys.y;
    const body = projectWorldPoint({ x: carX, y: bodyWorldY, z: phys.s }, camX, camY, sCam);
    const shadow = projectWorldPoint({ x: carX, y: floor, z: phys.s }, camX, camY, sCam);
    if (body.camera.z > state.camera.nearZ){
      const pixScale = body.screen.scale * HALF_VIEW;
      const w = Math.max(
        12,
        SPRITE_META.PLAYER.wN * state.getKindScale('PLAYER') * roadWidthAt(phys.s) * pixScale,
      );
      const h = Math.max(18, w * SPRITE_META.PLAYER.aspect);
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
      });
    }
  }

  function renderDrawList(drawList){
    const SPRITE_META = state.spriteMeta;
    for (const item of drawList){
      if (item.type === 'strip'){
        renderStrip(item);
      } else if (item.type === 'npc' || item.type === 'prop'){
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
      } else if (item.type === 'pickup'){
        drawBillboard(
          item.x,
          item.y - item.h * 0.2,
          item.w,
          item.h,
          item.z,
          item.tint,
          item.tex,
          item.uv,
          item.colorKey,
        );
      } else if (item.type === 'snowScreen'){
        renderSnowScreen(item);
      } else if (item.type === 'player'){
        renderPlayer(item, SPRITE_META);
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

    for (let i = 0; i < flakes.length; i++){
      const flake = flakes[i];
      const fallT = animTime * flake.speed;
      let normY = (flake.baseY + fallT) % 1;
      if (normY < 0) normY += 1;
      const sway = Math.sin(animTime * flake.swayFreq + flake.phase) * flake.swayAmp;
      const normX = clamp((flake.baseX - 0.5) + sway, -0.6, 0.6);
      const localY = normY - 0.5;
      const px = x + normX * diameter;
      const py = y + localY * diameter;
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

      glr.drawQuadSolid(quad, flakeColor, fogVals);
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
    } = it;

    const texturesEnabled = areTexturesEnabled();

    const x1 = p1.screen.x;
    const y1 = p1.screen.y;
    const x2 = p2.screen.x;
    const y2 = visibleRoad ? p2.screen.y : p1.screen.y - 1;

    const leftAvgY = 0.25 * (L.quadA.y1 + L.quadA.y4 + L.quadB.y1 + L.quadB.y4);
    const rightAvgY = 0.25 * (R.quadA.y2 + R.quadA.y3 + R.quadB.y2 + R.quadB.y3);
    const roadMidY = 0.5 * (y1 + y2);
    const leftIsNegative = leftAvgY > roadMidY;
    const rightIsNegative = rightAvgY > roadMidY;

    const fogCliff = fogArray(p1.camera.z, p2.camera.z);
    const group = ((segIndex / debug.span) | 0) % 2;
    const tint = group ? debug.colors.a : debug.colors.b;
    const debugFill = debug.mode === 'fill';
    const cliffTex = texturesEnabled ? (textures.cliff || glr.whiteTex) : null;
    const fillCliffs = debugFill || !texturesEnabled;

    const leftQuadA = padWithSpriteOverlap(L.quadA);
    const leftQuadB = padWithSpriteOverlap(L.quadB);
    const rightQuadA = padWithSpriteOverlap(R.quadA);
    const rightQuadB = padWithSpriteOverlap(R.quadB);

    const drawLeftCliffs = (solid = false) => {
      const uvA = { ...L.uvA, v1: v0Cliff, v2: v0Cliff, v3: v1Cliff, v4: v1Cliff };
      const uvB = { ...L.uvB, v1: v0Cliff, v2: v0Cliff, v3: v1Cliff, v4: v1Cliff };
      if (solid || !cliffTex){
        const solidTint = debugFill ? tint : randomColorFor(`cliffL:${segIndex}`);
        glr.drawQuadSolid(leftQuadA, solidTint, fogCliff);
        glr.drawQuadSolid(leftQuadB, solidTint, fogCliff);
      } else {
        glr.drawQuadTextured(cliffTex, leftQuadA, uvA, undefined, fogCliff);
        glr.drawQuadTextured(cliffTex, leftQuadB, uvB, undefined, fogCliff);
      }
    };

    const drawRightCliffs = (solid = false) => {
      const uvA = { ...R.uvA, v1: v0Cliff, v2: v0Cliff, v3: v1Cliff, v4: v1Cliff };
      const uvB = { ...R.uvB, v1: v0Cliff, v2: v0Cliff, v3: v1Cliff, v4: v1Cliff };
      if (solid || !cliffTex){
        const solidTint = debugFill ? tint : randomColorFor(`cliffR:${segIndex}`);
        glr.drawQuadSolid(rightQuadA, solidTint, fogCliff);
        glr.drawQuadSolid(rightQuadB, solidTint, fogCliff);
      } else {
        glr.drawQuadTextured(cliffTex, rightQuadA, uvA, undefined, fogCliff);
        glr.drawQuadTextured(cliffTex, rightQuadB, uvB, undefined, fogCliff);
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
      glr.drawQuadSolid(quad, roadTint, fogRoad);
      if (!debugFill && !texturesEnabled){
        drawBoostZonesOnStrip(boostZones, x1, y1, x2, y2, w1, w2, fogRoad, segIndex);
      }
    } else {
      const roadTex = textures.road || glr.whiteTex;
      drawRoadStrip(x1, y1, w1, x2, y2, w2, v0Road, v1Road, fogRoad, roadTex, segIndex);
      drawBoostZonesOnStrip(boostZones, x1, y1, x2, y2, w1, w2, fogRoad, segIndex);
    }

    if (!leftIsNegative) drawLeftCliffs(fillCliffs);
    if (!rightIsNegative) drawRightCliffs(fillCliffs);

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
      } else {
        glr.drawQuadSolid(quadLPadded, randomColorFor(`railL:${segIndex}`), railFogL);
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
      } else {
        glr.drawQuadSolid(quadRPadded, randomColorFor(`railR:${segIndex}`), railFogR);
      }
    }
  }

  function renderPlayer(item, SPRITE_META){
    const texturesEnabled = areTexturesEnabled();
    const fogShadow = fogArray(item.zShadow || 0);
    const fogBody = fogArray(item.zBody || 0);
    const shH = Math.max(3, item.h * 0.06);

    const bodyBottom = Math.min(item.bodyY, item.shadowY - shH);
    const bodyTop = bodyBottom - item.h;
    const bodyCX = item.x;
    const bodyCY = (bodyTop + bodyBottom) * 0.5;
    const shCX = item.x;
    const shCY = item.shadowY - shH * 0.5;

    const ang = (state.playerTiltDeg * Math.PI) / 180;

    const shQuad = makeRotatedQuad(shCX, shCY, item.w, shH, ang);
    const shadowColor = texturesEnabled ? [0.13, 0.13, 0.13, 1] : randomColorFor('player:shadow');
    glr.drawQuadSolid(shQuad, shadowColor, fogShadow);

    const bodyQuad = makeRotatedQuad(bodyCX, bodyCY, item.w, item.h, ang);
    const bodyColor = texturesEnabled ? SPRITE_META.PLAYER.tint : randomColorFor('player:body');
    glr.drawQuadSolid(bodyQuad, bodyColor, fogBody);
  }

  function worldToOverlay(s,y){
    return {
      x:(s-state.phys.s)*(1/track.metersPerPixel.x) + SW*0.5,
      y: SH - y*(1/track.metersPerPixel.y) - 60
    };
  }
  function drawBoostCrossSection(ctx){
    const panelX = 24;
    const panelY = 24;
    const panelW = 220;
    const panelH = 120;
    const roadPadX = 18;
    const roadPadTop = 24;
    const roadPadBottom = 20;
    const roadW = panelW - roadPadX * 2;
    const roadH = panelH - roadPadTop - roadPadBottom;

    ctx.save();
    ctx.translate(panelX, panelY);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, panelW, panelH);

    const roadX = roadPadX;
    const roadY = roadPadTop;
    ctx.fillStyle = '#484848';
    ctx.fillRect(roadX, roadY, roadW, roadH);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(roadX, roadY, roadW, roadH);

    const seg = segmentAtS(state.phys.s);
    const zones = boostZonesOnSegment(seg);
    const mapN = (n, fallback = 0) => {
      const ratio = laneToRoadRatio(n, fallback);
      return roadX + ratio * roadW;
    };
    const mapRatio = (ratio) => roadX + ratio * roadW;

    for (const zone of zones){
      const bounds = getZoneLaneBounds(zone);
      if (!bounds) continue;
      const zoneColors = boost.colors[zone.type] || boost.fallbackColor;
      const x1 = mapRatio(bounds.roadRatioMin);
      const x2 = mapRatio(bounds.roadRatioMax);
      const zx = Math.min(x1, x2);
      const zw = Math.max(2, Math.abs(x2 - x1));
      ctx.fillStyle = zoneColors.fill;
      ctx.fillRect(zx, roadY, zw, roadH);
      ctx.strokeStyle = zoneColors.stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(zx, roadY, zw, roadH);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    const centerX = mapN(0);
    ctx.beginPath();
    ctx.moveTo(centerX, roadY);
    ctx.lineTo(centerX, roadY + roadH);
    ctx.stroke();

    const playerX = mapN(state.playerN);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(playerX, roadY + roadH * 0.5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '11px system-ui, Arial';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Cross-section', 0, panelH - 4);

    ctx.restore();
  }
  function renderOverlay(){
    if (!overlayOn || !ctxSide) return;
    ctxSide.clearRect(0,0,SW,SH);
    ctxSide.lineWidth = 2;
    ctxSide.strokeStyle = state.phys.boostFlashTimer>0 ? '#d32f2f' : '#1976d2';
    ctxSide.beginPath();
    const sStart = state.phys.s - SW*0.5*track.metersPerPixel.x;
    const sEnd   = state.phys.s + SW*0.5*track.metersPerPixel.x;
    const step   = Math.max(5, 2*track.metersPerPixel.x);
    let first = true;
    for (let s = sStart; s <= sEnd; s += step){
      const p = worldToOverlay(s, elevationAt(s));
      if (first){ ctxSide.moveTo(p.x,p.y); first=false; } else { ctxSide.lineTo(p.x,p.y); }
    }
    ctxSide.stroke();

    drawBoostCrossSection(ctxSide);

    const p = worldToOverlay(state.phys.s, state.phys.y);
    ctxSide.fillStyle = '#2e7d32';
    ctxSide.beginPath(); ctxSide.arc(p.x, p.y, 6, 0, Math.PI*2); ctxSide.fill();

    const { dy, d2y } = groundProfileAt(state.phys.s);
    const kap = computeCurvature(dy, d2y);
    const boostingHUD = (state.boostTimer>0) ? `boost:${state.boostTimer.toFixed(2)}s ` : '';
    const driftHUD = `drift:${state.driftState}${state.driftState==='drifting'?' dir='+state.driftDirSnapshot:''} charge:${state.driftCharge.toFixed(2)}/${drift.chargeMin} armed:${state.allowedBoost}`;
    const buildVersion = (typeof build.version === 'string' && build.version.length > 0)
      ? build.version
      : null;
    const versionHUD = buildVersion ? `ver:${buildVersion}  ` : '';
    const hud = `${versionHUD}${boostingHUD}${driftHUD}  vtan:${state.phys.vtan.toFixed(1)}  grounded:${state.phys.grounded}  kappa:${kap.toFixed(5)}  n:${state.playerN.toFixed(2)}  cars:${state.cars.length}  pickups:${state.pickupCollected}/${state.pickupTotal}`;
    ctxSide.fillStyle = '#fff';
    ctxSide.strokeStyle = '#000';
    ctxSide.lineWidth = 3;
    ctxSide.font = '12px system-ui, Arial';
    ctxSide.strokeText(hud, 10, SH-12);
    ctxSide.fillText(hud, 10, SH-12);
  }

  const resetMatte = (() => {
    const FR_SHRINK = 32, FR_WAIT = 10, FR_EXPAND = 34, FR_TOTAL = FR_SHRINK + FR_WAIT + FR_EXPAND;
    let active = false, t = 0, scale = 1, didAction = false, mode = 'reset';
    let respawnS = 0, respawnN = 0;
    function start(nextMode='reset', sForRespawn=null, nForRespawn=0){
      if (active) return;
      active = true; t = 0; scale = 1; didAction = false; mode = nextMode;
      if (nextMode === 'respawn') { respawnS = (sForRespawn == null) ? state.phys.s : sForRespawn; respawnN = nForRespawn; }
      state.resetMatteActive = true;
    }
    function tick(){
      if (!active) return;
      if (t < FR_SHRINK) scale = 1 - (t + 1) / FR_SHRINK;
      else if (t < FR_SHRINK + FR_WAIT) scale = 0;
      else if (t < FR_TOTAL) { const u = t - (FR_SHRINK + FR_WAIT); scale = (u + 1) / FR_EXPAND; }
      if (!didAction && t >= FR_SHRINK) {
        if (mode === 'reset') {
          if (typeof state.callbacks.onResetScene === 'function') state.callbacks.onResetScene();
        } else if (mode === 'respawn') {
          if (typeof Gameplay.respawnPlayerAt === 'function') Gameplay.respawnPlayerAt(respawnS, respawnN);
        }
        didAction = true;
      }
      t++; if (t >= FR_TOTAL) { active = false; scale = 1; didAction = false; state.resetMatteActive = false; if (ctxHUD) ctxHUD.clearRect(0,0,HUD_W,HUD_H); }
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
    canvas3D = dom && dom.canvas || null;
    canvasOverlay = dom && dom.overlay || null;
    canvasHUD = dom && dom.hud || null;

    if (canvas3D){
      W = canvas3D.width;
      H = canvas3D.height;
      HALF_VIEW = W * 0.5;
    }
    if (canvasOverlay){
      ctxSide = canvasOverlay.getContext('2d', { alpha:true });
      SW = canvasOverlay.width;
      SH = canvasOverlay.height;
      canvasOverlay.style.display = overlayOn ? 'block' : 'none';
    }
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
      const dt=Math.min(0.25,(now-last)/1000); last=now; acc+=dt;
      while(acc>=step){
        if (typeof stepFn === 'function') stepFn(step);
        resetMatte.tick();
        acc-=step;
      }
      renderScene();
      renderOverlay();
      resetMatte.draw();
      if (state.phys.boostFlashTimer>0) state.phys.boostFlashTimer=Math.max(0, state.phys.boostFlashTimer - dt);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  global.Renderer = {
    attach,
    frame,
    matte: {
      startReset(){ resetMatte.start('reset'); },
      startRespawn(s, n=0){ resetMatte.start('respawn', s, n); },
      tick(){ resetMatte.tick(); },
      draw(){ resetMatte.draw(); },
    },
    renderScene,
    renderOverlay,
  };
})(window);
