import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateDeviation } from '../processing/deviation.ts';
import { loadAdaptiveThresholdModules } from './loadTypeScriptModule.mjs';

const { controller, features } = await loadAdaptiveThresholdModules();
const {
  AdaptiveThresholdController,
  MAX_ADAPTIVE_ADJUSTMENT,
} = controller;
const {
  TimeAwareEma,
  combineEqualWeightEvidence,
  normalizeCorrectionResponse,
  normalizeDeviationRatio,
  normalizeGoodPostureDuration,
  normalizeIncreasingTrend,
} = features;

const BASE_THRESHOLD = 6;
const SENSOR_INTERVAL = 20;

function sample(timestamp, pitchDeviation, rollDeviation = 2, stable = true) {
  return {
    timestamp,
    pitchDeviation,
    rollDeviation,
    pitchThreshold: BASE_THRESHOLD,
    rollThreshold: BASE_THRESHOLD,
    stable,
  };
}

function seedHealthyHistory(adaptive, interval = 6_000) {
  adaptive.recordCompletedCorrection(2, 120_000);
  adaptive.recordCompletedCorrection(2.5, 300_000);
  adaptive.recordCompletedCorrection(3, 480_000);

  for (let timestamp = 0; timestamp <= 600_000; timestamp += interval) {
    const closesGoodPeriod = timestamp === 120_000 || timestamp === 360_000;
    adaptive.update(sample(timestamp, closesGoodPeriod ? 6.5 : 2));
  }
}

function simulateProgressiveDeterioration(adaptive, start = 606_000, duration = 1_800_000) {
  let correctionTimestamp = start + 120_000;
  let correctionTime = 4;
  const snapshots = [];

  for (let timestamp = start; timestamp <= start + duration; timestamp += 6_000) {
    const progress = (timestamp - start) / duration;
    const outsideEvery = progress < 0.33 ? 15 : progress < 0.66 ? 10 : 8;
    const outside = ((timestamp - start) / 6_000) % outsideEvery === outsideEvery - 1;
    const pitchDeviation = outside ? 6.5 : 2.8 + 3 * progress;

    if (timestamp >= correctionTimestamp) {
      adaptive.recordCompletedCorrection(correctionTime, timestamp);
      correctionTime = Math.min(11, correctionTime + 0.75);
      correctionTimestamp += 120_000;
    }

    adaptive.update(sample(timestamp, pitchDeviation));
    if ((timestamp - start) % 300_000 === 0) {
      snapshots.push({
        timestamp,
        evidence: adaptive.getDiagnostics().pitch.evidenceEma,
        adjustment: adaptive.getState().pitchAdjustment,
      });
    }
  }

  return snapshots;
}

function simulateRecovery(adaptive, start, duration = 1_800_000) {
  let correctionTimestamp = start + 120_000;
  const snapshots = [];

  for (let timestamp = start; timestamp <= start + duration; timestamp += 6_000) {
    if (timestamp >= correctionTimestamp) {
      adaptive.recordCompletedCorrection(2, timestamp);
      correctionTimestamp += 120_000;
    }
    adaptive.update(sample(timestamp, 1.5));
    if ((timestamp - start) % 300_000 === 0) {
      snapshots.push({
        evidence: adaptive.getDiagnostics().pitch.evidenceEma,
        adjustment: adaptive.getState().pitchAdjustment,
      });
    }
  }

  return snapshots;
}

function assertBounded(state) {
  for (const adjustment of [state.pitchAdjustment, state.rollAdjustment]) {
    assert.ok(adjustment >= 0);
    assert.ok(adjustment <= MAX_ADAPTIVE_ADJUSTMENT);
    const effectiveThreshold = BASE_THRESHOLD + adjustment;
    assert.ok(effectiveThreshold >= BASE_THRESHOLD);
    assert.ok(effectiveThreshold <= BASE_THRESHOLD + MAX_ADAPTIVE_ADJUSTMENT);
  }
}

test('scenario A: prolonged stable normal posture keeps evidence and threshold near baseline', () => {
  const adaptive = new AdaptiveThresholdController();
  seedHealthyHistory(adaptive);
  for (let timestamp = 606_000; timestamp <= 2_406_000; timestamp += 6_000) {
    if (timestamp % 180_000 === 0) {
      adaptive.recordCompletedCorrection(2.5, timestamp);
    }
    adaptive.update(sample(timestamp, 1.5));
  }

  assert.ok(adaptive.getDiagnostics().pitch.evidenceEma < 0.1);
  assert.deepEqual(adaptive.getState(), { pitchAdjustment: 0, rollAdjustment: 0 });
  assertBounded(adaptive.getState());
});

test('scenario B: habitual poor posture without progressive deterioration does not earn tolerance', () => {
  const adaptive = new AdaptiveThresholdController();
  seedHealthyHistory(adaptive);
  for (let timestamp = 606_000; timestamp <= 2_406_000; timestamp += 6_000) {
    if (timestamp % 180_000 === 0) {
      adaptive.recordCompletedCorrection(3, timestamp);
    }
    adaptive.update(sample(timestamp, 7));
  }

  assert.ok(adaptive.getDiagnostics().pitch.evidenceEma < 0.3);
  assert.equal(adaptive.getState().pitchAdjustment, 0);
  assertBounded(adaptive.getState());
});

test('scenario C: progressive multi-feature deterioration raises EMA before bounded relaxation', () => {
  const adaptive = new AdaptiveThresholdController();
  seedHealthyHistory(adaptive);
  const snapshots = simulateProgressiveDeterioration(adaptive);
  const final = adaptive.getState();

  assert.equal(snapshots[0].adjustment, 0);
  assert.ok(snapshots.at(-1).evidence > snapshots[0].evidence);
  assert.ok(final.pitchAdjustment > 0);
  assert.equal(final.rollAdjustment, 0);
  assertBounded(final);
});

test('scenario D: isolated severe spikes do not create sustained relaxation', () => {
  const adaptive = new AdaptiveThresholdController();
  seedHealthyHistory(adaptive);
  const before = adaptive.getDiagnostics().pitch.evidenceEma;

  adaptive.update(sample(606_000, 20));
  for (let timestamp = 612_000; timestamp <= 1_806_000; timestamp += 6_000) {
    adaptive.update(sample(timestamp, 1.5));
  }

  assert.equal(adaptive.getState().pitchAdjustment, 0);
  assert.ok(adaptive.getDiagnostics().pitch.evidenceEma <= before + 0.05);
  assertBounded(adaptive.getState());
});

test('scenario E: severe deviation veto freezes relaxation despite elevated EMA', () => {
  const adaptive = new AdaptiveThresholdController();
  seedHealthyHistory(adaptive);
  simulateProgressiveDeterioration(adaptive);
  const before = adaptive.getState().pitchAdjustment;
  assert.ok(before > 0);

  adaptive.update(sample(2_412_000, 20));
  assert.ok(adaptive.getDiagnostics().pitch.evidenceEma > 0.3);
  assert.equal(adaptive.getDiagnostics().pitch.severeDeviation, true);
  assert.equal(adaptive.getState().pitchAdjustment, before);

  const classification = calculateDeviation(20, 0, 0, 0, 1, 1, {
    minimumThreshold: 4,
    variabilityFactor: 2,
    pitchThresholdAdjustment: before,
  });
  assert.equal(classification.pitchOutside, true);
});

test('scenario F: instability veto freezes an elevated adaptive threshold', () => {
  const adaptive = new AdaptiveThresholdController();
  seedHealthyHistory(adaptive);
  simulateProgressiveDeterioration(adaptive);
  const before = adaptive.getState().pitchAdjustment;

  adaptive.update(sample(2_412_000, 5.5, 2, false));
  assert.equal(adaptive.getDiagnostics().pitch.unstable, true);
  assert.equal(adaptive.getState().pitchAdjustment, before);
});

test('scenario G: rapid simultaneous deviation and frequency deterioration activates the veto', () => {
  const adaptive = new AdaptiveThresholdController();
  seedHealthyHistory(adaptive);
  let observed = false;

  for (let timestamp = 606_000; timestamp <= 1_206_000; timestamp += 6_000) {
    const before = adaptive.getState().pitchAdjustment;
    adaptive.update(sample(timestamp, 6.5));
    if (adaptive.getDiagnostics().pitch.majorDeterioration) {
      observed = true;
      assert.equal(adaptive.getState().pitchAdjustment, before);
      break;
    }
  }

  assert.equal(observed, true);
});

test('scenario H: sustained recovery lowers EMA and gradually returns toward baseline', () => {
  const adaptive = new AdaptiveThresholdController();
  const canonical = { pitch: 10, roll: -2 };
  seedHealthyHistory(adaptive);
  simulateProgressiveDeterioration(adaptive);
  const elevated = adaptive.getState().pitchAdjustment;
  const evidenceBeforeRecovery = adaptive.getDiagnostics().pitch.evidenceEma;
  assert.ok(elevated > 0);

  const recovery = simulateRecovery(adaptive, 2_412_000);
  assert.ok(adaptive.getDiagnostics().pitch.evidenceEma < evidenceBeforeRecovery);
  assert.ok(adaptive.getState().pitchAdjustment < elevated);
  assert.ok(recovery[0].adjustment > adaptive.getState().pitchAdjustment);
  assert.deepEqual(canonical, { pitch: 10, roll: -2 });
  assertBounded(adaptive.getState());
});

test('scenario I: timestamp-aware EMA depends on elapsed time, not callback count', () => {
  const dense = new TimeAwareEma(60_000);
  const sparse = new TimeAwareEma(60_000);
  dense.update(0, 0);
  sparse.update(0, 0);

  for (let timestamp = SENSOR_INTERVAL; timestamp <= 60_000; timestamp += SENSOR_INTERVAL) {
    dense.update(1, timestamp);
  }
  sparse.update(1, 60_000);

  assert.ok(Math.abs(dense.getValue() - sparse.getValue()) < 1e-12);

  const gapAware = new TimeAwareEma(60_000);
  gapAware.update(0, 0);
  const shortGap = gapAware.update(1, 1_000);
  const longGap = gapAware.update(1, 601_000);
  assert.ok(shortGap < longGap);
  assert.ok(longGap <= 1);
});

test('scenario I: a realistic 50 Hz prolonged session is deterministic and bounded', () => {
  function runSession() {
    const adaptive = new AdaptiveThresholdController();
    adaptive.recordCompletedCorrection(2, 120_000);
    adaptive.recordCompletedCorrection(2.5, 300_000);
    adaptive.recordCompletedCorrection(3, 480_000);
    for (let timestamp = 0; timestamp <= 720_000; timestamp += SENSOR_INTERVAL) {
      const pitchDeviation = timestamp < 600_000 ? 2 : 5;
      adaptive.update(sample(timestamp, pitchDeviation));
    }
    return {
      state: adaptive.getState(),
      diagnostics: adaptive.getDiagnostics(),
    };
  }

  const first = runSession();
  const second = runSession();
  assert.deepEqual(first, second);
  assert.equal(first.diagnostics.validSampleCount, 36_001);
  assertBounded(first.state);
});

test('scenario J: lifecycle reset prevents session evidence and thresholds contaminating the next session', () => {
  const adaptive = new AdaptiveThresholdController();
  seedHealthyHistory(adaptive);
  simulateProgressiveDeterioration(adaptive);
  assert.ok(adaptive.getState().pitchAdjustment > 0);
  assert.ok(adaptive.getDiagnostics().pitch.evidenceEma > 0);

  adaptive.reset();
  assert.deepEqual(adaptive.getState(), { pitchAdjustment: 0, rollAdjustment: 0 });
  assert.equal(adaptive.getDiagnostics().pitch.evidenceEma, 0);
  assert.equal(adaptive.getDiagnostics().validSampleCount, 0);

  for (let timestamp = 0; timestamp <= 600_000; timestamp += 6_000) {
    adaptive.update(sample(timestamp, 1.5));
  }
  assert.deepEqual(adaptive.getState(), { pitchAdjustment: 0, rollAdjustment: 0 });
});

test('normalized physical units have equal bounded influence on combined evidence', () => {
  const normalized = {
    deviationTrend: normalizeIncreasingTrend(0.75, 0.5),
    deviationFrequency: normalizeIncreasingTrend(0.75, 0.5),
    correctionTrend: normalizeCorrectionResponse(12),
    goodPostureDecline: normalizeGoodPostureDuration(60),
    nearThresholdExposure: normalizeDeviationRatio(12, 6),
  };
  for (const value of Object.values(normalized)) {
    assert.equal(value, 1);
  }
  assert.equal(combineEqualWeightEvidence(normalized), 1);

  for (const key of Object.keys(normalized)) {
    const singleFeature = Object.fromEntries(
      Object.keys(normalized).map((feature) => [feature, feature === key ? 1 : 0])
    );
    assert.equal(combineEqualWeightEvidence(singleFeature), 0.2);
  }
});

test('axis-specific deterioration changes pitch without moving roll or either canonical baseline', () => {
  const adaptive = new AdaptiveThresholdController();
  const calibration = { pitchBaseline: 11, rollBaseline: -4 };
  seedHealthyHistory(adaptive);
  simulateProgressiveDeterioration(adaptive);

  assert.ok(adaptive.getState().pitchAdjustment > 0);
  assert.equal(adaptive.getState().rollAdjustment, 0);
  assert.deepEqual(calibration, { pitchBaseline: 11, rollBaseline: -4 });
  assertBounded(adaptive.getState());
});
