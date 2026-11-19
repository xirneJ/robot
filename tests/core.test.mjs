import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLegIK, getGaitOffsets, getSupportMask, fuseEvidence } from '../src/core.js';

test('IK keeps target reachable for a rest pose', () => {
  const r = solveLegIK({ x: .8, y: .2, z: 0 }, { x: 2.5, y: 0, z: 0 }, { l1: .35, l2: .9, l3: 1.1 });
  assert.equal(r.reachable, true);
  assert.ok(Number.isFinite(r.yaw + r.hip + r.knee));
});

test('tripod gait has exactly three swing legs', () => {
  assert.deepEqual(getSupportMask(.1, 'tripod'), [false, true, false, true, false, true]);
});

test('wave gait has five support legs', () => {
  assert.equal(getSupportMask(.02, 'wave').filter(Boolean).length, 5);
});

test('two evidence channels confirm a target', () => {
  const r = fuseEvidence({ heat: .82, presence: .73, audio: .21 });
  assert.equal(r.hits, 2);
  assert.equal(r.confirmed, true);
  assert.ok(r.confidence > .6);
});

test('gait offsets preserve opposite tripods', () => {
  const o = getGaitOffsets('tripod');
  assert.equal(o.length, 6);
  assert.equal(o[0], o[2]);
  assert.equal(o[0], o[4]);
  assert.equal(Math.abs(o[1] - o[0]), .5);
});
