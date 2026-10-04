import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardSource = await readFile(
  new URL('../components/HistoricalAnalyticsDashboard.tsx', import.meta.url),
  'utf8'
);
const appSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');

test('historical dashboard consumes backend summary values without recalculating consistency', () => {
  assert.match(dashboardSource, /summary\.averageConsistency/);
  assert.match(dashboardSource, /duration-weighted/);
  assert.doesNotMatch(dashboardSource, /sessions\.reduce[\s\S]{0,160}consistency/);
});

test('historical charts preserve actual points and unavailable correction-time values', () => {
  assert.match(dashboardSource, /session => session\.consistency/);
  assert.match(dashboardSource, /session => session\.completionRate/);
  assert.match(dashboardSource, /session => session\.averageCorrectionTime/);
  assert.match(dashboardSource, /value === null/);
  assert.match(dashboardSource, /no values are interpolated/i);
});

test('App retains the established analytics loading lifecycle and delegates presentation', () => {
  assert.match(appSource, /Promise\.all\(\[\s*fetchHistoricalSummary\(\),\s*fetchHistoricalTrends\(\)/);
  assert.match(appSource, /historicalRefreshPendingRef/);
  assert.match(appSource, /<HistoricalAnalyticsDashboard/);
  assert.match(appSource, /onRefresh=\{\(\) => \{\s*void loadHistoricalAnalytics\(\)/);
});
