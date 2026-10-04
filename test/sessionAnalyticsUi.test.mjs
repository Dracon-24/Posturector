import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardModule, chartsModule, renderSessionUi, textContent } from './renderSessionUi.mjs';
import { loadTypeScriptModule } from './loadTypeScriptModule.mjs';
const { calculatePerformanceMetrics } = await loadTypeScriptModule('../processing/performanceMetrics.ts', import.meta.url);

function propsFor(overrides = {}) {
  const sample = (timestamp, deviation, acceptable) => ({ timestamp, pitch: 90 + deviation,
    roll: 0, pitchDeviation: deviation, rollDeviation: 0, overallDeviation: deviation,
    postureAcceptable: acceptable, direction: 'forward', pitchThreshold: 6, rollThreshold: 6 });
  const session = {
    id: 'ui-session', startTime: 1000, endTime: 7000, monitoredDuration: 6000,
    sampleCount: 3, actualSamplingRate: .5,
    calibration: { pitchBaseline: 90, rollBaseline: 0, pitchStd: 1, rollStd: 1,
      confidence: 100, sampleCount: 1500, duration: 30, valid: true },
    samples: [sample(1000, 1, true), sample(2000, 8, false), sample(6000, 1, true)],
    feedbackEvents: [{ timestamp: 3000, deviation: 8, direction: 'forward' }],
    correctionResponses: [{ feedbackTimestamp: 3000, correctionTimestamp: 6000,
      initialDeviation: 8, finalDeviation: 1, responseTime: 3, direction: 'forward' }],
    ...overrides,
  };
  return { session, metrics: calculatePerformanceMetrics(session), uploadState: 'saved',
    adaptiveMode: 'DEMO', canonicalPitchThreshold: 6, canonicalRollThreshold: 6,
    onRetryUpload() {}, onStartNewSession() {}, canStartNewSession: false };
}
const renderDashboard = props => renderSessionUi(dashboardModule.SessionResultsDashboard, props);

test('all six Session sections render and selection changes with actual controls', () => {
  const ui = renderDashboard(propsFor());
  const tabs = ui.nodes().filter(node => node.props.accessibilityRole === 'tab');
  assert.deepEqual(tabs.map(textContent), ['Overview', 'Posture', 'Corrections', 'Adaptive', 'Stability', 'Technical']);
  ui.press('Posture');
  assert.match(ui.text(), /Posture acceptability timeline/);
  assert.doesNotMatch(ui.text(), /Session Overview/);
  assert.equal(ui.nodes().find(node => node.props.accessibilityRole === 'tab' && textContent(node) === 'Posture').props.accessibilityState.selected, true);
  ui.press('Stability');
  assert.match(ui.text(), /Stability timeline unavailable/);
});

test('Overview renders canonical metrics, poor duration and denominator-safe completion', () => {
  const ui = renderDashboard(propsFor());
  for (const label of ['Session duration', 'Posture consistency', 'Good posture time', 'Poor posture time', 'Feedback events', 'Completed corrections', 'Correction completion rate', 'Average correction time', 'Longest good-posture period', 'Actual sampling rate']) assert.ok(ui.text().includes(label), label);
  assert.match(ui.text(), /16\.7%/);
  assert.match(ui.text(), /Poor posture time4\.0 s/);
  assert.match(ui.text(), /100\.0%/);
  const empty = renderDashboard(propsFor({ feedbackEvents: [], correctionResponses: [] }));
  assert.match(empty.text(), /No feedback events/);
  assert.match(empty.text(), /No completed corrections/);
  assert.doesNotMatch(empty.text(), /NaN|Infinity/);
});

test('every available graph has a meaningful title and rendered axis labels and units', () => {
  const ui = renderDashboard(propsFor());
  ui.press('Posture');
  for (const label of ['Posture acceptability timeline', 'Posture state', 'Elapsed session time', 'Pitch deviation trend', 'Pitch deviation (°)', 'Roll deviation trend', 'Roll deviation (°)', 'Deviation magnitude distribution', 'Deviation magnitude (°)', 'Recorded samples', 'Canonical threshold', 'Effective threshold']) assert.ok(ui.text().includes(label), label);
  ui.press('Corrections');
  for (const label of ['Correction response-time trend', 'Correction number', 'Response time (s)', 'Correction events by direction', 'Number of feedback events', 'Average correction time by direction', 'Average correction time (s)', 'Direction']) assert.ok(ui.text().includes(label), label);
  ui.press('Adaptive');
  for (const label of ['Adaptive pitch threshold trend', 'Adaptive roll threshold trend', 'Threshold / adjustment (°)', 'Elapsed session time', 'Recorded adjustment']) assert.ok(ui.text().includes(label), label);
});

test('no evidence, feature, mode or stability chart is fabricated for unavailable history', () => {
  const ui = renderDashboard(propsFor());
  ui.press('Adaptive');
  assert.match(ui.text(), /Behavioral evidence historyNot persisted for this session/);
  assert.match(ui.text(), /Adaptive feature history is not persisted/);
  assert.match(ui.text(), /Final adaptive feedback modeNot persisted/);
  assert.doesNotMatch(ui.text(), /Behavioral evidence \(0–1\)|Normalized feature value/);
  ui.press('Stability');
  assert.match(ui.text(), /cannot certify/);
  assert.doesNotMatch(ui.text(), /Stable time\d|Stability percentage\d/);
});

test('correction records and technical metadata expand and collapse through their controls', () => {
  const ui = renderDashboard(propsFor());
  ui.press('Corrections');
  assert.doesNotMatch(ui.text(), /Initial deviation/);
  const correction = ui.nodes().find(node => node.type === 'Pressable' && textContent(node).startsWith('#01'));
  correction.props.onPress(); ui.render();
  for (const label of ['Initial deviation', 'Final deviation', 'Feedback timestamp', 'Correction timestamp', 'Response time', 'Direction']) assert.ok(ui.text().includes(label));
  const expanded = ui.nodes().find(node => node.type === 'Pressable' && textContent(node).startsWith('#01'));
  assert.equal(expanded.props.accessibilityState.expanded, true);
  expanded.props.onPress(); ui.render();
  assert.doesNotMatch(ui.text(), /Initial deviation/);
  ui.press('Technical');
  assert.doesNotMatch(ui.text(), /Pitch baseline/);
  ui.press('Technical metadata ▾');
  assert.match(ui.text(), /Pitch baseline90\.00°/);
  assert.match(ui.text(), /Calibration timestampNot recorded/);
  ui.press('Technical metadata ▴');
  assert.doesNotMatch(ui.text(), /Pitch baseline/);
});

test('event story is hidden until expanded and lists actual timestamps and response details', () => {
  const ui = renderDashboard(propsFor());
  assert.doesNotMatch(ui.text(), /Feedback triggered/);
  ui.press('Session event timeline ▾');
  assert.match(ui.text(), /00:02\.0Feedback triggered — forward/);
  assert.match(ui.text(), /Posture corrected — forward · 3\.00 s/);
  ui.press('Session event timeline ▴');
  assert.doesNotMatch(ui.text(), /Feedback triggered/);
});

test('empty and very short sessions render truthful graph states and no synthetic thresholds', () => {
  const empty = renderDashboard(propsFor({ samples: [], feedbackEvents: [], correctionResponses: [],
    startTime: 0, monitoredDuration: 0, sampleCount: 0, actualSamplingRate: 0 }));
  assert.match(empty.text(), /No posture samples recorded/);
  empty.press('Posture');
  assert.match(empty.text(), /No posture samples recorded/);
  empty.press('Corrections');
  assert.match(empty.text(), /No completed corrections recorded/);
  assert.match(empty.text(), /No feedback events occurred/);
  empty.press('Adaptive');
  assert.match(empty.text(), /Unavailable — no recorded sample/);
  const props = propsFor();
  props.session.samples = [props.session.samples[0]];
  props.metrics = calculatePerformanceMetrics(props.session);
  const short = renderDashboard(props);
  short.press('Posture');
  assert.match(short.text(), /One recorded point; no chronological trend/);
});

test('line chart touch inspection selects an original exact reading and updates after layout', () => {
  const ui = renderSessionUi(chartsModule.SessionLineChart, {
    title: 'Pitch deviation trend', xLabel: 'Elapsed session time', yLabel: 'Pitch deviation (°)',
    series: [{ name: 'Pitch', color: '#fff', points: [{ x: 0, y: 1 }, { x: 1, y: 8 }, { x: 2, y: 2 }] }],
    formatX: value => `${value} s`, formatY: value => `${value}°`,
  });
  let plot = ui.nodes().find(node => node.props.onLayout);
  plot.props.onLayout({ nativeEvent: { layout: { width: 200 } } }); ui.render();
  plot = ui.nodes().find(node => node.props.onLayout);
  plot.props.onPress({ nativeEvent: { locationX: 100 } }); ui.render();
  assert.match(ui.text(), /Pitch: 8° · 1 s/);
});

test('zero-second completed corrections are shown as zero, never treated as missing', () => {
  const ui = renderSessionUi(chartsModule.SessionBarChart, { title: 'Average correction time by direction',
    xLabel: 'Direction', yLabel: 'Average correction time (s)',
    data: [{ label: 'Forward', value: 0 }, { label: 'Left', value: null }],
    emptyText: 'No completed corrections recorded.', formatValue: value => `${value} s` });
  assert.match(ui.text(), /0 s/);
  assert.match(ui.text(), /N\/A/);
  assert.match(ui.text(), /ForwardLeft/);
  assert.doesNotMatch(ui.text(), /No completed corrections recorded/);
});

test('large sessions keep chart rendering bounded and all corrections accessible through paging', () => {
  const props = propsFor();
  props.session.samples = Array.from({ length: 50_000 }, (_, index) => ({
    ...props.session.samples[0], timestamp: 1000 + index * 20,
    pitchDeviation: index === 25001 ? 44 : 1,
  }));
  props.session.sampleCount = props.session.samples.length;
  props.session.endTime = 1_001_000;
  props.session.monitoredDuration = 1_000_000;
  props.session.correctionResponses = Array.from({ length: 35 }, (_, index) => ({
    ...props.session.correctionResponses[0], feedbackTimestamp: 3000 + index * 10_000,
    correctionTimestamp: 6000 + index * 10_000,
  }));
  props.metrics = calculatePerformanceMetrics(props.session);
  const ui = renderDashboard(props);
  ui.press('Posture');
  assert.ok(ui.nodes().length < 15_000);
  assert.match(ui.text(), /44\.00°/);
  assert.match(ui.text(), /Extrema-preserving overview/);
  ui.press('Corrections');
  assert.ok(ui.text().includes('#15'));
  assert.ok(!ui.text().includes('#16'));
  ui.press('Next');
  assert.ok(ui.text().includes('#16'));
  ui.press('Next');
  assert.ok(ui.text().includes('#35'));
});
