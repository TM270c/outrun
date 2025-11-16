(function(global){
  const { Config, MathUtil } = global;

  if (!Config || !MathUtil) {
    throw new Error('World module requires Config and MathUtil globals');
  }

  const {
    track,
    lanes,
    boost,
  } = Config;

  const {
    clamp01,
    lerp,
    easeInOut01,
    easeInOut,
  } = MathUtil;

  function resolveAssetUrl(path){
    if (typeof path !== 'string' || path.length === 0) return path;

    try {
      const chromeApi = global.chrome;
      if (chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getURL === 'function') {
        return chromeApi.runtime.getURL(path);
      }
    } catch (err) {
      // Ignore access errors and fall back to location-based resolution.
    }

    try {
      const base = global.location && global.location.href ? global.location.href : null;
      if (base) {
        return new URL(path, base).toString();
      }
    } catch (err) {
      // new URL may throw for invalid inputs; fall back to original path.
    }

    return path;
  }

  const assetManifest = {
    road:      resolveAssetUrl('tex/road-seg.png'),
    rail:      resolveAssetUrl('tex/guardrail.png'),
    cliff:     resolveAssetUrl('tex/cliff.png'),
    boostJump: resolveAssetUrl('tex/boost.png'),
    boostDrive:resolveAssetUrl('tex/boost.png'),
    horizon1:  resolveAssetUrl('tex/paralax-1.png'),
    horizon2:  resolveAssetUrl('tex/paralax-2.png'),
    horizon3:  resolveAssetUrl('tex/paralax-3.png'),
    car:       resolveAssetUrl('tex/player-car.png'),
    playerVan: resolveAssetUrl('tex/player-van.png'),
    semi:      resolveAssetUrl('tex/semi.png'),
  };

  const textures = {};

  async function loadImage(url){
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = url;
    });
  }

  async function defaultTextureLoader(_key, url){
    await loadImage(url);
    return url;
  }

  async function loadTexturesWith(loader = defaultTextureLoader){
    if (typeof loader !== 'function') {
      throw new Error('loader must be a function');
    }

    await Promise.all(Object.entries(assetManifest).map(async ([key, path]) => {
      textures[key] = await loader(key, resolveAssetUrl(path));
    }));

    if (textures.car && !textures.playerCar) {
      textures.playerCar = textures.car;
    }
    if (!textures.playerVehicle) {
      textures.playerVehicle = textures.playerCar || textures.car || null;
    }

    return textures;
  }

  const segmentLength = track.segmentSize;
  const roadWidthAt = () => track.roadWidth;

  const segments = [];
  let trackLength = 0;
  let boostZoneIdCounter = 0;
  const boostZones = [];

  const RAIL_MASK = Object.freeze({
    none: 0,
    left: 1,
    right: 2,
    both: 3,
  });

  const CLIFF_SECTIONS_PER_SEG = 4;

  const CLIFF_SERIES = {
    left:  { dx: [], dy: [] },
    right: { dx: [], dy: [] },
  };
  let CLIFF_READY = false;

  function resetCliffSeries(){
    const total = segments.length * CLIFF_SECTIONS_PER_SEG;
    const clear = (arr) => {
      arr.length = total;
      for (let i = 0; i < total; i++) arr[i] = 0;
    };

    clear(CLIFF_SERIES.left.dx);  clear(CLIFF_SERIES.left.dy);
    clear(CLIFF_SERIES.right.dx); clear(CLIFF_SERIES.right.dy);

    CLIFF_READY = false;
  }

  function randomSnowScreenColor(){
    const phase = Math.random() * Math.PI * 2;
    const sample = (offset) => 0.5 + 0.5 * Math.cos(phase + offset);
    return [sample(0), sample((2 * Math.PI) / 3), sample((4 * Math.PI) / 3), 1];
  }

  function addSegment(curve, y, features = {}){
    const n = segments.length;
    const prevY = segments.length ? segments[n - 1].p2.world.y : 0;
    const railMask = Number.isFinite(features.railMask) ? features.railMask : RAIL_MASK.none;
    const boostZoneIds = Array.isArray(features.boostZoneIds) ? [...features.boostZoneIds] : [];
    segments.push({
      index: n,
      curve,
      features: { railMask, boostZoneIds },
      p1: { world: { y: prevY, z: n * segmentLength }, camera: {}, screen: {} },
      p2: { world: { y: y,    z: (n + 1) * segmentLength }, camera: {}, screen: {} },
      sprites: [], cars: [],
      snowScreen: { color: randomSnowScreenColor() },
    });
  }

  function lastY(){
    return segments.length ? segments[segments.length - 1].p2.world.y : 0;
  }

  const railMaskFromSpec = (spec) => {
    if (Number.isFinite(spec)) {
      if (spec <= 0) return RAIL_MASK.none;
      if (spec === 1) return RAIL_MASK.left;
      if (spec === 2) return RAIL_MASK.right;
      return RAIL_MASK.both;
    }
    const norm = (spec || '').toString().toLowerCase();
    if (norm === 'left' || norm === 'l') return RAIL_MASK.left;
    if (norm === 'right' || norm === 'r') return RAIL_MASK.right;
    if (norm === 'both' || norm === 'all') return RAIL_MASK.both;
    if (norm === 'none' || norm === 'off' || norm === 'false') return RAIL_MASK.none;
    return RAIL_MASK.none;
  };

  const registerBoostZone = (spec = {}) => {
    const startOffset = Math.max(0, spec.startOffset | 0);
    const endOffset = Math.max(startOffset, spec.endOffset | 0);
    const laneA = clampBoostLane(spec.nStart);
    const laneB = clampBoostLane(spec.nEnd);
    const nStart = Math.min(laneA, laneB);
    const nEnd = Math.max(laneA, laneB);
    const zone = {
      id: `zone-${boostZoneIdCounter++}`,
      startOffset,
      endOffset,
      type: spec.type || boost.types.jump,
      nStart,
      nEnd,
      visible: spec.visible !== false,
    };
    boostZones.push(zone);
    return boostZones.length - 1;
  };

  function buildSectionFeatures(length, featurePayload = {}) {
    const count = Math.max(1, length | 0);
    const railMask = railMaskFromSpec(featurePayload.railMask ?? featurePayload.rail);
    const boostSpec = featurePayload.boost;
    const perSegBoostIds = Array.from({ length: count }, () => []);

    if (boostSpec && boostSpec.enabled) {
      const id = registerBoostZone(boostSpec);
      const start = Math.max(0, boostSpec.startOffset | 0);
      const end = Math.max(start, Math.min(count - 1, boostSpec.endOffset | 0));
      for (let i = start; i <= end; i += 1) {
        perSegBoostIds[i].push(id);
      }
    }

    return Array.from({ length: count }, (_, idx) => ({
      railMask,
      boostZoneIds: perSegBoostIds[idx],
    }));
  }

  function addRoad(lengthInSegments, curve, dyInSegments = 0, featurePayload = {}){
    const count = Math.max(1, lengthInSegments | 0);
    const startY = lastY();
    const endY = startY + (dyInSegments * segmentLength);
    const hasElevationChange = Math.abs(dyInSegments) > 1e-6;
    const featuresBySegment = buildSectionFeatures(count, featurePayload);

    for (let i = 0; i < count; i += 1) {
      const curveT = count <= 1 ? 1 : i / Math.max(1, count - 1);
      const yT = count <= 1 ? 1 : (i + 1) / count;
      const segCurve = easeInOut(0, curve, curveT);
      const y = hasElevationChange ? easeInOut(startY, endY, yT) : startY;
      addSegment(segCurve, y, featuresBySegment[i]);
    }
  }

  async function buildTrackFromCSV(url){
    const csvUrl = resolveAssetUrl(url);
    const res = await fetch(csvUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('CSV load failed: ' + res.status);
    const text = await res.text();

    const toInt = (v, d = 0) => {
      if (v === '' || v == null) return d;
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? d : n;
    };
    const toFloat = (v, d = 0) => {
      if (v === '' || v == null) return d;
      const n = parseFloat(v);
      return Number.isNaN(n) ? d : n;
    };
    const toBool = (v, d = true) => {
      if (v === '' || v == null) return d;
      const norm = v.toLowerCase();
      if (['1', 'true', 'yes', 'y', 'on'].includes(norm)) return true;
      if (['0', 'false', 'no', 'n', 'off'].includes(norm)) return false;
      return d;
    };

    const lines = text.split(/\r?\n/);
    segments.length = 0;
    boostZones.length = 0;
    boostZoneIdCounter = 0;

    for (const raw of lines){
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;

      const cells = line.split(',').map((s) => (s ?? '').trim());
      const [lengthRaw, curveRaw, dyRaw, railRaw, boostTypeRaw, boostStartRaw, boostEndRaw, laneStartRaw, laneEndRaw, boostVisibleRaw] = cells;

      const lengthSegments = Math.max(1, toInt(lengthRaw, 0));
      const curve = toFloat(curveRaw, 0);
      const dySegments = toFloat(dyRaw, 0);
      const railMask = railMaskFromSpec(railRaw);

      const boostStart = toInt(boostStartRaw, null);
      const boostEnd = toInt(boostEndRaw, null);
      const boostEnabled = boostStart != null && boostEnd != null && boostEnd >= boostStart;
      const boostType = parseBoostZoneType(boostTypeRaw) || boost.types.jump;
      const laneStart = parseBoostLaneValue(laneStartRaw);
      const laneEnd = parseBoostLaneValue(laneEndRaw);
      const zoneVisible = toBool(boostVisibleRaw, true);

      const boostSpec = boostEnabled ? {
        enabled: true,
        startOffset: boostStart,
        endOffset: boostEnd,
        type: boostType,
        nStart: laneStart != null ? laneStart : clampBoostLane(lanes.boost.min),
        nEnd: laneEnd != null ? laneEnd : clampBoostLane(lanes.boost.max),
        visible: zoneVisible,
      } : { enabled: false };

      addRoad(lengthSegments, curve, dySegments, { railMask, boost: boostSpec });
    }

    if (segments.length === 0) throw new Error('CSV produced no segments');
    trackLength = segments.length * segmentLength;
  }

  async function buildCliffsFromCSV_Lite(url){
    if (!segments.length) return;
    resetCliffSeries();

    let text = '';
    try {
      const csvUrl = resolveAssetUrl(url);
      const res = await fetch(csvUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      text = await res.text();
    } catch (e) {
      console.warn('Cliff CSV not found, using flat cliffs:', e);
      CLIFF_READY = true;
      return;
    }

    const toInt = (v, d = 0) => (v === '' || v == null) ? d : (Number.isNaN(parseInt(v, 10)) ? d : parseInt(v, 10));
    const toNum = (v, d = 0) => (v === '' || v == null) ? d : (Number.isNaN(parseFloat(v)) ? d : parseFloat(v));
    const normSide = (s) => (s || 'B').trim().toUpperCase();

    const sectionsPerSeg = CLIFF_SECTIONS_PER_SEG;
    const totalSections = segments.length * sectionsPerSeg;
    const head = { L: 0, R: 0 };
    const state = {
      L: { dx: 0, dy: 0 },
      R: { dx: 0, dy: 0 },
    };

    const lines = text.split(/\r?\n/);
    for (const raw of lines){
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;

      const c = line.split(',').map((s) => (s ?? '').trim());
      const sideTok = normSide(c[0]);
      const sides = (sideTok === 'L' || sideTok === 'R') ? [sideTok] : ['L', 'R'];

      const lenSegments = Math.max(1, toInt(c[1], 1));
      const dxAdd = toNum(c[2], 0);
      const dyAdd = toNum(c[3], 0);
      const reps = Math.max(1, toInt(c[4], 1));

      for (let r = 0; r < reps; r += 1) {
        for (const S of sides){
          const st = state[S];
          const start = head[S];
          const from = { dx: st.dx, dy: st.dy };
          const target = { dx: st.dx + dxAdd, dy: st.dy + dyAdd };

          const steps = Math.max(1, lenSegments * sectionsPerSeg);
          const denom = steps <= 1 ? 1 : (steps - 1);

          for (let i = 0; i < steps; i += 1){
            const idx = (start + i) % totalSections;
            const t = (steps <= 1) ? 1 : (i / denom);
            const k = easeInOut01(t);
            const dx = lerp(from.dx, target.dx, k);
            const dy = lerp(from.dy, target.dy, k);

            if (S === 'L') {
              CLIFF_SERIES.left.dx[idx] = dx;  CLIFF_SERIES.left.dy[idx] = dy;
            } else {
              CLIFF_SERIES.right.dx[idx] = dx; CLIFF_SERIES.right.dy[idx] = dy;
            }
          }

          head[S] = start + steps;
          st.dx = target.dx; st.dy = target.dy;
        }
      }
    }

    const fillRemainder = (S) => {
      const st = state[S];
      const start = head[S];
      if (start >= totalSections) return;
      for (let i = start; i < totalSections; i += 1){
        if (S === 'L') {
          CLIFF_SERIES.left.dx[i] = st.dx;  CLIFF_SERIES.left.dy[i] = st.dy;
        } else {
          CLIFF_SERIES.right.dx[i] = st.dx; CLIFF_SERIES.right.dy[i] = st.dy;
        }
      }
    };

    fillRemainder('L');
    fillRemainder('R');

    CLIFF_READY = true;
  }

  function enforceCliffWrap(copySpan = 1){
    if (!CLIFF_READY || !segments.length) return;
    const sectionsPerSeg = CLIFF_SECTIONS_PER_SEG;
    const n = segments.length * sectionsPerSeg;
    if (n <= 0) return;
    const copyAt = (dst, src, side) => {
      side.dx[dst] = side.dx[src];
      side.dy[dst] = side.dy[src];
    };
    const totalCopy = Math.min(n, Math.max(0, copySpan|0) * sectionsPerSeg);
    for (let k = 0; k < totalCopy; k++){
      const dst = k;
      const src = (n - 1 - k + n) % n;
      copyAt(dst, src, CLIFF_SERIES.left);
      copyAt(dst, src, CLIFF_SERIES.right);
    }
  }

  function pushZone(stack, start, end, tile = 1){
    if (end < start) [start, end] = [end, start];
    stack.push({ start, end, tile: Math.max(1, tile|0) });
  }

  function findZone(stack, segIndex){
    for (let i=stack.length-1; i>=0; i--){
      const z = stack[i];
      if (segIndex>=z.start && segIndex<=z.end) return z;
    }
    return null;
  }

  function vSpanForSeg(zones, segIndex){
    const z = findZone(zones, segIndex);
    if (!z) return [0,1];
    const perSeg = 1 / Math.max(1, z.tile);
    const segPos = (segIndex - z.start);
    const v0 = (segPos % z.tile) * perSeg;
    const v1 = v0 + perSeg;
    return [v0, v1];
  }

  const clampBoostLane = (v) => {
    if (v == null) return v;
    const min = lanes.boost.min;
    const max = lanes.boost.max;
    if (v < min) return min;
    if (v > max) return max;
    return v;
  };

  const clampRoadLane = (v, fallback = 0) => {
    if (v == null) return fallback;
    const min = lanes.road.min;
    const max = lanes.road.max;
    if (v < min) return min;
    if (v > max) return max;
    return v;
  };

  const laneToCenterOffset = (n, fallback = 0) => clampRoadLane(n, fallback) * 0.5;
  const laneToRoadRatio = (n, fallback = 0) => {
    const clamped = clampRoadLane(n, fallback);
    return (clamped - lanes.road.min) / (lanes.road.max - lanes.road.min);
  };

  function getZoneLaneBounds(zone){
    if (!zone || zone.visible === false) return null;
    const fallbackStart = clampBoostLane(-2);
    const fallbackEnd = clampBoostLane(2);
    const rawStart = (zone.nStart != null) ? zone.nStart : fallbackStart;
    const rawEnd = (zone.nEnd != null) ? zone.nEnd : fallbackEnd;
    const start = clampBoostLane(rawStart);
    const end = clampBoostLane(rawEnd);
    const laneMin = Math.min(start, end);
    const laneMax = Math.max(start, end);
    return {
      start,
      end,
      laneMin,
      laneMax,
      centerOffsetMin: laneToCenterOffset(laneMin, fallbackStart),
      centerOffsetMax: laneToCenterOffset(laneMax, fallbackEnd),
      roadRatioMin: laneToRoadRatio(laneMin, fallbackStart),
      roadRatioMax: laneToRoadRatio(laneMax, fallbackEnd),
    };
  }

  function parseBoostZoneType(raw) {
    if (raw == null) return null;
    const norm = raw.toString().trim().toLowerCase();
    if (!norm) return null;
    if (['jump', 'orange', 'crest', 'air'].includes(norm)) return boost.types.jump;
    if (['drive', 'ground', 'auto', 'blue'].includes(norm)) return boost.types.drive;
    return null;
  }

  function parseBoostLaneValue(raw) {
    if (raw == null || raw === '') return null;
    const num = Number.parseFloat(raw);
    if (!Number.isFinite(num)) return null;
    const min = lanes.boost.min;
    const max = lanes.boost.max;
    if (num < min) return min;
    if (num > max) return max;
    return num;
  }

  const segmentAtS = (s) => {
    if (!segments.length || trackLength <= 0) return null;
    const wrapped = ((s % trackLength) + trackLength) % trackLength;
    const idx = Math.floor(wrapped / segmentLength) % segments.length;
    return segments[idx];
  };

  function elevationAt(s){
    if (trackLength <= 0 || !segments.length) return 0;
    let ss = s % trackLength;
    if (ss < 0) ss += trackLength;
    const i = Math.floor(ss / segmentLength);
    const seg = segments[i % segments.length];
    const t = (ss - seg.p1.world.z) / segmentLength;
    return lerp(seg.p1.world.y, seg.p2.world.y, t);
  }

  function cliffParamsAt(segIndex, t = 0){
    const segCount = segments.length;
    const sectionsPerSeg = CLIFF_SECTIONS_PER_SEG;
    const totalSections = segCount * sectionsPerSeg;

    if (totalSections <= 0 || !CLIFF_READY) {
      return {
        left:  { dx:0, dy:0 },
        right: { dx:0, dy:0 },
      };
    }

    const segNorm = ((segIndex % segCount) + segCount) % segCount;
    const u = clamp01(t);
    const total = totalSections;
    const global = segNorm * sectionsPerSeg + u * sectionsPerSeg;
    const base = Math.floor(global);
    const frac = global - base;
    const idx0 = ((base % total) + total) % total;
    const idx1 = (idx0 + 1) % total;

    const lerpSeries = (series) => {
      const dx0 = series.dx[idx0] != null ? series.dx[idx0] : 0;
      const dx1 = series.dx[idx1] != null ? series.dx[idx1] : dx0;
      const dy0 = series.dy[idx0] != null ? series.dy[idx0] : 0;
      const dy1 = series.dy[idx1] != null ? series.dy[idx1] : dy0;
      return {
        dx: lerp(dx0, dx1, frac),
        dy: lerp(dy0, dy1, frac),
      };
    };

    return {
      left:  lerpSeries(CLIFF_SERIES.left),
      right: lerpSeries(CLIFF_SERIES.right),
    };
  }

  function cliffSurfaceInfoAt(segIndex, nNorm, t = 0){
    const zeroInfo = () => ({
      heightOffset: 0,
      slope: 0,
      section: null,
      slopeA: 0,
      slopeB: 0,
      coverageA: 0,
      coverageB: 0,
    });

    if (!CLIFF_READY || !segments.length) {
      return zeroInfo();
    }

    const absN = Math.abs(nNorm);
    if (absN <= 1) return zeroInfo();

    const params = cliffParamsAt(segIndex, t);
    const left = nNorm < 0;
    const sign = Math.sign(nNorm) || 1;

    const dy = left ? params.left.dy : params.right.dy;
    const dx = Math.abs(left ? params.left.dx : params.right.dx);

    const idxNorm = ((segIndex % segments.length) + segments.length) % segments.length;
    const segData = segments[idxNorm];
    const baseZ = segData ? segData.p1.world.z : segIndex * segmentLength;
    const roadW = roadWidthAt(baseZ + clamp01(t) * segmentLength);
    const beyond = Math.max(0, (absN - 1) * roadW);

    const width = Math.max(0, dx);
    const slope = (width > 1e-6) ? sign * (dy / width) : 0;

    if (beyond <= 1e-6) {
      return { heightOffset: 0, slope: 0, section: null, slopeA: slope, slopeB: 0, coverageA: 0, coverageB: 0 };
    }

    if (width <= 1e-6) {
      return { heightOffset: dy, slope: 0, section: null, slopeA: slope, slopeB: 0, coverageA: 0, coverageB: 0 };
    }

    const dist = Math.min(beyond, width);

    let heightOffset = 0;
    let coverageA = 0;
    if (width > 1e-6) {
      coverageA = dist / width;
      heightOffset += dy * coverageA;
    }

    if (beyond >= width - 1e-6) {
      return { heightOffset: dy, slope: 0, section: null, slopeA: slope, slopeB: 0, coverageA: 0, coverageB: 0 };
    }

    return { heightOffset, slope, section: 'A', slopeA: slope, slopeB: 0, coverageA, coverageB: 0 };
  }

  function floorElevationAt(s, nNorm){
    const base = elevationAt(s);
    const seg = segmentAtS(s);
    if (!seg) return base;
    const segT = clamp01((s - seg.p1.world.z) / segmentLength);
    const info = cliffSurfaceInfoAt(seg.index, nNorm, segT);
    return base + info.heightOffset;
  }

  function cliffLateralSlopeAt(segIndex, nNorm, t = 0){
    const info = cliffSurfaceInfoAt(segIndex, nNorm, t);
    return info.slope;
  }

  global.World = {
    data: {
      segments,
      boostZones,
      get trackLength(){ return trackLength; },
    },
    assets: { manifest: assetManifest, textures },
    resolveAssetUrl,
    loadTexturesWith,
    roadWidthAt,
    buildTrackFromCSV,
    pushZone,
    vSpanForSeg,
    buildCliffsFromCSV_Lite,
    enforceCliffWrap,
    floorElevationAt,
    cliffParamsAt,
    lane: {
      clampBoostLane,
      clampRoadLane,
      laneToCenterOffset,
      laneToRoadRatio,
      getZoneLaneBounds,
    },
  };
})(window);
