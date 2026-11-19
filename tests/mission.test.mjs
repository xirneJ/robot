import test from 'node:test';
import assert from 'node:assert/strict';
import { scanRate, canConfirm, buildEvidence } from '../src/mission.js';

test('scan is slower while moving', () => {
  assert.ok(scanRate(2.5) < scanRate(0));
});

test('confirmed target can be uploaded', () => {
  assert.equal(canConfirm({ confirmed: true, uploaded: false }), true);
  assert.equal(canConfirm({ confirmed: false, uploaded: false }), false);
});

test('near strong target produces at least two evidence hits', () => {
  const e = buildEvidence({ distance: 2, radius: 8, intensity: .9 });
  assert.ok(e.heat > .5);
  assert.ok(e.presence > .5);
  assert.equal(e.confirmed, true);
});
