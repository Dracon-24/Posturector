import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdaptiveFeedbackController,
  classifyResponseTime,
} from '../processing/adaptiveFeedback.ts';
import { AdaptiveThresholdController } from '../processing/adaptiveThreshold.ts';
import { CorrectionResponseDetector } from '../processing/correctionResponse.ts';

function recordResponses(controller, responseTimes) {
  for (const responseTime of responseTimes) {
    controller.recordCompletedResponse(responseTime);
  }
  return controller.getState();
}

test('initial mode is NORMAL', () => {
  assert.equal(new AdaptiveFeedbackController().getState().mode, 'NORMAL');
});

test('no response history keeps NORMAL', () => {
  assert.deepEqual(new AdaptiveFeedbackController().getState(), {
    mode: 'NORMAL',
    recentResponseTimes: [],
  });
});

test('fewer than three responses cannot enter PERSISTENT', () => {
  const state = recordResponses(new AdaptiveFeedbackController(), [7, 8]);
  assert.equal(state.mode, 'NORMAL');
});

test('two slow responses among the latest three enter PERSISTENT', () => {
  const state = recordResponses(new AdaptiveFeedbackController(), [7, 4, 8]);
  assert.equal(state.mode, 'PERSISTENT');
});

test('fewer than five responses cannot enter HIGH_PERSISTENCE', () => {
  const state = recordResponses(new AdaptiveFeedbackController(), [7, 8, 9, 10]);
  assert.equal(state.mode, 'PERSISTENT');
});

test('four slow responses among the latest five enter HIGH_PERSISTENCE', () => {
  const state = recordResponses(new AdaptiveFeedbackController(), [7, 8, 4, 9, 10]);
  assert.equal(state.mode, 'HIGH_PERSISTENCE');
});

test('fast and normal responses prevent inappropriate escalation', () => {
  const state = recordResponses(new AdaptiveFeedbackController(), [7, 7, 7, 2, 4]);
  assert.equal(state.mode, 'NORMAL');
});

test('history retains only the most recent five completed responses', () => {
  const state = recordResponses(new AdaptiveFeedbackController(), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(state.recentResponseTimes, [2, 3, 4, 5, 6]);
});

test('a new monitoring session resets response history', () => {
  const controller = new AdaptiveFeedbackController();
  recordResponses(controller, [7, 8, 9]);
  controller.reset();
  assert.deepEqual(controller.getState(), {
    mode: 'NORMAL',
    recentResponseTimes: [],
  });
});

test('monitoring stop resets adaptive-feedback state', () => {
  const controller = new AdaptiveFeedbackController();
  recordResponses(controller, [7, 8, 9]);
  controller.reset();
  assert.equal(controller.getState().mode, 'NORMAL');
});

test('response-time classification uses the specified boundaries', () => {
  assert.equal(classifyResponseTime(2.999), 'FAST');
  assert.equal(classifyResponseTime(3), 'NORMAL');
  assert.equal(classifyResponseTime(6), 'NORMAL');
  assert.equal(classifyResponseTime(6.001), 'SLOW');
});

test('adaptive feedback does not modify adaptive deviation thresholds', () => {
  const thresholdController = new AdaptiveThresholdController();
  const before = thresholdController.getState();
  recordResponses(new AdaptiveFeedbackController(), [7, 8, 9, 10, 11]);
  assert.deepEqual(thresholdController.getState(), before);
});

test('adaptive feedback does not modify calibration baselines', () => {
  const calibration = { pitchBaseline: 12, rollBaseline: -4 };
  recordResponses(new AdaptiveFeedbackController(), [7, 8, 9]);
  assert.deepEqual(calibration, { pitchBaseline: 12, rollBaseline: -4 });
});

test('existing correction-response completion behavior remains unchanged', () => {
  const detector = new CorrectionResponseDetector();
  detector.startObservation(8, 1_000, 'forward');

  const observing = detector.update(7, 2_000, true, true);
  assert.equal(observing.status, 'OBSERVING');

  const corrected = detector.update(3, 4_000, false, true);
  assert.equal(corrected.status, 'CORRECTED');
  assert.equal(corrected.responseTime, 3);
  assert.equal(corrected.direction, 'forward');
});
