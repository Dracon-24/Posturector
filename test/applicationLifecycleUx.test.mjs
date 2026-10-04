import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
const resultsSource = await readFile(
  new URL('../components/SessionResultsDashboard.tsx', import.meta.url),
  'utf8'
);
const historySource = await readFile(
  new URL('../components/HistoricalAnalyticsDashboard.tsx', import.meta.url),
  'utf8'
);
const apiSource = await readFile(new URL('../services/apiService.ts', import.meta.url), 'utf8');

test('major surfaces use local view state without adding navigation infrastructure', () => {
  assert.match(appSource, /type AppView =\s*\| 'monitor'\s*\| 'results'\s*\| 'history'/);
  assert.match(appSource, /label="Monitor"/);
  assert.match(appSource, /label="Session Results"/);
  assert.match(appSource, /label="History"/);
  assert.doesNotMatch(appSource, /@react-navigation/);
});

test('stop exposes finalized results before asynchronous upload completes', () => {
  const stopStart = appSource.indexOf('const stopMonitoring = () => {');
  const stopEnd = appSource.indexOf('// UI', stopStart);
  const stopSource = appSource.slice(stopStart, stopEnd);
  assert.match(stopSource, /setPerformanceMetrics\(\s*metrics\s*\)/);
  assert.match(stopSource, /setActiveView\(\s*'results'\s*\)/);
  assert.match(stopSource, /void uploadCompletedSession\(\s*completedSession,\s*metrics\s*\)/);
});

test('historical session details reuse the existing results dashboard without replacing the local result', () => {
  assert.match(apiSource, /export async function fetchSessionById/);
  assert.match(apiSource, /\/api\/sessions\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(historySource, /Open Selected Session Results/);
  assert.match(appSource, /historicalSessionDetail \?\?[\s\S]*performanceMetrics/);
  assert.match(appSource, /<SessionResultsDashboard/);
});

test('sync states use application-level copy and preserve same-session retry', () => {
  assert.match(resultsSource, /Session remains available in this app session\. Sync failed/);
  assert.match(resultsSource, /Session may already be synced/);
  assert.match(resultsSource, /Retry Sync/);
  assert.match(appSource, /pendingUploadSessionRef\.current/);
  assert.match(appSource, /pendingUploadMetricsRef\.current/);
});

test('calibration UX distinguishes ready, active, and supported failure reasons', () => {
  assert.match(appSource, /CALIBRATED — READY/);
  assert.match(appSource, /Stop monitoring before recalibrating/);
  assert.match(appSource, /result\.reason === 'Not enough samples'/);
  assert.match(appSource, /result\.reason === 'Too much movement during calibration'/);
  assert.match(appSource, /calibrationActive\.current\) \{\s*return;/);
});

test('new lifecycle actions clear stale dashboard-only diagnostics', () => {
  const resetSnapshots = appSource.match(/setDashboardRuntime\(\{\s*direction: 'neutral'/g) ?? [];
  assert.ok(resetSnapshots.length >= 2);
  assert.match(appSource, /samplingRate: 0,\s*monitoredDuration: 0/);
});

test('an unresolved upload blocks replacement and routes the user back to results', () => {
  assert.match(appSource, /pendingUploadSessionRef\.current !== null && \(/);
  assert.match(appSource, /Complete the current session sync first/);
  assert.match(appSource, /View Session Results/);
  assert.match(appSource, /onPress=\{openLatestResult\}/);
});
