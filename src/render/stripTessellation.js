export const defaultOverlap = { x: 0.75, y: 0.75 };

export function padQuad(quad, { padLeft = 0, padRight = 0, padTop = 0, padBottom = 0 } = {}) {
  const xs = [quad.x1, quad.x2, quad.x3, quad.x4];
  const ys = [quad.y1, quad.y2, quad.y3, quad.y4];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const adjustX = (x) => {
    const dMin = Math.abs(x - minX);
    const dMax = Math.abs(x - maxX);
    return x + (dMin <= dMax ? -padLeft : padRight);
  };
  const adjustY = (y) => {
    const dMin = Math.abs(y - minY);
    const dMax = Math.abs(y - maxY);
    return y + (dMin <= dMax ? -padTop : padBottom);
  };

  return {
    x1: adjustX(quad.x1), y1: adjustY(quad.y1),
    x2: adjustX(quad.x2), y2: adjustY(quad.y2),
    x3: adjustX(quad.x3), y3: adjustY(quad.y3),
    x4: adjustX(quad.x4), y4: adjustY(quad.y4),
  };
}

export function tessellateStrip({
  nearLeft,
  nearRight,
  farLeft,
  farRight,
  yNear,
  yFar,
  rows,
  cols,
  overlap = defaultOverlap,
  vStart = 0,
  vEnd = 1,
  fogStart = 0,
  fogEnd = 0,
}, cell) {
  const rowCount = Math.max(1, rows | 0);
  const colCount = Math.max(1, cols | 0);

  for (let row = 0; row < rowCount; row++) {
    const t0 = row / rowCount;
    const t1 = (row + 1) / rowCount;
    const y0 = yNear + (yFar - yNear) * t0;
    const y1 = yNear + (yFar - yNear) * t1;
    const leftNear = nearLeft + (farLeft - nearLeft) * t0;
    const rightNear = nearRight + (farRight - nearRight) * t0;
    const leftFar = nearLeft + (farLeft - nearLeft) * t1;
    const rightFar = nearRight + (farRight - nearRight) * t1;
    const v0 = vStart + (vEnd - vStart) * t0;
    const v1 = vStart + (vEnd - vStart) * t1;
    const fog0 = fogStart + (fogEnd - fogStart) * t0;
    const fog1 = fogStart + (fogEnd - fogStart) * t1;

    for (let col = 0; col < colCount; col++) {
      const u0 = col / colCount;
      const u1 = (col + 1) / colCount;
      const x1 = leftNear + (rightNear - leftNear) * u0;
      const x2 = leftNear + (rightNear - leftNear) * u1;
      const x3 = leftFar + (rightFar - leftFar) * u1;
      const x4 = leftFar + (rightFar - leftFar) * u0;
      const quadBase = { x1, y1: y0, x2, y2: y0, x3, y3: y1, x4, y4: y1 };
      const padLeft = col === 0 ? overlap.x : overlap.x * 0.5;
      const padRight = col === colCount - 1 ? overlap.x : overlap.x * 0.5;
      const quad = padQuad(quadBase, {
        padLeft,
        padRight,
        padTop: overlap.y,
        padBottom: overlap.y,
      });
      const uv = { u0, u1, v0, v1 };
      const fog = { a: fog0, b: fog1 };
      cell({ quad, uv, fog, row, col, rowCount, colCount, t0, t1 });
    }
  }
}
