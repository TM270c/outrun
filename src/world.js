(function(global){
  const { Config, MathUtil } = global;

  if (!Config || !MathUtil) {
    throw new Error('World module requires Config and MathUtil globals');
  }

  const {
    TUNE_TRACK,
    BOOST_LANE_LIMITS,
    ROAD_LANE_LIMITS,
    BOOST_ZONE_TYPES,
  } = Config;

  const {
    clamp01,
    lerp,
    getEase01,
    CURVE_EASE,
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

  const segmentLength = TUNE_TRACK.segmentLength;
  const roadWidthAt = () => TUNE_TRACK.roadWidth;

  const segments = [];
  let trackLength = 0;
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

  function addRoad(enter, hold, leave, curve, dyInSegments = 0, elevationProfile = 'smooth', featurePayload = {}){
    const e = Math.max(0, enter | 0), h = Math.max(0, hold | 0), l = Math.max(0, leave | 0);
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
    const boostZonesRaw = Array.isArray(extras.boostZones)
      ? extras.boostZones.map(zone => ({ ...zone }))
      : null;
    delete extras.rail;
    delete extras.boostRange;
    delete extras.boostZones;

    let zoneSpecs = boostZonesRaw && boostZonesRaw.length ? boostZonesRaw : null;
    if ((!zoneSpecs || zoneSpecs.length === 0) && boostRangeRaw && boostRangeRaw.length >= 2) {
      const start = Math.floor(Math.max(0, boostRangeRaw[0]));
      const end = Math.floor(Math.max(start, boostRangeRaw[1]));
      if (!(start === 0 && end === 0)) {
        const fallbackStart = clampBoostLane(-2);
        const fallbackEnd = clampBoostLane(2);
        zoneSpecs = [{
          id: `legacy-${boostZoneIdCounter++}`,
          startOffset: start,
          endOffset: end,
          type: BOOST_ZONE_TYPES.JUMP,
          nStart: fallbackStart,
          nEnd: fallbackEnd,
          visible: true,
        }];
      }
    }

    const buildFeatures = (segOffset) => {
      const segFeatures = { ...extras, rail: railPresent };
      if (zoneSpecs && zoneSpecs.length) {
        const zonesForSeg = zoneSpecs
          .filter(zone => segOffset >= zone.startOffset && segOffset <= zone.endOffset)
          .map(zone => ({ ...zone }));
        if (zonesForSeg.length) {
          segFeatures.boostZones = zonesForSeg;
          const minStart = zonesForSeg.reduce((acc, zone) => Math.min(acc, zone.startOffset), Number.POSITIVE_INFINITY);
          const maxEnd = zonesForSeg.reduce((acc, zone) => Math.max(acc, zone.endOffset), Number.NEGATIVE_INFINITY);
          segFeatures.boostRange = [minStart, maxEnd];
          segFeatures.boost = true;
        } else {
          segFeatures.boost = false;
        }
      } else {
        segFeatures.boost = false;
      }
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

    for (let n = 0; n < e; n++){
      const tCurve = e > 0 ? n / e : 1;
      addSegment(
        CURVE_EASE[profile].in(0, curve, tCurve),
        computeY((0 + n) / total),
        buildFeatures(segOffset),
      );
      segOffset++;
    }

    for (let n = 0; n < h; n++){
      addSegment(
        curve,
        computeY((e + n) / total),
        buildFeatures(segOffset),
      );
      segOffset++;
    }

    for (let n = 0; n < l; n++){
      const tCurve = l > 0 ? n / l : 1;
      addSegment(
        CURVE_EASE[profile].out(curve, 0, tCurve),
        computeY((e + h + n) / total),
        buildFeatures(segOffset),
      );
      segOffset++;
    }
  }

  async function buildTrackFromCSV(url){
    const res = await fetch(url, { cache: 'no-store' });
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
    const boolTrueTokens = ['1', 'true', 'yes', 'y', 'on'];
    const boolFalseTokens = ['0', 'false', 'no', 'n', 'off'];
    const boolWordTokens = ['true', 'yes', 'y', 'on', 'false', 'no', 'n', 'off'];
    const toBool = (v, d = true) => {
      if (v === '' || v == null) return d;
      const norm = v.toLowerCase();
      if (boolTrueTokens.includes(norm)) return true;
      if (boolFalseTokens.includes(norm)) return false;
      return d;
    };
    const isBoolToken = (v) => {
      if (v === '' || v == null) return false;
      const norm = v.toLowerCase();
      return boolWordTokens.includes(norm);
    };

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
      const e = toInt(enter, 0);
      const h = toInt(hold, 0);
      const l = toInt(leave, 0);

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

      const curve = toFloat(curveRaw, 0);
      const dySegments = toFloat(dyRaw, 0);
      const rail = !isBoolToken(railRaw) ? true : toBool(railRaw, true);
      const boostStart = toInt(boostStartRaw, null);
      const boostEnd = toInt(boostEndRaw, null);
      const boostTypeRaw = findAfter('boostType') ?? findAfter('boost');
      const boostLaneStartRaw = findAfter('boostLaneStart');
      const boostLaneEndRaw = findAfter('boostLaneEnd');
      const boostVisibleRaw = findAfter('boostVisible');

      const repeatsKeywordIdx = findIndex('repeats');
      if (repeatsKeywordIdx != null) {
        repeatsIdx = repeatsKeywordIdx + 1;
      }
      const repeats = repeatsIdx != null ? toInt(cells[repeatsIdx], 1) : toInt(repeatsRaw, 1);
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
          const parsedType = parseBoostZoneType(boostTypeRaw) || BOOST_ZONE_TYPES.JUMP;
          const laneStart = parseBoostLaneValue(boostLaneStartRaw);
          const laneEnd = parseBoostLaneValue(boostLaneEndRaw);
          const fallbackStart = clampBoostLane(-2);
          const fallbackEnd = clampBoostLane(2);
          const laneA = clampBoostLane((laneStart != null) ? laneStart : fallbackStart);
          const laneB = clampBoostLane((laneEnd != null) ? laneEnd : fallbackEnd);
          const nStart = Math.min(laneA, laneB);
          const nEnd = Math.max(laneA, laneB);
          const zoneVisible = toBool(boostVisibleRaw, true);
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

    const toInt =(v,d=0)=> (v===''||v==null)?d: (Number.isNaN(parseInt(v,10))?d:parseInt(v,10));
    const toNum =(v,d=0)=> (v===''||v==null)?d: (Number.isNaN(parseFloat(v))?d:parseFloat(v));
    const normSide = (s)=> (s||'').trim().toUpperCase();

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
      const sideTok = normSide(c[0]||'B');
      const sides = (sideTok==='L'||sideTok==='R') ? [sideTok] : (sideTok==='B' ? ['L','R'] : ['L','R']);

      const lenSegments = Math.max(1, toInt(c[1], 1));
      const aEase = getEase01(c[2]||'smooth:io');
      const aDx   = toNum(c[3], 0), aDy = toNum(c[4], 0);
      const bEase = getEase01(c[5]||'smooth:io');
      const bDx   = toNum(c[6], 0), bDy = toNum(c[7], 0);
      const mode  = (c[8]||'rel').toLowerCase()==='abs' ? 'abs' : 'rel';
      const reps  = Math.max(1, toInt(c[9], 1));

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

  const clampBoostLane = (v) => {
    if (v == null) return v;
    const min = BOOST_LANE_LIMITS.MIN;
    const max = BOOST_LANE_LIMITS.MAX;
    if (v < min) return min;
    if (v > max) return max;
    return v;
  };

  const clampRoadLane = (v, fallback = 0) => {
    if (v == null) return fallback;
    const min = ROAD_LANE_LIMITS.MIN;
    const max = ROAD_LANE_LIMITS.MAX;
    if (v < min) return min;
    if (v > max) return max;
    return v;
  };

  const laneToCenterOffset = (n, fallback = 0) => clampRoadLane(n, fallback) * 0.5;
  const laneToRoadRatio = (n, fallback = 0) => {
    const clamped = clampRoadLane(n, fallback);
    return (clamped - ROAD_LANE_LIMITS.MIN) / (ROAD_LANE_LIMITS.MAX - ROAD_LANE_LIMITS.MIN);
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
    if (['jump', 'orange', 'crest', 'air'].includes(norm)) return BOOST_ZONE_TYPES.JUMP;
    if (['drive', 'ground', 'auto', 'blue'].includes(norm)) return BOOST_ZONE_TYPES.DRIVE;
    return null;
  }

  function parseBoostLaneValue(raw) {
    if (raw == null || raw === '') return null;
    const num = Number.parseFloat(raw);
    if (!Number.isFinite(num)) return null;
    const min = BOOST_LANE_LIMITS.MIN;
    const max = BOOST_LANE_LIMITS.MAX;
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
        leftA:  { dx:0, dy:0 },
        leftB:  { dx:0, dy:0 },
        rightA: { dx:0, dy:0 },
        rightB: { dx:0, dy:0 },
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

    const widthA = Math.max(0, dxA);
    const widthB = Math.max(0, dxB);
    const totalWidth = widthA + widthB;

    const slopeA = (widthA > 1e-6) ? sign * (dyA / widthA) : 0;
    const slopeB = (widthB > 1e-6) ? sign * (dyB / widthB) : 0;

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
    lane: {
      clampBoostLane,
      clampRoadLane,
      laneToCenterOffset,
      laneToRoadRatio,
      getZoneLaneBounds,
    },
  };
})(window);
