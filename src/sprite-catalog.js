(function(global){
  const { World } = global;

  const resolve = (p) => (World && typeof World.resolveAssetUrl === 'function' ? World.resolveAssetUrl(p) : p);

  const SHEET_URL = resolve('tex/temptex-0.png');

  const TEXTURE_MANIFEST = Object.freeze({
    tree: SHEET_URL,
    animPlate01: SHEET_URL,
    jeriplate: SHEET_URL,
    snowman: SHEET_URL,
  });

  const METRIC_FALLBACK = Object.freeze({
    wN: 0.2,
    hitboxWN: null,
    aspect: 1,
    tint: [1, 1, 1, 1],
    textureKey: null,
    frameNames: null,
    atlas: null,
  });

  function freezeClip(clip){
    if (!clip) {
      return Object.freeze({ frames: Object.freeze([]), playback: 'none', hold: false });
    }
    const frames = Array.isArray(clip.frames) ? clip.frames.slice() : [];
    return Object.freeze({
      frames: Object.freeze(frames),
      playback: (clip.playback || 'none'),
      hold: !!clip.hold,
      speed: Number.isFinite(clip.speed) ? clip.speed : 0,
    });
  }

  function makeFrames(start, end){
    const frames = [];
    if (!Number.isFinite(start) || !Number.isFinite(end)) return frames;
    const step = start <= end ? 1 : -1;
    for (let f = start; step > 0 ? f <= end : f >= end; f += step) {
      frames.push(f);
    }
    return frames;
  }

  function parseFrameRange(rangeStr) {
    if (typeof rangeStr !== 'string' || !rangeStr) return [];
    const [start, end] = rangeStr.split('-').map(Number);
    if (!Number.isFinite(start)) return [];
    // If 'end' is missing (e.g. "0"), treat it as a single frame range "0-0"
    const safeEnd = Number.isFinite(end) ? end : start;
    return makeFrames(start, safeEnd);
  }

  const CATALOG_SOURCE = [
    {
      id: 'trees',
      texture: 'tree',
      frameNames: [
        'trees_00', 'trees_01', 'trees_02', 'trees_03',
        'trees_04', 'trees_05', 'trees_06', 'trees_07',
        'trees_08', 'trees_09', 'trees_10', 'trees_11'
      ],
      wN: 0.8, aspect: 1.0, tint: [1, 1, 1, 1],
      assetMode: 'grouped',
      assetFrames: ['0-3', '4-7', '8-11'],
      physics: 'static',
      idleAnim: 'none',
      idleFrames: null,
      idleSpeed: 0,
      onInteract: 'none',
    },
    {
      id: 'snowbank_taper',
      texture: 'tree',
      frameNames: [
        'snowbank_taper_00', 'snowbank_taper_01', 'snowbank_taper_02',
        'snowbank_taper_03', 'snowbank_taper_04', 'snowbank_taper_05'
      ],
      wN: 1.0, aspect: 1.0, tint: [1, 1, 1, 1],
      assetMode: 'random',
      assetFrames: '0-5',
      physics: 'static',
      idleAnim: 'none',
      idleFrames: null,
      idleSpeed: 0,
      onInteract: 'none',
    },
    {
      id: 'pickup_orb',
      texture: 'animPlate01',
      frameNames: [
        'pickup_orb_00', 'pickup_orb_01', 'pickup_orb_02', 'pickup_orb_03'
      ],
      wN: 0.1, aspect: 1.0, tint: [1, 0.92, 0.2, 1],
      assetMode: 'single',
      assetFrames: '0-3',
      physics: 'trigger',
      idleAnim: 'loop',
      idleFrames: '0-3',
      idleSpeed: 0.09,
      onInteract: 'toggle',
    },
    {
      id: 'snowman',
      texture: 'snowman',
      frameNames: ['snowman_00', 'snowman_01', 'snowman_02', 'snowman_03'],
      wN: 0.4, aspect: 1.0, tint: [1, 1, 1, 1],
      hitboxWN: 0.25,
      assetMode: 'single',
      assetFrames: '0',
      physics: 'solid',
      collisionPush: 0.6, // Heavy: short slide
      cooldown: 0.5,      // Can be hit again after 0.5s
      slowdown: 0.5,      // Slows car by 50% on impact
      idleAnim: 'loop',
      idleFrames: '0-3',
      idleSpeed: 0.15,
      onInteract: 'none',
    },
    {
      id: 'bush',
      texture: 'tree',
      frameNames: [
        'bush_00', 'bush_01', 'bush_02', 'bush_03', 'bush_04', 'bush_05'
      ],
      wN: 0.5, aspect: 1.0, tint: [0.2, 0.8, 0.2, 1],
      assetMode: 'random',
      assetFrames: '0-5',
      physics: 'static',
      idleAnim: 'none',
      idleFrames: null,
      idleSpeed: 0,
      onInteract: 'none',
    },
    {
      id: 'crate_break',
      texture: 'jeriplate',
      frameNames: [
        'crate_break_00', 'crate_break_01', 'crate_break_02', 'crate_break_03'
      ],
      wN: 0.3, aspect: 1.0, tint: [0.6, 0.4, 0.2, 1],
      assetMode: 'single',
      assetFrames: '0',
      physics: 'solid',
      collisionPush: 1.2, // Light: long slide
      cooldown: -1,       // Hit once only
      idleAnim: 'none',
      idleFrames: null,
      idleSpeed: 0,
      onInteract: 'playAnim',
      interactAnim: 'once',
      interactFrames: '0-3',
      interactSpeed: 0.05,
      interactHold: true,
    },
    {
      id: 'hazard_signal',
      texture: 'animPlate01',
      frameNames: [
        'hazard_signal_00', 'hazard_signal_01'
      ],
      wN: 0.2, aspect: 1.0, tint: [1, 0.1, 0.1, 0.9],
      assetMode: 'single',
      assetFrames: '0-1',
      physics: 'static',
      idleAnim: 'pingpong',
      idleFrames: '0-1',
      idleSpeed: 0.05,
      onInteract: 'none',
    },
  ];

  const CATALOG_MAP = new Map();
  for (const source of CATALOG_SOURCE) {
    // 1. Translate Metrics
    const metrics = Object.freeze({
      wN: source.wN,
      hitboxWN: Number.isFinite(source.hitboxWN) ? source.hitboxWN : null,
      aspect: source.aspect,
      tint: Object.freeze(source.tint.slice()),
      textureKey: source.texture,
      frameNames: source.frameNames ? Object.freeze(source.frameNames.slice()) : null,
      atlas: source.atlas ? Object.freeze({
        columns: source.atlas.columns,
        totalFrames: source.atlas.frames,
      }) : null,
    });

    // 2. Translate Assets (Visuals)
    let assetList = [];
    if (source.assetFrames) {
      const frameRanges = Array.isArray(source.assetFrames)
        ? source.assetFrames.map(parseFrameRange)
        : [parseFrameRange(source.assetFrames)];

      if (source.assetMode === 'random') {
        assetList = frameRanges.flat().map((f) => ({ frames: [f] }));
      } else if (source.assetMode === 'grouped') {
        assetList = frameRanges.map((f) => ({ frames: f }));
      } else {
        assetList = [{ frames: frameRanges.flat() }];
      }
    }

    const assets = assetList.map((asset) => Object.freeze({
      type: 'atlas',
      key: source.texture,
      frames: Object.freeze(asset.frames.slice()),
    }));

    // 3. Translate Animation Clips
    const baseClip = (source.idleAnim !== 'none' && source.idleFrames)
      ? { frames: parseFrameRange(source.idleFrames), playback: source.idleAnim, speed: source.idleSpeed }
      : null;

    const interactClip = (source.onInteract === 'playAnim' && source.interactFrames)
      ? {
        frames: parseFrameRange(source.interactFrames),
        playback: source.interactAnim || 'once',
        speed: source.interactSpeed,
        hold: !!source.interactHold
      } : null;

    // 4. Determine Runtime Type
    let type = 'static';
    let interaction = source.onInteract || 'static';
    if (source.physics === 'trigger') {
      type = 'trigger';
    } else if (source.physics === 'solid') {
      type = 'solid';
    } else if (source.physics === 'fixed') {
      type = 'fixed';
    } else if (source.idleAnim !== 'none') {
      type = 'animated';
    }

    // 5. Freeze & Store
    const frozen = Object.freeze({
      spriteId: source.id,
      metrics,
      assets,
      type,
      interaction,
      collisionPush: Number.isFinite(source.collisionPush) ? source.collisionPush : 1,
      cooldown: Number.isFinite(source.cooldown) ? source.cooldown : 0,
      slowdown: Number.isFinite(source.slowdown) ? source.slowdown : 0,
      baseClip: freezeClip(baseClip),
      interactClip: freezeClip(interactClip),
    });

    CATALOG_MAP.set(source.id, frozen);
  }

  function cloneCatalog(){
    return new Map(CATALOG_MAP);
  }

  function getTextureManifest(){
    return { ...TEXTURE_MANIFEST };
  }

  function getCatalogEntry(spriteId){
    return CATALOG_MAP.get(spriteId) || null;
  }

  function getMetrics(spriteId){
    const entry = getCatalogEntry(spriteId);
    return entry ? entry.metrics : METRIC_FALLBACK;
  }

  const SpriteCatalog = {
    getTextureManifest,
    getCatalog: cloneCatalog,
    getEntry: getCatalogEntry,
    getMetrics,
    metricsFallback: METRIC_FALLBACK,
    forEach(fn){
      if (typeof fn !== 'function') return;
      CATALOG_MAP.forEach(fn);
    },
  };

  if (World && World.assets && World.assets.manifest) {
    // Remove sprite textures from the main manifest if present to prevent double loading.
    Object.keys(TEXTURE_MANIFEST).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(World.assets.manifest, key)) {
        delete World.assets.manifest[key];
      }
    });
    if (!World.assets.spriteManifest) {
      World.assets.spriteManifest = { ...TEXTURE_MANIFEST };
    }
  }

  global.SpriteCatalog = Object.freeze(SpriteCatalog);
})(typeof window !== 'undefined' ? window : globalThis);
