import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './loadTypeScriptModule.mjs';

const { createCalibrationStorage, CALIBRATION_STORAGE_KEY, CALIBRATION_STORAGE_VERSION } =
  await loadTypeScriptModule('../services/calibrationStorageModel.ts', import.meta.url);

const validCalibration = {
  pitchBaseline: 89.5, rollBaseline: 1.2, pitchStd: 0.8, rollStd: 0.7,
  confidence: 81.25, sampleCount: 1500, duration: 30, valid: true,
};

function memoryAdapter(initial = null) {
  let value = initial;
  return {
    async getItem(key) { assert.equal(key, CALIBRATION_STORAGE_KEY); return value; },
    async setItem(key, next) { assert.equal(key, CALIBRATION_STORAGE_KEY); value = next; },
    value: () => value,
  };
}

test('first launch without calibration reports missing', async () => {
  assert.deepEqual(await createCalibrationStorage(memoryAdapter()).load(), { status: 'missing' });
});

test('valid calibration saves and loads with timestamp and version', async () => {
  const adapter = memoryAdapter();
  const storage = createCalibrationStorage(adapter);
  assert.equal(await storage.save(validCalibration, 123456), true);
  const result = await storage.load();
  assert.equal(result.status, 'loaded');
  assert.equal(result.value.version, CALIBRATION_STORAGE_VERSION);
  assert.equal(result.value.savedAt, 123456);
  assert.deepEqual(result.value.calibration, validCalibration);
});

test('corrupt JSON and invalid calibration fall back safely', async () => {
  assert.deepEqual(await createCalibrationStorage(memoryAdapter('{')).load(), { status: 'invalid' });
  const invalid = JSON.stringify({ version: 1, savedAt: 123, calibration: { ...validCalibration, valid: false } });
  assert.deepEqual(await createCalibrationStorage(memoryAdapter(invalid)).load(), { status: 'invalid' });
});

test('non-finite and out-of-contract values are rejected without repair', async () => {
  const storage = createCalibrationStorage(memoryAdapter());
  assert.equal(await storage.save({ ...validCalibration, pitchStd: 5 }, 123), false);
  assert.equal(await storage.save({ ...validCalibration, sampleCount: 99 }, 123), false);
  assert.equal(await storage.save({ ...validCalibration, confidence: Number.NaN }, 123), false);
});

test('storage failures report unavailable and preserve explicit failure', async () => {
  const storage = createCalibrationStorage({
    async getItem() { throw new Error('unavailable'); },
    async setItem() { throw new Error('unavailable'); },
  });
  assert.deepEqual(await storage.load(), { status: 'unavailable' });
  assert.equal(await storage.save(validCalibration, 123), false);
});
