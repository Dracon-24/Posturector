import assert from 'node:assert/strict';
import test from 'node:test';
import { HistoricalAnalyticsDashboard, HistoryAnalyticsChart, renderHistoryUi, textContent } from './renderHistoryUi.mjs';
const make = (id, hour = 9) => {
  const startTime = new Date(2026, 9, 5, hour).getTime();
  return { id, startTime, endTime: startTime + 60000, monitoredDuration: 60000, sampleCount: 3000,
    actualSamplingRate: 50, consistency: 80, timeInGoodPosture: 48000, longestContinuousGoodPosture: 24000,
    feedbackEvents: 2, completedCorrections: 1, completionRate: 50, averageCorrectionTime: 2,
    postureSpecific: { forward: 2, backward: 0, left: 0, right: 0 },
    directionCorrectionTimes: { forward: 2, backward: null, left: null, right: null } };
};
const propsFor = sessions => ({ summary: { totalSessions: sessions.length, includedSessions: sessions.length,
  excludedSessions: 0, totalMonitoredDuration: sessions.length * 60000, averageConsistency: 80,
  averageCorrectionTime: 2, totalFeedbackEvents: sessions.length * 2, totalCompletedCorrections: sessions.length,
  overallCompletionRate: 50, averageSamplingRate: 50 }, trends: { sessions }, loading: false,
  error: null, adaptiveMode: 'DEMO', onRefresh() {}, onOpenSession() {}, sessionDetailLoading: false, sessionDetailError: null });
const chartPoints = ui => ui.nodes().filter(node => node.type === 'Pressable' && node.props.accessibilityLabel?.includes(': Recorded:'));

test('weekly renders day points and calendar selectors; selected empty week is explicit', () => {
  const ui = renderHistoryUi(HistoricalAnalyticsDashboard, propsFor([make('a'), make('b', 15)]));
  assert.match(ui.text(), /Complete selected week/);
  assert.match(ui.text(), /chart points are days/);
  assert.equal(chartPoints(ui).filter(node => node.props.accessibilityLabel.startsWith('Mon:')).length, 3);
  assert.match(ui.text(), /Daily good \/ poor posture time/);
  assert.match(ui.text(), /Poor posture · unavailable/);
  ui.press('Next Week →');
  assert.match(ui.text(), /No sessions in this week/);
  ui.press('← Previous Week');
  assert.match(ui.text(), /Period summary/);
});
test('daily reports all sessions with session charts and comparison disclosure, not session opening', () => {
  const ui = renderHistoryUi(HistoricalAnalyticsDashboard, propsFor([make('a'), make('b', 15)]));
  ui.press('Daily');
  assert.match(ui.text(), /2 sessions aggregated/);
  assert.match(ui.text(), /Daily key insights/);
  assert.match(ui.text(), /Session posture consistency/);
  assert.match(ui.text(), /Time-of-day monitoring usage/);
  assert.equal(chartPoints(ui).filter(node => node.props.accessibilityLabel.startsWith('S1:')).length, 3);
  assert.doesNotMatch(ui.text(), /Open ›/);
  assert.doesNotMatch(ui.text(), /Daily session comparison/);
  ui.press('Compare sessions');
  assert.match(ui.text(), /Daily session comparison/);
  assert.match(ui.text(), /Avg response \(s\)/);
  ui.press('Next Day →');
  assert.match(ui.text(), /No sessions on this day/);
  ui.press('← Previous Day');
  assert.match(ui.text(), /2 sessions aggregated/);
});
test('Sessions preserves date selection and opens full stored session by id only on explicit action', () => {
  const ids = [];
  const props = propsFor([make('a')]); props.onOpenSession = id => ids.push(id);
  const ui = renderHistoryUi(HistoricalAnalyticsDashboard, props);
  ui.press('Sessions');
  assert.match(ui.text(), /Individual session exploration/);
  const row = ui.nodes().find(node => node.type === 'Pressable' && textContent(node).includes('Open ›'));
  row.props.onPress(); assert.deepEqual(ids, ['a']);
  ui.press('Choose recorded date');
  assert.match(ui.text(), /Recorded dates/);
  ui.press('Next Day →');
  assert.match(ui.text(), /No sessions on this date/);
});
test('many sessions page charts and rows while all daily KPI totals remain complete', () => {
  const ui = renderHistoryUi(HistoricalAnalyticsDashboard, propsFor(Array.from({ length: 20 }, (_, i) => make(`s${i}`))));
  ui.press('Daily');
  assert.match(ui.text(), /20 sessions aggregated/);
  assert.match(ui.text(), /Showing sessions 1–6 of 20/);
  ui.press('Next sessions');
  assert.match(ui.text(), /Showing sessions 7–12 of 20/);
  assert.ok(chartPoints(ui).some(node => node.props.accessibilityLabel.startsWith('S7:')));
  assert.ok(!chartPoints(ui).some(node => node.props.accessibilityLabel.startsWith('S1:')));
  ui.press('Compare sessions');
  assert.match(ui.text(), /S12/);
});
test('refresh/loading/errors retain chosen period and old results without opening raw sessions', () => {
  const props = propsFor([make('a')]);
  const ui = renderHistoryUi(HistoricalAnalyticsDashboard, props);
  ui.press('Next Week →');
  props.loading = true; props.error = 'offline'; ui.render();
  assert.match(ui.text(), /No sessions in this week/);
  assert.match(ui.text(), /Existing results remain visible/);
  assert.match(ui.text(), /Refreshing persisted analytics/);
  props.loading = false; props.trends = { sessions: [make('a'),make('b')] }; ui.render();
  assert.match(ui.text(), /No sessions in this week/);
});
test('undated sessions remain accessible but calendar reports never pretend they occurred in 1970', () => {
  const props = propsFor([{ ...make('undated'), startTime: 0, monitoredDuration: 0 }]);
  const ui = renderHistoryUi(HistoricalAnalyticsDashboard, props);
  assert.match(ui.text(), /No sessions in this week/);
  ui.press('Sessions'); assert.match(ui.text(), /Undated sessions/);
  assert.doesNotMatch(ui.text(), /1970/);
});
test('charts expose titles, units, nullable categories, exact value inspection and empty state', () => {
  const props = { title: 'Recorded consistency', xLabel: 'Day', yLabel: 'Consistency (%)',
    data: [{ key:'a',label:'Mon',values:[80] }, { key:'b',label:'Tue',values:[null] }],
    series: [{ name:'Consistency',color:'#50D4C5' }] };
  const ui = renderHistoryUi(HistoryAnalyticsChart, props);
  assert.match(ui.text(), /Recorded consistency/); assert.match(ui.text(), /Consistency \(%\)/);
  assert.match(ui.text(), /N\/A/);
  const missing = ui.nodes().find(node => node.props.accessibilityLabel === 'Tue: Consistency: Unavailable');
  missing.props.onPress(); ui.render(); assert.match(ui.text(), /Consistency: Unavailable/);
  props.data = []; ui.render(); assert.match(ui.text(), /No recorded values/);
});
test('line chart does not bridge an unavailable day', () => {
  const ui = renderHistoryUi(HistoryAnalyticsChart, { title:'Response', xLabel:'Day',yLabel:'Response (s)',kind:'line',
    data: [{key:'a',label:'Mon',values:[2]},{key:'b',label:'Tue',values:[null]},{key:'c',label:'Wed',values:[4]}],
    series:[{name:'Response',color:'#7FAAF1'}] });
  assert.equal(ui.nodes().filter(node => node.props.style?.transform).length, 0);
});
