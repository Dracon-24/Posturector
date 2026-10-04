import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSessionAnalytics, nearestPoint, preserveExtrema, UNAVAILABLE_SESSION_HISTORY } from '../ui/sessionAnalytics.ts';
import { loadTypeScriptModule } from './loadTypeScriptModule.mjs';
const { calculatePerformanceMetrics } = await loadTypeScriptModule('../processing/performanceMetrics.ts', import.meta.url);

export function fixture(overrides = {}) {
  const sample = (timestamp, acceptable, direction, magnitude, threshold = 6) => ({
    timestamp, pitch: 90 + magnitude, roll: 0, pitchDeviation: magnitude,
    rollDeviation: 0, overallDeviation: magnitude, postureAcceptable: acceptable,
    direction, pitchThreshold: threshold, rollThreshold: 6,
  });
  return {
    id: 'session-test', startTime: 1_000, endTime: 8_000, monitoredDuration: 7_000,
    sampleCount: 4, actualSamplingRate: 4 / 7,
    calibration: { pitchBaseline: 90, rollBaseline: 0, pitchStd: 1, rollStd: 1,
      confidence: 100, sampleCount: 1500, duration: 30, valid: true },
    samples: [sample(1_000, true, 'forward', 1), sample(2_000, false, 'forward', 8, 7),
      sample(4_000, false, 'left', 10, 8), sample(6_000, true, 'forward', 2, 6.5)],
    feedbackEvents: [{ timestamp: 3_000, deviation: 8, direction: 'forward' }],
    correctionResponses: [{ feedbackTimestamp: 3_000, correctionTimestamp: 6_000,
      initialDeviation: 8, finalDeviation: 2, responseTime: 3, direction: 'forward' }],
    ...overrides,
  };
}
export function metricsFor(session) { return calculatePerformanceMetrics(session); }
const analyticsFor = session => buildSessionAnalytics(session, metricsFor(session), 6, 6);

test('existing finalized metrics keep their canonical consistency and completion definitions', () => {
  const session = fixture();
  const metrics = metricsFor(session);
  assert.equal(metrics.timeInGoodPosture, 1000);
  assert.equal(metrics.consistency, 1000 / 7000 * 100);
  assert.equal(metrics.completionRate, 100);
  assert.equal(metrics.averageCorrectionTime, 3);
  assert.equal(metrics.longestContinuousGoodPosture, 1000);
  assert.equal(analyticsFor(session).completionRate, metrics.completionRate);
});

test('poor posture duration follows recorded intervals without classifying the unobserved tail', () => {
  const analytics = analyticsFor(fixture());
  assert.equal(analytics.poorPostureTime, 4000);
  assert.equal(analytics.observedIntervalTime, 5000);
  assert.equal(analytics.unclassifiedTime, 2000);
});

test('nonpositive sample intervals do not contribute duration', () => {
  const session = fixture();
  session.samples[2].timestamp = 2000;
  assert.equal(analyticsFor(session).poorPostureTime, 4000);
});

test('direction counts and correction averages use completed responses, preserving missing values', () => {
  const session = fixture();
  session.feedbackEvents.push({ timestamp: 6500, deviation: 8, direction: 'left' });
  const metrics = metricsFor(session);
  assert.deepEqual(metrics.postureSpecific, { forward: 1, backward: 0, left: 1, right: 0 });
  assert.deepEqual(metrics.directionCorrectionTimes, { forward: 3, backward: null, left: null, right: null });
  assert.equal(metrics.completionRate, 50);
});

test('deviation distribution uses recorded maximum-axis magnitude with precise boundaries', () => {
  const session = fixture();
  session.samples = [0, 1.99, 2, 4, 6, 8, 12].map((overallDeviation, index) => ({
    ...session.samples[0], timestamp: 1000 + index * 20, overallDeviation,
  }));
  assert.deepEqual(analyticsFor(session).distribution.map(bin => bin.count), [2, 1, 1, 1, 2]);
});

test('threshold summaries retain final and maximum recorded values through relaxation and recovery', () => {
  const analytics = analyticsFor(fixture());
  assert.deepEqual(analytics.pitch, { canonical: 6, final: 6.5, maximumEffective: 8,
    finalAdjustment: .5, maximumRecordedAdjustment: 2 });
  assert.equal(analytics.roll.maximumRecordedAdjustment, 0);
  assert.deepEqual(analytics.pitchThreshold.map(point => point.y), [6, 7, 8, 6.5]);
});

test('correction trend is chronological, uses stored response seconds, and retains direction context', () => {
  const session = fixture();
  session.correctionResponses.unshift({ ...session.correctionResponses[0], correctionTimestamp: 7500,
    responseTime: 4.5, direction: 'left' });
  const analytics = analyticsFor(session);
  assert.deepEqual(analytics.correctionPoints.map(point => [point.x, point.y]), [[1, 3], [2, 4.5]]);
  assert.match(analytics.correctionPoints[0].detail, /forward/);
});

test('empty session has no synthetic posture, threshold, correction, or adaptive points', () => {
  const analytics = analyticsFor(fixture({ startTime: 0, monitoredDuration: 0, sampleCount: 0,
    actualSamplingRate: 0, samples: [], feedbackEvents: [], correctionResponses: [] }));
  for (const name of ['pitchDeviation', 'rollDeviation', 'pitchThreshold', 'rollThreshold', 'posture', 'correctionPoints']) assert.deepEqual(analytics[name], []);
  assert.equal(analytics.pitch.final, null);
  assert.equal(analytics.pitch.maximumRecordedAdjustment, null);
  assert.equal(analytics.completionRate, null);
});

test('zero feedback and no completed corrections preserve unavailable correction information', () => {
  const session = fixture({ feedbackEvents: [], correctionResponses: [] });
  const metrics = metricsFor(session);
  assert.equal(analyticsFor(session).completionRate, null);
  assert.equal(metrics.averageCorrectionTime, null);
  assert.equal(metrics.directionCorrectionTimes.forward, null);
  assert.deepEqual(analyticsFor(session).correctionPoints, []);
});

test('unpersisted evidence, feature, feedback mode, calibration time and stability remain explicit', () => {
  const analytics = analyticsFor(fixture());
  assert.equal(analytics.history, UNAVAILABLE_SESSION_HISTORY);
  assert.match(analytics.history.evidence, /Not persisted/);
  assert.match(analytics.history.features, /not persisted/);
  assert.match(analytics.history.feedbackMode, /Not persisted/);
  assert.match(analytics.history.stability, /cannot certify/);
  assert.equal('evidencePoints' in analytics, false);
  assert.equal('featurePoints' in analytics, false);
  assert.equal('stabilityPoints' in analytics, false);
});

test('event story uses recorded transitions and true feedback/correction timestamps only', () => {
  const analytics = analyticsFor(fixture());
  assert.deepEqual(analytics.events.map(event => event.kind), ['start', 'deviation', 'feedback', 'deviation', 'acceptable', 'correction', 'end']);
  assert.equal(analytics.events.find(event => event.kind === 'feedback').elapsed, 2);
  assert.equal(analytics.events.find(event => event.kind === 'correction').timestamp, 6000);
  assert.equal(analytics.events.some(event => /failed|reassert/i.test(event.label)), false);
});

test('single point preserves its exact data without creating a trend or interval', () => {
  const session = fixture();
  session.samples = [session.samples[0]];
  const analytics = analyticsFor(session);
  assert.equal(analytics.posture.length, 1);
  assert.equal(analytics.observedIntervalTime, 0);
  assert.equal(analytics.poorPostureTime, 0);
});

test('large-session reduction keeps original extrema and endpoints within a bounded render budget', () => {
  const points = Array.from({ length: 180_000 }, (_, x) => ({ x, y: x === 98765 ? 80 : x === 54321 ? 0 : 4 }));
  const reduced = preserveExtrema(points);
  assert.ok(reduced.length <= 160);
  assert.equal(reduced[0], points[0]);
  assert.equal(reduced.at(-1), points.at(-1));
  assert.ok(reduced.includes(points[98765]));
  assert.ok(reduced.includes(points[54321]));
  assert.ok(reduced.every(point => points[point.x] === point));
  assert.equal(nearestPoint(points, 98765.2), points[98765]);
});

test('analytics derivation does not mutate a finalized session or its metric snapshot', () => {
  const session = fixture();
  const metrics = metricsFor(session);
  const before = JSON.stringify({ session, metrics });
  buildSessionAnalytics(session, metrics, 6, 6);
  assert.equal(JSON.stringify({ session, metrics }), before);
});
