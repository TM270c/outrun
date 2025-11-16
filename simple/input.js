export function createInput() {
  const state = {
    left: false,
    right: false,
    accel: false,
    brake: false,
  };

  function setKey(e, pressed) {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        state.left = pressed;
        break;
      case 'ArrowRight':
      case 'KeyD':
        state.right = pressed;
        break;
      case 'ArrowUp':
      case 'KeyW':
        state.accel = pressed;
        break;
      case 'ArrowDown':
      case 'KeyS':
        state.brake = pressed;
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  const handlers = {
    keydown: (e) => setKey(e, true),
    keyup: (e) => setKey(e, false),
  };

  return { state, handlers };
}
