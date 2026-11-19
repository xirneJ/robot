import test from 'node:test';
import assert from 'node:assert/strict';
import { stepVelocity, angleDamp, smoothstep } from '../src/core.js';

test('velocity accelerates gradually', () => {
  const v = stepVelocity(0, 1, 1.2, .016);
  assert.ok(v > 0);
  assert.ok(v < 1);
});

test('angle damping reduces turn rate', () => {
  assert.ok(Math.abs(angleDamp(1, 0, .016)) < 1);
});

test('smoothstep clamps at both ends', () => {
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(1), 1);
  assert.ok(smoothstep(.5) > .4 && smoothstep(.5) < .6);
});
