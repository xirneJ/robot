import test from 'node:test';
import assert from 'node:assert/strict';
import { thermalReading, isHumanThermal } from '../src/mission.js';

test('stationary close thermal sensor converges toward body temperature', () => {
  const reading = thermalReading({ ambient: 19, body: 36.8, proximity: 1, stationary: true, lineOfSight: true });
  assert.ok(reading > 34.5);
  assert.equal(isHumanThermal(reading), true);
});

test('moving or obstructed reading stays below human threshold', () => {
  const reading = thermalReading({ ambient: 19, body: 36.8, proximity: .9, stationary: false, lineOfSight: false });
  assert.ok(reading < 34.5);
  assert.equal(isHumanThermal(reading), false);
});
