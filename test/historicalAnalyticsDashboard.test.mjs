import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { groupHistoricalSessionsByDay, groupHistoricalSessionsByWeek } from '../ui/historyGrouping.ts';

const source = await readFile(new URL('../components/HistoricalAnalyticsDashboard.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');

const sessions = [
  { id: 'a', startTime: new Date(2026, 9, 3, 9).getTime(), endTime: 1, monitoredDuration: 1000, sampleCount: 50, actualSamplingRate: 50, consistency: 80, averageCorrectionTime: 2, feedbackEvents: 2, completedCorrections: 1, completionRate: 50, timeInGoodPosture: 800, longestContinuousGoodPosture: 700, postureSpecific: { forward: 2, backward: 0, left: 0, right: 0 }, directionCorrectionTimes: { forward: 2, backward: null, left: null, right: null } },
  { id: 'b', startTime: new Date(2026, 9, 3, 15).getTime(), endTime: 2, monitoredDuration: 3000, sampleCount: 150, actualSamplingRate: 50, consistency: 60, averageCorrectionTime: 4, feedbackEvents: 2, completedCorrections: 2, completionRate: 100, timeInGoodPosture: 1800, longestContinuousGoodPosture: 900, postureSpecific: { forward: 0, backward: 1, left: 1, right: 0 }, directionCorrectionTimes: { forward: null, backward: 4, left: 4, right: null } },
  { id: 'c', startTime: new Date(2026, 9, 4, 10).getTime(), endTime: 3, monitoredDuration: 2000, sampleCount: 100, actualSamplingRate: 50, consistency: 90, averageCorrectionTime: null, feedbackEvents: 0, completedCorrections: 0, completionRate: 0, timeInGoodPosture: 1800, longestContinuousGoodPosture: 1000, postureSpecific: { forward: 0, backward: 0, left: 0, right: 0 }, directionCorrectionTimes: { forward: null, backward: null, left: null, right: null } },
];

test('history is append-oriented and groups sessions without replacing older entries', () => {
  const days = groupHistoricalSessionsByDay(sessions);
  assert.equal(days.length, 2);
  assert.equal(days.flatMap(day => day.sessions).length, 3);
  assert.deepEqual(days.find(day => day.sessions.some(session => session.id === 'a')).sessions.map(session => session.id), ['a', 'b']);
  assert.equal(groupHistoricalSessionsByWeek(sessions)[0].sessions.length, 3);
});

test('daily aggregation uses stored duration and good-posture time', () => {
  const day = groupHistoricalSessionsByDay(sessions).find(group => group.sessions.some(session => session.id === 'a'));
  assert.equal(day.monitoredDuration, 4000);
  assert.equal(day.consistency, 65);
  assert.equal(day.completedCorrections, 3);
});

test('history provides date and session selection and opens stored results by id', () => {
  assert.match(source, /setSelectedDate/);
  assert.match(source, /setExpandedDay/);
  assert.match(source, /onOpen\(id\)/);
  assert.match(app, /fetchSessionById/);
  assert.match(app, /setActiveView\(\s*'session'\s*\)/);
});

test('established analytics request coordination remains intact', () => {
  assert.match(app, /Promise\.all\(\[\s*fetchHistoricalSummary\(\),\s*fetchHistoricalTrends\(\)/);
  assert.match(app, /historicalRefreshPendingRef/);
});
