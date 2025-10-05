const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

global.window = {
  Config: { fog: { enabled: false, color: [0, 0, 0] } },
};

require('../src/gl/renderer.js');

const { GLRenderer } = window.RenderGL;

const makeRenderer = (width, height) => {
  const calls = [];
  const gl = {
    canvas: { width, height },
    viewport: () => {},
    clearColor: () => {},
    clear: () => {},
    uniform2f: (location, x, y) => {
      calls.push(['uniform2f', location, x, y]);
    },
    uniform1i: () => {},
    uniform3f: () => {},
  };

  const renderer = Object.create(GLRenderer.prototype);
  renderer.gl = gl;
  renderer.u_viewSize = Symbol('u_viewSize');
  renderer.u_pivot = Symbol('u_pivot');
  renderer.u_fogEnabled = Symbol('u_fogEnabled');
  renderer.u_fogColor = Symbol('u_fogColor');
  renderer._fogEnabled = null;
  renderer._fogColor = [NaN, NaN, NaN];
  renderer._canvasWidth = width;
  renderer._canvasHeight = height;

  return { renderer, calls, gl };
};

const { renderer, calls, gl } = makeRenderer(320, 240);

renderer.begin();

const firstViewUniformCalls = calls.filter((c) => c[0] === 'uniform2f' && c[1] === renderer.u_viewSize);
assert(firstViewUniformCalls.length === 0, 'Unexpected view size update when dimensions did not change');

calls.length = 0;
gl.canvas.width = 640;
gl.canvas.height = 360;

renderer.begin();

const updatedCalls = calls.filter((c) => c[0] === 'uniform2f' && c[1] === renderer.u_viewSize);
assert(updatedCalls.length === 1, 'View size uniform should update when the canvas resizes');
const [, , updatedWidth, updatedHeight] = updatedCalls[0];
assert(updatedWidth === 640 && updatedHeight === 360, 'View size uniform should match new canvas dimensions');
assert(renderer._canvasWidth === 640 && renderer._canvasHeight === 360, 'Cached canvas size should update after resize');

console.log('GLRenderer resize smoke test passed.');
