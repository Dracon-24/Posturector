import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateDeviation } from '../processing/deviation.ts';
import { loadAdaptiveThresholdModules } from './loadTypeScriptModule.mjs';

const { config, controller, features } = await loadAdaptiveThresholdModules();
const {
  AdaptiveThresholdController,
  MAX_ADAPTIVE_ADJUSTMENT,
} = controller;
const {
  TimeAwareEma,
  clamp01,
  combineEqualWeightEvidence,
  isNearThreshold,
  normalizeCorrectionResponse,
  normalizeDecliningTrend,
  normalizeDeviationRatio,
  normalizeGoodPostureDuration,
  normalizeIncreasingTrend,
} = features;
const { PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG } = config;

function createAdaptiveController() {
  return new AdaptiveThresholdController(PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG);
}

function sample(timestamp, pitchDeviation, rollDeviation = pitchDeviation, stable = true) {
  return {
    timestamp,
    pitchDeviation,
    rollDeviation,
    pitchThreshold: 6,
    rollThreshold: 6,
    stable,
  };
}

function establishMeaningfulHistory(adaptive) {
  adaptive.recordCompletedCorrection(2, 120_000);
  adaptive.recordCompletedCorrection(2.5, 300_000);
  adaptive.recordCompletedCorrection(3, 480_000);

  for (let timestamp = 0; timestamp <= 600_000; timestamp += 6_000) {
    const closesGoodPeriod = timestamp === 120_000 || timestamp === 360_000;
    adaptive.update(sample(timestamp, closesGoodPeriod ? 6.5 : 2));
  }
}

function applyControlledDeterioration(adaptive, start = 606_000, duration = 1_800_000) {
  let correctionTimestamp = start + 120_000;
  let correctionTime = 4;

  for (let timestamp = start; timestamp <= start + duration; timestamp += 6_000) {
    const progress = (timestamp - start) / duration;
    const periodicOutside = ((timestamp - start) / 6_000) % 8 === 7;
    const deviation = periodicOutside
      ? 6.5
      : 3 + 2.8 * progress;

    if (timestamp >= correctionTimestamp) {
      adaptive.recordCompletedCorrection(correctionTime, timestamp);
      correctionTime = Math.min(11, correctionTime + 0.75);
      correctionTimestamp += 120_000;
    }

    adaptive.update(sample(timestamp, deviation, 2));
  }
}

function applyRecovery(adaptive, start, duration = 1_800_000) {
  let correctionTimestamp = start + 120_000;

  for (let timestamp = start; timestamp <= start + duration; timestamp += 6_000) {
    if (timestamp >= correctionTimestamp) {
      adaptive.recordCompletedCorrection(2, timestamp);
      correctionTimestamp += 120_000;
    }
    adaptive.update(sample(timestamp, 1.5));
  }
}

test('all five feature normalization paths are deterministic and bounded 0-1', () => {
  const values = [
    clamp01(-2),
    clamp01(2),
    normalizeDeviationRatio(9, 6),
    normalizeCorrectionResponse(7),
    normalizeGoodPostureDuration(30),
    normalizeIncreasingTrend(0.8, 0.4),
    normalizeDecliningTrend(0.2, 0.7),
  ];
  for (const value of values) {
    assert.ok(value >= 0 && value <= 1);
  }
  assert.equal(normalizeDeviationRatio(6, 6), 0.5);
  assert.equal(normalizeCorrectionResponse(6), 0.5);
  assert.equal(normalizeGoodPostureDuration(
    30,
    PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG.goodPostureDurationReference
  ), 0.5);
  assert.equal(isNearThreshold(5, 6), true);
  assert.equal(isNearThreshold(7, 6), false);
});

test('combined evidence uses an equal arithmetic mean and stays bounded', () => {
  const evidence = combineEqualWeightEvidence({
    deviationTrend: 0,
    deviationFrequency: 0.25,
    correctionTrend: 0.5,
    goodPostureDecline: 0.75,
    nearThresholdExposure: 1,
  });
  assert.equal(evidence, 0.5);
  assert.equal(combineEqualWeightEvidence({
    deviationTrend: 2,
    deviationFrequency: 2,
    correctionTrend: 2,
    goodPostureDecline: 2,
    nearThresholdExposure: 2,
  }), 1);
});

test('time-aware EMA initializes safely, follows elapsed time, and remains bounded', () => {
  const ema = new TimeAwareEma(1_000);
  assert.equal(ema.update(0.25, 0), 0.25);
  const next = ema.update(1, 1_000);
  assert.ok(next > 0.25 && next < 1);
  assert.equal(ema.update(5, 2_000) <= 1, true);
  ema.reset();
  assert.equal(ema.getValue(), 0);
});

test('read-only diagnostics expose the existing short-term and long-term feature EMAs', () => {
  const adaptive = createAdaptiveController();
  establishMeaningfulHistory(adaptive);
  const diagnostics = adaptive.getDiagnostics().pitch;

  for (const emaValue of Object.values(diagnostics.featureEmaValues)) {
    assert.ok(emaValue.shortTerm >= 0 && emaValue.shortTerm <= 1);
    assert.ok(emaValue.longTerm >= 0 && emaValue.longTerm <= 1);
  }

  assert.equal(
    diagnostics.featureEmaValues.correction.shortTerm,
    adaptive.getDiagnostics().roll.featureEmaValues.correction.shortTerm
  );
});

test('new session starts and resets with zero independent adjustments and EMA', () => {
  const adaptive = createAdaptiveController();
  assert.deepEqual(adaptive.getState(), { pitchAdjustment: 0, rollAdjustment: 0 });
  establishMeaningfulHistory(adaptive);
  applyControlledDeterioration(adaptive);
  adaptive.reset();
  assert.deepEqual(adaptive.getState(), { pitchAdjustment: 0, rollAdjustment: 0 });
  assert.equal(adaptive.getDiagnostics().pitch.evidenceEma, 0);
});

test('insufficient data, instability, and severe deviation freeze adaptation', () => {
  const adaptive = createAdaptiveController();
  for (let timestamp = 0; timestamp < 60_000; timestamp += 1_000) {
    adaptive.update(sample(timestamp, 5.5));
  }
  assert.equal(adaptive.getDiagnostics().pitch.dataSufficient, false);
  assert.equal(adaptive.getState().pitchAdjustment, 0);

  adaptive.update(sample(61_000, 5.5, 5.5, false));
  assert.equal(adaptive.getDiagnostics().pitch.unstable, true);
  adaptive.update(sample(62_000, 13));
  assert.equal(adaptive.getDiagnostics().pitch.severeDeviation, true);
  assert.equal(adaptive.getState().pitchAdjustment, 0);
});

test('normal stable posture produces low evidence without unnecessary relaxation', () => {
  const adaptive = createAdaptiveController();
  establishMeaningfulHistory(adaptive);
  assert.ok(adaptive.getDiagnostics().pitch.evidenceEma < 0.4);
  assert.equal(adaptive.getState().pitchAdjustment, 0);
});

test('habitual constant bad posture does not look like progressive deterioration', () => {
  const adaptive = createAdaptiveController();
  establishMeaningfulHistory(adaptive);
  for (let timestamp = 606_000; timestamp <= 1_806_000; timestamp += 6_000) {
    adaptive.update(sample(timestamp, 7));
  }
  assert.equal(adaptive.getState().pitchAdjustment, 0);
  assert.ok(adaptive.getDiagnostics().pitch.evidenceEma < 0.3);
});

test('controlled prolonged-use evidence produces gradual bounded axis-specific relaxation', () => {
  const adaptive = createAdaptiveController();
  establishMeaningfulHistory(adaptive);
  applyControlledDeterioration(adaptive);
  const state = adaptive.getState();
  assert.ok(state.pitchAdjustment > 0);
  assert.ok(state.pitchAdjustment <= MAX_ADAPTIVE_ADJUSTMENT);
  assert.equal(state.rollAdjustment, 0);
  assert.ok(adaptive.getDiagnostics().pitch.evidenceEma > 0.3);
});

test('one isolated bad sample cannot cause a large threshold jump', () => {
  const adaptive = createAdaptiveController();
  establishMeaningfulHistory(adaptive);
  const before = adaptive.getState().pitchAdjustment;
  adaptive.update(sample(606_000, 11));
  const change = adaptive.getState().pitchAdjustment - before;
  assert.ok(change <= 0.25);
});

test('instability freezes an already elevated temporary adjustment', () => {
  const adaptive = createAdaptiveController();
  establishMeaningfulHistory(adaptive);
  applyControlledDeterioration(adaptive);
  const before = adaptive.getState().pitchAdjustment;
  assert.ok(before > 0);
  adaptive.update(sample(2_412_000, 5.5, 2, false));
  assert.equal(adaptive.getState().pitchAdjustment, before);
  assert.equal(adaptive.getDiagnostics().pitch.unstable, true);
});

test('severe and major deterioration veto high evidence and keep poor posture outside', () => {
  const adaptive = createAdaptiveController();
  establishMeaningfulHistory(adaptive);
  applyControlledDeterioration(adaptive);
  const before = adaptive.getState().pitchAdjustment;
  adaptive.update(sample(2_412_000, 20));
  assert.equal(adaptive.getState().pitchAdjustment, before);
  assert.equal(adaptive.getDiagnostics().pitch.severeDeviation, true);

  const deviation = calculateDeviation(20, 0, 0, 0, 1, 1, {
    minimumThreshold: 4,
    variabilityFactor: 2,
    pitchThresholdAdjustment: adaptive.getState().pitchAdjustment,
  });
  assert.equal(deviation.pitchOutside, true);
});

test('simultaneous major deviation and frequency deterioration freezes relaxation', () => {
  const adaptive = createAdaptiveController();
  establishMeaningfulHistory(adaptive);
  let majorDeteriorationObserved = false;
  let adjustmentAtVeto = 0;

  for (let timestamp = 606_000; timestamp <= 1_206_000; timestamp += 6_000) {
    const before = adaptive.getState().pitchAdjustment;
    adaptive.update(sample(timestamp, 6.5, 2));
    if (adaptive.getDiagnostics().pitch.majorDeterioration) {
      majorDeteriorationObserved = true;
      adjustmentAtVeto = adaptive.getState().pitchAdjustment;
      assert.equal(adjustmentAtVeto, before);
      break;
    }
  }

  assert.equal(majorDeteriorationObserved, true);
});

test('recovery lowers evidence and returns the temporary threshold toward baseline', () => {
  const adaptive = createAdaptiveController();
  establishMeaningfulHistory(adaptive);
  applyControlledDeterioration(adaptive);
  const elevated = adaptive.getState().pitchAdjustment;
  assert.ok(elevated > 0);
  applyRecovery(adaptive, 2_412_000);
  assert.ok(adaptive.getState().pitchAdjustment < elevated);
  assert.ok(adaptive.getState().pitchAdjustment >= 0);
});

test('canonical calibration baseline stays immutable and effective thresholds use adjustment', () => {
  const calibration = { pitchBaseline: 10, rollBaseline: -3, pitchStd: 1, rollStd: 2 };
  const result = calculateDeviation(10, -3, 10, -3, 1, 2, {
    minimumThreshold: 4,
    variabilityFactor: 2,
    pitchThresholdAdjustment: 1,
    rollThresholdAdjustment: 2,
  });
  assert.equal(result.pitchThreshold, 7);
  assert.equal(result.rollThreshold, 10);
  assert.deepEqual(calibration, { pitchBaseline: 10, rollBaseline: -3, pitchStd: 1, rollStd: 2 });
});
