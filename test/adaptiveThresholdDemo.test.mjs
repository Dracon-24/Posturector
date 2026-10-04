import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAdaptiveThresholdModules } from './loadTypeScriptModule.mjs';

const { config, controller } = await loadAdaptiveThresholdModules();
const { AdaptiveThresholdController } = controller;
const {
  ACTIVE_ADAPTIVE_THRESHOLD_CONFIG,
  ADAPTIVE_THRESHOLD_DEMO_MODE,
  DEMO_ADAPTIVE_THRESHOLD_CONFIG,
  PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG,
} = config;

function sample(timestamp, pitchDeviation, stable = true) {
  return {
    timestamp,
    pitchDeviation,
    rollDeviation: 2,
    pitchThreshold: 6,
    rollThreshold: 6,
    stable,
  };
}

function seedHealthyEvidence(controllerInstance) {
  controllerInstance.recordCompletedCorrection(2, 4_000);
  controllerInstance.recordCompletedCorrection(2.5, 10_000);
  controllerInstance.recordCompletedCorrection(3, 16_000);

  for (let timestamp = 0; timestamp <= 20_000; timestamp += 200) {
    const closesGoodPeriod = timestamp === 6_000 || timestamp === 14_000;
    controllerInstance.update(sample(timestamp, closesGoodPeriod ? 6.5 : 2));
  }
}

function applyReviewDeterioration(controllerInstance) {
  let correctionTimestamp = 30_000;
  let responseTime = 4;
  const snapshots = [];

  for (let timestamp = 20_200; timestamp <= 90_000; timestamp += 200) {
    const progress = (timestamp - 20_000) / 70_000;
    const phaseTime = (timestamp - 20_000) % 5_000;
    const deviation = phaseTime < 1_000 ? 6.5 : 3 + 2.8 * progress;

    if (timestamp >= correctionTimestamp) {
      controllerInstance.recordCompletedCorrection(responseTime, timestamp);
      responseTime = Math.min(11, responseTime + 1);
      correctionTimestamp += 10_000;
    }

    controllerInstance.update(sample(timestamp, deviation));
    if (timestamp % 10_000 === 0) {
      snapshots.push({
        timestamp,
        evidence: controllerInstance.getDiagnostics().pitch.evidenceEma,
        adjustment: controllerInstance.getState().pitchAdjustment,
      });
    }
  }

  return snapshots;
}

function applyReviewRecovery(controllerInstance) {
  let correctionTimestamp = 96_000;
  const snapshots = [];

  for (let timestamp = 90_200; timestamp <= 120_000; timestamp += 200) {
    if (timestamp >= correctionTimestamp) {
      controllerInstance.recordCompletedCorrection(2, timestamp);
      correctionTimestamp += 6_000;
    }
    controllerInstance.update(sample(timestamp, 1.5));
    if (timestamp % 5_000 === 0) {
      snapshots.push({
        evidence: controllerInstance.getDiagnostics().pitch.evidenceEma,
        adjustment: controllerInstance.getState().pitchAdjustment,
      });
    }
  }

  return snapshots;
}

test('production timing remains accessible while temporary demo timing is the active default', () => {
  assert.equal(ADAPTIVE_THRESHOLD_DEMO_MODE, true);
  assert.equal(ACTIVE_ADAPTIVE_THRESHOLD_CONFIG.mode, 'DEMO');
  assert.equal(PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG.mode, 'PRODUCTION');
  assert.equal(DEMO_ADAPTIVE_THRESHOLD_CONFIG.mode, 'DEMO');

  assert.equal(PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG.shortTermFeatureTau, 120_000);
  assert.equal(PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG.longTermFeatureTau, 600_000);
  assert.equal(PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG.evidenceEmaTau, 600_000);
  assert.equal(PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG.minimumObservationDuration, 600_000);
  assert.equal(PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG.maximumAdjustmentRatePerMinute, 0.25);

  assert.equal(DEMO_ADAPTIVE_THRESHOLD_CONFIG.shortTermFeatureTau, 5_000);
  assert.equal(DEMO_ADAPTIVE_THRESHOLD_CONFIG.longTermFeatureTau, 30_000);
  assert.equal(DEMO_ADAPTIVE_THRESHOLD_CONFIG.evidenceEmaTau, 15_000);
  assert.equal(DEMO_ADAPTIVE_THRESHOLD_CONFIG.minimumObservationDuration, 20_000);
  assert.equal(DEMO_ADAPTIVE_THRESHOLD_CONFIG.maximumAdjustmentRatePerMinute, 1.5);
});

test('same behavioral input produces a substantially faster demo response than production', () => {
  const production = new AdaptiveThresholdController(PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG);
  const demo = new AdaptiveThresholdController(DEMO_ADAPTIVE_THRESHOLD_CONFIG);
  seedHealthyEvidence(production);
  seedHealthyEvidence(demo);
  const productionSnapshots = applyReviewDeterioration(production);
  const demoSnapshots = applyReviewDeterioration(demo);

  assert.equal(production.getState().pitchAdjustment, 0);
  assert.ok(demo.getState().pitchAdjustment > 0);
  assert.ok(demo.getState().pitchAdjustment <= 3);
  assert.ok(demoSnapshots.at(-1).evidence > productionSnapshots.at(-1).evidence);
  assert.ok(demoSnapshots.some((snapshot) => snapshot.adjustment > 0));
});

test('demo recovery remains gradual and moves the effective threshold toward baseline', () => {
  const demo = new AdaptiveThresholdController(DEMO_ADAPTIVE_THRESHOLD_CONFIG);
  const canonical = { pitchBaseline: 90, rollBaseline: 0 };
  seedHealthyEvidence(demo);
  applyReviewDeterioration(demo);
  const elevated = demo.getState().pitchAdjustment;
  const evidenceBefore = demo.getDiagnostics().pitch.evidenceEma;
  assert.ok(elevated > 0);

  const recovery = applyReviewRecovery(demo);
  assert.ok(demo.getDiagnostics().pitch.evidenceEma < evidenceBefore);
  assert.ok(demo.getState().pitchAdjustment < elevated);
  assert.ok(recovery[0].adjustment > demo.getState().pitchAdjustment);
  assert.ok(demo.getState().pitchAdjustment >= 0);
  assert.deepEqual(canonical, { pitchBaseline: 90, rollBaseline: 0 });
});

test('elapsed demo time alone cannot cause adaptation without behavioral evidence', () => {
  const demo = new AdaptiveThresholdController(DEMO_ADAPTIVE_THRESHOLD_CONFIG);
  seedHealthyEvidence(demo);
  for (let timestamp = 20_200; timestamp <= 120_000; timestamp += 200) {
    demo.update(sample(timestamp, 2));
  }
  assert.ok(demo.getDiagnostics().pitch.evidenceEma < 0.3);
  assert.equal(demo.getState().pitchAdjustment, 0);
});

test('demo mode preserves insufficient-data, instability, and severe-deviation vetoes', () => {
  const insufficient = new AdaptiveThresholdController(DEMO_ADAPTIVE_THRESHOLD_CONFIG);
  for (let timestamp = 0; timestamp < 10_000; timestamp += 200) {
    insufficient.update(sample(timestamp, 5.5));
  }
  assert.equal(insufficient.getDiagnostics().pitch.dataSufficient, false);
  assert.equal(insufficient.getState().pitchAdjustment, 0);

  const demo = new AdaptiveThresholdController(DEMO_ADAPTIVE_THRESHOLD_CONFIG);
  seedHealthyEvidence(demo);
  applyReviewDeterioration(demo);
  const elevated = demo.getState().pitchAdjustment;
  assert.ok(elevated > 0);

  demo.update(sample(90_200, 5.5, false));
  assert.equal(demo.getDiagnostics().pitch.unstable, true);
  assert.equal(demo.getState().pitchAdjustment, elevated);

  demo.update(sample(90_400, 20));
  assert.equal(demo.getDiagnostics().pitch.severeDeviation, true);
  assert.equal(demo.getState().pitchAdjustment, elevated);
});

test('demo mode preserves major-deterioration veto and the +3 degree cap', () => {
  const demo = new AdaptiveThresholdController(DEMO_ADAPTIVE_THRESHOLD_CONFIG);
  seedHealthyEvidence(demo);
  let majorDeteriorationObserved = false;

  for (let timestamp = 20_200; timestamp <= 50_000; timestamp += 200) {
    const before = demo.getState().pitchAdjustment;
    demo.update(sample(timestamp, 6.5));
    assert.ok(demo.getState().pitchAdjustment <= 3);
    if (demo.getDiagnostics().pitch.majorDeterioration) {
      majorDeteriorationObserved = true;
      assert.equal(demo.getState().pitchAdjustment, before);
      break;
    }
  }

  assert.equal(majorDeteriorationObserved, true);
  assert.equal(DEMO_ADAPTIVE_THRESHOLD_CONFIG.maximumAdaptiveAdjustment, 3);
  assert.equal(
    DEMO_ADAPTIVE_THRESHOLD_CONFIG.maximumAdaptiveAdjustment,
    PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG.maximumAdaptiveAdjustment
  );
});

test('demo and production profiles retain identical safety thresholds and data counts', () => {
  for (const key of [
    'minimumValidSamples',
    'minimumCorrectionResponses',
    'minimumGoodPosturePeriods',
    'evidenceActivationThreshold',
    'maximumAdaptiveAdjustment',
    'severeDeviationMultiplier',
    'majorDeteriorationThreshold',
  ]) {
    assert.equal(
      DEMO_ADAPTIVE_THRESHOLD_CONFIG[key],
      PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG[key]
    );
  }
});
