import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { calculateDeviation } from '../processing/deviation.ts';
import { OrientationEstimator } from '../processing/orientation.ts';
import { CorrectionResponseDetector } from '../processing/correctionResponse.ts';
import {
  loadAdaptiveThresholdModules,
  loadFeedbackModules,
  loadTypeScriptModule,
} from './loadTypeScriptModule.mjs';

const { config, controller } = await loadAdaptiveThresholdModules();
const { AdaptiveThresholdController, MAX_ADAPTIVE_ADJUSTMENT } = controller;
const { PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG } = config;
const { adaptiveFeedback, feedback: feedbackModule } = await loadFeedbackModules();
const { AdaptiveFeedbackController, FeedbackReassertionController } = adaptiveFeedback;
const { FeedbackController } = feedbackModule;
const { StabilityDetector } = await loadTypeScriptModule(
  '../processing/stability.ts',
  import.meta.url
);
const { PersistenceDetector } = await loadTypeScriptModule(
  '../processing/persistence.ts',
  import.meta.url
);
const {
  endSession,
  recordCorrectionResponse,
  recordFeedbackEvent,
  recordPostureSample,
  startSession,
} = await loadTypeScriptModule('../processing/sessionRecorder.ts', import.meta.url);
const { calculatePerformanceMetrics } = await loadTypeScriptModule(
  '../processing/performanceMetrics.ts',
  import.meta.url
);

const SAMPLE_INTERVAL = 20;
const BASE_THRESHOLD = 6;
const calibration = Object.freeze({
  pitchBaseline: 90,
  rollBaseline: 0,
  pitchStd: 1,
  rollStd: 1,
  confidence: 100,
  sampleCount: 1_500,
  duration: 30,
  valid: true,
});

function directionFor(pitch, roll, pitchDeviation, rollDeviation) {
  if (pitchDeviation === 0 && rollDeviation === 0) return 'neutral';
  if (pitchDeviation >= rollDeviation) {
    return pitch >= calibration.pitchBaseline ? 'forward' : 'backward';
  }
  return roll >= calibration.rollBaseline ? 'right' : 'left';
}

class SyntheticMonitoringHarness {
  constructor() {
    this.timestamp = 1;
    this.threshold = new AdaptiveThresholdController(
      PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG
    );
    this.adaptiveFeedback = new AdaptiveFeedbackController();
    this.stability = new StabilityDetector({
      windowDuration: 2,
      maxPitchStd: 2,
      maxRollStd: 2,
    });
    this.persistence = new PersistenceDetector({ persistenceDuration: 3 });
    this.feedback = new FeedbackController({ vibrationDuration: 500 });
    this.correction = new CorrectionResponseDetector();
    this.session = startSession(calibration);
    this.pendingFeedbackTimestamp = null;
    this.hapticStarts = 0;
    this.hapticStops = 0;
    this.timerCallback = null;
    this.timerClears = 0;
    this.reassertion = new FeedbackReassertionController(
      (callback) => {
        this.timerCallback = callback;
        return 1;
      },
      () => {
        this.timerCallback = null;
        this.timerClears += 1;
      }
    );
  }

  step(pitchDeviation, rollDeviation = 0, stableInput = true) {
    const pitch = calibration.pitchBaseline + pitchDeviation;
    const roll = calibration.rollBaseline + rollDeviation;
    const thresholdStateBeforeSample = this.threshold.getState();
    const deviation = calculateDeviation(
      pitch,
      roll,
      calibration.pitchBaseline,
      calibration.rollBaseline,
      calibration.pitchStd,
      calibration.rollStd,
      {
        minimumThreshold: 4,
        variabilityFactor: 2,
        pitchThresholdAdjustment: thresholdStateBeforeSample.pitchAdjustment,
        rollThresholdAdjustment: thresholdStateBeforeSample.rollAdjustment,
      }
    );
    const stability = this.stability.update(pitch, roll, this.timestamp);
    const stable = stability.stable && stableInput;

    this.threshold.update({
      timestamp: this.timestamp,
      pitchDeviation: deviation.pitchDeviation,
      rollDeviation: deviation.rollDeviation,
      pitchThreshold: deviation.pitchThreshold,
      rollThreshold: deviation.rollThreshold,
      stable,
    });

    const persistence = this.persistence.update(
      deviation.overallDeviation && stable,
      this.timestamp
    );
    const feedback = this.feedback.update(
      persistence.isSustained,
      this.timestamp,
      this.adaptiveFeedback.getState().mode
    );
    const currentDeviation = Math.max(deviation.pitchDeviation, deviation.rollDeviation);
    const direction = directionFor(
      pitch,
      roll,
      deviation.pitchDeviation,
      deviation.rollDeviation
    );

    recordPostureSample(this.session, {
      timestamp: this.timestamp,
      pitch,
      roll,
      pitchDeviation: deviation.pitchDeviation,
      rollDeviation: deviation.rollDeviation,
      overallDeviation: currentDeviation,
      postureAcceptable: !deviation.overallDeviation,
      direction,
      pitchThreshold: deviation.pitchThreshold,
      rollThreshold: deviation.rollThreshold,
    });

    if (feedback.shouldVibrate && !this.correction.getIsObserving()) {
      recordFeedbackEvent(this.session, {
        timestamp: this.timestamp,
        deviation: currentDeviation,
        direction,
      });
      this.pendingFeedbackTimestamp = this.timestamp;
      this.correction.startObservation(currentDeviation, this.timestamp, direction);
      this.hapticStarts += 1;
      this.reassertion.start(
        feedback.reassertInterval,
        () => this.correction.getIsObserving(),
        () => {
          this.hapticStarts += 1;
        }
      );
    }

    const correction = this.correction.update(
      currentDeviation,
      this.timestamp,
      deviation.pitchOutside,
      deviation.rollOutside
    );
    if (
      correction.status === 'CORRECTED' &&
      correction.feedbackTimestamp !== null &&
      correction.feedbackTimestamp === this.pendingFeedbackTimestamp
    ) {
      recordCorrectionResponse(this.session, {
        feedbackTimestamp: correction.feedbackTimestamp,
        correctionTimestamp: this.timestamp,
        initialDeviation: correction.initialDeviation,
        finalDeviation: correction.currentDeviation,
        responseTime: correction.responseTime,
        direction: correction.direction ?? 'neutral',
      });
      this.adaptiveFeedback.recordCompletedResponse(correction.responseTime);
      this.threshold.recordCompletedCorrection(correction.responseTime, this.timestamp);
      this.pendingFeedbackTimestamp = null;
      this.reassertion.stop();
      this.hapticStops += 1;
    }

    const result = {
      timestamp: this.timestamp,
      deviation,
      stability,
      stable,
      persistence,
      feedback,
      correction,
      thresholdBefore: thresholdStateBeforeSample,
      thresholdAfter: this.threshold.getState(),
      thresholdDiagnostics: this.threshold.getDiagnostics(),
      feedbackMode: this.adaptiveFeedback.getState().mode,
    };
    this.timestamp += SAMPLE_INTERVAL;
    return result;
  }

  runFor(duration, pitchDeviation, rollDeviation = 0, stable = true) {
    let last;
    const end = this.timestamp + duration;
    while (this.timestamp < end) {
      const pitchValue = typeof pitchDeviation === 'function'
        ? pitchDeviation(this.timestamp, end)
        : pitchDeviation;
      last = this.step(pitchValue, rollDeviation, stable);
    }
    return last;
  }

  completeCorrection(responseTime, deviation = 7) {
    while (!this.correction.getIsObserving()) {
      this.step(deviation);
    }
    const feedbackTimestamp = this.session.feedbackEvents.at(-1).timestamp;
    while (this.timestamp < feedbackTimestamp + responseTime * 1_000) {
      this.step(deviation);
    }
    const completed = this.step(1.5);
    assert.equal(completed.correction.status, 'CORRECTED');
    assert.ok(Math.abs(completed.correction.responseTime - responseTime) <= 0.02);
    this.runFor(2_500, 1.5);
    return completed;
  }

  resetAdaptiveLifecycle() {
    this.reassertion.stop();
    this.threshold.reset();
    this.adaptiveFeedback.reset();
    this.stability.reset();
    this.persistence.reset();
    this.feedback.reset();
    this.correction.reset();
    this.pendingFeedbackTimestamp = null;
    this.hapticStops += 1;
  }
}

test('realistic full session preserves feedback, safety, recovery, and persisted metrics', () => {
  const orientation = new OrientationEstimator();
  const body = orientation.update(0, 0, 1, 0, 0, SAMPLE_INTERVAL / 1_000);
  assert.equal(body.pitch, calibration.pitchBaseline);
  assert.ok(Math.abs(body.roll - calibration.rollBaseline) === 0);

  const harness = new SyntheticMonitoringHarness();

  // Phase 1: normal/stable. Phase 2: mild near-threshold posture remains acceptable.
  harness.runFor(300_000, 1.5);
  const mild = harness.runFor(60_000, 5.5);
  assert.equal(mild.deviation.overallDeviation, false);
  assert.equal(mild.feedback.shouldVibrate, false);

  // Phases 3-4: real persistence/feedback/correction flow and slow-response escalation.
  for (const responseTime of [2, 2.5, 4, 7, 7, 8, 8]) {
    harness.completeCorrection(responseTime);
  }
  assert.equal(harness.adaptiveFeedback.getState().mode, 'HIGH_PERSISTENCE');
  assert.equal(harness.session.feedbackEvents.length, 7);
  assert.equal(harness.session.correctionResponses.length, 7);

  const thresholdBeforeDeterioration = harness.threshold.getState().pitchAdjustment;
  const feedbackModeBeforeDeterioration = harness.adaptiveFeedback.getState().mode;

  // Phases 5-6: progressive prolonged-use deterioration at the real 50 Hz cadence.
  const deteriorationStart = harness.timestamp;
  harness.runFor(1_800_000, (timestamp, end) => {
    const progress = (timestamp - deteriorationStart) / (end - deteriorationStart);
    const phaseTime = (timestamp - deteriorationStart) % 8_000;
    return phaseTime < 1_000 ? 6.5 : 2.8 + 3 * progress;
  });
  const relaxed = harness.threshold.getState().pitchAdjustment;
  assert.ok(relaxed > thresholdBeforeDeterioration);
  assert.ok(relaxed <= MAX_ADAPTIVE_ADJUSTMENT);
  assert.equal(harness.threshold.getState().rollAdjustment, 0);
  assert.equal(harness.adaptiveFeedback.getState().mode, feedbackModeBeforeDeterioration);

  // Slight relaxation may accept a minor deviation, while a meaningful one still follows
  // the unchanged stability -> persistence -> feedback path.
  const minor = harness.step(BASE_THRESHOLD + relaxed / 2);
  assert.equal(minor.deviation.overallDeviation, false);
  harness.runFor(2_500, 1.5);
  const meaningful = harness.runFor(6_000, BASE_THRESHOLD + relaxed + 1);
  assert.equal(meaningful.stable, true);
  assert.equal(meaningful.persistence.isSustained, true);
  assert.equal(meaningful.feedback.shouldVibrate, true);
  harness.step(1.5);

  // Phases 7-8: severe posture stays outside and freezes the relaxed threshold.
  harness.runFor(2_500, 1.5);
  const beforeSevere = harness.threshold.getState().pitchAdjustment;
  const severe = harness.runFor(6_000, 20);
  assert.equal(severe.thresholdDiagnostics.pitch.severeDeviation, true);
  assert.equal(harness.threshold.getState().pitchAdjustment, beforeSevere);
  assert.equal(severe.deviation.pitchOutside, true);
  assert.equal(severe.persistence.isSustained, true);
  assert.equal(severe.feedback.shouldVibrate, true);
  assert.deepEqual(calibration, {
    pitchBaseline: 90,
    rollBaseline: 0,
    pitchStd: 1,
    rollStd: 1,
    confidence: 100,
    sampleCount: 1_500,
    duration: 30,
    valid: true,
  });
  harness.step(1.5);

  // Phases 9-10: fast corrections independently restore NORMAL while threshold EMA recovers.
  const evidenceBeforeRecovery = harness.threshold.getDiagnostics().pitch.evidenceEma;
  for (const responseTime of [2, 2, 2, 2, 2]) {
    harness.completeCorrection(responseTime);
  }
  assert.equal(harness.adaptiveFeedback.getState().mode, 'NORMAL');
  const adjustmentBeforeRecovery = harness.threshold.getState().pitchAdjustment;
  harness.runFor(1_800_000, 1.5);
  assert.ok(harness.threshold.getDiagnostics().pitch.evidenceEma < evidenceBeforeRecovery);
  assert.ok(harness.threshold.getState().pitchAdjustment < adjustmentBeforeRecovery);
  assert.ok(harness.threshold.getState().pitchAdjustment >= 0);

  const completed = endSession(harness.session, harness.timestamp);
  const metrics = calculatePerformanceMetrics(completed);
  assert.equal(completed.sampleCount, completed.samples.length);
  assert.ok(completed.sampleCount > 100_000);
  assert.ok(completed.monitoredDuration > 0);
  assert.ok(Math.abs(completed.actualSamplingRate - 50) < 0.01);
  assert.equal(metrics.feedbackEvents, completed.feedbackEvents.length);
  assert.equal(metrics.completedCorrections, completed.correctionResponses.length);
  assert.equal(metrics.completionRate, 100);
  assert.equal(metrics.sampleCount, completed.sampleCount);
  assert.ok(completed.samples.some((sample) => sample.pitchThreshold > BASE_THRESHOLD));
  assert.ok(completed.samples.every((sample) => sample.pitchThreshold <= BASE_THRESHOLD + MAX_ADAPTIVE_ADJUSTMENT));
});

test('correction semantics and adaptive states stay independent during an active observation', () => {
  const harness = new SyntheticMonitoringHarness();
  harness.runFor(600_000, 1.5);
  const feedbackBefore = harness.adaptiveFeedback.getState();

  while (!harness.correction.getIsObserving()) {
    harness.step(7);
  }
  const feedbackTimestamp = harness.session.feedbackEvents.at(-1).timestamp;
  const thresholdBefore = harness.threshold.getState();
  const emaBefore = harness.threshold.getDiagnostics().pitch.evidenceEma;
  harness.adaptiveFeedback.recordCompletedResponse(8);
  harness.adaptiveFeedback.recordCompletedResponse(8);
  harness.adaptiveFeedback.recordCompletedResponse(8);

  assert.equal(harness.adaptiveFeedback.getState().mode, 'PERSISTENT');
  assert.deepEqual(harness.threshold.getState(), thresholdBefore);
  assert.equal(harness.threshold.getDiagnostics().pitch.evidenceEma, emaBefore);
  assert.notDeepEqual(harness.adaptiveFeedback.getState(), feedbackBefore);

  const observing = harness.step(7);
  assert.equal(observing.correction.status, 'OBSERVING');
  const completed = harness.step(1.5);
  assert.equal(completed.correction.status, 'CORRECTED');
  assert.equal(completed.correction.feedbackTimestamp, feedbackTimestamp);
  assert.equal(completed.correction.initialDeviation, 7);
  assert.equal(completed.correction.currentDeviation, 1.5);
  assert.equal(completed.correction.direction, 'forward');
  assert.equal(harness.session.correctionResponses.length, 1);
  harness.step(1.5);
  assert.equal(harness.session.correctionResponses.length, 1);
});

test('monitoring stop and new-session reset clear every adaptive and correction state', () => {
  const harness = new SyntheticMonitoringHarness();
  harness.runFor(600_000, 1.5);
  for (const responseTime of [2, 2.5, 4, 7, 7, 8, 8]) {
    harness.completeCorrection(responseTime);
  }
  const start = harness.timestamp;
  harness.runFor(1_800_000, (timestamp, end) => {
    const progress = (timestamp - start) / (end - start);
    const phaseTime = (timestamp - start) % 8_000;
    return phaseTime < 1_000 ? 6.5 : 2.8 + 3 * progress;
  });
  assert.ok(harness.threshold.getState().pitchAdjustment > 0);
  assert.equal(harness.adaptiveFeedback.getState().mode, 'HIGH_PERSISTENCE');

  harness.runFor(6_000, 8);
  assert.equal(harness.correction.getIsObserving(), true);
  assert.equal(harness.reassertion.getIsActive(), true);
  harness.resetAdaptiveLifecycle();

  assert.deepEqual(harness.threshold.getState(), { pitchAdjustment: 0, rollAdjustment: 0 });
  assert.equal(harness.threshold.getDiagnostics().pitch.evidenceEma, 0);
  assert.equal(harness.threshold.getDiagnostics().validSampleCount, 0);
  assert.deepEqual(harness.adaptiveFeedback.getState(), {
    mode: 'NORMAL',
    recentResponseTimes: [],
  });
  assert.equal(harness.correction.getIsObserving(), false);
  assert.equal(harness.reassertion.getIsActive(), false);

  harness.session = startSession(calibration);
  const firstNewSessionSample = harness.step(1.5);
  assert.equal(firstNewSessionSample.thresholdBefore.pitchAdjustment, 0);
  assert.equal(firstNewSessionSample.feedbackMode, 'NORMAL');
  assert.equal(harness.session.samples[0].pitchThreshold, BASE_THRESHOLD);
});

test('recalibration guard and reset path preserve lifecycle safety without changing frozen contracts', async () => {
  const harness = new SyntheticMonitoringHarness();
  harness.runFor(6_000, 8);
  assert.equal(harness.correction.getIsObserving(), true);
  harness.adaptiveFeedback.recordCompletedResponse(8);
  harness.adaptiveFeedback.recordCompletedResponse(8);
  harness.adaptiveFeedback.recordCompletedResponse(8);
  harness.resetAdaptiveLifecycle();

  const replacementCalibration = {
    ...calibration,
    pitchBaseline: 88,
    rollBaseline: 1,
  };
  assert.equal(replacementCalibration.pitchBaseline, 88);
  assert.equal(calibration.pitchBaseline, 90);
  assert.deepEqual(harness.threshold.getState(), { pitchAdjustment: 0, rollAdjustment: 0 });
  assert.equal(harness.adaptiveFeedback.getState().mode, 'NORMAL');
  assert.equal(harness.correction.getIsObserving(), false);
  assert.equal(harness.reassertion.getIsActive(), false);

  const appSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(
    appSource,
    /const startCalibration = \(\) => \{\s*if \(monitoringActive\.current\) \{\s*return;/
  );
  assert.match(appSource, /adaptiveThresholdController\.reset\(\)/);
  assert.match(appSource, /adaptiveFeedbackController\.reset\(\)/);
  assert.match(appSource, /correctionResponseDetector\.reset\(\)/);
  assert.match(appSource, /feedbackReassertionController\.stop\(\)/);
  assert.match(appSource, /const DEVICE_DIAGNOSTIC_INTERVAL = 5_000;/);
  assert.match(appSource, /__DEV__ &&/);
  assert.match(appSource, /\[PJT-I device validation\]/);
  assert.match(appSource, /samplingRate: liveSamplingRate/);
  assert.match(appSource, /correctionTimestamp:/);
  assert.match(appSource, /adaptiveDiagnostics\.pitch\.evidenceEma/);
  assert.match(appSource, /canonicalThreshold:/);
  assert.match(appSource, /adaptiveThresholdMode:/);
  assert.match(appSource, /adaptiveThresholdController\.getMode\(\)/);
  assert.match(appSource, /adaptiveFeedbackController\.getState\(\)\.mode/);
  assert.match(appSource, /const DASHBOARD_UPDATE_INTERVAL = 200;/);
  assert.match(appSource, /Adaptive Threshold Internals/);
  assert.match(appSource, /TEMPORARY REVIEW DEMO CONFIGURATION|accelerated adaptive timing/);
  assert.match(appSource, /getAdaptiveFreezeReasons/);

  const resultsSource = await readFile(
    new URL('../components/SessionResultsDashboard.tsx', import.meta.url),
    'utf8'
  );
  assert.match(resultsSource, /Session Overview/);
  assert.match(resultsSource, /Correction Performance/);
  assert.match(resultsSource, /Adaptive-System Behaviour/);
  assert.match(resultsSource, /Direction Analysis/);
  assert.match(resultsSource, /Deviation History/);
  assert.match(resultsSource, /No posture corrections were triggered during this session\./);
  assert.match(resultsSource, /No completed correction responses recorded\./);
  assert.match(resultsSource, /Start Another Session/);
  assert.doesNotMatch(resultsSource, /calculatePerformanceMetrics/);
});
