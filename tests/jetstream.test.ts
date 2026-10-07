import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consumerRows, queueTotals } from '../src/lib/jetstream.ts';
import type { JetStreamSnapshot } from '../src/lib/jetstream.ts';

const sample = { status: 'HEALTHY', streams: [{ name: 'EVENTS', consumers: [
  { name: 'preprocess', pending: 5, ackPending: 1, redelivered: 2 },
  { name: 'promote', pending: 3, ackPending: 0, redelivered: 0 },
] }] } as JetStreamSnapshot;
test('broker counts reflect selected stream and consumer', () => {
  assert.deepEqual(queueTotals(sample), { pending: 8, ackPending: 1, redelivered: 2, consumers: 2 });
  assert.equal(queueTotals(sample, 'EVENTS', 'promote')?.pending, 3);
  assert.equal(consumerRows(sample, 'MISSING').length, 0);
});
test('unavailable broker is not displayed as an empty queue', () => {
  assert.equal(queueTotals({ ...sample, status: 'UNAVAILABLE' }), null);
  assert.equal(queueTotals(null), null);
});
