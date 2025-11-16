import { buildSegments } from './world/track.js';
import { createCarState, stepCar, findSegment } from './gameplay/driving.js';
import { createRenderer } from './render/scene.js';
import { colors } from './core/config.js';

const inputState = { throttle: false, brake: false, left: false, right: false, jump: false };
const viewport = { width: 0, height: 0, dpr: 1 };

function setupInput(element) {
  const down = new Set();
  const handle = (pressed, key) => {
    if (pressed) down.add(key); else down.delete(key);
    inputState.throttle = down.has('ArrowUp') || down.has('KeyW');
    inputState.brake = down.has('ArrowDown') || down.has('KeyS');
    inputState.left = down.has('ArrowLeft') || down.has('KeyA');
    inputState.right = down.has('ArrowRight') || down.has('KeyD');
    inputState.jump = down.has('Space');
  };

  window.addEventListener('keydown', (e) => handle(true, e.code));
  window.addEventListener('keyup', (e) => handle(false, e.code));
  element.addEventListener('blur', () => {
    down.clear();
    inputState.throttle = false;
    inputState.brake = false;
    inputState.left = false;
    inputState.right = false;
    inputState.jump = false;
  });
}

function applyPageStyle() {
  const background = `rgba(${colors.background[0] * 255}, ${colors.background[1] * 255}, ${colors.background[2] * 255}, 1)`;
  document.documentElement.style.height = '100%';
  document.body.style.height = '100%';
  document.body.style.margin = '0';
  document.body.style.background = background;
  document.body.style.overflow = 'hidden';
}

function createCanvas() {
  applyPageStyle();
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  document.body.appendChild(canvas);
  return canvas;
}

function resizeCanvas(canvas) {
  viewport.dpr = window.devicePixelRatio || 1;
  const width = Math.floor(window.innerWidth);
  const height = Math.floor(window.innerHeight);
  viewport.width = width * viewport.dpr;
  viewport.height = height * viewport.dpr;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function run() {
  const canvas = createCanvas();
  const gl = canvas.getContext('webgl');
  if (!gl) {
    throw new Error('WebGL not supported');
  }

  resizeCanvas(canvas);
  window.addEventListener('resize', () => resizeCanvas(canvas));
  setupInput(canvas);

  const { segments, length: trackLength } = buildSegments();
  const car = createCarState();
  const renderer = createRenderer(gl, segments, trackLength);

  let lastTime = performance.now();

  const frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    stepCar(car, inputState, segments, trackLength, dt);
    const currentSegment = findSegment(segments, car.s);

    renderer.render(car, currentSegment);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

run();
