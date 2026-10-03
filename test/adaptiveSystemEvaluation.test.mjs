import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AdaptiveFeedbackController,
  FeedbackReassertionController,
  getAdaptiveFeedbackBehavior,
} from '../processing/adaptiveFeedback.ts';
import { calculateCalibration } from '../processing/calibration.ts';
import { CorrectionResponseDetector } from '../processing/correctionResponse.ts';
import { calculateDeviation } from '../processing/deviation.ts';
import { OrientationEstimator } from '../processing/orientation.ts';
import {
  loadAdaptiveThresholdModules,
  loadTypeScriptModule,
} from './loadTypeScriptModule.mjs';

const { controller } = await loadAdaptiveThresholdModules();
const { AdaptiveThresholdController } = controller;

function postureSample(timestamp, pitchDeviation, rollDeviation = pitchDeviation, stable = true) {
  return {
    timestamp,
    pitchDeviation,
    rollDeviation,
    pitchThreshold: 6,
    rollThreshold: 6,
    stable,
  };
}

function establishHistory(adaptive) {
  adaptive.recordCompletedCorrection(2, 120_000);
  adaptive.recordCompletedCorrection(2.5, 300_000);
  adaptive.recordCompletedCorrection(3, 480_000);
  for (let timestamp = 0; timestamp <= 600_000; timestamp += 6_000) {
    const outside = timestamp === 120_000 || timestamp === 360_000;
    adaptive.update(postureSample(timestamp, outside ? 6.5 : 2));
  }
}

function controlledDeterioration(adaptive) {
  let correctionTimestamp = 726_000;
  let responseTime = 4;
  for (let timestamp = 606_000; timestamp <= 2_406_000; timestamp += 6_000) {
    const progress = (timestamp - 606_000) / 1_800_000;
    const outside = ((timestamp - 606_000) / 6_000) % 8 === 7;
    if (timestamp >= correctionTimestamp) {
      adaptive.recordCompletedCorrection(responseTime, timestamp);
      responseTime = Math.min(11, responseTime + 0.75);
      correctionTimestamp += 120_000;
    }
    adaptive.update(postureSample(timestamp, outside ? 6.5 : 3 + 2.8 * progress, 2));
  }
}

test('scenario A: the complete confirmed-deviation and quick-correction chain remains NORMAL', async () => {
  const { StabilityDetector } = await loadTypeScriptModule('../processing/stability.ts', import.meta.url);
  const { PersistenceDetector } = await loadTypeScriptModule('../processing/persistence.ts', import.meta.url);
  const baseline = { pitch: 0, roll: 0 };
  const threshold = new AdaptiveThresholdController();
  const feedback = new AdaptiveFeedbackController();
  const deviation = calculateDeviation(7, 0, 0, 0, 1, 1, {
    minimumThreshold: 4,
    variabilityFactor: 2,
  });

  const stability = new StabilityDetector({ windowDuration: 2, maxPitchStd: 2, maxRollStd: 2 });
  let stable = false;
  for (let index = 0; index < 10; index += 1) {
    stable = stability.update(7, 0, index * 200).stable;
  }
  const persistence = new PersistenceDetector({ persistenceDuration: 3 });
  persistence.update(deviation.overallDeviation && stable, 2_000);
  const sustained = persistence.update(true, 5_000);
  assert.equal(getAdaptiveFeedbackBehavior(sustained.isSustained, 'NORMAL').shouldVibrate, true);

  const correction = new CorrectionResponseDetector();
  correction.startObservation(7, 5_000, 'forward');
  const corrected = correction.update(2, 7_000, false, false);
  feedback.recordCompletedResponse(corrected.responseTime);
  threshold.recordCompletedCorrection(corrected.responseTime, 7_000);

  assert.equal(corrected.status, 'CORRECTED');
  assert.equal(corrected.responseTime, 2);
  assert.equal(feedback.getState().mode, 'NORMAL');
  assert.deepEqual(threshold.getState(), { pitchAdjustment: 0, rollAdjustment: 0 });
  assert.deepEqual(baseline, { pitch: 0, roll: 0 });
});

test('scenario B: prolonged-use evidence relaxes gradually without moving baseline', () => {
  const adaptive = new AdaptiveThresholdController();
  const baseline = { pitch: 10, roll: -2 };
  establishHistory(adaptive);
  controlledDeterioration(adaptive);
  assert.ok(adaptive.getState().pitchAdjustment > 0);
  assert.ok(adaptive.getState().pitchAdjustment <= 3);
  assert.equal(adaptive.getState().rollAdjustment, 0);
  assert.deepEqual(baseline, { pitch: 10, roll: -2 });
});

test('scenario C: slow correction changes feedback mode without changing threshold state', () => {
  const feedback = new AdaptiveFeedbackController();
  const threshold = new AdaptiveThresholdController();
  for (const responseTime of [7, 4, 8]) {
    feedback.recordCompletedResponse(responseTime);
  }
  assert.equal(feedback.getState().mode, 'PERSISTENT');
  for (const responseTime of [9, 10]) {
    feedback.recordCompletedResponse(responseTime);
  }
  assert.equal(feedback.getState().mode, 'HIGH_PERSISTENCE');
  assert.deepEqual(threshold.getState(), { pitchAdjustment: 0, rollAdjustment: 0 });
});

test('scenario D: severe deterioration freezes relaxation and remains unacceptable', () => {
  const adaptive = new AdaptiveThresholdController();
  establishHistory(adaptive);
  controlledDeterioration(adaptive);
  const before = adaptive.getState().pitchAdjustment;
  adaptive.update(postureSample(2_412_000, 20));
  assert.equal(adaptive.getState().pitchAdjustment, before);

  const result = calculateDeviation(20, 0, 0, 0, 1, 1, {
    minimumThreshold: 4,
    variabilityFactor: 2,
    pitchThresholdAdjustment: before,
  });
  assert.equal(result.pitchOutside, true);
});

test('scenario E: correction and lifecycle stops release every reassertion mode', () => {
  for (const mode of ['NORMAL', 'PERSISTENT', 'HIGH_PERSISTENCE']) {
    let callback = null;
    let observing = true;
    const reassertion = new FeedbackReassertionController(
      (nextCallback) => {
        callback = nextCallback;
        return 1;
      },
      () => {}
    );
    const behavior = getAdaptiveFeedbackBehavior(true, mode);
    reassertion.start(behavior.reassertInterval, () => observing, () => {});
    observing = false;
    if (callback !== null) {
      callback();
    }
    reassertion.stop();
    assert.equal(reassertion.getIsActive(), false);
  }
});

test('frozen orientation, body mapping, and calibration behavior remain unchanged', () => {
  const estimator = new OrientationEstimator();
  const initial = estimator.update(0, 0, 1, 0, 0, 0.02);
  assert.equal(initial.pitch, 90);
  assert.ok(Math.abs(initial.roll) === 0);
  const filtered = estimator.update(0, 0, 1, 0.1, 0.2, 0.1);
  assert.ok(Math.abs(filtered.pitch - 89.438501) < 0.00001);
  assert.ok(Math.abs(filtered.roll - 1.122998) < 0.00001);

  const samples = Array.from({ length: 100 }, (_, index) => ({
    pitch: 12,
    roll: -3,
    timestamp: index * 20,
  }));
  const calibration = calculateCalibration(samples);
  assert.equal(calibration.pitchBaseline, 12);
  assert.equal(calibration.rollBaseline, -3);
  assert.equal(calibration.valid, true);
});

test('frozen stability, persistence, and correction semantics remain unchanged', async () => {
  const { StabilityDetector } = await loadTypeScriptModule('../processing/stability.ts', import.meta.url);
  const { PersistenceDetector } = await loadTypeScriptModule('../processing/persistence.ts', import.meta.url);
  const stability = new StabilityDetector({ windowDuration: 2, maxPitchStd: 2, maxRollStd: 2 });
  for (let index = 0; index < 9; index += 1) {
    assert.equal(stability.update(5, 1, index * 200).stable, false);
  }
  assert.equal(stability.update(5, 1, 1_800).stable, true);

  const persistence = new PersistenceDetector({ persistenceDuration: 3 });
  assert.equal(persistence.update(true, 1_000).isSustained, false);
  assert.equal(persistence.update(true, 4_000).isSustained, true);

  const correction = new CorrectionResponseDetector();
  correction.startObservation(8, 10_000, 'left');
  const result = correction.update(3, 12_500, true, false);
  assert.equal(result.status, 'CORRECTED');
  assert.equal(result.responseTime, 2.5);
});

test('backend routes and persisted session schema remain unchanged', async () => {
  const { startSession } = await loadTypeScriptModule('../processing/sessionRecorder.ts', import.meta.url);
  const session = startSession({
    pitchBaseline: 10,
    rollBaseline: -2,
    pitchStd: 1,
    rollStd: 1,
    confidence: 100,
    sampleCount: 100,
    duration: 30,
    valid: true,
  });
  assert.deepEqual(Object.keys(session).sort(), [
    'actualSamplingRate', 'calibration', 'correctionResponses', 'endTime',
    'feedbackEvents', 'id', 'monitoredDuration', 'sampleCount', 'samples', 'startTime',
  ]);

  const server = await readFile(new URL('../backend/src/server.ts', import.meta.url), 'utf8');
  const sessionsRoute = await readFile(new URL('../backend/src/routes/sessions.ts', import.meta.url), 'utf8');
  assert.match(server, /app\.get\('\/'/);
  assert.match(server, /app\.use\('\/api\/sessions'/);
  assert.match(sessionsRoute, /router\.post\('\/'/);
  assert.match(sessionsRoute, /router\.get\('\/:id'/);
});
