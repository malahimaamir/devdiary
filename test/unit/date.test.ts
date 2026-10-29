import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dateKeysBetween } from '../../src/util/date';

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-10-29', -6), '2026-10-23');
  assert.equal(addDays('2026-03-02', -2), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('dateKeysBetween is inclusive and ordered', () => {
  assert.deepEqual(dateKeysBetween('2026-10-30', '2026-11-02'), [
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
    '2026-11-02',
  ]);
  assert.deepEqual(dateKeysBetween('2026-10-29', '2026-10-29'), ['2026-10-29']);
  assert.deepEqual(dateKeysBetween('2026-10-29', '2026-10-28'), []);
});
