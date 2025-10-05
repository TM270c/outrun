const dom = {
  c3D: document.getElementById('outrun'),
  cSide: document.getElementById('sideOverlay'),
  cHUD: document.getElementById('hudMatte'),
};

const glr = new RenderGL.GLRenderer(dom.c3D);

await (async function loadAssets() {
  await Promise.all(
    Object.entries(World.assets.manifest).map(async ([k, url]) => {
      const tex = await glr.loadTexture(url);
      World.assets.textures[k] = tex;
    }),
  );
})();

await World.buildTrackFromCSV('tracks/test-track.csv').catch(() => {
  /* fallback like original */
});
await World.buildCliffsFromCSV_Lite('tracks/cliffs.csv').catch(() => {});
World.enforceCliffWrap(1);

const N = World.data.segments.length;
const roadTexZones = [];
const railTexZones = [];
const cliffTexZones = [];
World.pushZone(roadTexZones, 0, N - 1, 20);
World.pushZone(railTexZones, 0, N - 1, 20);
World.pushZone(cliffTexZones, 0, N - 1, 3);
World.data.roadTexZones = roadTexZones;
World.data.railTexZones = railTexZones;
World.data.cliffTexZones = cliffTexZones;

Gameplay.spawnProps();
Gameplay.spawnCars();
Gameplay.spawnPickups();
Gameplay.resetPlayerState({
  s: Config.TUNE_TRACK.camBackSegments * Config.TUNE_TRACK.segmentLength,
  playerN: 0,
  timers: { t: 0, nextHopTime: 0, boostFlashTimer: 0 },
});

addEventListener('keydown', Gameplay.keydownHandler);
addEventListener('keyup', Gameplay.keyupHandler);

Renderer.attach(glr, dom);
Renderer.frame((dt) => {
  Gameplay.step(dt);
});
