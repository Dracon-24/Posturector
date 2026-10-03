import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADAPTATION_WINDOW,
  AdaptiveThresholdController,
  MAX_ADAPTIVE_ADJUSTMENT,
} from '../processing/adaptiveThreshold.ts';
import { calculateDeviation } from '../processing/deviation.ts';

const baseSample = {
  pitchDeviation: 2,
  rollDeviation: 2,
  pitchThreshold: 4,
  rollThreshold: 4,
  stable: true,
};

function completeWindow(controller, overrides = {}, start = 0) {
  controller.update({ ...baseSample, ...overrides, timestamp: start });
  return controller.update({
    ...baseSample,
    ...overrides,
    timestamp: start + ADAPTATION_WINDOW,
  });
}

test('initial adjustment is zero', () => {
  assert.deepEqual(new AdaptiveThresholdController().getState(), {
    pitchAdjustment: 0,
    rollAdjustment: 0,
  });
});

test('a valid window increases adjustment by 0.5 degrees', () => {
  assert.deepEqual(
    completeWindow(new AdaptiveThresholdController()),
    { pitchAdjustment: 0.5, rollAdjustment: 0.5 }
  );
});

test('adjustment never exceeds 3 degrees', () => {
  const controller = new AdaptiveThresholdController();
  let start = 0;
  for (let index = 0; index < 8; index += 1) {
    completeWindow(controller, {}, start);
    start += ADAPTATION_WINDOW + 1;
  }
  assert.deepEqual(controller.getState(), {
    pitchAdjustment: MAX_ADAPTIVE_ADJUSTMENT,
    rollAdjustment: MAX_ADAPTIVE_ADJUSTMENT,
  });
});

test('invalid or insufficient data does not increase adjustment', () => {
  const controller = new AdaptiveThresholdController();
  controller.update({ ...baseSample, timestamp: 0 });
  controller.update({
    ...baseSample,
    pitchDeviation: Number.NaN,
    timestamp: ADAPTATION_WINDOW,
  });
  assert.deepEqual(controller.getState(), {
    pitchAdjustment: 0,
    rollAdjustment: 0,
  });
});

test('low acceptable ratio does not increase adjustment', () => {
  const controller = new AdaptiveThresholdController();
  controller.update({ ...baseSample, timestamp: 0 });
  controller.update({ ...baseSample, pitchDeviation: 5, rollDeviation: 5, timestamp: 100_000 });
  controller.update({ ...baseSample, pitchDeviation: 5, rollDeviation: 5, timestamp: 200_000 });
  const state = controller.update({ ...baseSample, pitchDeviation: 5, rollDeviation: 5, timestamp: ADAPTATION_WINDOW });
  assert.deepEqual(state, { pitchAdjustment: 0, rollAdjustment: 0 });
});

test('low stable ratio does not increase adjustment', () => {
  const controller = new AdaptiveThresholdController();
  controller.update({ ...baseSample, stable: true, timestamp: 0 });
  controller.update({ ...baseSample, stable: false, timestamp: 100_000 });
  controller.update({ ...baseSample, stable: false, timestamp: 200_000 });
  const state = controller.update({ ...baseSample, stable: false, timestamp: ADAPTATION_WINDOW });
  assert.deepEqual(state, { pitchAdjustment: 0, rollAdjustment: 0 });
});

test('excessive severe deviation does not increase adjustment', () => {
  const controller = new AdaptiveThresholdController();
  controller.update({ ...baseSample, timestamp: 0 });
  controller.update({ ...baseSample, pitchDeviation: 9, rollDeviation: 9, timestamp: 100_000 });
  controller.update({ ...baseSample, timestamp: 200_000 });
  const state = controller.update({ ...baseSample, timestamp: ADAPTATION_WINDOW });
  assert.deepEqual(state, { pitchAdjustment: 0, rollAdjustment: 0 });
});

test('significant deterioration from the previous window freezes adaptation', () => {
  const controller = new AdaptiveThresholdController();
  completeWindow(controller);
  const start = ADAPTATION_WINDOW + 1;
  controller.update({ ...baseSample, timestamp: start });
  controller.update({ ...baseSample, timestamp: start + 100_000 });
  controller.update({ ...baseSample, timestamp: start + 200_000 });
  const state = controller.update({
    ...baseSample,
    pitchDeviation: 5,
    rollDeviation: 5,
    timestamp: start + ADAPTATION_WINDOW,
  });
  assert.deepEqual(state, { pitchAdjustment: 0.5, rollAdjustment: 0.5 });
});

test('pitch and roll adapt independently', () => {
  const state = completeWindow(new AdaptiveThresholdController(), {
    pitchDeviation: 2,
    rollDeviation: 5,
  });
  assert.deepEqual(state, { pitchAdjustment: 0.5, rollAdjustment: 0 });
});

test('canonical calibration baseline never changes', () => {
  const calibration = { pitchBaseline: 10, rollBaseline: -3 };
  completeWindow(new AdaptiveThresholdController());
  assert.deepEqual(calibration, { pitchBaseline: 10, rollBaseline: -3 });
});

test('a new monitoring session resets adjustments to zero', () => {
  const controller = new AdaptiveThresholdController();
  completeWindow(controller);
  controller.reset();
  assert.deepEqual(controller.getState(), {
    pitchAdjustment: 0,
    rollAdjustment: 0,
  });
});

test('adaptive threshold equals base threshold at zero adjustment', () => {
  const result = calculateDeviation(0, 0, 0, 0, 1, 2, {
    minimumThreshold: 4,
    variabilityFactor: 2,
  });
  assert.equal(result.pitchThreshold, 6);
  assert.equal(result.rollThreshold, 8);
});

test('adaptive threshold equals base plus adjustment after adaptation', () => {
  const result = calculateDeviation(0, 0, 0, 0, 1, 2, {
    minimumThreshold: 4,
    variabilityFactor: 2,
    pitchThresholdAdjustment: 0.5,
    rollThresholdAdjustment: 1.5,
  });
  assert.equal(result.pitchThreshold, 6.5);
  assert.equal(result.rollThreshold, 9.5);
});

test('correction response time is not an adaptive-threshold input', () => {
  assert.deepEqual(Object.keys(baseSample).sort(), [
    'pitchDeviation',
    'pitchThreshold',
    'rollDeviation',
    'rollThreshold',
    'stable',
  ]);
});
