import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('source entry exists', () => {
  assert.equal(fs.existsSync('src/main.js'), true);
});
