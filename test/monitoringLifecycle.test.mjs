import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { calculateCalibration } from '../processing/calibration.ts';
import { AdaptiveFeedbackController } from '../processing/adaptiveFeedback.ts';
import { CorrectionResponseDetector } from '../processing/correctionResponse.ts';
import {
  loadAdaptiveThresholdModules,
  loadTypeScriptModule,
} from './loadTypeScriptModule.mjs';

const appSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
const { controller } = await loadAdaptiveThresholdModules();
const { AdaptiveThresholdController } = controller;
const {
  endSession,
  recordCorrectionResponse,
  recordFeedbackEvent,
  recordPostureSample,
  startSession,
} = await loadTypeScriptModule('../processing/sessionRecorder.ts', import.meta.url);

const validCalibration = Object.freeze({
  pitchBaseline: 90,
  rollBaseline: 0,
  pitchStd: 1,
  rollStd: 1,
  confidence: 100,
  sampleCount: 1_500,
  duration: 30,
  valid: true,
});

function section(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing section start: ${startMarker}`);
  assert.ok(end > start, `Missing section end: ${endMarker}`);
  return appSource.slice(start, end);
}

const startMonitoringSource = section(
  'const startMonitoring = () => {',
  '// STOP MONITORING'
);
const stopMonitoringSource = section(
  'const stopMonitoring = () => {',
  '// UI'
);
const startCalibrationSource = section(
  'const startCalibration = () => {',
  '// START MONITORING'
);

test('valid calibration enters calibrated idle and can explicitly start monitoring', () => {
  assert.match(appSource, /A valid calibration is retained,[\s\S]*monitoringActive\.current =\s*false;/);
  assert.match(startMonitoringSource, /currentCalibration === null \|\|\s*!currentCalibration\.valid/);
  assert.match(startMonitoringSource, /const newSession =\s*startSession\(currentCalibration\)/);
  assert.match(startMonitoringSource, /monitoringActive\.current =\s*true;/);
  assert.match(appSource, /onPress=\{startMonitoring\}[\s\S]*Start Monitoring/);
});

test('stop monitoring finalizes once and preserves the valid calibration', () => {
  assert.match(stopMonitoringSource, /monitoringActive\.current =\s*false;/);
  assert.match(stopMonitoringSource, /endSession\(\s*currentSession,/);
  assert.match(stopMonitoringSource, /calculatePerformanceMetrics\(\s*completedSession/);
  assert.doesNotMatch(stopMonitoringSource, /currentSession\.startTime === 0/);
  assert.doesNotMatch(stopMonitoringSource, /setCalibrationResult\(\s*null/);
  assert.doesNotMatch(stopMonitoringSource, /calibrationResultRef\.current =\s*null/);
});

test('a newly started zero-sample session can still stop and finalize safely', () => {
  const session = startSession(validCalibration);
  assert.equal(session.startTime, 0);
  endSession(session, 10_000);
  assert.equal(session.endTime, 10_000);
  assert.equal(session.monitoredDuration, 0);
  assert.equal(session.actualSamplingRate, 0);
  assert.match(
    appSource,
    /monitoringActive\.current &&\s*calibrationResult !== null &&\s*calibrationResult\.valid &&\s*session !== null &&\s*\(/
  );
});

test('stop then start creates an independent session with the same canonical calibration', () => {
  const sessionA = startSession(validCalibration);
  recordPostureSample(sessionA, {
    timestamp: 1_000,
    pitch: 97,
    roll: 0,
    pitchDeviation: 7,
    rollDeviation: 0,
    overallDeviation: 7,
    postureAcceptable: false,
    direction: 'forward',
    pitchThreshold: 6,
    rollThreshold: 6,
  });
  recordFeedbackEvent(sessionA, { timestamp: 4_000, deviation: 7, direction: 'forward' });
  recordCorrectionResponse(sessionA, {
    feedbackTimestamp: 4_000,
    correctionTimestamp: 6_000,
    initialDeviation: 7,
    finalDeviation: 1,
    responseTime: 2,
    direction: 'forward',
  });
  endSession(sessionA, 10_000);

  const sessionB = startSession(validCalibration);
  assert.notEqual(sessionB.id, sessionA.id);
  assert.equal(sessionB.startTime, 0);
  assert.deepEqual(sessionB.samples, []);
  assert.deepEqual(sessionB.feedbackEvents, []);
  assert.deepEqual(sessionB.correctionResponses, []);
  assert.deepEqual(sessionB.calibration, sessionA.calibration);
  assert.equal(sessionA.samples.length, 1);
  assert.equal(sessionA.feedbackEvents.length, 1);
  assert.equal(sessionA.correctionResponses.length, 1);
  assert.equal(sessionA.endTime, 10_000);
});

test('new monitoring session resets adaptive and correction state without replacing calibration', () => {
  const threshold = new AdaptiveThresholdController();
  const feedback = new AdaptiveFeedbackController();
  const correction = new CorrectionResponseDetector();
  feedback.recordCompletedResponse(8);
  feedback.recordCompletedResponse(8);
  feedback.recordCompletedResponse(8);
  correction.startObservation(7, 1_000, 'forward');

  threshold.reset();
  feedback.reset();
  correction.reset();

  assert.deepEqual(threshold.getState(), { pitchAdjustment: 0, rollAdjustment: 0 });
  assert.equal(threshold.getDiagnostics().pitch.evidenceEma, 0);
  assert.deepEqual(feedback.getState(), { mode: 'NORMAL', recentResponseTimes: [] });
  assert.equal(correction.getIsObserving(), false);
  assert.equal(validCalibration.pitchBaseline, 90);
  assert.match(startMonitoringSource, /adaptiveThresholdController\.reset\(\)/);
  assert.match(startMonitoringSource, /adaptiveFeedbackController\.reset\(\)/);
  assert.match(startMonitoringSource, /correctionResponseDetector\.reset\(\)/);
});

test('explicit recalibration replaces calibration only after producing a new valid result', () => {
  const samples = Array.from({ length: 100 }, (_, index) => ({
    pitch: 88,
    roll: 1,
    timestamp: index * 20,
  }));
  const replacement = calculateCalibration(samples);
  assert.equal(replacement.valid, true);
  assert.equal(replacement.pitchBaseline, 88);
  assert.equal(replacement.rollBaseline, 1);
  assert.equal(validCalibration.pitchBaseline, 90);
  assert.match(startCalibrationSource, /calibrationResultRef\.current =\s*null/);
  assert.match(appSource, /calibrationResultRef\.current =\s*result/);
});

test('active monitoring continues to block recalibration', () => {
  assert.match(
    startCalibrationSource,
    /if \(monitoringActive\.current\) \{\s*return;/
  );
  assert.match(
    appSource,
    /!monitoringActive\.current &&\s*pendingUploadSessionRef\.current === null && \(/
  );
});

test('unresolved upload continues to block both restart and recalibration', () => {
  assert.match(
    startMonitoringSource,
    /sessionUploadActiveRef\.current \|\|\s*pendingUploadSessionRef\.current !== null/
  );
  assert.match(
    startCalibrationSource,
    /if \(pendingUploadSessionRef\.current !== null\) \{\s*return;/
  );
  assert.match(
    appSource,
    /calibrationResult\.valid &&\s*!monitoringActive\.current &&\s*pendingUploadSessionRef\.current === null &&\s*!sessionUploadActiveRef\.current/
  );
});
