
(function(global){
  const { Config, MathUtil, World, SpriteCatalog } = global;

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
    nearMiss: nearMissConfig = {},
    forceLandingOnCarImpact = false,
  } = Config;

  const {
    base: tiltBase = { tiltDir: 1, tiltCurveWeight: 0, tiltEase: 0.1, tiltSens: 0, tiltMaxDeg: 0 },
    additive: tiltAdd = { tiltAddEnabled: false, tiltAddMaxDeg: null },
  } = tiltConfig;

  const {
    forwardDistanceScale: nearMissForwardScale = 0.5,
    forwardDistanceMin: nearMissForwardMinRaw = 5,
    forwardDistanceFallback: nearMissForwardFallbackRaw = 12,
  } = nearMissConfig;

  const NEAR_MISS_FORWARD_MIN = Math.max(
    0,
    Number.isFinite(nearMissForwardMinRaw) ? nearMissForwardMinRaw : 5,
  );
  const NEAR_MISS_FORWARD_FALLBACK = (() => {
    const fallback = Number.isFinite(nearMissForwardFallbackRaw)
      ? nearMissForwardFallbackRaw
      : 12;
    return Math.max(NEAR_MISS_FORWARD_MIN, fallback);
  })();
  const NEAR_MISS_FORWARD_SCALE = Number.isFinite(nearMissForwardScale)
    ? nearMissForwardScale
    : 0.5;

  const {
    clamp,
    clamp01,
    lerp,
    computeCurvature,
    wrap,
    shortestSignedDelta,
    tangentNormalFromSlope,
  } = MathUtil;

  const {
    data,
    segmentAtS,
    segmentAtIndex,
    elevationAt,
    groundProfileAt,
    roadWidthAt,
    floorElevationAt,
    cliffParamsAt,
    cliffSurfaceInfoAt,
    cliffLateralSlopeAt,
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

  function normalizeAnimClip(rawClip, fallbackFrame = 0, useFallback = true){
    const clip = rawClip || {};
    const frames = Array.isArray(clip.frames) ? clip.frames.filter(Number.isFinite) : [];
    let normalizedFrames = frames.slice();
    if (normalizedFrames.length === 0 && useFallback && Number.isFinite(fallbackFrame)) {
      normalizedFrames = [fallbackFrame];
    }
    const mode = (clip.playback || '').toString().toLowerCase();
    const playback = (mode === 'loop' || mode === 'pingpong' || mode === 'once') ? mode : 'none';
    return { frames: normalizedFrames, playback, hold: !!clip.hold, speed: Number.isFinite(clip.speed) ? clip.speed : 0 };
  }

  function createSpriteAnimationState(baseClipRaw, interactClipRaw, fallbackFrame){
    const interactClip = normalizeAnimClip(interactClipRaw, fallbackFrame, false);
    const hasInteract = interactClip.frames.length > 0;

    // Optimization: If no base animation and no interaction animation, return null (static sprite)
    if (!baseClipRaw && !hasInteract) return null;

    const baseClip = normalizeAnimClip(baseClipRaw, fallbackFrame, true);
    const hasBase = baseClip.frames.length > 0;
    if (!hasBase && !hasInteract) return null;

    const initialFrame = hasBase
      ? baseClip.frames[Math.min(baseClip.frames.length - 1, 0)]
      : (hasInteract ? interactClip.frames[Math.min(interactClip.frames.length - 1, 0)] : (Number.isFinite(fallbackFrame) ? fallbackFrame : 0));

    return {
      clips: {
        base: hasBase ? baseClip : (Number.isFinite(initialFrame) ? { frames: [initialFrame], playback: 'none' } : null),
        interact: hasInteract ? interactClip : null,
      },
      active: 'base',
      frameIndex: 0,
      direction: 1,
      accumulator: 0,
      playing: baseClip.playback === 'loop' || baseClip.playback === 'pingpong',
      finished: baseClip.playback === 'none',
      currentFrame: initialFrame,
    };
  }

  function currentAnimationClip(anim){
    if (!anim) return null;
    if (anim.active === 'interact' && anim.clips && anim.clips.interact) return anim.clips.interact;
    return anim.clips ? anim.clips.base : null;
  }

  function clampFrameIndex(idx, length){
    if (!Number.isFinite(idx)) return 0;
    if (!Number.isFinite(length) || length <= 0) return 0;
    const maxIdx = Math.max(0, Math.floor(length) - 1);
    if (idx < 0) return 0;
    if (idx > maxIdx) return maxIdx;
    return Math.floor(idx);
  }

  function switchSpriteAnimationClip(anim, clipName, restart = true){
    if (!anim || !anim.clips) return;
    const clip = (clipName === 'interact') ? anim.clips.interact : anim.clips.base;
    if (!clip) return;
    anim.active = clipName;
    if (restart) {
      anim.frameIndex = 0;
      anim.direction = 1;
      anim.accumulator = 0;
    } else if (Array.isArray(clip.frames) && clip.frames.length) {
      anim.frameIndex = clampFrameIndex(anim.frameIndex, clip.frames.length);
    } else {
      anim.frameIndex = 0;
    }
    if (clip.playback === 'loop' || clip.playback === 'pingpong') {
      anim.playing = clip.frames.length > 0;
      anim.finished = false;
    } else if (clip.playback === 'once') {
      anim.playing = clip.frames.length > 1;
      anim.finished = clip.frames.length <= 1;
    } else {
      anim.playing = false;
      anim.finished = true;
    }
    if (clip.frames && clip.frames.length) {
      const frame = clip.frames[clampFrameIndex(anim.frameIndex, clip.frames.length)];
      if (Number.isFinite(frame)) anim.currentFrame = frame;
    }
  }

  function updateSpriteUv(sprite){
    if (!sprite) return;
    const info = sprite.atlasInfo;
    if (!info || !Number.isFinite(sprite.animFrame)) return;
    const columns = Math.max(1, info.columns | 0);
    const total = Math.max(columns, info.totalFrames | 0);
    sprite.uv = atlasFrameUv(sprite.animFrame, columns, total);
  }

  function advanceSpriteAnimation(sprite, dt){
    if (!sprite || !sprite.animation) return;
    const anim = sprite.animation;
    const clip = currentAnimationClip(anim);
    if (!clip) {
      if (Number.isFinite(anim.currentFrame)) sprite.animFrame = anim.currentFrame;
      updateSpriteUv(sprite);
      return;
    }
    const frames = Array.isArray(clip.frames) ? clip.frames : [];
    if (frames.length === 0) {
      if (Number.isFinite(anim.currentFrame)) sprite.animFrame = anim.currentFrame;
      updateSpriteUv(sprite);
      return;
    }
    const frameDuration = (Number.isFinite(clip.speed) && clip.speed > 0)
      ? clip.speed
      : (1 / 60);
    if (!anim.playing || clip.playback === 'none') {
      const idx = clampFrameIndex(anim.frameIndex, frames.length);
      const frame = frames[idx];
      anim.currentFrame = frame;
      sprite.animFrame = frame;
      updateSpriteUv(sprite);
      return;
    }

    anim.accumulator += dt;
    while (anim.accumulator >= frameDuration) {
      anim.accumulator -= frameDuration;
      if (clip.playback === 'loop') {
        anim.frameIndex = (anim.frameIndex + 1) % frames.length;
      } else if (clip.playback === 'once') {
        if (anim.frameIndex < frames.length - 1) {
          anim.frameIndex += 1;
        } else {
          anim.frameIndex = frames.length - 1;
          anim.playing = false;
          anim.finished = true;
          break;
        }
      } else if (clip.playback === 'pingpong') {
        if (frames.length <= 1) {
          anim.frameIndex = 0;
          anim.playing = false;
          anim.finished = true;
          break;
        }
        const next = anim.frameIndex + anim.direction;
        if (next >= frames.length) {
          anim.direction = -1;
          anim.frameIndex = frames.length - 2;
        } else if (next < 0) {
          anim.direction = 1;
          anim.frameIndex = 1;
        } else {
          anim.frameIndex = next;
        }
      }
    }

    const idx = clampFrameIndex(anim.frameIndex, frames.length);
    const frame = frames[idx];
    anim.currentFrame = frame;
    sprite.animFrame = frame;
    updateSpriteUv(sprite);

    if (!anim.playing && anim.active === 'interact' && anim.clips && anim.clips.base) {
      if (clip && clip.hold) return;
      switchSpriteAnimationClip(anim, 'base', false);
      const baseClip = anim.clips.base;
      if (baseClip && baseClip.frames && baseClip.frames.length) {
        const baseIdx = clampFrameIndex(anim.frameIndex, baseClip.frames.length);
        const baseFrame = baseClip.frames[baseIdx];
        anim.currentFrame = baseFrame;
        sprite.animFrame = baseFrame;
        updateSpriteUv(sprite);
      }
    }
  }

  const DRIFT_SMOKE_INTERVAL = 0.1 / 60;
  const DRIFT_SMOKE_INTERVAL_JITTER = 0.25;
  const DRIFT_SMOKE_LIFETIME = 30 / 60;
  const DRIFT_SMOKE_LONGITUDINAL_JITTER = segmentLength * 0.01;
  const DRIFT_SMOKE_FORWARD_INHERITANCE = 0.4;
  const DRIFT_SMOKE_DRAG = 1.75;

  const SPARKS_INTERVAL = .7 / 60;
  const SPARKS_INTERVAL_JITTER = 4;
  const SPARKS_LIFETIME = 30 / 60;
  const SPARKS_LONGITUDINAL_JITTER = segmentLength * 1;
  const SPARKS_FORWARD_INHERITANCE = 0;
  const SPARKS_DRAG = 10;
  const SPARKS_LATERAL_SPEED = { min: -.5, max: 0.5};
  const SPARKS_SCREEN_LATERAL_SPEED = { min: -1, max: 10};
  const SPARKS_SCREEN_VERTICAL_SPEED = { min: -600, max: -200 };
  const SPARKS_SCREEN_GRAVITY = 40;
  const SPARKS_SCREEN_DRAG = 10;

  const DEFAULT_SPRITE_META = {
    PLAYER: {
      wN: 0.35,
      hitboxWN: 0.2,
      aspect: 1,
      tint: [0.9, 0.22, 0.21, 1],
      atlas: { columns: 9, totalFrames: 81 },
      tex() {
        const textures = (World && World.assets && World.assets.textures)
          ? World.assets.textures
          : null;
        if (!textures) return null;
        if (textures.playerVehicle) return textures.playerVehicle;
        if (textures.car) return textures.car;
        if (textures.playerCar) return textures.playerCar;
        return null;
      },
    },
    CAR:    { wN: 0.35, hitboxWN: 0.2, aspect: 1, tint: [0.2, 0.7, 1.0, 1], tex: () => null },
    TRUCK:  { wN: 0.36, hitboxWN: 0.2, aspect: 1, tint: [0.35, 0.75, 0.6, 1], tex: () => null },
    SEMI:   { wN: 0.38, hitboxWN: 0.22, aspect: 1, tint: [0.85, 0.85, 0.85, 1], tex: () => null },
    SPECIAL:{ wN: 0.35, hitboxWN: 0.2, aspect: 1, tint: [1, 0.95, 0.7, 1], tex: () => null },
    DRIFT_SMOKE: { wN: 0.1, aspect: 1.0, tint: [0.3, 0.5, 1.0, 0.85], tex: () => null },
    SPARKS: { wN: 0.01, aspect: 1.0, tint: [1.0, 0.6, 0.2, 0.9], tex: () => null },
  };

  const SPRITE_METRIC_FALLBACK = SpriteCatalog && SpriteCatalog.metricsFallback
    ? SpriteCatalog.metricsFallback
    : Object.freeze({
      wN: 0.2,
      hitboxWN: null,
      aspect: 1,
      tint: [1, 1, 1, 1],
      textureKey: null,
      atlas: null,
    });

  function createSpriteMetaEntry(metrics = SPRITE_METRIC_FALLBACK) {
    const preset = metrics || SPRITE_METRIC_FALLBACK;
    const base = {
      ...SPRITE_METRIC_FALLBACK,
      ...preset,
    };
    const hitboxWN = (Number.isFinite(base.hitboxWN) && base.hitboxWN > 0)
      ? base.hitboxWN
      : base.wN;
    return {
      wN: base.wN,
      hitboxWN,
      aspect: base.aspect,
      tint: Array.isArray(base.tint) ? base.tint.slice() : [1, 1, 1, 1],
      tex(spr) {
        const textures = (World && World.assets && World.assets.textures)
          ? World.assets.textures
          : null;
        if (!textures) return null;
        if (spr && spr.assetKey && textures[spr.assetKey]) {
          return textures[spr.assetKey];
        }
        if (base.textureKey && textures[base.textureKey]) {
          return textures[base.textureKey];
        }
        return null;
      },
      frameUv(frameIndex, spr) {
        const atlasInfo = (spr && spr.atlasInfo) ? spr.atlasInfo : base.atlas;
        if (!atlasInfo) return null;
        const columns = Math.max(1, atlasInfo.columns | 0);
        const total = Math.max(columns, atlasInfo.totalFrames | 0);
        const frame = Number.isFinite(frameIndex) ? frameIndex : 0;
        return atlasFrameUv(frame, columns, total);
      },
    };
  }

  function splitCsvLine(line){
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === ',') {
        cells.push(current.trim());
        current = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  function parseCsvWithHeader(text){
    const lines = text.split(/\r?\n/);
    const rows = [];
    let header = null;
    for (const rawLine of lines) {
      if (!rawLine) continue;
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      const cells = splitCsvLine(rawLine);
      if (!header) {
        const lower = cells.map((cell) => cell.toLowerCase());
        if (lower.includes('spriteid') || lower.includes('sprite') || lower.includes('segment')) {
          header = cells.map((cell) => cell.trim());
          continue;
        }
      }
      if (header) {
        const record = {};
        for (let i = 0; i < header.length; i += 1) {
          record[header[i]] = (cells[i] || '').trim();
        }
        rows.push(record);
      } else {
        rows.push(cells);
      }
    }
    return { header, rows };
  }

  function parseNumberRange(value, { allowFloat = true } = {}){
    if (value == null) return null;
    const trimmed = value.toString().trim();
    if (!trimmed) return null;
    const rangeMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
    const parseNum = allowFloat ? parseFloat : (v) => parseInt(v, 10);
    if (rangeMatch) {
      const start = parseNum(rangeMatch[1]);
      const end = parseNum(rangeMatch[2]);
      if (Number.isNaN(start) || Number.isNaN(end)) return null;
      return { start, end };
    }
    const single = parseNum(trimmed);
    if (Number.isNaN(single)) return null;
    return { start: single, end: single };
  }

  function parseNumericRange(value){
    const range = parseNumberRange(value, { allowFloat: true });
    if (!range) return null;
    const min = Math.min(range.start, range.end);
    const max = Math.max(range.start, range.end);
    return [min, max];
  }

  function parseSpritePool(value){
    if (value == null) return [];
    return value
      .toString()
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
  }

  function parsePlacementMode(value){
    if (value == null) return 'uniform';
    const normalized = value.toString().trim().toLowerCase();
    switch (normalized) {
      case 'taperscale':
      case 'taper-scale':
      case 'taper_scale':
        return 'taperScale';
      case 'taperatlas':
      case 'taper-atlas':
      case 'taper_atlas':
        return 'taperAtlas';
      case 'taperboth':
      case 'taper-both':
      case 'taper_both':
        return 'taperBoth';
      case 'uniform':
      default:
        return 'uniform';
    }
  }

  function normalizeSeed(seed, a = 0, b = 0){
    if (Number.isFinite(seed)) {
      const normalized = (Math.floor(seed) >>> 0);
      return normalized === 0 ? 1 : normalized;
    }
    const ax = Number.isFinite(a) ? Math.floor(a * 73856093) : 0;
    const bx = Number.isFinite(b) ? Math.floor(b * 19349663) : 0;
    const combined = (ax ^ bx) >>> 0;
    return combined === 0 ? 1 : combined;
  }

  function createRng(seed){
    let state = (seed >>> 0) || 1;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), state | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomInRange(range, rng, fallback = 0){
    if (!range || range.length < 2) return fallback;
    const min = Number.isFinite(range[0]) ? range[0] : fallback;
    const max = Number.isFinite(range[1]) ? range[1] : fallback;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return fallback;
    if (Math.abs(max - min) <= 1e-9) return min;
    const sample = typeof rng === 'function' ? rng() : Math.random();
    return min + sample * (max - min);
  }

  function computeAxisScaleWeight(count, index){
    if (!Number.isFinite(count) || count < 3) return 1;
    if (!Number.isFinite(index)) return 1;
    const total = Math.max(1, Math.floor(count));
    if (total < 3) return 1;
    const clampedIndex = clamp(Math.floor(index), 0, Math.max(0, total - 1));
    const center = (total - 1) / 2;
    const maxDistance = Math.max(center, 1e-9);
    const distance = Math.abs(clampedIndex - center);
    const normalized = clamp(distance / maxDistance, 0, 1);
    const falloff = Math.pow(1 - normalized, 1.35);
    return clamp01(falloff);
  }

  function computeAxisAtlasBias(count, index){
    if (!Number.isFinite(count) || count < 2) return 0.5;
    if (!Number.isFinite(index)) return 0.5;
    const total = Math.max(1, Math.floor(count));
    if (total < 2) return 0.5;
    const clampedIndex = clamp(Math.floor(index), 0, Math.max(0, total - 1));
    const center = (total - 1) / 2;
    const maxDistance = Math.max(center, 1e-9);
    const distance = Math.abs(clampedIndex - center);
    const normalized = clamp(distance / maxDistance, 0, 1);
    const emphasis = Math.pow(normalized, 0.75);
    const minBias = 0.2;
    const maxBias = 1;
    return clamp01(minBias + (maxBias - minBias) * emphasis);
  }

  function computePlacementBias(segCount, segIndex, laneCount, laneIndex){
    const axisValues = [];
    if (Number.isFinite(segCount) && segCount >= 3) {
      axisValues.push({
        scale: computeAxisScaleWeight(segCount, segIndex),
        atlas: computeAxisAtlasBias(segCount, segIndex),
      });
    }
    if (Number.isFinite(laneCount) && laneCount >= 3) {
      axisValues.push({
        scale: computeAxisScaleWeight(laneCount, laneIndex),
        atlas: computeAxisAtlasBias(laneCount, laneIndex),
      });
    }
    if (!axisValues.length) return null;
    const scale = axisValues.reduce((acc, value) => acc * value.scale, 1);
    const atlas = axisValues.reduce((acc, value) => acc + value.atlas, 0) / axisValues.length;
    return { scale, atlas };
  }

  function biasedRandom01(weight, rng){
    if (!Number.isFinite(weight)) {
      return typeof rng === 'function' ? rng() : Math.random();
    }
    const sample = typeof rng === 'function' ? rng() : Math.random();
    const clamped = clamp01(weight);
    return clamp01((sample + clamped) * 0.5);
  }

  function sampleScaleValue(scaleRange, rng, bias, useTaper){
    const min = Number.isFinite(scaleRange[0]) ? scaleRange[0] : 1;
    const max = Number.isFinite(scaleRange[1]) ? scaleRange[1] : min;
    if (!useTaper || bias == null) {
      return randomInRange([min, max], rng, min);
    }
    if (Math.abs(max - min) <= 1e-9) return min;
    const t = biasedRandom01(bias, rng);
    return lerp(min, max, t);
  }

  function sampleUniformIndex(count, rng){
    if (!Number.isFinite(count) || count <= 1) return 0;
    const sample = typeof rng === 'function' ? rng() : Math.random();
    const idx = Math.floor(sample * count) % count;
    return clamp(idx, 0, count - 1);
  }

  function sampleBiasedIndex(count, rng, bias){
    if (!Number.isFinite(count) || count <= 1) return 0;
    if (bias == null || !Number.isFinite(bias)) {
      return sampleUniformIndex(count, rng);
    }
    const t = clamp01(bias);
    const r = typeof rng === 'function' ? rng() : Math.random();
    let power;
    if (t <= 0.5) {
      const local = t / 0.5;
      power = 3 - (3 - 1) * local;
    } else {
      const local = (t - 0.5) / 0.5;
      power = 1 - (1 - 0.3) * local;
    }
    const sample = Math.pow(r, Math.max(power, 1e-3));
    const idx = Math.floor(sample * count);
    return clamp(idx, 0, count - 1);
  }

  function computeLaneStep(range, repeatLane){
    if (!range) return 0;
    if (Number.isFinite(repeatLane) && repeatLane > 0) return repeatLane;
    const span = Math.abs(range.end - range.start);
    if (span <= 1e-6) return 0;
    return span;
  }

  function dedupePositions(values){
    const result = [];
    for (const value of values) {
      if (!Number.isFinite(value)) continue;
      if (result.some((existing) => Math.abs(existing - value) <= 1e-6)) continue;
      result.push(value);
    }
    return result;
  }

  function computeLanePositions(start, end, step){
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const direction = end >= start ? 1 : -1;
    if (!Number.isFinite(step) || step <= 1e-6) {
      return dedupePositions(direction > 0 ? [start, end] : [start, end]);
    }
    const positions = [];
    let current = start;
    const limit = 1024;
    for (let i = 0; i < limit; i += 1) {
      positions.push(current);
      if ((direction > 0 && current >= end - 1e-6) || (direction < 0 && current <= end + 1e-6)) {
        break;
      }
      const next = current + direction * step;
      if ((direction > 0 && next > end) || (direction < 0 && next < end)) {
        positions.push(end);
        break;
      }
      current = next;
    }
    return dedupePositions(positions);
  }

  function clampSegmentRange(range, segCount){
    if (!range || !Number.isFinite(segCount) || segCount <= 0) return null;
    const maxIdx = Math.max(0, Math.floor(segCount) - 1);
    let start = Number.isFinite(range.start) ? Math.floor(range.start) : 0;
    let end = Number.isFinite(range.end) ? Math.floor(range.end) : start;
    start = Math.min(Math.max(0, start), maxIdx);
    end = Math.min(Math.max(0, end), maxIdx);
    return { start, end };
  }

  function selectAsset(assets, rng, options = {}){
    if (!Array.isArray(assets) || !assets.length) return null;
    const atlasBias = options.atlasBias;
    const index = assets.length === 1
      ? 0
      : sampleBiasedIndex(assets.length, rng, atlasBias);
    const asset = assets[index] || assets[0];
    return asset ? { ...asset, frames: Array.isArray(asset.frames) ? asset.frames.slice() : [] } : null;
  }

  function determineInitialFrame(entry, asset, rng, options = {}){
    if (entry && entry.baseClip && Array.isArray(entry.baseClip.frames) && entry.baseClip.frames.length > 0) {
      return entry.baseClip.frames[0];
    }
    if (asset && Array.isArray(asset.frames) && asset.frames.length > 0) {
      const atlasBias = options.atlasBias;
      const index = atlasBias == null
        ? sampleUniformIndex(asset.frames.length, rng)
        : sampleBiasedIndex(asset.frames.length, rng, atlasBias);
      return asset.frames[index];
    }
    return 0;
  }

  function buildSpriteMetaOverrides(catalog){
    const overrides = {};
    if (!catalog || typeof catalog.forEach !== 'function') return overrides;
    catalog.forEach((entry, spriteId) => {
      const metrics = (entry && entry.metrics) ? entry.metrics : SPRITE_METRIC_FALLBACK;
      overrides[spriteId] = createSpriteMetaEntry(metrics);
    });
    return overrides;
  }

  function generateSpriteInstances(catalog, placements){
    const instances = [];
    if (!catalog || !placements || !placements.length) return instances;
    const segCount = segments.length;
    if (!segCount) return instances;
    for (const spec of placements) {
      if (!spec || !Array.isArray(spec.spritePool) || !spec.spritePool.length) continue;
      const pool = spec.spritePool
        .map((id) => catalog.get(id))
        .filter((entry) => !!entry);
      if (!pool.length) continue;
      const segRange = clampSegmentRange(spec.segmentRange, segCount);
      if (!segRange) continue;
      const laneRange = spec.laneRange || { start: 0, end: 0 };
      const laneStep = computeLaneStep(laneRange, spec.repeatLane);
      const lanePositionsRaw = computeLanePositions(laneRange.start, laneRange.end, laneStep);
      const lanePositions = lanePositionsRaw.length ? lanePositionsRaw : [laneRange.start];
      const laneCount = lanePositions.length;
      const seed = normalizeSeed(spec.randomSeed, segRange.start, laneRange.start);
      const rng = createRng(seed);
      const scaleRange = spec.scaleRange || [1, 1];
      const jitterSegRange = spec.jitterSegRange || null;
      const jitterLaneRange = spec.jitterLaneRange || null;
      const segStep = Math.max(1, Math.floor(spec.repeatSegment || 1));
      const direction = segRange.end >= segRange.start ? 1 : -1;
      const segmentIndices = [];
      for (let segIdx = segRange.start; ; segIdx += direction * segStep) {
        const seg = segmentAtIndex(segIdx);
        if (seg) segmentIndices.push(segIdx);
        if (segIdx === segRange.end) break;
        if ((direction > 0 && segIdx > segRange.end) || (direction < 0 && segIdx < segRange.end)) break;
      }
      const placementMode = spec.placementMode || 'uniform';
      const useScaleTaper = placementMode === 'taperScale' || placementMode === 'taperBoth';
      const useAtlasTaper = placementMode === 'taperAtlas' || placementMode === 'taperBoth';
      const segSlotCount = segmentIndices.length;
      for (let segSlot = 0; segSlot < segSlotCount; segSlot += 1) {
        const segIdx = segmentIndices[segSlot];
        const seg = segmentAtIndex(segIdx);
        if (!seg) continue;
        for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
          const laneBase = lanePositions[laneIndex];
          const entry = pool.length === 1
            ? pool[0]
            : pool[Math.floor(rng() * pool.length) % pool.length];
          if (!entry) continue;
          const bias = computePlacementBias(segSlotCount, segSlot, laneCount, laneIndex);
          const scaleBias = bias ? bias.scale : null;
          const atlasBias = (useAtlasTaper && bias) ? bias.atlas : null;
          const scale = sampleScaleValue(scaleRange, rng, scaleBias, useScaleTaper);
          const jitterSeg = jitterSegRange ? randomInRange(jitterSegRange, rng, 0) : 0;
          const jitterLane = jitterLaneRange ? randomInRange(jitterLaneRange, rng, 0) : 0;
          const asset = selectAsset(entry.assets, rng, { atlasBias });
          const initialFrame = determineInitialFrame(entry, asset, rng, { atlasBias });
          instances.push({
            entry,
            segIndex: segIdx,
            offset: laneBase + jitterLane,
            scale,
            sOffset: jitterSeg,
            asset,
            initialFrame,
          });
        }
      }
    }
    return instances;
  }

  function createSpriteFromInstance(instance){
    if (!instance || !instance.entry) return null;
    const seg = segmentAtIndex(instance.segIndex);
    if (!seg) return null;
    const entry = instance.entry;
    const metrics = (entry && entry.metrics) ? entry.metrics : SPRITE_METRIC_FALLBACK;
    const sprite = {
      kind: entry.spriteId,
      offset: Number.isFinite(instance.offset) ? instance.offset : 0,
      segIndex: seg.index,
      s: (seg.p1 && seg.p1.world) ? seg.p1.world.z : instance.segIndex * segmentLength,
      scale: Number.isFinite(instance.scale) ? instance.scale : 1,
      interactionMode: entry.interaction,
      type: entry.type,
      interactable: entry.type === 'trigger' || entry.interaction !== 'static',
      impactable: entry.type === 'solid',
      interacted: false,
      collisionPush: entry.collisionPush,
      cooldown: entry.cooldown,
      slowdown: entry.slowdown,
      lastHitTime: -Infinity,
      assetKey: (instance.asset && instance.asset.key) ? instance.asset.key : (metrics.textureKey || null),
    };
    if (instance.asset && Array.isArray(instance.asset.frames)) {
      sprite.assetFrames = instance.asset.frames.slice();
    }
    if (metrics.atlas) {
      sprite.atlasInfo = { ...metrics.atlas };
    } else if (instance.asset && instance.asset.type === 'atlas') {
      sprite.atlasInfo = {
        columns: (instance.asset.columns || 1),
        totalFrames: (instance.asset.totalFrames || Math.max(1, (instance.asset.frames || []).length)),
      };
    }
    const baseZ = (seg.p1 && seg.p1.world) ? seg.p1.world.z : instance.segIndex * segmentLength;
    if (Number.isFinite(instance.sOffset) && instance.sOffset !== 0) {
      const delta = instance.sOffset * segmentLength;
      sprite.s = wrap(baseZ + delta, trackLengthRef());
    } else {
      sprite.s = baseZ;
    }
    const fallbackFrame = Number.isFinite(instance.initialFrame) ? instance.initialFrame : 0;
    const animState = createSpriteAnimationState(entry.baseClip, entry.interactClip, fallbackFrame);
    if (animState) {
      sprite.animation = animState;
      sprite.animFrame = Number.isFinite(animState.currentFrame) ? animState.currentFrame : fallbackFrame;
    } else {
      sprite.animation = null;
      sprite.animFrame = fallbackFrame;
    }
    if (entry.interaction === 'toggle') sprite.toggleOnInteract = true;
    if (sprite.impactable) {
      if (!Number.isFinite(sprite.baseOffset)) sprite.baseOffset = sprite.offset;
      configureImpactableSprite(sprite);
    }
    updateSpriteUv(sprite);
    ensureArray(seg, 'sprites').push(sprite);
    return sprite;
  }

  let spriteDataCache = null;
  let spriteDataPromise = null;

  async function loadSpriteCsv(relativePath){
    const url = typeof World.resolveAssetUrl === 'function'
      ? World.resolveAssetUrl(relativePath)
      : relativePath;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load ${relativePath}: ${res.status}`);
    }
    return res.text();
  }

  function parseSpritePlacements(text){
    const { header, rows } = parseCsvWithHeader(text);
    const placements = [];
    for (const row of rows) {
      const record = header ? row : null;
      const spriteValue = header ? (record.sprite || record.spriteId || '') : (row[0] || '');
      const spritePool = parseSpritePool(spriteValue);
      if (!spritePool.length) continue;
      const segmentRaw = header ? (record.segment || '') : (row[1] || '');
      const laneRaw = header ? (record.lane || '') : (row[2] || '');
      const repeatSegRaw = header ? (record.repeatSegment || record.repeatSeg || '') : (row[3] || '');
      const repeatLaneRaw = header ? (record.repeatLane || '') : (row[4] || '');
      const scaleRangeRaw = header ? (record.scaleRange || '') : (row[5] || '');
      const randomSeedRaw = header ? (record.randomSeed || '') : (row[6] || '');
      const jitterSegRaw = header ? (record.jitterSeg || '') : (row[7] || '');
      const jitterLaneRaw = header ? (record.jitterLane || '') : (row[8] || '');
      const placementModeRaw = header
        ? (record.placementMode || record.placement || record.distribution || record.placementFunction || '')
        : (row.length > 9 ? row[9] || '' : '');
      const segmentRange = parseNumberRange(segmentRaw, { allowFloat: false }) || { start: 0, end: 0 };
      const laneRange = parseNumberRange(laneRaw, { allowFloat: true }) || { start: 0, end: 0 };
      const repeatSegment = parseFloat(repeatSegRaw);
      const repeatLane = parseFloat(repeatLaneRaw);
      const scaleRange = parseNumericRange(scaleRangeRaw) || [1, 1];
      const randomSeed = parseFloat(randomSeedRaw);
      const jitterSegRange = parseNumericRange(jitterSegRaw);
      const jitterLaneRange = parseNumericRange(jitterLaneRaw);
      placements.push({
        spritePool,
        segmentRange,
        laneRange,
        repeatSegment: Number.isFinite(repeatSegment) && repeatSegment > 0 ? repeatSegment : 1,
        repeatLane: Number.isFinite(repeatLane) && repeatLane > 0 ? repeatLane : null,
        scaleRange,
        randomSeed: Number.isFinite(randomSeed) ? randomSeed : null,
        jitterSegRange,
        jitterLaneRange,
        placementMode: parsePlacementMode(placementModeRaw),
      });
    }
    return placements;
  }

  async function ensureSpriteDataLoaded(placementPath = 'tracks/placement.csv'){
    if (spriteDataCache) return spriteDataCache;
    if (spriteDataPromise) return spriteDataPromise;
    spriteDataPromise = (async () => {
      const catalog = (SpriteCatalog && typeof SpriteCatalog.getCatalog === 'function')
        ? SpriteCatalog.getCatalog()
        : new Map();
      const placementText = await loadSpriteCsv(placementPath);
      const placements = parseSpritePlacements(placementText);
      spriteDataCache = { catalog, placements };
      spriteDataPromise = null;
      return spriteDataCache;
    })().catch((err) => {
      spriteDataPromise = null;
      throw err;
    });
    return spriteDataPromise;
  }

  function invalidateSpriteCache() {
    spriteDataCache = null;
    spriteDataPromise = null;
  }

  const driftSmokePool = [];
  const sparksPool = [];

  function computeDriftSmokeInterval() {
    const base = Math.max(1e-4, DRIFT_SMOKE_INTERVAL);
    const jitter = Math.max(0, DRIFT_SMOKE_INTERVAL_JITTER);
    if (jitter <= 1e-6) return base;
    const span = base * jitter;
    return base + (Math.random() * 2 - 1) * span;
  }

  function allocDriftSmokeSprite() {
    return driftSmokePool.length ? driftSmokePool.pop() : { kind: 'DRIFT_SMOKE' };
  }

  function recycleDriftSmokeSprite(sprite) {
    if (!sprite || sprite.kind !== 'DRIFT_SMOKE') return;
    sprite.animation = null;
    sprite.impactState = null;
    sprite.driftMotion = null;
    sprite.interactable = false;
    sprite.interacted = false;
    sprite.impactable = false;
    sprite.segIndex = 0;
    sprite.s = 0;
    sprite.ttl = 0;
    sprite.offset = 0;
    driftSmokePool.push(sprite);
  }

  function computeSparksInterval() {
    const base = Math.max(1e-4, SPARKS_INTERVAL);
    const jitter = Math.max(0, SPARKS_INTERVAL_JITTER);
    if (jitter <= 1e-6) return base;
    const span = base * jitter;
    return base + (Math.random() * 2 - 1) * span;
  }

  function allocSparksSprite() {
    return sparksPool.length ? sparksPool.pop() : { kind: 'SPARKS' };
  }

  function recycleSparksSprite(sprite) {
    if (!sprite || sprite.kind !== 'SPARKS') return;
    sprite.animation = null;
    sprite.impactState = null;
    sprite.driftMotion = null;
    sprite.interactable = false;
    sprite.interacted = false;
    sprite.impactable = false;
    sprite.segIndex = 0;
    sprite.s = 0;
    sprite.ttl = 0;
    sprite.offset = 0;
    sprite.screenOffsetX = 0;
    sprite.screenOffsetY = 0;
    sparksPool.push(sprite);
  }

  function recycleTransientSprite(sprite) {
    if (!sprite) return;
    if (sprite.kind === 'DRIFT_SMOKE') recycleDriftSmokeSprite(sprite);
    if (sprite.kind === 'SPARKS') recycleSparksSprite(sprite);
  }

  const NPC_DEFAULTS = { total: 20, edgePad: 0.02, avoidLookaheadSegs: 20 };
  const NPC = { ...NPC_DEFAULTS, ...trafficConfig };
  const NPC_WEIGHTS_DEFAULT = { car: 1, truck: 0.7, semi: 0.4, special: 0.2 };
  const NPC_SPEED_DEFAULTS = {
    car: { base: 0.16, variance: 0.18 },
    truck: { base: 0.14, variance: 0.14 },
    semi: { base: 0.12, variance: 0.1 },
    special: { base: 0.2, variance: 0.15 },
  };
  const NPC_VEHICLE_POOLS = {
    car: ['npcCar01', 'npcCar02', 'npcCar03'],
    truck: ['npcVan01', 'npcVan02', 'npcVan03'],
    semi: ['npcSemi01', 'npcSemi02', 'npcSemi03'],
    special: [
      'npcSpecial01',
      'npcSpecial02',
      'npcSpecial03',
      'npcSpecial04',
      'npcSpecial05',
      'npcSpecial06',
      'npcSpecial07',
      'npcSpecial08',
      'npcSpecial09',
    ],
  };
  const NPC_VEHICLE_META = {
    car: 'CAR',
    truck: 'TRUCK',
    semi: 'SEMI',
    special: 'SPECIAL',
  };
  const NPC_SPECIAL_CONFIG = trafficConfig.specials || trafficConfig.specialVehicles || {};
  const NPC_SPEED_CONFIG = trafficConfig.vehicleSpeeds || {};
  const NPC_WEIGHTS = (() => {
    const configWeights = (trafficConfig && trafficConfig.vehicleWeights) || {};
    const merged = { ...NPC_WEIGHTS_DEFAULT };
    Object.keys(configWeights).forEach((key) => {
      const val = Number(configWeights[key]);
      if (Number.isFinite(val) && val >= 0) {
        merged[key] = val;
      }
    });
    return merged;
  })();

  const CAR_COLLISION_COOLDOWN = 1 / 120;
  const COLLISION_PUSH_DURATION = 1.5;
  const NPC_COLLISION_PUSH_FORWARD_MAX_SEGMENTS = 20;
  const NPC_COLLISION_PUSH_LATERAL_MAX = 0.85;
  const INTERACTABLE_COLLISION_PUSH_FORWARD_MAX_SEGMENTS = 60;
  const INTERACTABLE_COLLISION_PUSH_LATERAL_MAX = 1;
  const CAR_COLLISION_STAMP = Symbol('carCollisionStamp');
  const CAR_NEAR_MISS_READY = Symbol('carNearMissReady');
  const NEAR_MISS_LATERAL_SCALE = 1.2;
  const NEAR_MISS_RESET_SCALE = 1.8;
  const NEAR_MISS_FORWARD_DISTANCE = (() => {
    if (
      Number.isFinite(segmentLength)
      && segmentLength > 0
      && NEAR_MISS_FORWARD_SCALE > 0
    ) {
      const scaledDistance = segmentLength * NEAR_MISS_FORWARD_SCALE;
      if (Number.isFinite(scaledDistance) && scaledDistance > 0) {
        return Math.max(NEAR_MISS_FORWARD_MIN, scaledDistance);
      }
    }
    return NEAR_MISS_FORWARD_FALLBACK > 0
      ? NEAR_MISS_FORWARD_FALLBACK
      : Math.max(12, NEAR_MISS_FORWARD_MIN);
  })();
  const NEAR_MISS_SPEED_MARGIN = 1;
  const GUARD_RAIL_HIT_COOLDOWN = 0.5;
  const OFF_ROAD_THRESHOLD = 1;

  const defaultGetKindScale = (kind) => (kind === 'PLAYER' ? player.scale : 1);

  function createInitialMetrics() {
    return {
      npcHits: 0,
      nearMisses: 0,
      guardRailHits: 0,
      guardRailContactTime: 0,
      pickupsCollected: 0,
      airTime: 0,
      driftTime: 0,
      topSpeed: 0,
      respawnCount: 0,
      offRoadTime: 0,
      guardRailCooldownTimer: 0,
      guardRailContactActive: false,
    };
  }

  const state = {
    phys: { s: 0, y: 0, vx: 0, vy: 0, vtan: 0, grounded: true, t: 0, nextHopTime: 0, boostFlashTimer: 0 },
    playerN: 0,
    camYSmooth: 0,
    hopHeld: false,
    driftState: 'idle',
    driftDirSnapshot: 0,
    driftCharge: 0,
    allowedBoost: false,
    pendingDriftDir: 0,
    lastSteerDir: 0,
    boostTimer: 0,
    activeDriveZoneId: null,
    lateralRate: 0,
    prevPlayerN: 0,
    camRollDeg: 0,
    playerTiltDeg: 0,
    resetMatteActive: false,
    bgScrollX: 0,
    pendingRespawn: null,
    isMenu: true,
    menuCarOffsetZ: 0,
    menuGhostCar: null,
    menuCameraHeight: 4000,
    menuPitch: 320,
    menuSpeed: 0,
    titleOpacity: 1,
    race: {
      active: false,
      phase: 'idle', // idle, countdown, racing, finished
      targetLaps: 1,
      lapsCompleted: 0,
      startTime: 0,
      finishTime: null,
      checkpoints: 4,
      totalSectors: 0,
      lastSector: 0,
      countdownTimer: 0,
      finishTimer: 0,
      message: null,
      messageTimer: 0,
      lastLap: 0,
      timeRemaining: 0,
    },
    driftSmokeTimer: 0,
    driftSmokeNextInterval: computeDriftSmokeInterval(),
    sparksTimer: 0,
    sparksNextInterval: computeSparksInterval(),
    cars: [],
    spriteMeta: DEFAULT_SPRITE_META,
    getKindScale: defaultGetKindScale,
    input: { left: false, right: false, up: false, down: false, hop: false },
    gamepad: { hopPressed: false },
    callbacks: {
      onQueueReset: null,
      onToggleOverlay: null,
      onResetScene: null,
      onQueueRespawn: null,
      onRaceFinish: null,
      onPickupCollected: null,
    },
    camera: {
      fieldOfView: camera.fovDeg,
      cameraDepth: 0,
      nearZ: 0,
      playerZ: 0,
      updateFromFov: null,
    },
    metrics: createInitialMetrics(),
  };

  const CLIFF_LIMIT_DEG = Number.isFinite(cliffs.cliffLimit) ? cliffs.cliffLimit : null;
  const CLIFF_ANGLE_SAMPLES = [0, 0.5, 1];

  function getSpriteMeta(kind) {
    const metaStack = state.spriteMeta || {};
    return metaStack[kind] || DEFAULT_SPRITE_META[kind] || { wN: 0.2, aspect: 1, tint: [1, 1, 1, 1], tex: () => null };
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
    const meta = getSpriteMeta('PLAYER');
    const width = Number.isFinite(meta.hitboxWN) && meta.hitboxWN > 0 ? meta.hitboxWN : meta.wN;
    return width * state.getKindScale('PLAYER') * 0.5;
  }

  function spawnDriftSmokeSprites() {
    if (!hasSegments()) return;
    const { phys } = state;
    if (!phys || !phys.grounded) return;
    const seg = segmentAtS(phys.s);
    if (!seg) return;
    const half = playerHalfWN();
    const offsets = [state.playerN - half, state.playerN + half];
    const sprites = ensureArray(seg, 'sprites');
    const baseS = Number.isFinite(phys.s)
      ? phys.s
      : (seg.p1 && seg.p1.world ? seg.p1.world.z : 0);
    const trackLength = trackLengthRef();
    const forwardSpeed = Math.max(0, Number.isFinite(phys.vtan) ? phys.vtan : 0);
    for (const baseOffset of offsets) {
      const sprite = allocDriftSmokeSprite();
      const spawnOffset = baseOffset;
      const sJitter = (Math.random() * 2 - 1) * DRIFT_SMOKE_LONGITUDINAL_JITTER;
      const spawnS = trackLength > 0 ? wrap(baseS + sJitter, trackLength) : baseS + sJitter;
      const inheritedForward = forwardSpeed * DRIFT_SMOKE_FORWARD_INHERITANCE * (0.8 + 0.4 * Math.random());
      sprite.kind = 'DRIFT_SMOKE';
      sprite.offset = spawnOffset;
      sprite.segIndex = seg.index;
      sprite.s = spawnS;
      sprite.ttl = DRIFT_SMOKE_LIFETIME;
      sprite.interactable = false;
      sprite.interacted = false;
      sprite.impactable = false;
      sprite.driftMotion = {
        forwardVel: inheritedForward,
        drag: DRIFT_SMOKE_DRAG,
        lateralVel: 0,
      };
      sprites.push(sprite);
    }
  }

  function spawnSparksSprites(contactSide = 0) {
    if (!hasSegments()) return;
    const { phys } = state;
    if (!phys || !phys.grounded) return;
    const seg = segmentAtS(phys.s);
    if (!seg) return;
    const half = playerHalfWN();
    const sideSign = contactSide !== 0 ? Math.sign(contactSide) || 0 : (state.playerN >= 0 ? 1 : -1);
    if (sideSign === 0) return;
    const offsets = [state.playerN + sideSign * half * 0.85];
    const sprites = ensureArray(seg, 'sprites');
    const baseS = Number.isFinite(phys.s)
      ? phys.s
      : (seg.p1 && seg.p1.world ? seg.p1.world.z : 0);
    const trackLength = trackLengthRef();
    const forwardSpeed = Math.max(0, Number.isFinite(phys.vtan) ? phys.vtan : 0);
    for (const baseOffset of offsets) {
      const sprite = allocSparksSprite();
      const spawnOffset = baseOffset;
      const sJitter = (Math.random() * 2 - 1) * SPARKS_LONGITUDINAL_JITTER;
      const spawnS = trackLength > 0 ? wrap(baseS + sJitter, trackLength) : baseS + sJitter;
      const inheritedForward = forwardSpeed * SPARKS_FORWARD_INHERITANCE * (0.8 + 0.4 * Math.random());
      const lateralVel = sideSign * lerp(SPARKS_LATERAL_SPEED.min, SPARKS_LATERAL_SPEED.max, Math.random());
      const screenLateral = sideSign * lerp(SPARKS_SCREEN_LATERAL_SPEED.min, SPARKS_SCREEN_LATERAL_SPEED.max, Math.random());
      const screenVertical = lerp(SPARKS_SCREEN_VERTICAL_SPEED.min, SPARKS_SCREEN_VERTICAL_SPEED.max, Math.random());
      sprite.kind = 'SPARKS';
      sprite.offset = spawnOffset;
      sprite.segIndex = seg.index;
      sprite.s = spawnS;
      sprite.ttl = SPARKS_LIFETIME;
      sprite.interactable = false;
      sprite.interacted = false;
      sprite.impactable = false;
      sprite.driftMotion = {
        forwardVel: inheritedForward,
        drag: SPARKS_DRAG,
        lateralVel,
        screenLateralVel: screenLateral,
        screenDrag: SPARKS_SCREEN_DRAG,
        verticalVel: screenVertical,
        verticalGravity: SPARKS_SCREEN_GRAVITY,
        verticalDrag: SPARKS_SCREEN_DRAG,
      };
      sprite.screenOffsetX = 0;
      sprite.screenOffsetY = 0;
      sprites.push(sprite);
    }
  }

  function applyDriftSmokeMotion(sprite, dt, currentSeg = null) {
    if (!sprite || sprite.kind !== 'DRIFT_SMOKE') return null;
    const motion = sprite.driftMotion;
    if (!motion) return null;
    const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (step <= 0) return null;

    const trackLength = trackLengthRef();

    if (Number.isFinite(motion.forwardVel) && motion.forwardVel !== 0) {
      if (Number.isFinite(sprite.s)) {
        const nextS = trackLength > 0
          ? wrap(sprite.s + motion.forwardVel * step, trackLength)
          : sprite.s + motion.forwardVel * step;
        sprite.s = nextS;
      }
      if (Number.isFinite(motion.drag) && motion.drag > 0) {
        const decay = Math.max(0, 1 - motion.drag * step);
        motion.forwardVel *= decay;
        if (Math.abs(motion.forwardVel) <= 1e-4) motion.forwardVel = 0;
      }
    }

    if (Number.isFinite(motion.lateralVel) && motion.lateralVel !== 0) {
      sprite.offset += motion.lateralVel * step;
      if (Number.isFinite(motion.drag) && motion.drag > 0) {
        const decay = Math.max(0, 1 - motion.drag * step);
        motion.lateralVel *= decay;
        if (Math.abs(motion.lateralVel) <= 1e-4) motion.lateralVel = 0;
      }
    }

    if (trackLength > 0 && Number.isFinite(sprite.s)) {
      const seg = segmentAtS(sprite.s);
      if (seg && currentSeg && seg !== currentSeg) {
        return seg;
      }
    }

    return null;
  }

  function applySparksMotion(sprite, dt, currentSeg = null) {
    if (!sprite || sprite.kind !== 'SPARKS') return null;
    const motion = sprite.driftMotion;
    if (!motion) return null;
    const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (step <= 0) return null;

    const trackLength = trackLengthRef();

    if (Number.isFinite(motion.forwardVel) && motion.forwardVel !== 0) {
      if (Number.isFinite(sprite.s)) {
        const nextS = trackLength > 0
          ? wrap(sprite.s + motion.forwardVel * step, trackLength)
          : sprite.s + motion.forwardVel * step;
        sprite.s = nextS;
      }
      if (Number.isFinite(motion.drag) && motion.drag > 0) {
        const decay = Math.max(0, 1 - motion.drag * step);
        motion.forwardVel *= decay;
        if (Math.abs(motion.forwardVel) <= 1e-4) motion.forwardVel = 0;
      }
    }

    if (Number.isFinite(motion.lateralVel) && motion.lateralVel !== 0) {
      sprite.offset += motion.lateralVel * step;
      if (Number.isFinite(motion.drag) && motion.drag > 0) {
        const decay = Math.max(0, 1 - motion.drag * step);
        motion.lateralVel *= decay;
        if (Math.abs(motion.lateralVel) <= 1e-4) motion.lateralVel = 0;
      }
    }

    if (Number.isFinite(motion.screenLateralVel) && motion.screenLateralVel !== 0) {
      const currentOffsetX = Number.isFinite(sprite.screenOffsetX) ? sprite.screenOffsetX : 0;
      sprite.screenOffsetX = currentOffsetX + motion.screenLateralVel * step;
      if (Number.isFinite(motion.screenDrag) && motion.screenDrag > 0) {
        const decay = Math.max(0, 1 - motion.screenDrag * step);
        motion.screenLateralVel *= decay;
        if (Math.abs(motion.screenLateralVel) <= 1e-2) motion.screenLateralVel = 0;
      }
    }

    let verticalVel = Number.isFinite(motion.verticalVel) ? motion.verticalVel : 0;
    if (Number.isFinite(motion.verticalGravity) && motion.verticalGravity !== 0) {
      verticalVel += motion.verticalGravity * step;
    }
    if (verticalVel !== 0) {
      const currentOffsetY = Number.isFinite(sprite.screenOffsetY) ? sprite.screenOffsetY : 0;
      sprite.screenOffsetY = currentOffsetY + verticalVel * step;
      motion.verticalVel = verticalVel;
      if (Number.isFinite(motion.verticalDrag) && motion.verticalDrag > 0) {
        const decay = Math.max(0, 1 - motion.verticalDrag * step);
        motion.verticalVel *= decay;
        if (Math.abs(motion.verticalVel) <= 1e-2) motion.verticalVel = 0;
      }
    }

    if (trackLength > 0 && Number.isFinite(sprite.s)) {
      const seg = segmentAtS(sprite.s);
      if (seg && currentSeg && seg !== currentSeg) {
        return seg;
      }
    }

    return null;
  }

  function carMeta(car) {
    const kind = car && car.type ? car.type : 'CAR';
    return (car && car.meta) ? car.meta : getSpriteMeta(kind);
  }

  function carHalfWN(car) {
    const meta = carMeta(car);
    const width = Number.isFinite(meta.hitboxWN) && meta.hitboxWN > 0 ? meta.hitboxWN : meta.wN;
    return (width || 0) * 0.5;
  }

  function currentPlayerForwardSpeed() {
    const vt = state && state.phys ? state.phys.vtan : 0;
    return Math.max(0, Number.isFinite(vt) ? vt : 0);
  }

  function npcForwardSpeed(car) {
    if (!car || !Number.isFinite(car.speed)) return 0;
    return Math.max(0, car.speed);
  }

  function ensureCarNearMissReset(car, combinedHalf, lateralGap) {
    if (!car) return;
    if (!Number.isFinite(lateralGap) || !Number.isFinite(combinedHalf) || combinedHalf <= 0) {
      car[CAR_NEAR_MISS_READY] = true;
      return;
    }
    if (lateralGap >= combinedHalf * NEAR_MISS_RESET_SCALE) {
      car[CAR_NEAR_MISS_READY] = true;
    }
  }

  function tryRegisterCarNearMiss(car, combinedHalf, lateralGap) {
    if (!car || !state.metrics) return;
    if (car[CAR_NEAR_MISS_READY] === false) return;
    if (!Number.isFinite(lateralGap) || !Number.isFinite(combinedHalf) || combinedHalf <= 0) return;
    if (lateralGap >= combinedHalf * NEAR_MISS_LATERAL_SCALE) return;

    const phys = state.phys || {};
    const forwardGap = Math.abs(shortestSignedDelta(phys.s || 0, car.z || 0, trackLengthRef()));
    if (!Number.isFinite(forwardGap) || forwardGap > NEAR_MISS_FORWARD_DISTANCE) return;

    const playerSpeed = currentPlayerForwardSpeed();
    const npcSpeed = npcForwardSpeed(car);
    if ((playerSpeed - npcSpeed) < NEAR_MISS_SPEED_MARGIN) return;

    car[CAR_NEAR_MISS_READY] = false;
    state.metrics.nearMisses += 1;
  }

  function computeCollisionPush(
    forwardSpeed,
    playerOffset,
    targetOffset,
    forwardMaxSegments = NPC_COLLISION_PUSH_FORWARD_MAX_SEGMENTS,
    lateralMax = NPC_COLLISION_PUSH_LATERAL_MAX,
    duration = COLLISION_PUSH_DURATION,
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

    const safeDuration = Math.max(duration, 1e-4);
    return {
      forwardVel: forwardDistance / safeDuration,
      lateralVel: (lateralDistance * lateralDir) / safeDuration,
    };
  }

  function configureImpactableSprite(sprite) {
    if (!sprite || !sprite.impactable) return null;

    if (!sprite.impactState) {
      sprite.impactState = { timer: 0, lateralVel: 0, forwardVel: 0, totalDuration: 0 };
    }

    const impact = sprite.impactState;
    if (!Number.isFinite(impact.timer)) impact.timer = 0;
    if (!Number.isFinite(impact.lateralVel)) impact.lateralVel = 0;
    if (!Number.isFinite(impact.forwardVel)) impact.forwardVel = 0;
    if (!Number.isFinite(impact.totalDuration)) impact.totalDuration = 0;

    return impact;
  }

  function applyImpactPushToSprite(sprite) {
    if (!sprite || !sprite.impactable) return;

    const impact = configureImpactableSprite(sprite);
    if (!impact) return;

    const factor = Number.isFinite(sprite.collisionPush) ? sprite.collisionPush : 1;
    const duration = Math.max(COLLISION_PUSH_DURATION * factor, 1e-4);
    const fMax = INTERACTABLE_COLLISION_PUSH_FORWARD_MAX_SEGMENTS * factor;
    const lMax = INTERACTABLE_COLLISION_PUSH_LATERAL_MAX * factor;

    const push = computeCollisionPush(
      currentPlayerForwardSpeed(),
      state.playerN,
      sprite.offset,
      fMax,
      lMax,
      duration
    );
    if (!push) return;

    impact.lateralVel = push.lateralVel;
    impact.forwardVel = push.forwardVel;
    impact.timer = duration;
    impact.totalDuration = duration;
  }

  function updateImpactableSprite(sprite, dt, currentSeg = null) {
    if (!sprite || !sprite.impactable) return null;
    const impact = configureImpactableSprite(sprite);
    if (!impact) return null;

    let nextSeg = null;

    if (dt <= 0) return null;

    if (impact.timer > 0) {
      const step = Math.min(dt, impact.timer);

      const duration = Math.max(impact.totalDuration, 1e-4);
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
          const nextS = wrap(baseS + impact.forwardVel * avgRatio * step, trackLength);
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

  function cancelDrift() {
    state.driftState = 'idle';
    state.driftDirSnapshot = 0;
    state.driftCharge = 0;
    state.allowedBoost = false;
    state.pendingDriftDir = 0;
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

  function resolveSpriteInteractionsInSeg(seg) {
    if (!seg || !Array.isArray(seg.sprites) || !seg.sprites.length) return;
    const pHalf = playerHalfWN();
    for (let i = seg.sprites.length - 1; i >= 0; i -= 1) {
      const spr = seg.sprites[i];
      if (!spr) continue;
      const meta = getSpriteMeta(spr.kind);
      const scale = Number.isFinite(spr.scale) ? spr.scale : 1;
      const width = (Number.isFinite(meta.hitboxWN) && meta.hitboxWN > 0) ? meta.hitboxWN : (meta.wN || 0);
      const spriteHalf = Math.max(0, width * scale * 0.5);
      if (spriteHalf <= 0) continue;
      if (!overlap(state.playerN, pHalf, spr.offset, spriteHalf, 1)) continue;

      let remove = false;

      if (spr.interactable && !spr.interacted) {
        spr.interacted = true;
        if (spr.toggleOnInteract && state.metrics) {
          state.metrics.pickupsCollected += 1;
          if (typeof state.callbacks.onPickupCollected === 'function') {
            state.callbacks.onPickupCollected();
          }
        }
        const mode = spr.interactionMode || 'static';
        if (mode === 'playAnim' && spr.animation && spr.animation.clips && spr.animation.clips.interact) {
          switchSpriteAnimationClip(spr.animation, 'interact', true);
          spr.interactable = false;
        } else if (mode === 'toggle') {
          spr.interactable = false;
          remove = true;
        } else {
          spr.interactable = false;
        }
      }

      if (spr.impactable) {
        const now = state.phys.t;
        const lastHit = Number.isFinite(spr.lastHitTime) ? spr.lastHitTime : -Infinity;
        const cooldown = Number.isFinite(spr.cooldown) ? spr.cooldown : 0;
        let allowed = true;

        if (cooldown < 0) {
          if (lastHit > -Infinity) allowed = false;
        } else if ((now - lastHit) < cooldown) {
          allowed = false;
        }
        if (allowed) {
          applyImpactPushToSprite(spr);
          spr.lastHitTime = now;
          if (Number.isFinite(spr.slowdown) && spr.slowdown > 0) {
            state.phys.vtan *= Math.max(0, 1 - spr.slowdown);
            cancelDrift();
          }
        }
      }

      if (remove) {
        recycleTransientSprite(spr);
        seg.sprites.splice(i, 1);
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
      const carHalf = carHalfWN(car);
      const combinedHalf = pHalf + carHalf;
      const lateralGap = Math.abs(state.playerN - car.offset);
      ensureCarNearMissReset(car, combinedHalf, lateralGap);
      if (!overlap(state.playerN, pHalf, car.offset, carHalf, 1)) {
        tryRegisterCarNearMiss(car, combinedHalf, lateralGap);
        continue;
      }

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
      car[CAR_NEAR_MISS_READY] = true;
      if (state.metrics) {
        state.metrics.npcHits += 1;
      }
      cancelDrift();
      return true;
    }
    return false;
  }

  function resolveSegmentCollisions(seg) {
    if (!seg) return false;
    const carHit = resolveCarCollisionsInSeg(seg);
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

        if (Number.isFinite(spr.ttl)) {
          spr.ttl -= dt;
          if (spr.ttl <= 0) {
            recycleTransientSprite(spr);
            seg.sprites.splice(i, 1);
            continue;
          }
        }

        let transferSeg = null;
        if (spr.kind === 'DRIFT_SMOKE') {
          transferSeg = applyDriftSmokeMotion(spr, dt, seg);
        } else if (spr.kind === 'SPARKS') {
          transferSeg = applySparksMotion(spr, dt, seg);
        }

        if (spr.animation && spr.animation.clips) {
          advanceSpriteAnimation(spr, dt);
        } else if (spr.animation) {
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
        const impactTransfer = updateImpactableSprite(spr, dt, seg);
        if (impactTransfer && impactTransfer !== seg) {
          transferSeg = impactTransfer;
        }
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
      const idx = wrap(startIndex + step, segments.length);
      const seg = segmentAtIndex(idx);
      if (seg) touched.push(seg);
    }
    return touched;
  }

  function updatePhysics(dt) {
    const { phys } = state;
    if (!hasSegments()) return;

    // Gamepad polling
    const gamepads = (navigator.getGamepads && navigator.getGamepads()) || [];
    const gp = gamepads[0];
    let gpLeft = false, gpRight = false, gpUp = false, gpDown = false, gpHop = false;

    if (gp) {
      gpUp = gp.buttons[12]?.pressed;
      gpDown = gp.buttons[13]?.pressed;
      gpLeft = gp.buttons[14]?.pressed;
      gpRight = gp.buttons[15]?.pressed;
      const btnHop = gp.buttons[5]?.pressed;
      if (btnHop && !state.gamepad.hopPressed) {
        gpHop = true;
      }
      state.gamepad.hopPressed = btnHop;
    }

    // Merge inputs
    let input = {
      left: state.input.left || gpLeft,
      right: state.input.right || gpRight,
      up: state.input.up || gpUp,
      down: state.input.down || gpDown,
      hop: state.input.hop || gpHop,
    };

    // Input override based on race phase
    if (state.isMenu) {
      input = { left: false, right: false, up: false, down: false, hop: false };
    } else if (state.race.active) {
      if (state.race.phase === 'countdown') {
        // Block all input during countdown
        input = { left: false, right: false, up: false, down: false, hop: false };
      } else if (state.race.phase === 'finished') {
        // Auto-drive forward during finish sequence
        input = { left: false, right: false, up: true, down: false, hop: false };
      }
    }

    const metrics = state.metrics || null;
    if (metrics && dt > 0) {
      const cooldown = Number.isFinite(metrics.guardRailCooldownTimer) ? metrics.guardRailCooldownTimer : 0;
      metrics.guardRailCooldownTimer = Math.max(0, cooldown - dt);
    }

    if (input.hop) {
      doHop();
      state.input.hop = false;
    }

    const steerAxis = (input.left && input.right) ? 0 : (input.left ? -1 : (input.right ? 1 : 0));
    if (steerAxis !== 0) {
      state.lastSteerDir = steerAxis;
      if (state.hopHeld && state.driftState !== 'drifting') {
        state.pendingDriftDir = steerAxis;
      }
    }
    const boosting = state.boostTimer > 0;
    if (boosting) state.boostTimer = Math.max(0, state.boostTimer - dt);
    const speed01 = clamp(Math.abs(phys.vtan) / player.topSpeed, 0, 1);

    // Dynamic FOV based on boost state
    const fovBase = camera.fovDeg;
    const fovPeak = (boost.manual && boost.manual.fovPeak) || 148;
    const fovTarget = state.boostTimer > 0 ? fovPeak : fovBase;
    const fovCurrent = state.camera.fieldOfView;
    if (Math.abs(fovTarget - fovCurrent) > 0.05) {
      const fovSpeed = (fovTarget > fovCurrent) ? 5.0 : 1.0;
      const nextFov = lerp(fovCurrent, fovTarget, fovSpeed * dt);
      state.camera.updateFromFov(nextFov);
    }

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
    let guardRailContact = false;
    let guardRailSide = 0;
    let offRoadNow = false;
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
      if (state.isMenu) {
        phys.vtan = state.menuSpeed;
      } else {
        let a = 0;
        if (input.up) a += accel;
        if (input.down) a -= brake;
        a += -player.gravity * ty;
        a += -player.rollDrag * phys.vtan;
        phys.vtan = clamp(phys.vtan + a * dt, -boostedMaxSpeed, boostedMaxSpeed);
      }

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


    if (!prevGrounded && phys.grounded) {
      if (state.hopHeld && state.pendingDriftDir !== 0) {
        state.driftState = 'drifting';
        state.driftDirSnapshot = state.pendingDriftDir;
        state.driftCharge = 0;
        state.allowedBoost = false;
      } else {
        state.driftState = 'idle';
        state.driftDirSnapshot = 0;
        state.driftCharge = 0;
        state.allowedBoost = false;
        if (!state.hopHeld) state.pendingDriftDir = 0;
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
        state.pendingDriftDir = 0;
      }
    }

    if (state.driftState === 'drifting') {
      state.driftSmokeTimer += dt;
      let interval = (Number.isFinite(state.driftSmokeNextInterval) && state.driftSmokeNextInterval > 0)
        ? state.driftSmokeNextInterval
        : computeDriftSmokeInterval();
      while (state.driftSmokeTimer >= interval) {
        spawnDriftSmokeSprites();
        state.driftSmokeTimer -= interval;
        interval = computeDriftSmokeInterval();
      }
      state.driftSmokeNextInterval = interval;
    } else {
      state.driftSmokeTimer = 0;
      state.driftSmokeNextInterval = computeDriftSmokeInterval();
    }

    phys.t += dt;

    const length = trackLengthRef();
    let integrationEndS = phys.s;
  
    const segForScroll = segmentAtS(phys.s);
    if (segForScroll) {
      const speedRatio = phys.vtan / player.topSpeed;
      state.bgScrollX += segForScroll.curve * speedRatio * dt * 0.12;
    }

    if (length > 0) {
      const rawS = integrationEndS;
      phys.s = wrap(rawS, length);

      const checkpoints = state.race.checkpoints || 4;
      const sectorSize = length / checkpoints;
      const currentSector = Math.floor(phys.s / sectorSize);

      if (currentSector !== state.race.lastSector) {
        let diff = currentSector - state.race.lastSector;
        const half = checkpoints / 2;
        if (diff < -half) diff += checkpoints;
        else if (diff > half) diff -= checkpoints;
        
        state.race.totalSectors += diff;
        state.race.lastSector = currentSector;
        state.race.lapsCompleted = Math.floor(state.race.totalSectors / checkpoints);
      }
    }
    segmentsCrossedDuringStep = collectSegmentsCrossed(startS, integrationEndS);

    if (state.race.active && state.race.phase === 'racing' && Config.game.mode === 'timeTrial') {
      for (const seg of segmentsCrossedDuringStep) {
        if (seg && seg.features && seg.features.gate) {
          if (state.race.collectedGates && !state.race.collectedGates.has(seg.index)) {
            state.race.timeRemaining += seg.features.gate;
            state.race.message = 'EXTEND';
            state.race.messageTimer = 2;
            state.race.collectedGates.add(seg.index);
          }
        }
      }
    }

    if (state.race.active) {
      // Countdown Logic
      if (state.race.phase === 'countdown') {
        state.race.countdownTimer -= dt;
        if (state.race.countdownTimer <= 0) {
          state.race.phase = 'racing';
          state.race.message = 'GO!';
          state.race.messageTimer = 1.5;
        }
      }

      // Message Timer Logic
      if (state.race.messageTimer > 0) {
        state.race.messageTimer -= dt;
        if (state.race.messageTimer <= 0) {
          state.race.message = null;
        }
      }

      // Racing Logic
      if (state.race.phase === 'racing') {
        if (Config.game.mode === 'timeTrial') {
          state.race.timeRemaining -= dt;
          if (state.race.timeRemaining <= 0) {
            state.race.timeRemaining = 0;
            state.race.finishTime = phys.t;
            state.race.phase = 'finished';
            state.race.finishTimer = 4;
            state.race.message = 'TIME UP';
            state.race.messageTimer = 4;
          }
        }

        // Lap Change Detection
        if (state.race.lapsCompleted > state.race.lastLap) {
          if (state.race.lapsCompleted < state.race.targetLaps) {
            state.race.message = `LAP ${state.race.lapsCompleted + 1}`;
            state.race.messageTimer = 2;
          }
          state.race.lastLap = state.race.lapsCompleted;
        }

        // Finish Detection
        if (Config.game.mode !== 'timeTrial' && state.race.lapsCompleted >= state.race.targetLaps && state.race.finishTime == null) {
          state.race.finishTime = phys.t;
          state.race.phase = 'finished';
          state.race.finishTimer = 4; // Hold for 4 seconds
          state.race.message = 'FINISH';
          state.race.messageTimer = 4;
          state.driftState = 'idle';
          state.driftCharge = 0;
          state.allowedBoost = false;
          state.hopHeld = false;
          state.pendingDriftDir = 0;
        }
      }

      // Finish Sequence Logic
      if (state.race.phase === 'finished') {
        state.race.finishTimer -= dt;
        if (state.race.finishTimer <= 0) {
          state.race.active = false;
          const elapsed = Math.max(0, state.race.finishTime - state.race.startTime);
          if (typeof state.callbacks.onRaceFinish === 'function') {
            state.callbacks.onRaceFinish(Math.round(elapsed * 1000));
          }
        }
      }
    }

    const aY = 1 - Math.exp(-dt / camera.heightEase);
    let targetCamY = phys.y + camera.height;
    if (phys.grounded) {
      const floorY = floorElevationAt ? floorElevationAt(phys.s, state.playerN) : phys.y;
      targetCamY += (floorY - phys.y) * cliffs.cameraBlend;
    }
    state.camYSmooth += aY * (targetCamY - state.camYSmooth);

    if (state.isMenu) {
      state.playerN = 0;
    }

    state.lateralRate = state.playerN - state.prevPlayerN;
    state.prevPlayerN = state.playerN;

    segNow = segmentAtS(phys.s);
    if (segNow) {
      const bound = playerLateralLimit(segNow.index);
      const clampLimit = Number.isFinite(bound) ? bound : Math.abs(state.playerN) + 1;
      const preClamp = state.playerN;
      state.playerN = clamp(state.playerN, -clampLimit, clampLimit);
      const scraping = Math.abs(preClamp) > clampLimit - 1e-6 || Math.abs(state.playerN) >= clampLimit - 1e-6;
      offRoadNow = Math.abs(preClamp) > OFF_ROAD_THRESHOLD || Math.abs(state.playerN) > OFF_ROAD_THRESHOLD;
      const hasGuardRail = !!(segNow.features && segNow.features.rail);
      guardRailContact = hasGuardRail && scraping;
      if (guardRailContact) {
        guardRailSide = Math.sign(preClamp) || Math.sign(state.playerN) || guardRailSide;
        const offRoadDecelLimit = player.topSpeed / 4;
        if (Math.abs(phys.vtan) > offRoadDecelLimit) {
          const sign = Math.sign(phys.vtan) || 1;
          phys.vtan -= sign * (player.topSpeed * 0.8) * (1 / 60);
        }
        cancelDrift();
      }
    } else if (metrics) {
      metrics.guardRailContactActive = false;
    }

    if (guardRailContact) {
      state.sparksTimer += dt;
      let interval = (Number.isFinite(state.sparksNextInterval) && state.sparksNextInterval > 0)
        ? state.sparksNextInterval
        : computeSparksInterval();
      while (state.sparksTimer >= interval) {
        spawnSparksSprites(guardRailSide);
        state.sparksTimer -= interval;
        interval = computeSparksInterval();
      }
      state.sparksNextInterval = interval;
    } else {
      state.sparksTimer = 0;
      state.sparksNextInterval = computeSparksInterval();
    }

    if (metrics) {
      if (guardRailContact) {
        metrics.guardRailContactTime += dt;
        if (!metrics.guardRailContactActive && metrics.guardRailCooldownTimer <= 0) {
          metrics.guardRailHits += 1;
          metrics.guardRailCooldownTimer = GUARD_RAIL_HIT_COOLDOWN;
        }
        metrics.guardRailContactActive = true;
      } else {
        metrics.guardRailContactActive = false;
      }
      if (offRoadNow) {
        metrics.offRoadTime += dt;
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

    if (metrics) {
      if (!phys.grounded) {
        metrics.airTime += dt;
      }
      if (state.driftState === 'drifting') {
        metrics.driftTime += dt;
      }
      const speed = Math.abs(phys.vtan);
      if (Number.isFinite(speed) && speed > metrics.topSpeed) {
        metrics.topSpeed = speed;
      }
    }
  }

  function clearSegmentCars() {
    if (!hasSegments()) return;
    for (const seg of segments) {
      if (seg && Array.isArray(seg.cars)) seg.cars.length = 0;
    }
  }

  function pickNpcCategory() {
    const entries = Object.entries(NPC_WEIGHTS).filter(([, weight]) => weight > 0);
    const fallback = 'car';
    if (!entries.length) return fallback;
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0) || entries.length;
    let r = Math.random() * total;
    for (const [category, weight] of entries) {
      r -= weight;
      if (r <= 0) return category;
    }
    return entries[entries.length - 1][0] || fallback;
  }

  function pickNpcTextureKey(category) {
    const pool = NPC_VEHICLE_POOLS[category];
    const list = Array.isArray(pool) && pool.length ? pool : NPC_VEHICLE_POOLS.car;
    const idx = Math.floor(Math.random() * list.length);
    return list[Math.max(0, Math.min(list.length - 1, idx))];
  }

  function normalizeSpeedSpec(raw = {}, fallback = { base: 0.1, variance: 0 }) {
    const base = Number(raw.base);
    const variance = Number(raw.variance);
    return {
      base: Number.isFinite(base) && base >= 0 ? base : fallback.base,
      variance: Number.isFinite(variance) && variance >= 0 ? variance : fallback.variance,
    };
  }

  function categorySpeedSpec(category) {
    const fallback = NPC_SPEED_DEFAULTS[category] || NPC_SPEED_DEFAULTS.car;
    const raw = NPC_SPEED_CONFIG[category] || {};
    return normalizeSpeedSpec(raw, fallback);
  }

  function specialSpeedSpec(texKey) {
    const fallback = categorySpeedSpec('special');
    const cfg = NPC_SPECIAL_CONFIG[texKey];
    const raw = cfg && cfg.speed ? cfg.speed : null;
    if (!raw) return fallback;
    return normalizeSpeedSpec(raw, fallback);
  }

  function computeNpcSpeed(category, texKey) {
    const spec = category === 'special' ? specialSpeedSpec(texKey) : categorySpeedSpec(category);
    const base = Math.max(0, spec.base || 0);
    const variance = Math.max(0, spec.variance || 0);
    const sample = base + Math.random() * variance;
    const fraction = sample > 0 ? sample : 0;
    return player.topSpeed * fraction;
  }

  function buildSpecialMetaOverride(texKey, baseMeta) {
    const cfg = NPC_SPECIAL_CONFIG[texKey];
    if (!cfg) return null;
    const meta = { ...baseMeta };
    if (Number.isFinite(cfg.wN) && cfg.wN > 0) meta.wN = cfg.wN;
    if (Number.isFinite(cfg.hitboxWN) && cfg.hitboxWN > 0) meta.hitboxWN = cfg.hitboxWN;
    if (Number.isFinite(cfg.aspect) && cfg.aspect > 0) meta.aspect = cfg.aspect;
    return meta;
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
      const category = pickNpcCategory();
      const metaKind = NPC_VEHICLE_META[category] || 'CAR';
      const texKey = pickNpcTextureKey(category);
      const baseMeta = getSpriteMeta(metaKind);
      const meta = category === 'special'
        ? (buildSpecialMetaOverride(texKey, baseMeta) || { ...baseMeta })
        : baseMeta;
      const tmpCar = { type: metaKind, meta };
      const seg = segmentAtS(s);
      if (!seg) continue;
      const b = npcLateralLimit(seg.index, tmpCar);
      const side = Math.random() < 0.5 ? -1 : 1;
      const offset = side * (Math.random() * (b * 0.9));
      const speed = computeNpcSpeed(category, texKey);
      const car = { z: s, offset, type: metaKind, meta, speed, texKey };
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
      car.z = wrap(car.z + forwardTravel, trackLengthRef());
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

  async function spawnProps(placementPath) {
    if (!hasSegments()) {
      state.spriteMeta = DEFAULT_SPRITE_META;
      return;
    }
    for (const seg of segments) {
      if (seg && Array.isArray(seg.sprites)) seg.sprites.length = 0;
    }

    let data;
    try {
      data = await ensureSpriteDataLoaded(placementPath);
    } catch (err) {
      console.warn('Failed to load sprite data:', err);
      state.spriteMeta = DEFAULT_SPRITE_META;
      return;
    }

    if (!data || !data.catalog || !data.placements) {
      state.spriteMeta = DEFAULT_SPRITE_META;
      return;
    }

    const metaOverrides = buildSpriteMetaOverrides(data.catalog);
    state.spriteMeta = { ...DEFAULT_SPRITE_META, ...metaOverrides };

    const instances = generateSpriteInstances(data.catalog, data.placements);

    for (const instance of instances) {
      createSpriteFromInstance(instance);
    }
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
        if (state.lastSteerDir !== 0) state.pendingDriftDir = state.lastSteerDir;
      }
      state.hopHeld = true;
    },
    KeyR: () => { queueReset(); },
    KeyB: () => { if (typeof state.callbacks.onToggleOverlay === 'function') state.callbacks.onToggleOverlay(); },
    KeyL: () => { if (typeof state.callbacks.onResetScene === 'function') state.callbacks.onResetScene(); },
    KeyZ: (e) => {
      if (e && e.repeat) return;
      const manualCfg = boost.manual || { impulse: 2000, duration: 2.0 };
      state.boostTimer = Math.max(state.boostTimer, manualCfg.duration);
      const { phys } = state;
      const boostCap = player.topSpeed * drift.boostScale;
      const currentForward = Math.max(phys.vtan, 0);
      const boosted = currentForward + manualCfg.impulse;
      phys.vtan = clamp(boosted, 0, boostCap);
      phys.boostFlashTimer = Math.max(phys.boostFlashTimer, 0.5);
    },
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
      state.pendingDriftDir = 0;
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
    state.gamepad.hopPressed = false;
    state.driftState = 'idle';
    state.driftDirSnapshot = 0;
    state.driftCharge = 0;
    state.allowedBoost = false;
    state.pendingDriftDir = 0;
    state.lastSteerDir = 0;
    state.boostTimer = 0;
    state.driftSmokeTimer = 0;
    state.driftSmokeNextInterval = computeDriftSmokeInterval();
    state.sparksTimer = 0;
    state.sparksNextInterval = computeSparksInterval();

    state.camRollDeg = 0;
    state.playerTiltDeg = 0;
    state.prevPlayerN = state.playerN;
    state.lateralRate = 0;
    state.bgScrollX = 0;
    state.pendingRespawn = null;
    if (state.metrics) {
      state.metrics.guardRailContactActive = false;
      state.metrics.guardRailCooldownTimer = 0;
    }

    const length = trackLengthRef();
    if (length > 0) {
      const sectorSize = length / (state.race.checkpoints || 4);
      state.race.lastSector = Math.floor(phys.s / sectorSize);
    }
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

  function applyDefaultFieldOfView() {
    const cameraState = state && state.camera ? state.camera : null;
    const update = cameraState && cameraState.updateFromFov;
    if (typeof update === 'function') {
      update(camera.fovDeg);
    } else if (cameraState && camera.fovDeg != null) {
      cameraState.fieldOfView = camera.fovDeg;
    }
  }

  let activeSceneOptions = {
    track: 'tracks/test-track.csv',
    cliffs: 'tracks/cliffs.csv',
    placement: 'tracks/placement.csv',
  };

  async function resetScene(options = {}) {
    applyDefaultFieldOfView();
    
    if (options && options.track) {
      activeSceneOptions.track = options.track;
      activeSceneOptions.cliffs = options.cliffs || 'tracks/cliffs.csv';
      activeSceneOptions.placement = options.placement || 'tracks/placement.csv';
    }
    const trackPath = activeSceneOptions.track;
    const cliffPath = activeSceneOptions.cliffs;
    const placementPath = activeSceneOptions.placement;

    if (typeof buildTrackFromCSV === 'function') {
      try {
        await buildTrackFromCSV(trackPath);
      } catch (err) {
        console.warn('CSV build failed, keeping existing track', err);
      }
    }

    if (typeof buildCliffsFromCSV_Lite === 'function') {
      try {
        await buildCliffsFromCSV_Lite(cliffPath);
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

    let gateCount = 0;
    if (hasSegments()) {
      for (const seg of segments) {
        if (seg.features && seg.features.gate) {
          gateCount++;
        }
      }
    }
    state.race.checkpoints = gateCount > 0 ? gateCount : 4;
    state.race.collectedGates = new Set();
    state.metrics = createInitialMetrics();

    // Invalidate sprite cache to force reload of placements for the new track
    spriteDataCache = null;
    await spawnProps(placementPath);
    if (!state.isMenu) {
      spawnCars();
    } else {
      state.cars.length = 0;
    }
    resetPlayerState({
      s: camera.backSegments * track.segmentSize,
      playerN: 0,
      timers: { t: 0, nextHopTime: 0, boostFlashTimer: 0 },
    });
    state.race.active = false;
    state.race.phase = 'idle';
    state.race.targetLaps = 1;
    state.race.lapsCompleted = 0;
    state.race.startTime = 0;
    state.race.finishTime = null;
    state.race.totalSectors = 0;
    state.race.lastSector = 0;
    state.race.countdownTimer = 0;
    state.race.finishTimer = 0;
    state.race.message = null;
    state.race.messageTimer = 0;
    state.race.lastLap = 0;
    state.race.timeRemaining = 0;
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
    const wasPending = !!state.pendingRespawn;
    state.pendingRespawn = { targetS, targetN: 0 };
    if (!wasPending && state.metrics) {
      state.metrics.respawnCount += 1;
    }
    if (typeof state.callbacks.onQueueRespawn === 'function') {
      state.callbacks.onQueueRespawn(state.pendingRespawn);
    }
  }

  function setMenuMode(enabled) {
    state.isMenu = !!enabled;
    if (state.isMenu) {
      state.race.active = false;
      state.cars.length = 0;
      state.menuCarOffsetZ = 0;
      state.menuGhostCar = null;
    }
  }

  function startRaceSession({ laps = 1 } = {}) {
    const lapCount = Number.isFinite(laps) && laps > 0 ? Math.floor(laps) : 1;
    state.race.active = true;
    state.race.phase = 'countdown';
    state.race.targetLaps = lapCount;
    state.race.lapsCompleted = 0;
    state.race.startTime = state.phys.t;
    state.race.finishTime = null;
    state.race.countdownTimer = 4; // 3, 2, 1, GO
    state.race.finishTimer = 0;
    state.race.message = null;
    state.race.messageTimer = 0;
    state.race.lastLap = 0;
    if (state.race.collectedGates) {
      state.race.collectedGates.clear();
    }
    if (Config.game.mode === 'timeTrial') {
      state.race.timeRemaining = Config.game.timeTrial.startTime;
    }
    
    const length = trackLengthRef();
    const sectorSize = length > 0 ? length / (state.race.checkpoints || 4) : 1;
    state.race.totalSectors = Math.floor(state.phys.s / sectorSize);
    state.race.lastSector = state.race.totalSectors;
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
    startRaceSession,
    spawnCars,
    spawnProps,
    resetPlayerState,
    invalidateSpriteCache,
    respawnPlayerAt,
    resetScene,
    queueReset,
    queueRespawn,
    setMenuMode,
  };
})(window);
