import { World } from './world.js';
import { drawCliff, drawGrass, drawShoulderCliff } from './cliffs.js';

function project(worldPoint, camera) {
  const transZ = worldPoint.z - camera.z;
  if (transZ === 0) return null;
  const scale = World.cameraDepth / transZ;
  const x = (World.width / 2) + scale * (worldPoint.x - camera.x);
  const y = (World.height / 2) - scale * (worldPoint.y - camera.y);
  const w = scale * (World.roadWidth / 2);
  return {
    screen: { x, y, w, scale },
  };
}

function drawQuad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function drawRoad(ctx, p1, p2) {
  const r1 = p1.screen.w;
  const r2 = p2.screen.w;
  const l1 = r1 / World.lanes;
  const l2 = r2 / World.lanes;

  drawQuad(ctx, 0, p2.screen.y, World.width, p2.screen.y, World.width, p1.screen.y, 0, p1.screen.y, '#0e1b21');
  drawShoulderCliff(ctx, p1, p2, true);
  drawShoulderCliff(ctx, p1, p2, false);

  drawQuad(
    ctx,
    p1.screen.x - r1 * 1.1,
    p1.screen.y,
    p2.screen.x - r2 * 1.1,
    p2.screen.y,
    p2.screen.x - r2,
    p2.screen.y,
    p1.screen.x - r1,
    p1.screen.y,
    '#a56a43',
  );

  drawQuad(
    ctx,
    p1.screen.x + r1,
    p1.screen.y,
    p2.screen.x + r2,
    p2.screen.y,
    p2.screen.x + r2 * 1.1,
    p2.screen.y,
    p1.screen.x + r1 * 1.1,
    p1.screen.y,
    '#a56a43',
  );

  drawQuad(
    ctx,
    p1.screen.x - r1,
    p1.screen.y,
    p2.screen.x - r2,
    p2.screen.y,
    p2.screen.x + r2,
    p2.screen.y,
    p1.screen.x + r1,
    p1.screen.y,
    '#1b2f38',
  );

  for (let lane = 1; lane < World.lanes; lane += 1) {
    const laneW1 = lane * l1 - l1 * 0.5;
    const laneW2 = lane * l2 - l2 * 0.5;
    drawQuad(
      ctx,
      p1.screen.x - r1 + laneW1,
      p1.screen.y,
      p2.screen.x - r2 + laneW2,
      p2.screen.y,
      p2.screen.x - r2 + laneW2 + l2 * 0.1,
      p2.screen.y,
      p1.screen.x - r1 + laneW1 + l1 * 0.1,
      p1.screen.y,
      '#cfd5d8',
    );
  }
}

export function renderScene(ctx, state, hud) {
  ctx.clearRect(0, 0, World.width, World.height);
  ctx.fillStyle = '#0e151a';
  ctx.fillRect(0, 0, World.width, World.height / 2);
  ctx.fillStyle = '#0b0f12';
  ctx.fillRect(0, World.height / 2, World.width, World.height / 2);

  const baseSegmentIndex = Math.floor(state.position / World.segmentLength) % state.segments.length;
  const basePercent = (state.position % World.segmentLength) / World.segmentLength;
  const camera = {
    x: state.playerX * (World.roadWidth / 2),
    y: World.cameraHeight,
    z: state.position - World.playerZ,
  };

  let maxY = World.height;
  let x = 0;
  let dx = (state.segments[baseSegmentIndex]?.curve || 0) * basePercent;
  const segmentCount = state.segments.length;
  const trackLength = segmentCount * World.segmentLength;

  for (let n = 0; n < World.drawDistance; n += 1) {
    const segIndex = (baseSegmentIndex + n) % segmentCount;
    const segment = state.segments[segIndex];
    const nextSeg = state.segments[(segIndex + 1) % segmentCount];
    const looped = segIndex < baseSegmentIndex ? trackLength : 0;
    const z1 = segment.p1.world.z + looped;
    const z2 = nextSeg.p1.world.z + looped;

    const p1 = project({ x, y: 0, z: z1 }, camera);
    x += dx;
    dx += segment.curve;
    const p2 = project({ x, y: 0, z: z2 }, camera);

    if (!p1 || !p2 || p1.screen.y >= maxY || p2.screen.y >= maxY) {
      continue;
    }

    const yTop = p2.screen.y;
    const yBottom = p1.screen.y;
    drawGrass(ctx, World.width, yTop, yBottom);
    drawCliff(ctx, p1, p2, true, segment.cliffLeft);
    drawCliff(ctx, p1, p2, false, segment.cliffRight);
    drawRoad(ctx, p1, p2);
    maxY = p2.screen.y;
  }

  const spriteY = World.height - 80;
  const spriteX = World.width / 2 + state.playerX * (World.width * 0.2);
  ctx.fillStyle = '#e7f1f2';
  ctx.beginPath();
  ctx.moveTo(spriteX, spriteY - 26);
  ctx.lineTo(spriteX - 14, spriteY + 16);
  ctx.lineTo(spriteX + 14, spriteY + 16);
  ctx.closePath();
  ctx.fill();

  const speedKph = Math.round(state.speed * 0.06);
  if (hud) {
    hud.textContent = `Speed ${speedKph} kph · Distance ${(state.distance / 1000).toFixed(2)} km`;
  }
}
