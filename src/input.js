import * as THREE from 'three';

export function createInput(canvas) {
  const keys = new Set();
  const actions = new Set();
  const state = {
    throttle: 0, turn: 0, boost: false, brake: false, scan: false,
    pointerLocked: false, dragging: false, rightDown: false, cameraYaw: 0, cameraPitchOffset: 0,
    zoom: 0, aimPoint: new THREE.Vector3(0, 1, -6), enabled: true
  };
  let lastX = 0; let lastY = 0;

  const edgeKeys = { KeyE: 'interact', KeyG: 'gait', KeyH: 'help', KeyM: 'mute', KeyF: 'auto', Tab: 'radar', Escape: 'escape' };
  const onKeyDown = (e) => {
    if (!state.enabled && e.code !== 'KeyH' && e.code !== 'KeyM') return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'Tab', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyG', 'KeyH', 'KeyM', 'Escape'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (!e.repeat && edgeKeys[e.code]) actions.add(edgeKeys[e.code]);
    if (!e.repeat && e.code === 'KeyR') actions.add('scanStart');
  };
  const onKeyUp = (e) => {
    keys.delete(e.code);
    if (e.code === 'KeyR') actions.add('scanEnd');
  };
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);

  const onPointerDown = (e) => {
    if (e.button === 2) {
      state.rightDown = true;
      state.dragging = true; lastX = e.clientX; lastY = e.clientY;
      return;
    }
    if (e.button === 0 && !state.pointerLocked) {
      state.dragging = true; lastX = e.clientX; lastY = e.clientY;
    }
  };
  const onPointerUp = (e) => {
    if (e.button === 2) state.rightDown = false;
    if (e.button === 2 || e.button === 0) state.dragging = false;
  };
  const onPointerMove = (e) => {
    if (!state.pointerLocked && !state.dragging) return;
    const dx = state.pointerLocked ? e.movementX : e.clientX - lastX;
    const dy = state.pointerLocked ? e.movementY : e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    state.cameraYaw -= dx * .0026;
    state.cameraPitchOffset = THREE.MathUtils.clamp(state.cameraPitchOffset + dy * .0018, -.24, .26);
  };
  const onWheel = (e) => {
    state.zoom = THREE.MathUtils.clamp(state.zoom + Math.sign(e.deltaY) * .45, -1.5, 2.2);
    e.preventDefault();
  };
  const onPointerLockChange = () => { state.pointerLocked = document.pointerLockElement === canvas; };
  const onContextMenu = (e) => e.preventDefault();

  canvas.addEventListener('pointerdown', onPointerDown);
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onPointerLockChange);

  return {
    state,
    getControls() {
      state.throttle = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      state.turn = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
      state.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
      state.brake = keys.has('Space');
      state.scan = keys.has('KeyR') || state.rightDown;
      return state;
    },
    consume(action) {
      if (!actions.has(action)) return false;
      actions.delete(action);
      return true;
    },
    requestLock() {
      if (!canvas.requestPointerLock) return;
      try {
        const request = canvas.requestPointerLock();
        if (request && typeof request.catch === 'function') request.catch(() => {});
      } catch {}
    },
    releaseLock() {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    setEnabled(value) { state.enabled = value; if (!value) { keys.clear(); state.throttle = 0; state.turn = 0; } },
    reset() {
      keys.clear(); actions.clear(); state.pointerLocked = false; state.dragging = false;
      state.cameraYaw = 0; state.cameraPitchOffset = 0; state.zoom = 0; state.rightDown = false;
    }
  };
}
