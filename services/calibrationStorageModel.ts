import { CalibrationResult } from '../processing/calibration';

export const CALIBRATION_STORAGE_VERSION = 1;
export const CALIBRATION_STORAGE_KEY = 'pjt-i:canonical-calibration';

export interface StoredCalibration {
    version: typeof CALIBRATION_STORAGE_VERSION;
    savedAt: number;
    calibration: CalibrationResult;
}

export type CalibrationLoadResult =
    | { status: 'loaded'; value: StoredCalibration }
    | { status: 'missing' }
    | { status: 'invalid' }
    | { status: 'unavailable' };

export interface CalibrationStorageAdapter {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isValidCalibration(value: unknown): value is CalibrationResult {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const calibration = value as Record<string, unknown>;

    return (
        isFiniteNumber(calibration.pitchBaseline) &&
        isFiniteNumber(calibration.rollBaseline) &&
        isFiniteNumber(calibration.pitchStd) &&
        calibration.pitchStd >= 0 &&
        calibration.pitchStd <= 4 &&
        isFiniteNumber(calibration.rollStd) &&
        calibration.rollStd >= 0 &&
        calibration.rollStd <= 4 &&
        isFiniteNumber(calibration.confidence) &&
        calibration.confidence >= 0 &&
        calibration.confidence <= 100 &&
        isFiniteNumber(calibration.sampleCount) &&
        Number.isInteger(calibration.sampleCount) &&
        calibration.sampleCount >= 100 &&
        isFiniteNumber(calibration.duration) &&
        calibration.duration >= 0 &&
        calibration.valid === true &&
        (calibration.reason === undefined || typeof calibration.reason === 'string')
    );
}

function parseStoredCalibration(value: unknown): StoredCalibration | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    const stored = value as Record<string, unknown>;

    if (
        stored.version !== CALIBRATION_STORAGE_VERSION ||
        !isFiniteNumber(stored.savedAt) ||
        stored.savedAt <= 0 ||
        !isValidCalibration(stored.calibration)
    ) {
        return null;
    }

    return stored as unknown as StoredCalibration;
}

export function createCalibrationStorage(adapter: CalibrationStorageAdapter) {
    return {
        async load(): Promise<CalibrationLoadResult> {
            try {
                const serialized = await adapter.getItem(CALIBRATION_STORAGE_KEY);

                if (serialized === null) {
                    return { status: 'missing' };
                }

                let parsed: unknown;

                try {
                    parsed = JSON.parse(serialized) as unknown;
                } catch {
                    return { status: 'invalid' };
                }

                const stored = parseStoredCalibration(parsed);

                return stored === null
                    ? { status: 'invalid' }
                    : { status: 'loaded', value: stored };
            } catch {
                return { status: 'unavailable' };
            }
        },

        async save(
            calibration: CalibrationResult,
            savedAt: number = Date.now()
        ): Promise<boolean> {
            const stored: StoredCalibration = {
                version: CALIBRATION_STORAGE_VERSION,
                savedAt,
                calibration,
            };

            if (parseStoredCalibration(stored) === null) {
                return false;
            }

            try {
                await adapter.setItem(
                    CALIBRATION_STORAGE_KEY,
                    JSON.stringify(stored)
                );
                return true;
            } catch {
                return false;
            }
        },
    };
}
