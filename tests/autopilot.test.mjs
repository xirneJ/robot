import test from 'node:test';
import assert from 'node:assert/strict';
import { findPath, nearestWalkable } from '../src/autopilot.js';

const openWorld = { canMove: () => true };
const wallWorld = {
  canMove(x, z, radius) {
    return !(x > 2 - radius && x < 4 + radius && z > -5 && z < 5);
  }
};

test('A* finds a route across open ground', () => {
  const path = findPath({ x: 0, z: 0 }, { x: 6, z: 0 }, openWorld, .6, 1);
  assert.ok(path.length >= 2);
  assert.ok(Math.hypot(path.at(-1).x - 6, path.at(-1).z) < 1.5);
});

test('A* routes around a solid wall', () => {
  const path = findPath({ x: 0, z: 0 }, { x: 7, z: 0 }, wallWorld, .6, 1);
  assert.ok(path.length > 2);
  assert.ok(path.some((p) => p.z > 5 || p.z < -5));
});

test('nearestWalkable moves a blocked target to a reachable point', () => {
  const p = nearestWalkable({ x: 3, z: 0 }, wallWorld, .6);
  assert.equal(wallWorld.canMove(p.x, p.z, .6), true);
});
