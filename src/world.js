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
    clamp,
    clamp01,
    lerp,
    getEase01,
    CURVE_EASE,
    wrap,
    wrapIndex,
  } = MathUtil;

  const assetManifest = {
    road:      'tex/road-seg.png',
    rail:      'tex/guardrail.png',
    cliff:     'tex/cliff.png',
    boostJump: 'tex/boost.png',
    boostDrive:'tex/boost.png',
    horizon1:  'tex/paralax-1.png',
    horizon2:  'tex/paralax-2.png',
    horizon3:  'tex/paralax-3.png',
    car:       'tex/car.png',
    semi:      'tex/semi.png',
    tree:      'tex/tree.png',
    sign:      'tex/billboard.png',
  };

  const textures = {};

  const parseNumber = (value, parser, fallback = 0) => {
    if (value === '' || value == null) return fallback;
    const parsed = parser(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  };

  const parseIntSafe = (value, fallback = 0) => parseNumber(value, v => parseInt(v, 10), fallback);
  const parseFloatSafe = (value, fallback = 0) => parseNumber(value, v => parseFloat(v), fallback);

  const BOOL_TOKEN_SETS = {
    true: new Set(['1', 'true', 'yes', 'y', 'on']),
    false: new Set(['0', 'false', 'no', 'n', 'off']),
  };

  const BOOL_TOKENS = new Set([...BOOL_TOKEN_SETS.true, ...BOOL_TOKEN_SETS.false]);

  const parseBoolSafe = (value, fallback = true) => {
    if (value === '' || value == null) return fallback;
    const norm = value.toString().toLowerCase();
    if (BOOL_TOKEN_SETS.true.has(norm)) return true;
    if (BOOL_TOKEN_SETS.false.has(norm)) return false;
    return fallback;
  };

  const isBoolToken = (value) => {
    if (value === '' || value == null) return false;
    return BOOL_TOKENS.has(value.toString().toLowerCase());
  };

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
      textures[key] = await loader(key, path);
    }));

    return textures;
  }

  const segmentLength = track.segmentSize;
  const roadWidthAt = () => track.roadWidth;

  const segments = [];
  let trackLength = 0;
  const getTrackLength = () => trackLength;
  let boostZoneIdCounter = 0;

  const CLIFF_SECTIONS_PER_SEG = 4;

  const CLIFF_SERIES = {
    leftA:  { dx: [], dy: [] },
    leftB:  { dx: [], dy: [] },
    rightA: { dx: [], dy: [] },
    rightB: { dx: [], dy: [] },
  };
  let CLIFF_READY = false;

  function resetCliffSeries(){
    const total = segments.length * CLIFF_SECTIONS_PER_SEG;
    const clear = (arr) => {
      arr.length = total;
      for (let i = 0; i < total; i++) arr[i] = 0;
    };

    clear(CLIFF_SERIES.leftA.dx);  clear(CLIFF_SERIES.leftA.dy);
    clear(CLIFF_SERIES.leftB.dx);  clear(CLIFF_SERIES.leftB.dy);
    clear(CLIFF_SERIES.rightA.dx); clear(CLIFF_SERIES.rightA.dy);
    clear(CLIFF_SERIES.rightB.dx); clear(CLIFF_SERIES.rightB.dy);

    CLIFF_READY = false;
  }

  function addSegment(curve, y, features = {}){
    const n = segments.length;
    const prevY = segments.length ? segments[n - 1].p2.world.y : 0;
    const featureClone = { ...features };
    if (!('rail' in featureClone)) featureClone.rail = true;
    if (Array.isArray(featureClone.boostRange)) featureClone.boostRange = [...featureClone.boostRange];
    if (Array.isArray(featureClone.boostZones)) featureClone.boostZones = featureClone.boostZones.map(zone => ({ ...zone }));
    featureClone.boost = !!featureClone.boost;
    segments.push({
      index: n,
      curve,
      features: featureClone,
      p1: { world: { y: prevY, z: n * segmentLength }, camera: {}, screen: {} },
      p2: { world: { y: y,    z: (n + 1) * segmentLength }, camera: {}, screen: {} },
      sprites: [], cars: [], pickups: [],
    });
  }

  const HEIGHT_EASE_UNIT = {
    linear: { in: (t) => clamp01(t),          out: (t) => clamp01(t) },
    smooth: { in: (t) => Math.pow(clamp01(t), 2),
              out: (t) => 1 - Math.pow(1 - clamp01(t), 2) },
    sharp:  { in: (t) => Math.pow(clamp01(t), 3),
              out: (t) => 1 - Math.pow(1 - clamp01(t), 3) },
  };

  function lastY(){
    return segments.length ? segments[segments.length - 1].p2.world.y : 0;
  }

  const clampBoostLane = (v) => clamp(v, lanes.boost.min, lanes.boost.max);

  const clampRoadLane = (v, fallback = 0) => {
    if (v == null) return fallback;
    return clamp(v, lanes.road.min, lanes.road.max);
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

  const createLegacyZone = (range) => {
    if (!Array.isArray(range) || range.length < 2) return null;
    const start = Math.floor(Math.max(0, range[0] | 0));
    const end = Math.floor(Math.max(start, range[1] | 0));
    if (start === 0 && end === 0) return null;
    const fallbackStart = clampBoostLane(-2);
    const fallbackEnd = clampBoostLane(2);
    return [{
      id: `legacy-${boostZoneIdCounter++}`,
      startOffset: start,
      endOffset: end,
      type: boost.types.jump,
      nStart: fallbackStart,
      nEnd: fallbackEnd,
      visible: true,
    }];
  };

  const normaliseZoneSpecs = (zoneSpecsRaw, boostRangeRaw) => {
    if (Array.isArray(zoneSpecsRaw) && zoneSpecsRaw.length) {
      return zoneSpecsRaw.map(zone => ({ ...zone }));
    }
    return createLegacyZone(boostRangeRaw);
  };

  function addRoad(enter, hold, leave, curve, dyInSegments = 0, elevationProfile = 'smooth', featurePayload = {}){
    const e = Math.max(0, enter | 0);
    const h = Math.max(0, hold | 0);
    const l = Math.max(0, leave | 0);
    const total = e + h + l;
    if (total <= 0) return;

    const startY = lastY();
    const endY   = startY + (dyInSegments * segmentLength);
    const hasElevationChange = dyInSegments !== 0;
    const profile =
      elevationProfile === 'linear' ? 'linear' :
      elevationProfile === 'sharp'  ? 'sharp'  :
                                      'smooth';

    const extras = { ...featurePayload };
    const railPresent = ('rail' in extras) ? !!extras.rail : true;
    const boostRangeRaw = Array.isArray(extras.boostRange) ? extras.boostRange : null;
    const zoneSpecs = normaliseZoneSpecs(extras.boostZones, boostRangeRaw);
    delete extras.rail;
    delete extras.boostRange;
    delete extras.boostZones;

    const buildFeatures = (segOffset) => {
      const segFeatures = { ...extras, rail: railPresent };
      if (!zoneSpecs || !zoneSpecs.length) {
        segFeatures.boost = false;
        return segFeatures;
      }

      const zonesForSeg = zoneSpecs
        .filter(zone => segOffset >= zone.startOffset && segOffset <= zone.endOffset)
        .map(zone => ({ ...zone }));

      if (!zonesForSeg.length) {
        segFeatures.boost = false;
        return segFeatures;
      }

      const minStart = zonesForSeg.reduce((acc, zone) => Math.min(acc, zone.startOffset), Number.POSITIVE_INFINITY);
      const maxEnd = zonesForSeg.reduce((acc, zone) => Math.max(acc, zone.endOffset), Number.NEGATIVE_INFINITY);
      segFeatures.boostZones = zonesForSeg;
      segFeatures.boostRange = [minStart, maxEnd];
      segFeatures.boost = true;
      return segFeatures;
    };

    let segOffset = 0;
    const computeY = (progressRaw) => {
      if (!hasElevationChange) return startY;

      const t = clamp01(progressRaw);
      const k = (e + 1e-6) / (e + l + 2e-6);

      let shaped01;
      if (t < k) {
        const u = t / Math.max(k, 1e-6);
        shaped01 = 0.5 * HEIGHT_EASE_UNIT[profile].in(u);
      } else {
        const u = (t - k) / Math.max(1 - k, 1e-6);
        shaped01 = 0.5 + 0.5 * HEIGHT_EASE_UNIT[profile].out(u);
      }

      return lerp(startY, endY, shaped01);
    };

    const runPhase = (count, resolveCurve, progressBase) => {
      for (let n = 0; n < count; n++){
        const phaseT = count > 0 ? n / count : 1;
        addSegment(
          resolveCurve(phaseT),
          computeY((progressBase + n) / total),
          buildFeatures(segOffset),
        );
        segOffset++;
      }
      return progressBase + count;
    };

    let progressBase = 0;
    progressBase = runPhase(e, tCurve => CURVE_EASE[profile].in(0, curve, tCurve), progressBase);
    progressBase = runPhase(h, () => curve, progressBase);
    runPhase(l, tCurve => CURVE_EASE[profile].out(curve, 0, tCurve), progressBase);
  }

  async function buildTrackFromCSV(url){
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('CSV load failed: ' + res.status);
    const text = await res.text();

    const typeAliases = {
      road: 'road', r: 'road',
      straight: 'straight', flat: 'straight', s: 'straight',
      curve: 'curve', c: 'curve', turn: 'curve',
      hill: 'smoothHill', h: 'smoothHill', rise: 'smoothHill',
      smoothhill: 'smoothHill', smooth: 'smoothHill',
      sharphill: 'sharpHill', sharp: 'sharpHill',
    };

    const lines = text.split(/\r?\n/);
    segments.length = 0;
    boostZoneIdCounter = 0;

    for (const raw of lines){
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;

      const cells = line.split(',').map(s => (s ?? '').trim());
      const typeRaw = cells[0];
      const enter = cells[1];
      const hold = cells[2];
      const leave = cells[3];
      let curveRaw;
      let dyRaw;
      let railRaw;
      let boostStartRaw;
      let boostEndRaw;
      let repeatsRaw;
      let repeatsIdx = null;

      const findIndex = (label) => {
        if (!label) return null;
        const idx = cells.findIndex(cell => cell.toLowerCase() === label.toLowerCase());
        return idx >= 0 ? idx : null;
      };

      const type = (typeAliases[typeRaw?.toLowerCase()] || typeRaw || '').toLowerCase();
      const e = parseIntSafe(enter, 0);
      const h = parseIntSafe(hold, 0);
      const l = parseIntSafe(leave, 0);

      const findAfter = (keyword) => {
        const idx = findIndex(keyword);
        if (idx == null) return null;
        const valueIdx = idx + 1;
        return valueIdx < cells.length ? cells[valueIdx] : null;
      };

      if (cells.length > 4){
        curveRaw = cells[4];
        dyRaw = cells[5];
        railRaw = cells[6];
        boostStartRaw = cells[7];
        boostEndRaw = cells[8];
        repeatsRaw = cells[9];
      }

      if (type === 'curve') {
        curveRaw = findAfter('curve');
      }

      if (type === 'smoothhill' || type === 'sharphill') {
        dyRaw = findAfter('dy');
      }

      const curve = parseFloatSafe(curveRaw, 0);
      const dySegments = parseFloatSafe(dyRaw, 0);
      const rail = !isBoolToken(railRaw) ? true : parseBoolSafe(railRaw, true);
      const boostStart = parseIntSafe(boostStartRaw, null);
      const boostEnd = parseIntSafe(boostEndRaw, null);
      const boostTypeRaw = findAfter('boostType') ?? findAfter('boost');
      const boostLaneStartRaw = findAfter('boostLaneStart');
      const boostLaneEndRaw = findAfter('boostLaneEnd');
      const boostVisibleRaw = findAfter('boostVisible');

      const repeatsKeywordIdx = findIndex('repeats');
      if (repeatsKeywordIdx != null) {
        repeatsIdx = repeatsKeywordIdx + 1;
      }
      const repeats = repeatsIdx != null ? parseIntSafe(cells[repeatsIdx], 1) : parseIntSafe(repeatsRaw, 1);
      const reps = Math.max(1, repeats);

      let elevationProfile = 'smooth';
      if (type === 'road' || type === 'straight') {
        elevationProfile = 'smooth';
      }
      else if (type === 'curve') {
        elevationProfile = 'smooth';
      }
      else if (type === 'smoothhill') {
        elevationProfile = 'smooth';
      }
      else if (type === 'sharphill') {
        elevationProfile = 'sharp';
      }

      const features = { rail };
      if (boostStart != null && boostEnd != null && boostEnd >= boostStart) {
        const start = Math.max(0, boostStart | 0);
        const end = Math.max(start, boostEnd | 0);
        if (!(start === 0 && end === 0)) {
          const parsedType = parseBoostZoneType(boostTypeRaw) || boost.types.jump;
          const laneStart = parseBoostLaneValue(boostLaneStartRaw);
          const laneEnd = parseBoostLaneValue(boostLaneEndRaw);
          const fallbackStart = clampBoostLane(-2);
          const fallbackEnd = clampBoostLane(2);
          const laneA = clampBoostLane((laneStart != null) ? laneStart : fallbackStart);
          const laneB = clampBoostLane((laneEnd != null) ? laneEnd : fallbackEnd);
          const nStart = Math.min(laneA, laneB);
          const nEnd = Math.max(laneA, laneB);
          const zoneVisible = parseBoolSafe(boostVisibleRaw, true);
          const zone = {
            id: `csv-${boostZoneIdCounter++}`,
            startOffset: start,
            endOffset: end,
            type: parsedType,
            nStart,
            nEnd,
            visible: zoneVisible,
          };
          features.boostZones = [zone];
          features.boostRange = [start, end];
        }
      }

      for (let i = 0; i < reps; i++){
        addRoad(e, h, l, curve, dySegments, elevationProfile, features);
      }
    }

    if (segments.length === 0) throw new Error('CSV produced no segments');
    trackLength = segments.length * segmentLength;
  }

  async function buildCliffsFromCSV_Lite(url){
    if (!segments.length) return;
    resetCliffSeries();

    let text = '';
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      text = await res.text();
    } catch (e) {
      console.warn('Cliff CSV not found, using flat cliffs:', e);
      CLIFF_READY = true;
      return;
    }

    const normSide = (s)=> (s||'').trim().toUpperCase();
    const resolveSides = (token) => {
      const side = normSide(token || 'B');
      if (side === 'L' || side === 'R') return [side];
      return ['L', 'R'];
    };

    const sectionsPerSeg = CLIFF_SECTIONS_PER_SEG;
    const N = segments.length * sectionsPerSeg;
    const head = { L:0, R:0 };
    const state = {
      L: { Ax:0, Ay:0, Bx:0, By:0 },
      R: { Ax:0, Ay:0, Bx:0, By:0 },
    };

    const lines = text.split(/\r?\n/);
    for (const raw of lines){
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;

      const c = line.split(',').map(s => (s??'').trim());
      const sides = resolveSides(c[0]);

      const lenSegments = Math.max(1, parseIntSafe(c[1], 1));
      const aEase = getEase01(c[2]||'smooth:io');
      const aDx   = parseFloatSafe(c[3], 0), aDy = parseFloatSafe(c[4], 0);
      const bEase = getEase01(c[5]||'smooth:io');
      const bDx   = parseFloatSafe(c[6], 0), bDy = parseFloatSafe(c[7], 0);
      const mode  = (c[8]||'rel').toLowerCase()==='abs' ? 'abs' : 'rel';
      const reps  = Math.max(1, parseIntSafe(c[9], 1));

      for (let r=0; r<reps; r++){
        for (const S of sides){
          const st = state[S];
          const start = head[S];
          const from = { Ax: st.Ax, Ay: st.Ay, Bx: st.Bx, By: st.By };
          const target = (mode==='abs') ?
            { Ax:aDx, Ay:aDy, Bx:bDx, By:bDy } :
            { Ax: st.Ax + aDx, Ay: st.Ay + aDy, Bx: st.Bx + bDx, By: st.By + bDy };

          const steps = Math.max(1, lenSegments * sectionsPerSeg);
          const denom = steps <= 1 ? 1 : (steps - 1);

          for (let i=0; i<steps; i++){
            const idx = (start + i) % N;
            const t = (steps <= 1) ? 1 : (i / denom);
            const sA = aEase(t), sB = bEase(t);

            const Ax = lerp(from.Ax, target.Ax, sA);
            const Ay = lerp(from.Ay, target.Ay, sA);
            const Bx = lerp(from.Bx, target.Bx, sB);
            const By = lerp(from.By, target.By, sB);

            if (S==='L'){
              CLIFF_SERIES.leftA.dx[idx]=Ax;  CLIFF_SERIES.leftA.dy[idx]=Ay;
              CLIFF_SERIES.leftB.dx[idx]=Bx;  CLIFF_SERIES.leftB.dy[idx]=By;
            } else {
              CLIFF_SERIES.rightA.dx[idx]=Ax; CLIFF_SERIES.rightA.dy[idx]=Ay;
              CLIFF_SERIES.rightB.dx[idx]=Bx; CLIFF_SERIES.rightB.dy[idx]=By;
            }
          }

          head[S] = start + steps;
          st.Ax = target.Ax; st.Ay = target.Ay;
          st.Bx = target.Bx; st.By = target.By;
        }
      }
    }

    const fillRemainder = (S) => {
      const st = state[S];
      const start = head[S];
      if (start >= N) return;
      for (let i=start; i<N; i++){
        if (S==='L'){
          CLIFF_SERIES.leftA.dx[i]=st.Ax;  CLIFF_SERIES.leftA.dy[i]=st.Ay;
          CLIFF_SERIES.leftB.dx[i]=st.Bx;  CLIFF_SERIES.leftB.dy[i]=st.By;
        } else {
          CLIFF_SERIES.rightA.dx[i]=st.Ax; CLIFF_SERIES.rightA.dy[i]=st.Ay;
          CLIFF_SERIES.rightB.dx[i]=st.Bx; CLIFF_SERIES.rightB.dy[i]=st.By;
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
      copyAt(dst, src, CLIFF_SERIES.leftA);  copyAt(dst, src, CLIFF_SERIES.leftB);
      copyAt(dst, src, CLIFF_SERIES.rightA); copyAt(dst, src, CLIFF_SERIES.rightB);
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
    return clamp(num, lanes.boost.min, lanes.boost.max);
  }

  const segmentAtS = (s) => {
    if (!segments.length || trackLength <= 0) return null;
    const wrapped = wrap(s, trackLength);
    const idx = wrapIndex(Math.floor(wrapped / segmentLength), segments.length);
    return segments[idx];
  };

  function elevationAt(s){
    if (trackLength <= 0 || !segments.length) return 0;
    const ss = wrap(s, trackLength);
    const i = Math.floor(ss / segmentLength);
    const seg = segments[wrapIndex(i, segments.length)];
    const t = (ss - seg.p1.world.z) / segmentLength;
    return lerp(seg.p1.world.y, seg.p2.world.y, t);
  }

  function groundProfileAt(s){
    const y = elevationAt(s);
    if (trackLength <= 0 || !segments.length) return { y, dy: 0, d2y: 0 };
    const h = Math.max(5, segmentLength * 0.1);
    const y1 = elevationAt(s - h);
    const y2 = elevationAt(s + h);
    const dy = (y2 - y1) / (2 * h);
    const d2y = (y2 - 2 * y + y1) / (h * h);
    return { y, dy, d2y };
  }

  function boostZonesOnSegment(seg){
    const zones = seg && seg.features ? seg.features.boostZones : null;
    return Array.isArray(zones) ? zones : [];
  }

  function cliffParamsAt(segIndex, t = 0){
    const segCount = segments.length;
    const sectionsPerSeg = CLIFF_SECTIONS_PER_SEG;
    const totalSections = segCount * sectionsPerSeg;

    if (totalSections <= 0 || !CLIFF_READY) {
      return {
        leftA:  { dx:0, dy:0 },
        leftB:  { dx:0, dy:0 },
        rightA: { dx:0, dy:0 },
        rightB: { dx:0, dy:0 },
      };
    }

    const segNorm = wrapIndex(segIndex, segCount);
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
      leftA:  lerpSeries(CLIFF_SERIES.leftA),
      leftB:  lerpSeries(CLIFF_SERIES.leftB),
      rightA: lerpSeries(CLIFF_SERIES.rightA),
      rightB: lerpSeries(CLIFF_SERIES.rightB),
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

    const dyA = left ? params.leftA.dy : params.rightA.dy;
    const dyB = left ? params.leftB.dy : params.rightB.dy;
    const dxA = Math.abs(left ? params.leftA.dx : params.rightA.dx);
    const dxB = Math.abs(left ? params.leftB.dx : params.rightB.dx);

    const idxNorm = ((segIndex % segments.length) + segments.length) % segments.length;
    const segData = segments[idxNorm];
    const baseZ = segData ? segData.p1.world.z : segIndex * segmentLength;
    const roadW = roadWidthAt(baseZ + clamp01(t) * segmentLength);
    const beyond = Math.max(0, (absN - 1) * roadW);

    const EPS = 1e-6;
    const widthA = Math.max(0, dxA);
    const widthB = Math.max(0, dxB);
    const totalWidth = widthA + widthB;

    const hasHeightA = Math.abs(dyA) > EPS;
    const hasHeightB = Math.abs(dyB) > EPS;
    const isVerticalA = hasHeightA && widthA <= EPS;
    const isVerticalB = hasHeightB && widthB <= EPS;
    const verticalSlope = (dy) => sign * (dy >= 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);

    const slopeA = (widthA > EPS)
      ? sign * (dyA / widthA)
      : (isVerticalA ? verticalSlope(dyA) : 0);
    const slopeB = (widthB > EPS)
      ? sign * (dyB / widthB)
      : (isVerticalB ? verticalSlope(dyB) : 0);

    const touchesVerticalA = isVerticalA && beyond > 0;
    const touchesVerticalB = isVerticalB && beyond > Math.max(widthA - EPS, 0);

    if (beyond <= EPS && !touchesVerticalA && !touchesVerticalB) {
      return { heightOffset: 0, slope: 0, section: null, slopeA, slopeB, coverageA: 0, coverageB: 0 };
    }

    const distA = Math.min(beyond, widthA);
    const distB = Math.max(0, Math.min(beyond - widthA, widthB));

    let heightOffset = 0;
    let coverageA = 0;
    let coverageB = 0;

    if (widthA > EPS) {
      coverageA = clamp01(widthA > 0 ? distA / widthA : 0);
      heightOffset += dyA * coverageA;
    } else if (touchesVerticalA) {
      coverageA = 1;
      heightOffset += dyA;
    }

    if (widthB > EPS) {
      coverageB = clamp01(widthB > 0 ? distB / widthB : 0);
      heightOffset += dyB * coverageB;
    } else if (touchesVerticalB) {
      coverageB = 1;
      heightOffset += dyB;
    }

    if (coverageB <= 0 && hasHeightB && beyond > EPS && beyond >= totalWidth - EPS && beyond >= Math.max(widthA - EPS, 0)) {
      coverageB = 1;
      heightOffset += dyB;
    }

    const touchedB = (widthB > EPS && distB > EPS) || touchesVerticalB || (coverageB > 0 && beyond >= totalWidth - EPS);
    const touchedA = (widthA > EPS && distA > EPS) || touchesVerticalA;

    if (touchedB || (beyond >= totalWidth - EPS && (coverageB > 0 || hasHeightB))) {
      return {
        heightOffset,
        slope: slopeB,
        section: 'B',
        slopeA,
        slopeB,
        coverageA,
        coverageB,
      };
    }

    if (touchedA || (beyond >= totalWidth - EPS && (coverageA > 0 || hasHeightA))) {
      return {
        heightOffset,
        slope: slopeA,
        section: 'A',
        slopeA,
        slopeB,
        coverageA,
        coverageB,
      };
    }

    return { heightOffset, slope: 0, section: null, slopeA, slopeB, coverageA, coverageB };
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
      get trackLength(){ return trackLength; },
    },
    getTrackLength,
    assets: { manifest: assetManifest, textures },
    loadTexturesWith,
    roadWidthAt,
    buildTrackFromCSV,
    pushZone,
    vSpanForSeg,
    buildCliffsFromCSV_Lite,
    enforceCliffWrap,
    floorElevationAt,
    cliffParamsAt,
    cliffSurfaceInfoAt,
    cliffLateralSlopeAt,
    segmentAtS,
    elevationAt,
    groundProfileAt,
    boostZonesOnSegment,
    lane: {
      clampBoostLane,
      clampRoadLane,
      laneToCenterOffset,
      laneToRoadRatio,
      getZoneLaneBounds,
    },
  };
})(window);
