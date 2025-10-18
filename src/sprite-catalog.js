(function(global){
  const { World } = global;

  const TEXTURE_MANIFEST = Object.freeze({
    tree: 'tex/tree.png',
    sign: 'tex/rockwall.png',
    animPlate01: 'tex/anim-plate-01.png',
    animPlate02: 'tex/anim-plate-02.png',
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

  const CATALOG_SOURCE = [
    {
      spriteId: 'tree_main',
      metrics: {
        wN: 1,
        aspect: 1.0,
        tint: [1, 1, 1, 1],
        textureKey: 'tree',
        atlas:{ columns: 4, totalFrames: 16 },
      },
      assets: [
        { type: 'atlas', key: 'tree', frames: makeFrames(0,15) },
      ],
      type: 'static',
      interaction: 'static',
      baseClip: { frames: [], playback: 'none' },
      interactClip: { frames: [], playback: 'none' },
      frameDuration: null,
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
