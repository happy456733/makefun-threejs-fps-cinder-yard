// Keyboard, mouse and pointer lock. Keys are a held set; pressed is the edge set for
// one-shot actions (reload, buy, throw) that main.js drains once per frame. Nothing here
// knows what a key does — it only reports it.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, pressed, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0 };

  function setKey(event, down) {
    if (event.code === 'Space' || event.code === 'Tab') event.preventDefault();
    if (down) {
      if (!event.repeat) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
    state.firing = false;
    state.aiming = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      // Clamp each frame's look: no human flick moves 300 px in one frame, and a
      // wild synthetic delta must never spin the view.
      const look = {
        x: Math.max(-300, Math.min(300, state.lookX)),
        y: Math.max(-300, Math.min(300, state.lookY)),
      };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
    wasPressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    drainPressed() {
      pressed.clear();
    },
  };
}
