export const ADAPTATION_WINDOW = 5 * 60 * 1000;
export const ADAPTATION_STEP = 0.5;
export const MAX_ADAPTIVE_ADJUSTMENT = 3;
export const MIN_ACCEPTABLE_RATIO = 0.70;
export const MIN_STABLE_RATIO = 0.70;
export const MAX_SEVERE_DEVIATION_RATIO = 0.20;
export const MAX_ACCEPTABLE_RATIO_DROP = 0.10;

const SEVERE_DEVIATION_MULTIPLIER = 2;
const MINIMUM_VALID_SAMPLES = 2;

export interface AdaptiveThresholdSample {
    timestamp: number;
    pitchDeviation: number;
    rollDeviation: number;
    pitchThreshold: number;
    rollThreshold: number;
    stable: boolean;
}

export interface AdaptiveThresholdState {
    pitchAdjustment: number;
    rollAdjustment: number;
}

interface AxisWindowCounts {
    acceptable: number;
    severe: number;
}

interface WindowCounts {
    valid: number;
    stable: number;
    pitch: AxisWindowCounts;
    roll: AxisWindowCounts;
}

function emptyWindowCounts(): WindowCounts {
    return {
        valid: 0,
        stable: 0,
        pitch: { acceptable: 0, severe: 0 },
        roll: { acceptable: 0, severe: 0 },
    };
}

function isValidSample(sample: AdaptiveThresholdSample): boolean {
    return (
        Number.isFinite(sample.timestamp) &&
        Number.isFinite(sample.pitchDeviation) &&
        Number.isFinite(sample.rollDeviation) &&
        Number.isFinite(sample.pitchThreshold) &&
        Number.isFinite(sample.rollThreshold) &&
        sample.pitchDeviation >= 0 &&
        sample.rollDeviation >= 0 &&
        sample.pitchThreshold > 0 &&
        sample.rollThreshold > 0
    );
}

function canIncrease(
    acceptableRatio: number,
    stableRatio: number,
    severeRatio: number,
    previousAcceptableRatio: number | null
): boolean {
    const acceptableRatioDrop = previousAcceptableRatio === null
        ? 0
        : previousAcceptableRatio - acceptableRatio;

    return (
        acceptableRatio >= MIN_ACCEPTABLE_RATIO &&
        stableRatio >= MIN_STABLE_RATIO &&
        severeRatio < MAX_SEVERE_DEVIATION_RATIO &&
        acceptableRatioDrop <= MAX_ACCEPTABLE_RATIO_DROP
    );
}

export class AdaptiveThresholdController {
    private state: AdaptiveThresholdState = {
        pitchAdjustment: 0,
        rollAdjustment: 0,
    };

    private windowStartTimestamp: number | null = null;
    private counts = emptyWindowCounts();
    private previousPitchAcceptableRatio: number | null = null;
    private previousRollAcceptableRatio: number | null = null;

    getState(): AdaptiveThresholdState {
        return { ...this.state };
    }

    update(sample: AdaptiveThresholdSample): AdaptiveThresholdState {
        if (!isValidSample(sample)) {
            return this.getState();
        }

        if (this.windowStartTimestamp === null) {
            this.windowStartTimestamp = sample.timestamp;
        }

        if (sample.timestamp < this.windowStartTimestamp) {
            return this.getState();
        }

        this.counts.valid += 1;
        if (sample.stable) {
            this.counts.stable += 1;
        }

        this.recordAxisSample(
            this.counts.pitch,
            sample.pitchDeviation,
            sample.pitchThreshold
        );
        this.recordAxisSample(
            this.counts.roll,
            sample.rollDeviation,
            sample.rollThreshold
        );

        const windowDuration = sample.timestamp - this.windowStartTimestamp;
        if (windowDuration < ADAPTATION_WINDOW) {
            return this.getState();
        }

        this.evaluateWindow();
        this.windowStartTimestamp = null;
        this.counts = emptyWindowCounts();

        return this.getState();
    }

    reset(): void {
        this.state = { pitchAdjustment: 0, rollAdjustment: 0 };
        this.windowStartTimestamp = null;
        this.counts = emptyWindowCounts();
        this.previousPitchAcceptableRatio = null;
        this.previousRollAcceptableRatio = null;
    }

    private recordAxisSample(
        counts: AxisWindowCounts,
        deviation: number,
        threshold: number
    ): void {
        if (deviation <= threshold) {
            counts.acceptable += 1;
        }

        // Severe means more than twice the current adaptive threshold.
        if (deviation > threshold * SEVERE_DEVIATION_MULTIPLIER) {
            counts.severe += 1;
        }
    }

    private evaluateWindow(): void {
        if (this.counts.valid < MINIMUM_VALID_SAMPLES) {
            return;
        }

        const stableRatio = this.counts.stable / this.counts.valid;
        const pitchAcceptableRatio =
            this.counts.pitch.acceptable / this.counts.valid;
        const rollAcceptableRatio =
            this.counts.roll.acceptable / this.counts.valid;
        const pitchSevereRatio =
            this.counts.pitch.severe / this.counts.valid;
        const rollSevereRatio =
            this.counts.roll.severe / this.counts.valid;

        if (canIncrease(
            pitchAcceptableRatio,
            stableRatio,
            pitchSevereRatio,
            this.previousPitchAcceptableRatio
        )) {
            this.state.pitchAdjustment = Math.min(
                this.state.pitchAdjustment + ADAPTATION_STEP,
                MAX_ADAPTIVE_ADJUSTMENT
            );
        }

        if (canIncrease(
            rollAcceptableRatio,
            stableRatio,
            rollSevereRatio,
            this.previousRollAcceptableRatio
        )) {
            this.state.rollAdjustment = Math.min(
                this.state.rollAdjustment + ADAPTATION_STEP,
                MAX_ADAPTIVE_ADJUSTMENT
            );
        }

        this.previousPitchAcceptableRatio = pitchAcceptableRatio;
        this.previousRollAcceptableRatio = rollAcceptableRatio;
    }
}
