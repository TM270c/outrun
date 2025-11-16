import {
  roadWidth,
  cameraHeight,
  cameraDepth,
  cameraDistance,
  guardrailWidth,
  colors,
  boostLaneWidth,
  cliffHorizontalOffset,
  curveScale,
} from '../core/config.js';
import { clamp, lerp } from '../core/math.js';
import { getCliffProfile } from '../world/track.js';

function createProgram(gl, vertexSrc, fragmentSrc) {
  const compile = (type, src) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  };

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSrc));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}

function createRenderer(gl, segments, trackLength) {
  const vertexSrc = `
    attribute vec2 position;
    uniform vec2 resolution;
    void main() {
      vec2 zeroToOne = position / resolution;
      vec2 clip = zeroToOne * 2.0 - 1.0;
      gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
    }
  `;

  const fragmentSrc = `
    precision mediump float;
    uniform vec4 tint;
    void main() {
      gl_FragColor = tint;
    }
  `;

  const program = createProgram(gl, vertexSrc, fragmentSrc);
  const positionLocation = gl.getAttribLocation(program, 'position');
  const resolutionLocation = gl.getUniformLocation(program, 'resolution');
  const tintLocation = gl.getUniformLocation(program, 'tint');
  const buffer = gl.createBuffer();

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const curveOffsets = [];
  let curveTotal = 0;
  segments.forEach((segment, idx) => {
    curveOffsets[idx] = curveTotal;
    curveTotal += segment.curve * curveScale;
  });
  const curveLoopLength = curveTotal;

  const project = (x, y, z, camera, viewport) => {
    const relZ = z - camera.z;
    if (relZ <= 0.01) {
      return null;
    }
    const scale = camera.depth / relZ;
    const sx = viewport.width * 0.5 + x * scale * viewport.width * 0.5;
    const sy = viewport.height * 0.5 - (y - camera.y) * scale * viewport.height * 0.5;
    return { x: sx, y: sy, scale };
  };

  const drawQuad = (points, color, viewport) => {
    gl.useProgram(program);
    gl.uniform2f(resolutionLocation, viewport.width, viewport.height);
    gl.uniform4fv(tintLocation, color);

    const data = new Float32Array([
      points[0].x, points[0].y,
      points[1].x, points[1].y,
      points[2].x, points[2].y,
      points[0].x, points[0].y,
      points[2].x, points[2].y,
      points[3].x, points[3].y
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const interpolateCliffOffset = (profile, localIndex) => {
    if (!profile) return 0;
    const spanIndex = clamp(localIndex, 0, profile.lengthSegments - 1);
    const t = profile.lengthSegments <= 1 ? 0 : spanIndex / (profile.lengthSegments - 1);
    const pos = t * (profile.offsets.length - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(profile.offsets.length - 1, i0 + 1);
    const f = pos - i0;
    return lerp(profile.offsets[i0], profile.offsets[i1], f);
  };

  const render = (car, currentSegment) => {
    const viewport = { width: gl.canvas.width, height: gl.canvas.height };
    gl.viewport(0, 0, viewport.width, viewport.height);
    gl.clearColor(...colors.background);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const baseIndex = currentSegment.index;
    const baseOffset = curveOffsets[baseIndex];
    const camera = {
      x: 0,
      y: cameraHeight,
      z: car.s - cameraDistance,
      depth: cameraDepth
    };

    const drawCount = Math.min(segments.length, 160);
    for (let n = 0; n < drawCount; n += 1) {
      const segIndex = (baseIndex + n) % segments.length;
      const seg = segments[segIndex];
      const wrap = segIndex < baseIndex ? trackLength : 0;
      const zStart = seg.zStart + wrap;
      const zEnd = seg.zEnd + wrap;
      if (zStart <= camera.z) continue;

      let lateralOffset = curveOffsets[segIndex] - baseOffset;
      if (segIndex < baseIndex) {
        lateralOffset += curveLoopLength;
      }

      const nextIndex = (segIndex + 1) % segments.length;
      const nextSeg = segments[nextIndex];

      const centerX0 = lateralOffset;
      const centerX1 = curveOffsets[nextIndex] - baseOffset + (nextIndex < baseIndex ? curveLoopLength : 0);
      const y0 = seg.centerY;
      const y1 = nextSeg.centerY;

      const halfWidth = roadWidth * 0.5;
      const p1 = project(centerX0 - halfWidth, y0, zStart, camera, viewport);
      const p2 = project(centerX0 + halfWidth, y0, zStart, camera, viewport);
      const p3 = project(centerX1 + halfWidth, y1, zEnd, camera, viewport);
      const p4 = project(centerX1 - halfWidth, y1, zEnd, camera, viewport);
      if (!p1 || !p2 || !p3 || !p4) continue;

      // road
      drawQuad([p1, p2, p3, p4], colors.road, viewport);

      // boost strip overlay
      if (seg.inBoostZone && seg.boostType !== 'none') {
        const lane = seg.boostType === 'drive' ? colors.boostDrive : colors.boostJump;
        const laneWidth = boostLaneWidth * halfWidth;
        const b1 = project(centerX0 - laneWidth, y0 + 0.01, zStart, camera, viewport);
        const b2 = project(centerX0 + laneWidth, y0 + 0.01, zStart, camera, viewport);
        const b3 = project(centerX1 + laneWidth, y1 + 0.01, zEnd, camera, viewport);
        const b4 = project(centerX1 - laneWidth, y1 + 0.01, zEnd, camera, viewport);
        if (b1 && b2 && b3 && b4) {
          drawQuad([b1, b2, b3, b4], lane, viewport);
        }
      }

      const guardLeft = seg.guardrails === 'left' || seg.guardrails === 'both';
      const guardRight = seg.guardrails === 'right' || seg.guardrails === 'both';
      const guardColor = colors.guardrail;
      const railWidth = guardrailWidth;

      if (guardLeft) {
        const g1 = project(centerX0 - halfWidth - railWidth, y0, zStart, camera, viewport);
        const g2 = project(centerX0 - halfWidth, y0, zStart, camera, viewport);
        const g3 = project(centerX1 - halfWidth, y1, zEnd, camera, viewport);
        const g4 = project(centerX1 - halfWidth - railWidth, y1, zEnd, camera, viewport);
        if (g1 && g2 && g3 && g4) {
          drawQuad([g1, g2, g3, g4], guardColor, viewport);
        }
      }

      if (guardRight) {
        const g1 = project(centerX0 + halfWidth, y0, zStart, camera, viewport);
        const g2 = project(centerX0 + halfWidth + railWidth, y0, zStart, camera, viewport);
        const g3 = project(centerX1 + halfWidth + railWidth, y1, zEnd, camera, viewport);
        const g4 = project(centerX1 + halfWidth, y1, zEnd, camera, viewport);
        if (g1 && g2 && g3 && g4) {
          drawQuad([g1, g2, g3, g4], guardColor, viewport);
        }
      }

      const leftCliffProfile = getCliffProfile(seg.cliffLeftId);
      const rightCliffProfile = getCliffProfile(seg.cliffRightId);
      const dyLeft0 = interpolateCliffOffset(leftCliffProfile, seg.localIndex);
      const dyLeft1 = interpolateCliffOffset(leftCliffProfile, nextSeg.localIndex);
      const dyRight0 = interpolateCliffOffset(rightCliffProfile, seg.localIndex);
      const dyRight1 = interpolateCliffOffset(rightCliffProfile, nextSeg.localIndex);

      if (leftCliffProfile) {
        const cx0 = centerX0 - halfWidth - cliffHorizontalOffset;
        const cx1 = centerX1 - halfWidth - cliffHorizontalOffset;
        const c1 = project(cx0, y0 + dyLeft0, zStart, camera, viewport);
        const c2 = project(cx0, y0, zStart, camera, viewport);
        const c3 = project(cx1, y1, zEnd, camera, viewport);
        const c4 = project(cx1, y1 + dyLeft1, zEnd, camera, viewport);
        if (c1 && c2 && c3 && c4) {
          drawQuad([c1, c2, c3, c4], colors.cliff, viewport);
        }
      }

      if (rightCliffProfile) {
        const cx0 = centerX0 + halfWidth + cliffHorizontalOffset;
        const cx1 = centerX1 + halfWidth + cliffHorizontalOffset;
        const c1 = project(cx0, y0, zStart, camera, viewport);
        const c2 = project(cx0, y0 + dyRight0, zStart, camera, viewport);
        const c3 = project(cx1, y1 + dyRight1, zEnd, camera, viewport);
        const c4 = project(cx1, y1, zEnd, camera, viewport);
        if (c1 && c2 && c3 && c4) {
          drawQuad([c1, c2, c3, c4], colors.cliff, viewport);
        }
      }
    }

    const carHalfWidth = roadWidth * 0.1;
    const carHeight = roadWidth * 0.22;
    const carX = car.u * (roadWidth * 0.5);
    const carZ = car.s + cameraDistance * 0.6;
    const carY = currentSegment.centerY + 0.05;
    const c1 = project(carX - carHalfWidth, carY, carZ, camera, viewport);
    const c2 = project(carX + carHalfWidth, carY, carZ, camera, viewport);
    const c3 = project(carX + carHalfWidth, carY + carHeight, carZ, camera, viewport);
    const c4 = project(carX - carHalfWidth, carY + carHeight, carZ, camera, viewport);
    if (c1 && c2 && c3 && c4) {
      drawQuad([c1, c2, c3, c4], colors.car, viewport);
    }
  };

  return { render };
}

export { createRenderer };
