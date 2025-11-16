import { buildSegments } from './world/track.js';
import { createCarState, stepCar, findSegment } from './gameplay/driving.js';
import { createRenderer } from './render/scene.js';
import { colors } from './core/config.js';

const inputState = { throttle: false, brake: false, left: false, right: false, jump: false };

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

function createCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.style.margin = '0';
  document.body.style.background = `rgba(${colors.background[0] * 255}, ${colors.background[1] * 255}, ${colors.background[2] * 255}, 1)`;
  document.body.appendChild(canvas);
  return canvas;
}

function run() {
  const canvas = createCanvas();
  const gl = canvas.getContext('webgl');
  if (!gl) {
    throw new Error('WebGL not supported');
  }

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

    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    renderer.render(car, currentSegment);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

run();
