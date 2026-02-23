const dom = {
  canvas: document.getElementById('outrun'),
  overlay: document.getElementById('sideOverlay'),
  hud: document.getElementById('hudMatte'),
};

const glr = new RenderGL.GLRenderer(dom.canvas);
const App = window.App || null;

const roadTexZones = [];
const railTexZones = [];
const cliffTexZones = [];

World.data.roadTexZones = roadTexZones;
World.data.railTexZones = railTexZones;
World.data.cliffTexZones = cliffTexZones;

async function loadManifestTextures(manifest) {
  const entries = Object.entries(manifest || {});
  if (!entries.length) return;
  await Promise.all(entries.map(async ([key, url]) => {
    const resolvedUrl = (typeof World.resolveAssetUrl === 'function')
      ? World.resolveAssetUrl(url)
      : url;
    const tex = await glr.loadTexture(resolvedUrl);
    World.assets.textures[key] = tex;
  }));
}

async function loadAssets() {
  await loadManifestTextures(World.assets.manifest);
  if (globalThis.SpriteCatalog && typeof globalThis.SpriteCatalog.getTextureManifest === 'function') {
    const spriteManifest = globalThis.SpriteCatalog.getTextureManifest();
    await loadManifestTextures(spriteManifest);
  }
}

function setupCallbacks() {
  Gameplay.state.callbacks.onQueueReset = () => {
    Renderer.matte.startReset();
  };
  Gameplay.state.callbacks.onQueueRespawn = (respawn) => {
    if (!respawn) return;
    const { targetS, targetN = 0 } = respawn;
    Renderer.matte.startRespawn(targetS, targetN);
  };
  Gameplay.state.callbacks.onResetScene = () => {
    Gameplay.resetScene().catch((err) => console.error('Reset failed', err));
  };
  Gameplay.state.callbacks.onRaceFinish = (timeMs) => {
    if (App && typeof App.handleRaceFinish === 'function') {
      App.handleRaceFinish(timeMs);
    }
  };
  Gameplay.state.callbacks.onPickupCollected = () => {
    if (Renderer && typeof Renderer.triggerPickupAnimation === 'function') {
      Renderer.triggerPickupAnimation();
    }
  };
}

await loadAssets();

Renderer.attach(glr, dom);
if (App && typeof App.init === 'function') {
  App.init();
}
setupCallbacks();

await Gameplay.resetScene({
  track: 'tracks/select/select-track.csv',
  cliffs: 'tracks/select/select-cliffs.csv',
  placement: 'tracks/demo/demo-select.csv',
});
if (Renderer && Renderer.updateTrackTextures) {
  await Renderer.updateTrackTextures({
    road: 'tex/demo-road-seg.png',
    cliff: 'tex/demo-cliff.png',
    rail: 'tex/demo-guardrail.png',
    horizon: ['tex/demo-paralax-1.png', 'tex/demo-paralax-2.png', 'tex/demo-paralax-3.png'],
  });
}
Gameplay.setMenuMode(true);

const keydownHandler = (App && typeof App.handleKeyDown === 'function')
  ? App.handleKeyDown
  : Gameplay.keydownHandler;
const keyupHandler = (App && typeof App.handleKeyUp === 'function')
  ? App.handleKeyUp
  : Gameplay.keyupHandler;

addEventListener('keydown', keydownHandler);
addEventListener('keyup', keyupHandler);

Renderer.frame((dt) => {
  if (App && typeof App.step === 'function') {
    App.step(dt);
  } else {
    Gameplay.step(dt);
  }
});
