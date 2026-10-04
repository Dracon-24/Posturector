import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEMO_TIMING_LABEL, formatDuration, formatPercent } from '../ui/presentation.ts';

const shell = await readFile(new URL('../components/ApplicationShell.tsx', import.meta.url), 'utf8');
const results = await readFile(new URL('../components/SessionResultsDashboard.tsx', import.meta.url), 'utf8');

test('shared metric formatting remains stable', () => {
  assert.equal(formatDuration(4_250), '4.3 s');
  assert.equal(formatDuration(1_458_000), '24m 18s');
  assert.equal(formatDuration(3_661_000), '1h 1m 1s');
  assert.equal(formatPercent(82.04), '82.0%');
});

test('DEMO disclosure remains canonical and appears in System', () => {
  assert.equal(DEMO_TIMING_LABEL, 'DEMO — ACCELERATED ADAPTIVE TIMING');
  assert.match(shell, /formatAdaptiveTimingMode\(props\.adaptiveMode\)/);
  assert.match(shell, /Temporary review timing/);
});

test('progressive disclosure owns technical and correction details', () => {
  assert.match(shell, /Technical Details/);
  assert.match(results, /expandedCorrection/);
  assert.match(results, /technicalExpanded/);
  assert.match(shell, /minHeight: 48/);
  assert.match(shell, /minHeight: 52/);
});
