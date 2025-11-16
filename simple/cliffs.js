export function makeCliffColor(height) {
  if (height > 1000) return '#2e1f1b';
  if (height > 600) return '#2e241d';
  return '#2b2d25';
}

export function drawCliff(ctx, p1, p2, isLeft, height) {
  if (!height) return;
  const color = makeCliffColor(height);
  const width1 = p1.screen.w * 1.25;
  const width2 = p2.screen.w * 1.25;
  const wall = height * Math.min(p1.screen.scale, p2.screen.scale) * 0.02;

  const x1 = isLeft ? p1.screen.x - width1 : p1.screen.x + width1;
  const x2 = isLeft ? p2.screen.x - width2 : p2.screen.x + width2;
  const baseY1 = p1.screen.y;
  const baseY2 = p2.screen.y;
  const topY1 = baseY1 - wall;
  const topY2 = baseY2 - wall;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, baseY1);
  ctx.lineTo(x2, baseY2);
  ctx.lineTo(x2, topY2);
  ctx.lineTo(x1, topY1);
  ctx.closePath();
  ctx.fill();
}

export function drawShoulderCliff(ctx, p1, p2, isLeft) {
  const shoulderColor = '#0c1316';
  const width1 = p1.screen.w * 1.1;
  const width2 = p2.screen.w * 1.1;
  const x1 = isLeft ? p1.screen.x - width1 : p1.screen.x + width1;
  const x2 = isLeft ? p2.screen.x - width2 : p2.screen.x + width2;
  ctx.fillStyle = shoulderColor;
  ctx.beginPath();
  ctx.moveTo(isLeft ? 0 : p1.screen.x + (isLeft ? -1 : 1) * width1, p1.screen.y);
  ctx.lineTo(isLeft ? 0 : p2.screen.x + (isLeft ? -1 : 1) * width2, p2.screen.y);
  ctx.lineTo(x2, p2.screen.y);
  ctx.lineTo(x1, p1.screen.y);
  ctx.closePath();
  ctx.fill();
}

export function drawGrass(ctx, width, yTop, yBottom) {
  ctx.fillStyle = '#122016';
  ctx.fillRect(0, yTop, width, Math.max(0, yBottom - yTop));
}
