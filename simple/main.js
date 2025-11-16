import { World, clamp, createState } from './world.js';
import { createInput } from './input.js';
import { buildTrack } from './track.js';
import { renderScene } from './render.js';

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const hudText = document.getElementById('hudText');

const state = createState();
state.segments = buildTrack();
state.trackLength = state.segments.length * World.segmentLength;

const input = createInput();
addEventListener('keydown', input.handlers.keydown, false);
addEventListener('keyup', input.handlers.keyup, false);

let lastTime = performance.now();

function update(dt) {
  const accel = input.state.accel ? World.accel * dt : 0;
  const brake = input.state.brake ? World.brake * dt : 0;
  const natural = World.decel * dt;

  state.speed = clamp(state.speed + accel - brake - natural, 0, World.maxSpeed);

  const turn = (input.state.left ? -1 : 0) + (input.state.right ? 1 : 0);
  const turnScale = state.speed / World.maxSpeed;
  state.playerX = clamp(state.playerX + turn * World.turnSpeed * turnScale * dt, -World.offRoadLimit, World.offRoadLimit);

  const distance = state.speed * dt;
  state.position = (state.position + distance) % state.trackLength;
  state.distance += distance;
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  renderScene(ctx, state, hudText);
  requestAnimationFrame(frame);
}

renderScene(ctx, state, hudText);
requestAnimationFrame(frame);
