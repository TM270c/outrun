const dom = {
  canvas: document.getElementById('outrun'),
  overlay: document.getElementById('sideOverlay'),
  hud: document.getElementById('hudMatte'),
};

const glr = new RenderGL.GLRenderer(dom.canvas);

async function loadAssets() {
  await Promise.all(
    Object.entries(World.assets.manifest).map(async ([k, url]) => {
      const tex = await glr.loadTexture(url);
      World.assets.textures[k] = tex;
    }),
  );
}

async function resetScene() {
  await World.buildTrackFromCSV('tracks/test-track.csv').catch((err) => {
    console.error('Track CSV load failed', err);
    throw err;
  });
  await World.buildCliffsFromCSV_Lite('tracks/cliffs.csv').catch((err) => {
    console.warn('Cliff CSV load failed; continuing with defaults', err);
  });
  World.enforceCliffWrap(1);

  const segCount = World.data.segments.length;
  const roadTexZones = [];
  const railTexZones = [];
  const cliffTexZones = [];
  if (segCount > 0) {
    World.pushZone(roadTexZones, 0, segCount - 1, 20);
    World.pushZone(railTexZones, 0, segCount - 1, 20);
    World.pushZone(cliffTexZones, 0, segCount - 1, 3);
  }
  World.data.roadTexZones = roadTexZones;
  World.data.railTexZones = railTexZones;
  World.data.cliffTexZones = cliffTexZones;

  Gameplay.spawnProps();
  Gameplay.spawnCars();
  Gameplay.spawnPickups();
  Gameplay.resetPlayerState({
    s: Config.camera.backSegments * Config.track.segmentSize,
    playerN: 0,
    timers: { t: 0, nextHopTime: 0, boostFlashTimer: 0 },
  });
}

await loadAssets();
await resetScene().catch((err) => {
  console.error('Initial scene reset failed', err);
});

const callbacks = Gameplay.state.callbacks;
callbacks.onQueueReset = () => {
  Renderer.matte.startReset();
};
callbacks.onQueueRespawn = (pending) => {
  if (!pending || typeof pending.targetS !== 'number') {
    Renderer.matte.startRespawn(Gameplay.state.phys.s, 0);
    return;
  }
  const targetN = typeof pending.targetN === 'number' ? pending.targetN : 0;
  Renderer.matte.startRespawn(pending.targetS, targetN);
};
callbacks.onResetScene = () => {
  resetScene().catch((err) => {
    console.error('Scene reset failed', err);
  });
};

addEventListener('keydown', Gameplay.keydownHandler);
addEventListener('keyup', Gameplay.keyupHandler);

Renderer.attach(glr, dom);
Renderer.frame((dt) => {
  Gameplay.step(dt);
});
