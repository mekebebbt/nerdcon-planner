import test from 'node:test';
import assert from 'node:assert/strict';
import { parallelTimeBlocks, isTimetableStage } from '../src/agenda-layout.js';

test('office hours fills the opening window with complete 60-minute blocks', () => {
  const blocks = parallelTimeBlocks({ name: 'Office Hours', open_from: '13:00', open_until: '17:00' });
  assert.deepEqual(blocks.map(b => [b.start, b.end]), [[780, 840], [840, 900], [900, 960], [960, 1020]]);
  assert.equal(parallelTimeBlocks({ name: 'Office Hours', open_from: '13:00', open_until: '14:30' }).length, 1);
});

test('roundtable timing remains unchanged', () => {
  assert.deepEqual(parallelTimeBlocks({ name: 'Roundtables' }).map(b => [b.start, b.end]), [[735, 775], [780, 820], [825, 865], [870, 910], [915, 955]]);
});

test('bonus stages stay out of timetable columns', () => {
  assert.equal(isTimetableStage({ display_group: 'bonus' }), false);
  assert.equal(isTimetableStage({ display_group: 'zone' }), true);
});
