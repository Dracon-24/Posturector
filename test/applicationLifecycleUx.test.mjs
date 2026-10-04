import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SESSION_SECTIONS } from '../ui/sessionAnalytics.ts';

const app = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
const shell = await readFile(new URL('../components/ApplicationShell.tsx', import.meta.url), 'utf8');
const results = await readFile(new URL('../components/SessionResultsDashboard.tsx', import.meta.url), 'utf8');
const history = await readFile(new URL('../components/HistoricalAnalyticsDashboard.tsx', import.meta.url), 'utf8');

test('application exposes exactly four local bottom-navigation destinations', () => {
  assert.match(shell, /'monitor' \| 'session' \| 'history' \| 'settings'/);
  for (const label of ['Monitor', 'Session', 'History', 'Settings']) {
    assert.match(shell, new RegExp(`label="${label}"`));
  }
  assert.doesNotMatch(shell, /@react-navigation/);
  assert.match(shell, /accessibilityState=\{\{ selected \}\}/);
});

test('monitor, session, and history use required subsection navigation', () => {
  assert.match(shell, /'live', 'calibration', 'adaptive', 'system'/);
  assert.deepEqual(SESSION_SECTIONS, ['overview', 'posture', 'corrections', 'adaptive', 'stability', 'technical']);
  assert.match(results, /SESSION_SECTIONS\.map/);
  assert.match(history, /'weekly', 'daily', 'sessions'/);
});

test('stop finalizes locally before asynchronous upload and opens Session', () => {
  const source = app.slice(app.indexOf('const stopMonitoring = () => {'), app.indexOf('// UI'));
  assert.match(source, /setPerformanceMetrics\(\s*metrics\s*\)/);
  assert.match(source, /setActiveView\(\s*'session'\s*\)/);
  assert.match(source, /void uploadCompletedSession\(\s*completedSession,\s*metrics\s*\)/);
});

test('saved calibration is loaded at startup and successful recalibration is persisted', () => {
  assert.match(app, /calibrationStorage\.load\(\)/);
  assert.match(app, /calibrationResultRef\.current = result\.value\.calibration/);
  assert.match(app, /calibrationStorage\.save\(result, savedAt\)/);
  assert.match(app, /if \(monitoringActive\.current\) \{\s*return;/);
});

test('new sessions reset runtime controllers and reuse canonical calibration', () => {
  const source = app.slice(app.indexOf('const startMonitoring = () => {'), app.indexOf('// STOP MONITORING'));
  assert.match(source, /adaptiveThresholdController\.reset\(\)/);
  assert.match(source, /adaptiveFeedbackController\.reset\(\)/);
  assert.match(source, /correctionResponseDetector\.reset\(\)/);
  assert.match(source, /persistenceDetector\.reset\(\)/);
  assert.match(source, /stabilityDetector\.reset\(\)/);
  assert.match(source, /startSession\(currentCalibration\)/);
});
