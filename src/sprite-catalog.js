(function(global){
  const { World } = global;

  const resolve = (p) => (World && typeof World.resolveAssetUrl === 'function' ? World.resolveAssetUrl(p) : p);

  const TEXTURE_MANIFEST = Object.freeze({
    tree: resolve('tex/tree.png'),
    sign: resolve('tex/rockwall.png'),
    animPlate01: resolve('tex/anim-plate-01.png'),
    animPlate02: resolve('tex/anim-plate-02.png'),
    snowman: resolve('tex/snowman.png'),
  });

  const METRIC_FALLBACK = Object.freeze({
    wN: 0.2,
    aspect: 1,
    tint: [1, 1, 1, 1],
    textureKey: null,
    atlas: null,
  });

  function freezeClip(clip){
    if (!clip) {
      return Object.freeze({ frames: Object.freeze([]), playback: 'none' });
    }
    const frames = Array.isArray(clip.frames) ? clip.frames.slice() : [];
    return Object.freeze({
      frames: Object.freeze(frames),
      playback: (clip.playback || 'none'),
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

  function makeAtlasFrameAssets(key, frameValues){
    const frames = Array.isArray(frameValues) ? frameValues : [];
    return frames.map((frame) => ({ type: 'atlas', key, frames: [frame] }));
  }

  const TREE_ATLAS_METRICS = {
    wN: 1,
    aspect: 1.0,
    tint: [1, 1, 1, 1],
    textureKey: 'tree',
    atlas: { columns: 4, totalFrames: 16 },
  };

  const TREE_ATLAS_FRAMES = makeFrames(0, 15);

  const TREE_TAPER_DEMO_ASSETS = [
    { type: 'atlas', key: 'tree', frames: makeFrames(0, 3) },
    { type: 'atlas', key: 'tree', frames: makeFrames(4, 7) },
    { type: 'atlas', key: 'tree', frames: makeFrames(8, 11) },
    { type: 'atlas', key: 'tree', frames: makeFrames(12, 15) },
  ];

  const PICKUP_METRICS = {
    wN: 0.1,
    aspect: 1.0,
    tint: [1, 0.92, 0.2, 1],
    textureKey: 'animPlate01',
    atlas: { columns: 4, totalFrames: 16 },
  };

  const PICKUP_BASE_FRAMES = makeFrames(0, 3);

  const BARRIER_METRICS = {
    wN: 0.15,
    aspect: 1.0,
    tint: [1, 0.4, 0.2, 1], // Orange tint
    textureKey: 'animPlate02',
    atlas: { columns: 4, totalFrames: 16 },
  };

  const SNOWMAN_METRICS = {
    wN: 0.4,
    hitboxWN: 0.25,
    aspect: 1.0,
    tint: [1, 1, 1, 1],
    textureKey: 'snowman',
    atlas: { columns: 4, totalFrames: 16 },
  };

  const CATALOG_SOURCE = [
    {
      spriteId: 'tree_forest',
      metrics: TREE_ATLAS_METRICS,
      assets: makeAtlasFrameAssets('tree', TREE_ATLAS_FRAMES),
      type: 'static',
      collision: 'ghost',
      interaction: 'static',
      baseClip: null,
      interactClip: null,
      frameDuration: null,
    },
    {
      spriteId: 'tree_anim',
      metrics: TREE_ATLAS_METRICS,
      assets: [
        { type: 'atlas', key: 'tree', frames: TREE_ATLAS_FRAMES.slice() },
      ],
      type: 'animated',
      collision: 'ghost',
      interaction: 'static',
      baseClip: { frames: TREE_ATLAS_FRAMES.slice(), playback: 'loop' },
      interactClip: null,
      frameDuration: 0.08,
    },
    {
      spriteId: 'tree_forest_taper_demo',
      metrics: TREE_ATLAS_METRICS,
      assets: TREE_TAPER_DEMO_ASSETS.map((asset) => ({
        type: asset.type,
        key: asset.key,
        frames: asset.frames.slice(),
      })),
      type: 'static',
      collision: 'ghost',
      interaction: 'static',
      baseClip: null,
      interactClip: null,
      frameDuration: null,
    },
    {
      spriteId: 'pickup_orb',
      metrics: PICKUP_METRICS,
      assets: [
        { type: 'atlas', key: 'animPlate01', frames: PICKUP_BASE_FRAMES.slice() },
      ],
      type: 'trigger',
      collision: 'ghost',
      interaction: 'toggle',
      baseClip: { frames: PICKUP_BASE_FRAMES.slice(), playback: 'loop' },
      interactClip: null,
      frameDuration: 0.09,
    },
    {
      spriteId: 'barrier_solid',
      metrics: BARRIER_METRICS,
      assets: [
        { type: 'atlas', key: 'animPlate02', frames: [0] },
      ],
      type: 'solid',
      collision: 'solid',
      interaction: 'static',
      baseClip: null,
      interactClip: null,
      frameDuration: null,
    },
    {
      spriteId: 'snowman',
      metrics: SNOWMAN_METRICS,
      assets: [
        { type: 'atlas', key: 'snowman', frames: makeFrames(0, 15) },
      ],
      type: 'solid',
      collision: 'push',
      interaction: 'playAnim',
      baseClip: { frames: [0], playback: 'none' },
      interactClip: { frames: makeFrames(0, 15), playback: 'once' },
      frameDuration: 0.08,
    },
  ];

  const CATALOG_MAP = new Map();
  for (const entry of CATALOG_SOURCE) {
    const metrics = entry.metrics ? Object.freeze({
      wN: entry.metrics.wN,
      aspect: entry.metrics.aspect,
      tint: Array.isArray(entry.metrics.tint) ? Object.freeze(entry.metrics.tint.slice()) : Object.freeze([1, 1, 1, 1]),
      textureKey: entry.metrics.textureKey || null,
      atlas: entry.metrics.atlas ? Object.freeze({
        columns: entry.metrics.atlas.columns,
        totalFrames: entry.metrics.atlas.totalFrames,
      }) : null,
    }) : METRIC_FALLBACK;

    const assets = Array.isArray(entry.assets)
      ? entry.assets.map((asset) => Object.freeze({
        type: asset.type || 'texture',
        key: asset.key || '',
        frames: Object.freeze(Array.isArray(asset.frames) ? asset.frames.slice() : []),
      }))
      : [];

    const frozen = Object.freeze({
      spriteId: entry.spriteId,
      metrics,
      assets,
      type: entry.type || 'static',
      collision: entry.collision || 'ghost',
      interaction: entry.interaction || 'static',
      baseClip: freezeClip(entry.baseClip),
      interactClip: freezeClip(entry.interactClip),
      frameDuration: entry.frameDuration,
    });

    CATALOG_MAP.set(entry.spriteId, frozen);
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
