(function(global){
  const { World } = global;

  const resolve = (p) => (World && typeof World.resolveAssetUrl === 'function' ? World.resolveAssetUrl(p) : p);

  const TEXTURE_MANIFEST = Object.freeze({
    tree: resolve('tex/tree.png'),
    sign: resolve('tex/rockwall.png'),
    animPlate01: resolve('tex/anim-plate-01.png'),
    animPlate02: resolve('tex/anim-plate-02.png'),
    barrier: resolve('tex/barrier.png'),
    boost: resolve('tex/boost.png'),
  });

  const METRIC_FALLBACK = Object.freeze({
    wN: 0.2,
    hitboxWN: null,
    aspect: 1,
    tint: [1, 1, 1, 1],
    textureKey: null,
    atlas: null,
  });

  function sanitizeFrames(values, totalFrames){
    if (!Array.isArray(values)) return [];
    const maxFrame = Number.isFinite(totalFrames) && totalFrames > 0 ? totalFrames - 1 : null;
    return values
      .filter(Number.isFinite)
      .map((frame) => Math.floor(frame))
      .filter((frame) => frame >= 0 && (maxFrame == null || frame <= maxFrame));
  }

  function normalizeClip(clip, totalFrames){
    if (!clip) {
      return Object.freeze({ frames: Object.freeze([]), playback: 'none' });
    }
    const frames = sanitizeFrames(clip.frames, totalFrames);
    const mode = (clip.playback || 'none').toString().toLowerCase();
    const playback = (mode === 'loop' || mode === 'pingpong' || mode === 'once') ? mode : 'none';
    return Object.freeze({
      frames: Object.freeze(frames),
      playback,
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

  const ANIM_PLATE_METRICS = {
    wN: 0.14,
    aspect: 1.0,
    tint: [1, 1, 1, 1],
    textureKey: 'animPlate01',
    atlas: { columns: 4, totalFrames: 16 },
  };

  const PICKUP_METRICS = {
    wN: 0.11,
    aspect: 1.0,
    tint: [0.9, 1, 0.35, 1],
    textureKey: 'animPlate01',
    atlas: { columns: 4, totalFrames: 16 },
  };

  const SIGN_ANIM_FRAMES = makeFrames(0, 7);
  const PICKUP_FRAMES = makeFrames(8, 11);

  const INTERACTABLE_METRICS = {
    wN: 0.2,
    aspect: 1.0,
    tint: [1, 0.8, 0.5, 1],
    textureKey: 'animPlate02',
    atlas: { columns: 4, totalFrames: 16 },
  };

  const INTERACT_BASE_FRAMES = [12];
  const INTERACT_PLAY_FRAMES = makeFrames(12, 15);

  const BARRIER_METRICS = {
    wN: 0.22,
    hitboxWN: 0.18,
    aspect: 1.0,
    tint: [1, 1, 1, 1],
    textureKey: 'barrier',
    atlas: null,
  };

  const BOOST_METRICS = {
    wN: 0.18,
    aspect: 1.0,
    tint: [1, 1, 1, 1],
    textureKey: 'boost',
    atlas: null,
  };

  const BEHAVIOR_PRESETS = Object.freeze({
    staticProp: { type: 'static', collision: 'ghost', interaction: 'static' },
    animatedProp: { type: 'animated', collision: 'ghost', interaction: 'static' },
    pickup: { type: 'trigger', collision: 'ghost', interaction: 'toggle' },
    solidObstacle: { type: 'solid', collision: 'solid', interaction: 'static' },
    interactable: { type: 'solid', collision: 'push', interaction: 'playAnim' },
  });

  const CATALOG_SOURCE = [
    {
      spriteId: 'tree_forest',
      visual: TREE_ATLAS_METRICS,
      atlas: TREE_ATLAS_METRICS.atlas,
      assets: makeAtlasFrameAssets('tree', TREE_ATLAS_FRAMES),
      animation: null,
      behavior: 'staticProp',
    },
    {
      spriteId: 'sign_spinner',
      visual: ANIM_PLATE_METRICS,
      atlas: ANIM_PLATE_METRICS.atlas,
      assets: [
        { type: 'atlas', key: 'animPlate01', frames: SIGN_ANIM_FRAMES.slice() },
      ],
      animation: {
        baseClip: { frames: SIGN_ANIM_FRAMES.slice(), playback: 'loop' },
        interactClip: null,
        frameDuration: 0.1,
      },
      behavior: 'animatedProp',
    },
    {
      spriteId: 'pickup_boost',
      visual: PICKUP_METRICS,
      atlas: PICKUP_METRICS.atlas,
      assets: [
        { type: 'atlas', key: 'animPlate01', frames: PICKUP_FRAMES.slice() },
      ],
      animation: {
        baseClip: { frames: PICKUP_FRAMES.slice(), playback: 'loop' },
        interactClip: null,
        frameDuration: 0.09,
      },
      behavior: 'pickup',
    },
    {
      spriteId: 'barrier_block',
      visual: BARRIER_METRICS,
      atlas: null,
      assets: [
        { type: 'texture', key: 'barrier', frames: [] },
      ],
      animation: null,
      behavior: 'solidObstacle',
    },
    {
      spriteId: 'boost_pad',
      visual: BOOST_METRICS,
      atlas: null,
      assets: [
        { type: 'texture', key: 'boost', frames: [] },
      ],
      animation: null,
      behavior: 'staticProp',
    },
    {
      spriteId: 'billboard_interact',
      visual: INTERACTABLE_METRICS,
      atlas: INTERACTABLE_METRICS.atlas,
      assets: [
        { type: 'atlas', key: 'animPlate02', frames: INTERACT_PLAY_FRAMES.slice() },
      ],
      animation: {
        baseClip: { frames: INTERACT_BASE_FRAMES.slice(), playback: 'none' },
        interactClip: { frames: INTERACT_PLAY_FRAMES.slice(), playback: 'once' },
        frameDuration: 0.09,
      },
      behavior: 'interactable',
    },
  ];

  const CATALOG_MAP = new Map();
  for (const entry of CATALOG_SOURCE) {
    const rawVisual = entry.visual || entry.metrics || {};
    const rawAtlas = entry.atlas || rawVisual.atlas || null;
    const atlas = rawAtlas ? Object.freeze({
      columns: rawAtlas.columns,
      totalFrames: rawAtlas.totalFrames,
    }) : null;
    const visual = Object.freeze({
      ...METRIC_FALLBACK,
      ...rawVisual,
      tint: Array.isArray(rawVisual.tint) ? Object.freeze(rawVisual.tint.slice()) : Object.freeze(METRIC_FALLBACK.tint.slice()),
      atlas,
    });

    const assets = Array.isArray(entry.assets)
      ? entry.assets.map((asset) => Object.freeze({
        type: asset.type || 'texture',
        key: asset.key || '',
        frames: Object.freeze(sanitizeFrames(asset.frames, atlas ? atlas.totalFrames : null)),
      }))
      : [];

    const behaviorPreset = (typeof entry.behavior === 'string' && BEHAVIOR_PRESETS[entry.behavior])
      ? BEHAVIOR_PRESETS[entry.behavior]
      : null;
    const behavior = Object.freeze({
      type: (behaviorPreset && behaviorPreset.type) || entry.type || (entry.behavior && entry.behavior.type) || 'static',
      collision: (behaviorPreset && behaviorPreset.collision) || entry.collision || (entry.behavior && entry.behavior.collision) || 'ghost',
      interaction: (behaviorPreset && behaviorPreset.interaction) || entry.interaction || (entry.behavior && entry.behavior.interaction) || 'static',
    });

    const animation = entry.animation || {
      baseClip: entry.baseClip || null,
      interactClip: entry.interactClip || null,
      frameDuration: entry.frameDuration,
    };
    const frozen = Object.freeze({
      spriteId: entry.spriteId,
      visual,
      atlas,
      assets,
      behavior,
      animation: animation ? Object.freeze({
        baseClip: normalizeClip(animation.baseClip, atlas ? atlas.totalFrames : null),
        interactClip: normalizeClip(animation.interactClip, atlas ? atlas.totalFrames : null),
        frameDuration: animation.frameDuration,
      }) : Object.freeze({ baseClip: normalizeClip(null), interactClip: normalizeClip(null), frameDuration: null }),
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
    return entry ? entry.visual : METRIC_FALLBACK;
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
