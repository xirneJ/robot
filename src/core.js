export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const normAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function solveLegIK(anchor, target, metrics) {
  const { l1 = .35, l2 = .9, l3 = 1.1 } = metrics || {};
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const dz = target.z - anchor.z;
  const yaw = Math.atan2(-dz, dx);
  const radial = Math.max(.04, Math.hypot(dx, dz) - l1);
  const rawDistance = Math.hypot(radial, dy);
  const minDistance = Math.abs(l2 - l3) + .025;
  const maxDistance = l2 + l3 - .025;
  const distance = clamp(rawDistance, minDistance, maxDistance);
  const cosKnee = clamp((l2 * l2 + l3 * l3 - distance * distance) / (2 * l2 * l3), -1, 1);
  const cosHip = clamp((l2 * l2 + distance * distance - l3 * l3) / (2 * l2 * distance), -1, 1);
  const knee = Math.PI - Math.acos(cosKnee);
  const hip = Math.atan2(dy, radial) - Math.acos(cosHip);
  return {
    yaw,
    hip: clamp(hip, -Math.PI * .72, Math.PI * .32),
    knee: clamp(knee, .08, Math.PI * .92),
    reachable: rawDistance >= minDistance && rawDistance <= maxDistance
  };
}

export function getGaitOffsets(mode = 'tripod') {
  return mode === 'wave'
    ? [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]
    : [0, .5, 0, .5, 0, .5];
}

export function getSwingDuration(mode = 'tripod') {
  return mode === 'wave' ? .16 : .34;
}

export function getSupportMask(phase, mode = 'tripod') {
  const offsets = getGaitOffsets(mode);
  const swingDuration = getSwingDuration(mode);
  return offsets.map((offset) => ((phase + offset) % 1 + 1) % 1 >= swingDuration);
}

export function fuseEvidence({ heat = 0, presence = 0, audio = 0 }) {
  const values = [heat, presence, audio];
  const hits = values.filter((v) => v >= .56).length;
  const confidence = clamp(.35 * heat + .4 * presence + .25 * audio + (hits >= 2 ? .08 : 0), 0, .99);
  return { hits, confidence, confirmed: hits >= 2 };
}

export function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function stepVelocity(current, target, rate, dt) {
  return current + clamp(target - current, -rate * dt, rate * dt);
}

export function angleDamp(current, target, dt, rate = 5) {
  return damp(current, target, rate, dt);
}

export const ROBOT_SCALE = .22;
export const ROBOT_RADIUS = .62;
export const ROBOT_MAX_SPEED = .95;
