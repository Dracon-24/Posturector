import {
    AxisBehaviorFeatureExtractor,
    CorrectionTrendFeature,
    EVIDENCE_EMA_TAU,
    NormalizedBehavioralFeatures,
    TimeAwareEma,
    combineEqualWeightEvidence,
    clamp01,
} from './adaptiveThresholdFeatures';

export const MAX_ADAPTIVE_ADJUSTMENT = 3;
export const MIN_OBSERVATION_DURATION = 10 * 60 * 1000;
export const MIN_VALID_SAMPLES = 100;
export const MIN_CORRECTION_RESPONSES = 3;
export const MIN_GOOD_POSTURE_PERIODS = 2;
export const EVIDENCE_ACTIVATION_THRESHOLD = 0.30;
export const MAX_ADJUSTMENT_RATE_PER_MINUTE = 0.25;
export const SEVERE_DEVIATION_MULTIPLIER = 2;
export const MAJOR_DETERIORATION_THRESHOLD = 0.75;

const MAX_ADJUSTMENT_ELAPSED = 60 * 1000;

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

export interface AxisAdaptiveThresholdDiagnostics {
    features: NormalizedBehavioralFeatures;
    combinedEvidence: number;
    evidenceEma: number;
    dataSufficient: boolean;
    severeDeviation: boolean;
    unstable: boolean;
    majorDeterioration: boolean;
}

export interface AdaptiveThresholdDiagnostics {
    pitch: AxisAdaptiveThresholdDiagnostics;
    roll: AxisAdaptiveThresholdDiagnostics;
    validSampleCount: number;
    correctionResponseCount: number;
    observationDuration: number;
}

function emptyFeatures(): NormalizedBehavioralFeatures {
    return {
        deviationTrend: 0,
        deviationFrequency: 0,
        correctionTrend: 0,
        goodPostureDecline: 0,
        nearThresholdExposure: 0,
    };
}

function emptyAxisDiagnostics(): AxisAdaptiveThresholdDiagnostics {
    return {
        features: emptyFeatures(),
        combinedEvidence: 0,
        evidenceEma: 0,
        dataSufficient: false,
        severeDeviation: false,
        unstable: false,
        majorDeterioration: false,
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

export class AdaptiveThresholdController {
    private state: AdaptiveThresholdState = {
        pitchAdjustment: 0,
        rollAdjustment: 0,
    };

    private readonly pitchFeatures = new AxisBehaviorFeatureExtractor();
    private readonly rollFeatures = new AxisBehaviorFeatureExtractor();
    private readonly correctionTrend = new CorrectionTrendFeature();
    private readonly pitchEvidence = new TimeAwareEma(EVIDENCE_EMA_TAU);
    private readonly rollEvidence = new TimeAwareEma(EVIDENCE_EMA_TAU);

    private sessionStartTimestamp: number | null = null;
    private lastSampleTimestamp: number | null = null;
    private validSampleCount = 0;
    private diagnostics: AdaptiveThresholdDiagnostics = {
        pitch: emptyAxisDiagnostics(),
        roll: emptyAxisDiagnostics(),
        validSampleCount: 0,
        correctionResponseCount: 0,
        observationDuration: 0,
    };

    getState(): AdaptiveThresholdState {
        return { ...this.state };
    }

    getDiagnostics(): AdaptiveThresholdDiagnostics {
        return {
            ...this.diagnostics,
            pitch: {
                ...this.diagnostics.pitch,
                features: { ...this.diagnostics.pitch.features },
            },
            roll: {
                ...this.diagnostics.roll,
                features: { ...this.diagnostics.roll.features },
            },
        };
    }

    recordCompletedCorrection(responseTime: number, timestamp: number): void {
        this.correctionTrend.record(responseTime, timestamp);
    }

    update(sample: AdaptiveThresholdSample): AdaptiveThresholdState {
        if (!isValidSample(sample)) {
            return this.getState();
        }

        if (this.sessionStartTimestamp === null) {
            this.sessionStartTimestamp = sample.timestamp;
        }
        if (this.lastSampleTimestamp !== null && sample.timestamp <= this.lastSampleTimestamp) {
            return this.getState();
        }

        const elapsedSinceLastSample = this.lastSampleTimestamp === null
            ? 0
            : Math.min(sample.timestamp - this.lastSampleTimestamp, MAX_ADJUSTMENT_ELAPSED);

        this.lastSampleTimestamp = sample.timestamp;
        this.validSampleCount += 1;

        this.pitchFeatures.update(sample.pitchDeviation, sample.pitchThreshold, sample.timestamp);
        this.rollFeatures.update(sample.rollDeviation, sample.rollThreshold, sample.timestamp);

        const correctionFeature = this.correctionTrend.getFeature();
        const pitchFeatures = this.pitchFeatures.getFeatures(correctionFeature);
        const rollFeatures = this.rollFeatures.getFeatures(correctionFeature);
        const pitchCombined = combineEqualWeightEvidence(pitchFeatures);
        const rollCombined = combineEqualWeightEvidence(rollFeatures);
        const pitchEvidence = this.pitchEvidence.update(pitchCombined, sample.timestamp);
        const rollEvidence = this.rollEvidence.update(rollCombined, sample.timestamp);

        const observationDuration = Math.max(0, sample.timestamp - this.sessionStartTimestamp);
        const correctionResponseCount = this.correctionTrend.getCount();
        const commonDataSufficient =
            observationDuration >= MIN_OBSERVATION_DURATION &&
            this.validSampleCount >= MIN_VALID_SAMPLES &&
            correctionResponseCount >= MIN_CORRECTION_RESPONSES;

        const pitchDiagnostics = this.buildAxisDiagnostics(
            pitchFeatures,
            pitchCombined,
            pitchEvidence,
            commonDataSufficient &&
                this.pitchFeatures.getGoodPosturePeriodCount() >= MIN_GOOD_POSTURE_PERIODS,
            sample.pitchDeviation,
            sample.pitchThreshold,
            sample.stable
        );
        const rollDiagnostics = this.buildAxisDiagnostics(
            rollFeatures,
            rollCombined,
            rollEvidence,
            commonDataSufficient &&
                this.rollFeatures.getGoodPosturePeriodCount() >= MIN_GOOD_POSTURE_PERIODS,
            sample.rollDeviation,
            sample.rollThreshold,
            sample.stable
        );

        this.state.pitchAdjustment = this.updateAdjustment(
            this.state.pitchAdjustment,
            pitchDiagnostics,
            elapsedSinceLastSample
        );
        this.state.rollAdjustment = this.updateAdjustment(
            this.state.rollAdjustment,
            rollDiagnostics,
            elapsedSinceLastSample
        );

        this.diagnostics = {
            pitch: pitchDiagnostics,
            roll: rollDiagnostics,
            validSampleCount: this.validSampleCount,
            correctionResponseCount,
            observationDuration,
        };

        return this.getState();
    }

    reset(): void {
        this.state = { pitchAdjustment: 0, rollAdjustment: 0 };
        this.pitchFeatures.reset();
        this.rollFeatures.reset();
        this.correctionTrend.reset();
        this.pitchEvidence.reset();
        this.rollEvidence.reset();
        this.sessionStartTimestamp = null;
        this.lastSampleTimestamp = null;
        this.validSampleCount = 0;
        this.diagnostics = {
            pitch: emptyAxisDiagnostics(),
            roll: emptyAxisDiagnostics(),
            validSampleCount: 0,
            correctionResponseCount: 0,
            observationDuration: 0,
        };
    }

    private buildAxisDiagnostics(
        features: NormalizedBehavioralFeatures,
        combinedEvidence: number,
        evidenceEma: number,
        dataSufficient: boolean,
        deviation: number,
        threshold: number,
        stable: boolean
    ): AxisAdaptiveThresholdDiagnostics {
        return {
            features,
            combinedEvidence,
            evidenceEma,
            dataSufficient,
            severeDeviation: deviation > threshold * SEVERE_DEVIATION_MULTIPLIER,
            unstable: !stable,
            majorDeterioration:
                features.deviationTrend >= MAJOR_DETERIORATION_THRESHOLD &&
                features.deviationFrequency >= MAJOR_DETERIORATION_THRESHOLD,
        };
    }

    private updateAdjustment(
        current: number,
        diagnostics: AxisAdaptiveThresholdDiagnostics,
        elapsed: number
    ): number {
        if (
            !diagnostics.dataSufficient ||
            diagnostics.severeDeviation ||
            diagnostics.unstable ||
            diagnostics.majorDeterioration
        ) {
            return current;
        }

        const target = MAX_ADAPTIVE_ADJUSTMENT * clamp01(
            (diagnostics.evidenceEma - EVIDENCE_ACTIVATION_THRESHOLD) /
            (1 - EVIDENCE_ACTIVATION_THRESHOLD)
        );
        const maximumStep = MAX_ADJUSTMENT_RATE_PER_MINUTE *
            (elapsed / (60 * 1000));

        if (target > current) {
            return Math.min(target, current + maximumStep, MAX_ADAPTIVE_ADJUSTMENT);
        }

        return Math.max(target, current - maximumStep, 0);
    }
}
