const dom = {
  canvas: document.getElementById('outrun'),
  overlay: document.getElementById('sideOverlay'),
  hud: document.getElementById('hudMatte'),
};

const glr = new RenderGL.GLRenderer(dom.canvas);

const roadTexZones = [];
const railTexZones = [];
const cliffTexZones = [];

World.data.roadTexZones = roadTexZones;
World.data.railTexZones = railTexZones;
World.data.cliffTexZones = cliffTexZones;

async function loadAssets() {
  await Promise.all(
    Object.entries(World.assets.manifest).map(async ([key, url]) => {
      const resolvedUrl = (typeof World.resolveAssetUrl === 'function')
        ? World.resolveAssetUrl(url)
        : url;
      const tex = await glr.loadTexture(resolvedUrl);
      World.assets.textures[key] = tex;
    }),
  );
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
}

await loadAssets();

Renderer.attach(glr, dom);
setupCallbacks();

await Gameplay.resetScene();

addEventListener('keydown', Gameplay.keydownHandler);
addEventListener('keyup', Gameplay.keyupHandler);

Renderer.frame((dt) => {
  Gameplay.step(dt);
});
