import { clamp, normAngle } from './core.js';

const BOUNDS = { minX: -27, maxX: 27, minZ: -50, maxZ: 36 };

function key(ix, iz) { return `${ix},${iz}`; }

export function nearestWalkable(point, world, radius = .62, cell = 1) {
  const baseX = Math.floor((point.x - BOUNDS.minX) / cell);
  const baseZ = Math.floor((point.z - BOUNDS.minZ) / cell);
  for (let ring = 0; ring <= 10; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const x = BOUNDS.minX + (baseX + dx + .5) * cell;
        const z = BOUNDS.minZ + (baseZ + dz + .5) * cell;
        if (world.canMove(x, z, radius)) return { x, z };
      }
    }
  }
  return { x: point.x, z: point.z };
}

function heuristic(ix, iz, gx, gz) {
  const dx = Math.abs(ix - gx); const dz = Math.abs(iz - gz);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

export function findPath(start, goal, world, radius = .62, cell = 1) {
  const sx = Math.floor((start.x - BOUNDS.minX) / cell);
  const sz = Math.floor((start.z - BOUNDS.minZ) / cell);
  const gx = Math.floor((goal.x - BOUNDS.minX) / cell);
  const gz = Math.floor((goal.z - BOUNDS.minZ) / cell);
  const startKey = key(sx, sz);
  const goalKey = key(gx, gz);
  const open = [{ x: sx, z: sz, g: 0, f: 0 }];
  const came = new Map();
  const scores = new Map([[startKey, 0]]);
  const closed = new Set();
  const neighbors = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2]
  ];
  let iterations = 0;
  while (open.length && iterations++ < 9000) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    const currentKey = key(current.x, current.z);
    if (closed.has(currentKey)) continue;
    if (currentKey === goalKey) {
      const cells = [];
      let cursor = currentKey;
      while (cursor) {
        const comma = cursor.indexOf(',');
        cells.push({ x: Number(cursor.slice(0, comma)), z: Number(cursor.slice(comma + 1)) });
        cursor = came.get(cursor);
      }
      cells.reverse();
      const points = cells.map((c) => ({
        x: BOUNDS.minX + (c.x + .5) * cell,
        z: BOUNDS.minZ + (c.z + .5) * cell
      }));
      if (world.canMove(goal.x, goal.z, radius)) points[points.length - 1] = { x: goal.x, z: goal.z };
      return points;
    }
    closed.add(currentKey);
    for (const [dx, dz, cost] of neighbors) {
      const nx = current.x + dx; const nz = current.z + dz;
      const nKey = key(nx, nz);
      if (closed.has(nKey)) continue;
      const wx = BOUNDS.minX + (nx + .5) * cell;
      const wz = BOUNDS.minZ + (nz + .5) * cell;
      if (!world.canMove(wx, wz, radius)) continue;
      if (dx && dz) {
        const ax = BOUNDS.minX + (current.x + dx + .5) * cell;
        const az = BOUNDS.minZ + (current.z + .5) * cell;
        const bx = BOUNDS.minX + (current.x + .5) * cell;
        const bz = BOUNDS.minZ + (current.z + dz + .5) * cell;
        if (!world.canMove(ax, az, radius) || !world.canMove(bx, bz, radius)) continue;
      }
      const g = current.g + cost;
      if (g >= (scores.get(nKey) ?? Infinity)) continue;
      scores.set(nKey, g);
      came.set(nKey, currentKey);
      open.push({ x: nx, z: nz, g, f: g + heuristic(nx, nz, gx, gz) });
    }
  }
  return [];
}

export function createAutopilot(world, robot, mission) {
  const state = {
    enabled: false, phase: 'idle', targetZone: null, path: [],
    waypoint: 0, lastPathAt: 0, goal: null, message: ''
  };
  const autopilot = {
    state,
    toggle(force) {
      state.enabled = typeof force === 'boolean' ? force : !state.enabled;
      state.phase = state.enabled ? 'navigate' : 'idle';
      state.targetZone = null;
      state.path = [];
      state.waypoint = 0;
      state.lastPathAt = 0;
      return state.enabled;
    },
    update(now = performance.now()) {
      if (!state.enabled) return null;
      if (mission.state.complete) {
        state.enabled = false;
        state.phase = 'complete';
        return { throttle: 0, turn: 0, brake: true, scan: false };
      }
      const active = mission.state.activeZone;
      if (active && active.evidence.confirmed && !active.evidence.uploaded) {
        state.phase = 'awaiting-confirm';
        state.targetZone = active;
        return { throttle: 0, turn: 0, brake: true, scan: false };
      }
      let target = state.targetZone;
      if (!target || target.evidence.uploaded) {
        const candidates = world.searchZones.filter((z) => !z.evidence.uploaded);
        candidates.sort((a, b) => Math.hypot(robot.root.position.x - a.position.x, robot.root.position.z - a.position.z) - Math.hypot(robot.root.position.x - b.position.x, robot.root.position.z - b.position.z));
        target = candidates[0] || null;
        state.targetZone = target;
        state.path = [];
        state.waypoint = 0;
        state.lastPathAt = 0;
      }
      if (!target) {
        state.enabled = false;
        state.phase = 'complete';
        return { throttle: 0, turn: 0, brake: true, scan: false };
      }
      const goal = nearestWalkable(target.position, world, .62, 1);
      state.goal = goal;
      const robotPos = robot.root.position;
      const distanceToGoal = Math.hypot(robotPos.x - goal.x, robotPos.z - goal.z);
      if (distanceToGoal < .92) {
        state.phase = 'scanning';
        state.message = `搜索区 ${target.id} · 自动扫描`;
        return { throttle: 0, turn: 0, brake: true, scan: true };
      }
      if (!state.path.length || now - state.lastPathAt > 2600) {
        state.path = findPath({ x: robotPos.x, z: robotPos.z }, goal, world, .62, 1);
        state.waypoint = 0;
        state.lastPathAt = now;
      }
      if (!state.path.length) {
        state.phase = 'blocked';
        state.message = '路径受阻，请人工驾驶';
        return { throttle: 0, turn: 0, brake: true, scan: false };
      }
      while (state.waypoint < state.path.length - 1) {
        const wp = state.path[state.waypoint];
        if (Math.hypot(robotPos.x - wp.x, robotPos.z - wp.z) < .65) state.waypoint++;
        else break;
      }
      const wp = state.path[Math.min(state.waypoint, state.path.length - 1)];
      const desiredHeading = Math.atan2(-(wp.x - robotPos.x), -(wp.z - robotPos.z));
      const diff = normAngle(desiredHeading - robot.root.rotation.y);
      state.phase = 'navigate';
      state.message = `前往搜索区 ${target.id}`;
      return {
        throttle: Math.abs(diff) < .48 ? .72 : .16,
        turn: clamp(diff * 1.8, -1, 1),
        brake: false,
        boost: false,
        scan: false
      };
    },
    reset() {
      state.enabled = false;
      state.phase = 'idle';
      state.targetZone = null;
      state.path = [];
      state.waypoint = 0;
      state.message = '';
    }
  };
  return autopilot;
}
