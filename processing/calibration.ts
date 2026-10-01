// processing/calibration.ts

export interface PostureSample {
    pitch: number;
    roll: number;
    timestamp: number;
}

export interface CalibrationResult {
    pitchBaseline: number;
    rollBaseline: number;
    pitchStd: number;
    rollStd: number;
    confidence: number;
    sampleCount: number;
    duration: number;
    valid: boolean;
    reason?: string;
}

function calculateMean(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }

    return (
        values.reduce((sum, value) => sum + value, 0) /
        values.length
    );
}

function calculateStd(
    values: number[],
    mean: number
): number {
    if (values.length === 0) {
        return 0;
    }

    const variance =
        values.reduce(
            (sum, value) =>
                sum + Math.pow(value - mean, 2),
            0
        ) / values.length;

    return Math.sqrt(variance);
}

export function calculateCalibration(
    samples: PostureSample[]
): CalibrationResult {

    if (samples.length < 100) {
        return {
            pitchBaseline: 0,
            rollBaseline: 0,
            pitchStd: 0,
            rollStd: 0,
            confidence: 0,
            sampleCount: samples.length,
            duration: 0,
            valid: false,
            reason: 'Not enough samples',
        };
    }

    const pitches = samples.map(
        sample => sample.pitch
    );

    const rolls = samples.map(
        sample => sample.roll
    );

    const pitchBaseline =
        calculateMean(pitches);

    const rollBaseline =
        calculateMean(rolls);

    const pitchStd =
        calculateStd(
            pitches,
            pitchBaseline
        );

    const rollStd =
        calculateStd(
            rolls,
            rollBaseline
        );

    const duration =
        (
            samples[samples.length - 1].timestamp -
            samples[0].timestamp
        ) / 1000;

    /*
     * Initial engineering limits.
     *
     * These are NOT medical thresholds.
     * They will be experimentally tuned later.
     */

    const MAX_PITCH_STD = 4;
    const MAX_ROLL_STD = 4;

    const pitchStability =
        Math.max(
            0,
            1 - pitchStd / MAX_PITCH_STD
        );

    const rollStability =
        Math.max(
            0,
            1 - rollStd / MAX_ROLL_STD
        );

    const confidence =
        (
            (pitchStability + rollStability) / 2
        ) * 100;

    const valid =
        pitchStd <= MAX_PITCH_STD &&
        rollStd <= MAX_ROLL_STD;

    return {
        pitchBaseline,
        rollBaseline,
        pitchStd,
        rollStd,
        confidence,
        sampleCount: samples.length,
        duration,
        valid,
        reason: valid
            ? undefined
            : 'Too much movement during calibration',
    };
}