import assert from 'node:assert/strict';
import test from 'node:test';
import { groupHistoricalSessionsByDay, localDateKey, shiftDateKey, weekKey,
  selectedWeekAnalytics, selectedDayAnalytics, timeOfDayUsage } from '../ui/historyGrouping.ts';

export function session(id, day = 5, hour = 9, overrides = {}) {
  const startTime = new Date(2026, 9, day, hour).getTime();
  return { id, startTime, endTime: startTime + 60000, monitoredDuration: 60000,
    sampleCount: 3000, actualSamplingRate: 50, consistency: 80,
    averageCorrectionTime: 2, feedbackEvents: 2, completedCorrections: 1, completionRate: 50,
    timeInGoodPosture: 48000, longestContinuousGoodPosture: 24000,
    postureSpecific: { forward: 2, backward: 0, left: 0, right: 0 },
    directionCorrectionTimes: { forward: 2, backward: null, left: null, right: null }, ...overrides };
}
const a = session('a');
const b = session('b', 5, 15, { endTime: new Date(2026, 9, 5, 15).getTime() + 180000,
  monitoredDuration: 180000, sampleCount: 7200, consistency: 60, timeInGoodPosture: 108000,
  averageCorrectionTime: 4, completedCorrections: 2, completionRate: 100,
  longestContinuousGoodPosture: 60000, postureSpecific: { forward: 0, backward: 1, left: 1, right: 0 } });
const c = session('c', 7, 10, { averageCorrectionTime: null, feedbackEvents: 0, completedCorrections: 0,
  completionRate: 0, postureSpecific: { forward: 0, backward: 0, left: 0, right: 0 } });
const days = groupHistoricalSessionsByDay([b, c, a]);

test('weekly selects exactly seven local calendar dates and all matching sessions', () => {
  const week = selectedWeekAnalytics(groupHistoricalSessionsByDay([a, b, c, session('outside', 12)]), '2026-10-05');
  assert.equal(week.endKey, '2026-10-11');
  assert.equal(week.aggregate.sessions.length, 3);
  assert.deepEqual(week.charts.consistency.map(x => x.label), ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);
  assert.equal(week.charts.consistency[0].values[0], 65);
  assert.equal(week.charts.consistency[1].values[0], null);
  assert.equal(week.charts.consistency[2].values[0], 80);
  assert.equal(week.aggregate.monitoredDuration, 300000);
  assert.equal(week.aggregate.consistency, 68);
  assert.equal(week.averageDailyMonitoringTime, 300000 / 7);
});
test('weekly metrics use complete durations, counts and completed-response weighting', () => {
  const week = selectedWeekAnalytics(days, '2026-10-05');
  assert.equal(week.aggregate.feedbackEvents, 4);
  assert.equal(week.aggregate.completedCorrections, 3);
  assert.equal(week.aggregate.completionRate, 75);
  assert.equal(week.aggregate.averageCorrectionTime, 10 / 3);
  assert.equal(week.aggregate.averageSessionDuration, 100000);
  assert.equal(week.aggregate.averageSamplingRate, 13200 / 300);
  assert.equal(week.aggregate.longestGoodPosture, 60000);
  assert.deepEqual(week.aggregate.directionCounts, { forward: 2, backward: 1, left: 1, right: 0 });
  for (const name of ['duration','feedback','corrections','correctionTime','postureTime']) assert.equal(week.charts[name].length, 7);
  assert.deepEqual(week.charts.duration[0].values, [240000]);
  assert.deepEqual(week.charts.feedback[0].values, [4]);
  assert.deepEqual(week.charts.corrections[0].values, [3]);
  assert.deepEqual(week.charts.correctionTime[0].values, [10 / 3]);
  assert.deepEqual(week.charts.correctionTime[2].values, [null]);
  assert.deepEqual(week.charts.postureTime[0].values, [156000, null]);
  assert.equal(week.aggregate.poorPostureTime, null);
});
test('daily aggregates every selected-day session, chronological session points rather than days', () => {
  const day = selectedDayAnalytics(days, '2026-10-05');
  assert.deepEqual(day.aggregate.sessions.map(x => x.id), ['a','b']);
  assert.equal(day.aggregate.monitoredDuration, 240000);
  assert.equal(day.aggregate.consistency, 65);
  assert.equal(day.aggregate.feedbackEvents, 4);
  assert.equal(day.aggregate.completedCorrections, 3);
  assert.equal(day.aggregate.completionRate, 75);
  assert.deepEqual(day.charts.consistency.map(x => x.values), [[80],[60]]);
  assert.deepEqual(day.charts.duration.map(x => x.values), [[60000],[180000]]);
  assert.deepEqual(day.charts.feedback.map(x => x.values), [[2],[2]]);
  assert.deepEqual(day.charts.corrections.map(x => x.values), [[1],[2]]);
  assert.deepEqual(day.charts.correctionTime.map(x => x.values), [[2],[4]]);
  assert.deepEqual(day.charts.direction.map(x => x.values), [[2],[1],[1],[0]]);
});
test('insights are deterministic recorded maxima/minima, with ties represented', () => {
  const week = selectedWeekAnalytics(days, '2026-10-05');
  assert.equal(week.insights.bestConsistency.value, 80);
  assert.equal(week.insights.mostMonitored.value, 240000);
  assert.equal(week.insights.fastestCorrection.value, 10 / 3);
  assert.equal(week.insights.dominantDirection, 'forward');
  const day = selectedDayAnalytics(days, '2026-10-05');
  assert.equal(day.insights.bestConsistency.label, 'Session 1');
  assert.equal(day.insights.longestSession.label, 'Session 2');
  assert.equal(day.insights.fastestCorrection.value, 2);
  const tied = selectedDayAnalytics(groupHistoricalSessionsByDay([a, session('tie')]), '2026-10-05');
  assert.equal(tied.insights.bestConsistency.label, 'Session 1 / Session 2');
});
test('empty days/weeks and zero-feedback periods do not fabricate measurements', () => {
  const empty = selectedWeekAnalytics(days, '2026-10-12');
  assert.equal(empty.aggregate.sessions.length, 0);
  assert.equal(empty.aggregate.consistency, null);
  assert.equal(empty.aggregate.completionRate, null);
  assert.equal(empty.insights.bestConsistency, null);
  assert.ok(empty.charts.consistency.every(x => x.values[0] === null));
  assert.ok(empty.charts.direction.every(x => x.values[0] === null));
  assert.equal(selectedDayAnalytics(days, '2026-10-06').charts.duration.length, 0);
  const single = selectedDayAnalytics(days, '2026-10-07');
  assert.equal(single.charts.consistency.length, 1);
  assert.equal(single.aggregate.completionRate, null);
  assert.equal(single.insights.fastestCorrection, null);
  assert.deepEqual(single.charts.feedback[0].values, [0]);
  assert.deepEqual(single.charts.correctionTime[0].values, [null]);
});
test('incomplete correction-average coverage is unavailable, not silently zero or partial', () => {
  const day = selectedDayAnalytics(groupHistoricalSessionsByDay([a, session('missing', 5, 10, { averageCorrectionTime: null })]), '2026-10-05');
  assert.equal(day.aggregate.averageCorrectionTime, null);
  const noResponses = selectedDayAnalytics(groupHistoricalSessionsByDay([session('zero', 5, 10, { completedCorrections: 0, averageCorrectionTime: 2 })]), '2026-10-05');
  assert.deepEqual(noResponses.charts.correctionTime[0].values, [null]);
  assert.equal(noResponses.insights.fastestCorrection, null);
});
test('time-of-day counts only recorded intervals and does not fill gaps', () => {
  const usage = timeOfDayUsage([a, b], '2026-10-05');
  assert.deepEqual(usage.series.map(x => x.values[0]), [null,60000,180000,null]);
  assert.equal(usage.invalidIntervals, 0);
  const start = new Date(2026, 9, 5, 5, 30).getTime();
  const crossing = session('cross', 5, 5, { startTime: start, endTime: start + 3600000, monitoredDuration: 3600000 });
  assert.deepEqual(timeOfDayUsage([crossing], '2026-10-05').series.map(x => x.values[0]), [1800000,1800000,null,null]);
});
test('cross-midnight session belongs to start day; usage is clipped and outside time disclosed', () => {
  const start = new Date(2026, 9, 5, 23, 30).getTime();
  const item = session('cross', 5, 23, { startTime: start, endTime: start + 3600000, monitoredDuration: 3600000 });
  const groups = groupHistoricalSessionsByDay([item]);
  assert.equal(groups[0].key, '2026-10-05');
  assert.equal(groups[0].monitoredDuration, 3600000);
  const usage = selectedDayAnalytics(groups, '2026-10-05').usage;
  assert.equal(usage.series[3].values[0], 1800000);
  assert.equal(usage.outsideDayDuration, 1800000);
  assert.equal(selectedDayAnalytics(groups, '2026-10-06').aggregate.sessions.length, 0);
});
test('invalid intervals and undated sessions are not assigned invented time/date', () => {
  const invalid = session('invalid', 5, 9, { endTime: 1 });
  assert.equal(timeOfDayUsage([invalid], '2026-10-05').invalidIntervals, 1);
  assert.ok(timeOfDayUsage([invalid], '2026-10-05').series.every(x => x.values[0] === null));
  assert.equal(groupHistoricalSessionsByDay([session('undated', 5, 9, { startTime: 0 })]).length, 0);
});
test('local date/week boundaries, year changes and Sunday follow Monday convention', () => {
  assert.equal(localDateKey(new Date(2026, 9, 5, 0, 1).getTime()), '2026-10-05');
  assert.equal(weekKey(new Date(2026, 9, 11, 23).getTime()), '2026-10-05');
  assert.equal(weekKey(new Date(2026, 9, 12).getTime()), '2026-10-12');
  assert.equal(shiftDateKey('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDateKey('2026-03-08', 1), '2026-03-09');
});
test('large history aggregates all sessions without mutating source or truncating totals', () => {
  const sessions = Array.from({ length: 2000 }, (_, i) => session(`large-${i}`));
  const before = sessions.slice();
  const day = selectedDayAnalytics(groupHistoricalSessionsByDay(sessions), '2026-10-05');
  assert.equal(day.aggregate.sessions.length, 2000);
  assert.equal(day.aggregate.monitoredDuration, 120000000);
  assert.equal(day.charts.consistency.length, 2000);
  assert.match(day.insights.bestConsistency.label, /\+1997 tied/);
  assert.deepEqual(sessions, before);
});
