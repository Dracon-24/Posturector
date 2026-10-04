import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEMO_TIMING_LABEL,
  formatDuration,
  formatPercent,
} from '../ui/presentation.ts';

const appSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
const resultsSource = await readFile(
  new URL('../components/SessionResultsDashboard.tsx', import.meta.url),
  'utf8'
);
const historySource = await readFile(
  new URL('../components/HistoricalAnalyticsDashboard.tsx', import.meta.url),
  'utf8'
);

test('shared metric formatting is stable across durations and percentages', () => {
  assert.equal(formatDuration(4_250), '4.3 s');
  assert.equal(formatDuration(1_458_000), '24m 18s');
  assert.equal(formatDuration(3_661_000), '1h 1m 1s');
  assert.equal(formatDuration(-1), '0.0 s');
  assert.equal(formatPercent(82.04), '82.0%');
});

test('all surfaces use the canonical adaptive timing disclosure', () => {
  assert.equal(DEMO_TIMING_LABEL, 'DEMO — ACCELERATED ADAPTIVE TIMING');
  assert.match(appSource, /formatAdaptiveTimingMode/);
  assert.match(resultsSource, /formatAdaptiveTimingMode/);
  assert.match(historySource, /DEMO_TIMING_LABEL/);
  assert.doesNotMatch(appSource, /DEMO — accelerated adaptive timing/);
  assert.doesNotMatch(resultsSource, /DEMO — accelerated adaptive timing/);
});

test('primary statuses include non-color symbols and controls retain mobile touch targets', () => {
  assert.match(appSource, /tone === 'good'[\s\S]*'✓'/);
  assert.match(appSource, /tone === 'warning'[\s\S]*'⚠'/);
  assert.match(resultsSource, /case 'saved': return '✓ Session synced'/);
  assert.match(historySource, /✓ Historical data loaded/);
  assert.match(appSource, /navigationButton: \{[\s\S]*minHeight: 44/);
  assert.match(resultsSource, /newSessionButton: \{[\s\S]*minHeight: 48/);
  assert.match(historySource, /openSessionButton: \{[\s\S]*minHeight: 48/);
});
