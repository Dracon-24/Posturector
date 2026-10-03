import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

import {
  ADAPTATION_WINDOW,
  AdaptiveThresholdController,
} from '../processing/adaptiveThreshold.ts';
import {
  AdaptiveFeedbackController,
  FeedbackReassertionController,
  getAdaptiveFeedbackBehavior,
} from '../processing/adaptiveFeedback.ts';
import { calculateCalibration } from '../processing/calibration.ts';
import { CorrectionResponseDetector } from '../processing/correctionResponse.ts';
import { calculateDeviation } from '../processing/deviation.ts';
import { OrientationEstimator } from '../processing/orientation.ts';

async function loadTypeScriptModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

function completeAdaptationWindow(controller, sample, start) {
  controller.update({ ...sample, timestamp: start });
  return controller.update({
    ...sample,
    timestamp: start + ADAPTATION_WINDOW,
  });
}

const qualifyingSample = {
  pitchDeviation: 2,
  rollDeviation: 2,
  pitchThreshold: 6,
  rollThreshold: 6,
  stable: true,
};

test('scenario A: confirmed deviation, quick correction, and NORMAL feedback remain independent', async () => {
  const { StabilityDetector } = await loadTypeScriptModule('../processing/stability.ts');
  const { PersistenceDetector } = await loadTypeScriptModule('../processing/persistence.ts');
  const calibration = {
    pitchBaseline: 0,
    rollBaseline: 0,
    pitchStd: 1,
    rollStd: 1,
  };
  const originalCalibration = { ...calibration };
  const thresholdController = new AdaptiveThresholdController();
  const feedbackController = new AdaptiveFeedbackController();

  const deviation = calculateDeviation(7, 0, 0, 0, 1, 1, {
    minimumThreshold: 4,
    variabilityFactor: 2,
  });
  assert.equal(deviation.pitchThreshold, 6);
  assert.equal(deviation.pitchOutside, true);

  const stability = new StabilityDetector({
    windowDuration: 2,
    maxPitchStd: 2,
    maxRollStd: 2,
  });
  let stable = false;
  for (let index = 0; index < 10; index += 1) {
    stable = stability.update(7, 0, index * 200).stable;
  }
  assert.equal(stable, true);

  const persistence = new PersistenceDetector({ persistenceDuration: 3 });
  persistence.update(deviation.overallDeviation && stable, 2_000);
  const sustained = persistence.update(true, 5_000);
  assert.equal(sustained.isSustained, true);
  assert.equal(getAdaptiveFeedbackBehavior(sustained.isSustained, 'NORMAL').shouldVibrate, true);

  const correction = new CorrectionResponseDetector();
  correction.startObservation(deviation.pitchDeviation, 5_000, 'forward');
  const corrected = correction.update(2, 7_000, false, false);
  assert.equal(corrected.status, 'CORRECTED');
  assert.equal(corrected.responseTime, 2);
  feedbackController.recordCompletedResponse(corrected.responseTime);

  assert.equal(feedbackController.getState().mode, 'NORMAL');
  assert.deepEqual(thresholdController.getState(), {
    pitchAdjustment: 0,
    rollAdjustment: 0,
  });
  assert.deepEqual(calibration, originalCalibration);
});

test('scenario B: qualifying windows adapt gradually, cap at 3 degrees, and freeze on failure', () => {
  const controller = new AdaptiveThresholdController();
  const baseline = { pitch: 10, roll: -2 };
  let start = 0;

  for (let index = 0; index < 6; index += 1) {
    completeAdaptationWindow(controller, qualifyingSample, start);
    assert.equal(controller.getState().pitchAdjustment, (index + 1) * 0.5);
    start += ADAPTATION_WINDOW + 1;
  }

  completeAdaptationWindow(controller, qualifyingSample, start);
  assert.equal(controller.getState().pitchAdjustment, 3);
  start += ADAPTATION_WINDOW + 1;

  completeAdaptationWindow(controller, {
    ...qualifyingSample,
    pitchDeviation: 20,
    rollDeviation: 20,
  }, start);
  assert.deepEqual(controller.getState(), {
    pitchAdjustment: 3,
    rollAdjustment: 3,
  });

  const effective = calculateDeviation(10, -2, 10, -2, 1, 1, {
    minimumThreshold: 4,
    variabilityFactor: 2,
    pitchThresholdAdjustment: 3,
    rollThresholdAdjustment: 3,
  });
  assert.equal(effective.pitchThreshold, 9);
  assert.equal(effective.rollThreshold, 9);
  assert.deepEqual(baseline, { pitch: 10, roll: -2 });
});

test('scenario C: slow correction history changes feedback mode but not thresholds or baseline', () => {
  const feedback = new AdaptiveFeedbackController();
  const threshold = new AdaptiveThresholdController();
  const baseline = { pitch: 4, roll: -1 };

  for (const responseTime of [7, 4, 8]) {
    feedback.recordCompletedResponse(responseTime);
  }
  assert.equal(feedback.getState().mode, 'PERSISTENT');

  for (const responseTime of [9, 10]) {
    feedback.recordCompletedResponse(responseTime);
  }
  assert.equal(feedback.getState().mode, 'HIGH_PERSISTENCE');
  assert.equal(feedback.getState().recentResponseTimes.length, 5);
  assert.deepEqual(threshold.getState(), {
    pitchAdjustment: 0,
    rollAdjustment: 0,
  });
  assert.deepEqual(baseline, { pitch: 4, roll: -1 });
});

test('scenario D: severe poor posture freezes tolerance and remains outside the threshold', () => {
  const controller = new AdaptiveThresholdController();
  const baseline = { pitch: 0, roll: 0 };
  completeAdaptationWindow(controller, qualifyingSample, 0);
  const stateBeforePoorPosture = controller.getState();

  completeAdaptationWindow(controller, {
    ...qualifyingSample,
    pitchDeviation: 20,
    rollDeviation: 20,
  }, ADAPTATION_WINDOW + 1);

  assert.deepEqual(controller.getState(), stateBeforePoorPosture);
  const deviation = calculateDeviation(20, 20, 0, 0, 1, 1, {
    minimumThreshold: 4,
    variabilityFactor: 2,
    pitchThresholdAdjustment: controller.getState().pitchAdjustment,
    rollThresholdAdjustment: controller.getState().rollAdjustment,
  });
  assert.equal(deviation.pitchOutside, true);
  assert.equal(deviation.rollOutside, true);
  assert.deepEqual(baseline, { pitch: 0, roll: 0 });
});

test('scenario E: every feedback mode releases reassertion after correction and lifecycle stops', () => {
  for (const mode of ['NORMAL', 'PERSISTENT', 'HIGH_PERSISTENCE']) {
    let callback = null;
    let cleared = false;
    let observing = true;
    const reassertion = new FeedbackReassertionController(
      (nextCallback) => {
        callback = nextCallback;
        return 1;
      },
      () => {
        cleared = true;
      }
    );
    const behavior = getAdaptiveFeedbackBehavior(true, mode);
    reassertion.start(behavior.reassertInterval, () => observing, () => {});

    observing = false;
    if (callback !== null) {
      callback();
      assert.equal(cleared, true);
    }
    reassertion.stop();
    assert.equal(reassertion.getIsActive(), false);
  }

  const feedback = new AdaptiveFeedbackController();
  feedback.recordCompletedResponse(8);
  feedback.reset();
  assert.deepEqual(feedback.getState(), {
    mode: 'NORMAL',
    recentResponseTimes: [],
  });
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
  const { StabilityDetector } = await loadTypeScriptModule('../processing/stability.ts');
  const { PersistenceDetector } = await loadTypeScriptModule('../processing/persistence.ts');
  const stability = new StabilityDetector({
    windowDuration: 2,
    maxPitchStd: 2,
    maxRollStd: 2,
  });

  for (let index = 0; index < 9; index += 1) {
    assert.equal(stability.update(5, 1, index * 200).stable, false);
  }
  assert.equal(stability.update(5, 1, 1_800).stable, true);

  const persistence = new PersistenceDetector({ persistenceDuration: 3 });
  assert.equal(persistence.update(true, 1_000).isSustained, false);
  assert.equal(persistence.update(true, 3_999).isSustained, false);
  assert.equal(persistence.update(true, 4_000).isSustained, true);

  const correction = new CorrectionResponseDetector();
  correction.startObservation(8, 10_000, 'left');
  assert.equal(correction.update(7, 11_000, true, true).status, 'OBSERVING');
  const result = correction.update(3, 12_500, true, false);
  assert.equal(result.status, 'CORRECTED');
  assert.equal(result.responseTime, 2.5);
});

test('backend routes and persisted session schema remain unchanged', async () => {
  const { startSession } = await loadTypeScriptModule('../processing/sessionRecorder.ts');
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
    'actualSamplingRate',
    'calibration',
    'correctionResponses',
    'endTime',
    'feedbackEvents',
    'id',
    'monitoredDuration',
    'sampleCount',
    'samples',
    'startTime',
  ]);

  const server = await readFile(new URL('../backend/src/server.ts', import.meta.url), 'utf8');
  const sessionsRoute = await readFile(new URL('../backend/src/routes/sessions.ts', import.meta.url), 'utf8');
  assert.match(server, /app\.get\('\/'/);
  assert.match(server, /app\.use\('\/api\/sessions'/);
  assert.match(sessionsRoute, /router\.post\('\/'/);
  assert.match(sessionsRoute, /router\.get\('\/:id'/);
});
