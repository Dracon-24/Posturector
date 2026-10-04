import {
    AxisBehaviorFeatureExtractor,
    BehavioralFeatureEmaValues,
    CorrectionTrendFeature,
    NormalizedBehavioralFeatures,
    TimeAwareEma,
    combineEqualWeightEvidence,
    clamp01,
} from './adaptiveThresholdFeatures';

import {
    ACTIVE_ADAPTIVE_THRESHOLD_CONFIG,
    AdaptiveThresholdConfig,
    AdaptiveThresholdMode,
} from './adaptiveThresholdConfig';

export const MAX_ADAPTIVE_ADJUSTMENT =
    ACTIVE_ADAPTIVE_THRESHOLD_CONFIG.maximumAdaptiveAdjustment;

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
    featureEmaValues: BehavioralFeatureEmaValues;
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

function emptyFeatureEmaValues(): BehavioralFeatureEmaValues {
    const emptyValue = () => ({ shortTerm: 0, longTerm: 0 });

    return {
        deviation: emptyValue(),
        frequency: emptyValue(),
        correction: emptyValue(),
        goodPostureDuration: emptyValue(),
        nearThreshold: emptyValue(),
    };
}

function cloneFeatureEmaValues(
    values: BehavioralFeatureEmaValues
): BehavioralFeatureEmaValues {
    return {
        deviation: { ...values.deviation },
        frequency: { ...values.frequency },
        correction: { ...values.correction },
        goodPostureDuration: { ...values.goodPostureDuration },
        nearThreshold: { ...values.nearThreshold },
    };
}

function emptyAxisDiagnostics(): AxisAdaptiveThresholdDiagnostics {
    return {
        features: emptyFeatures(),
        featureEmaValues: emptyFeatureEmaValues(),
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

    private readonly pitchFeatures: AxisBehaviorFeatureExtractor;
    private readonly rollFeatures: AxisBehaviorFeatureExtractor;
    private readonly correctionTrend: CorrectionTrendFeature;
    private readonly pitchEvidence: TimeAwareEma;
    private readonly rollEvidence: TimeAwareEma;

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

    constructor(
        private readonly config: AdaptiveThresholdConfig =
            ACTIVE_ADAPTIVE_THRESHOLD_CONFIG
    ) {
        this.pitchFeatures = new AxisBehaviorFeatureExtractor(config);
        this.rollFeatures = new AxisBehaviorFeatureExtractor(config);
        this.correctionTrend = new CorrectionTrendFeature(config);
        this.pitchEvidence = new TimeAwareEma(config.evidenceEmaTau);
        this.rollEvidence = new TimeAwareEma(config.evidenceEmaTau);
    }

    getMode(): AdaptiveThresholdMode {
        return this.config.mode;
    }

    getState(): AdaptiveThresholdState {
        return { ...this.state };
    }

    getDiagnostics(): AdaptiveThresholdDiagnostics {
        return {
            ...this.diagnostics,
            pitch: {
                ...this.diagnostics.pitch,
                features: { ...this.diagnostics.pitch.features },
                featureEmaValues: cloneFeatureEmaValues(
                    this.diagnostics.pitch.featureEmaValues
                ),
            },
            roll: {
                ...this.diagnostics.roll,
                features: { ...this.diagnostics.roll.features },
                featureEmaValues: cloneFeatureEmaValues(
                    this.diagnostics.roll.featureEmaValues
                ),
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
            : Math.min(
                sample.timestamp - this.lastSampleTimestamp,
                this.config.maximumAdjustmentElapsed
            );

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
        const correctionEmaValue = this.correctionTrend.getEmaValue();
        const commonDataSufficient =
            observationDuration >= this.config.minimumObservationDuration &&
            this.validSampleCount >= this.config.minimumValidSamples &&
            correctionResponseCount >= this.config.minimumCorrectionResponses;

        const pitchDiagnostics = this.buildAxisDiagnostics(
            pitchFeatures,
            this.pitchFeatures.getEmaValues(correctionEmaValue),
            pitchCombined,
            pitchEvidence,
            commonDataSufficient &&
                this.pitchFeatures.getGoodPosturePeriodCount() >=
                    this.config.minimumGoodPosturePeriods,
            sample.pitchDeviation,
            sample.pitchThreshold,
            sample.stable
        );
        const rollDiagnostics = this.buildAxisDiagnostics(
            rollFeatures,
            this.rollFeatures.getEmaValues(correctionEmaValue),
            rollCombined,
            rollEvidence,
            commonDataSufficient &&
                this.rollFeatures.getGoodPosturePeriodCount() >=
                    this.config.minimumGoodPosturePeriods,
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
        featureEmaValues: BehavioralFeatureEmaValues,
        combinedEvidence: number,
        evidenceEma: number,
        dataSufficient: boolean,
        deviation: number,
        threshold: number,
        stable: boolean
    ): AxisAdaptiveThresholdDiagnostics {
        return {
            features,
            featureEmaValues,
            combinedEvidence,
            evidenceEma,
            dataSufficient,
            severeDeviation:
                deviation > threshold * this.config.severeDeviationMultiplier,
            unstable: !stable,
            majorDeterioration:
                features.deviationTrend >= this.config.majorDeteriorationThreshold &&
                features.deviationFrequency >= this.config.majorDeteriorationThreshold,
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

        const target = this.config.maximumAdaptiveAdjustment * clamp01(
            (diagnostics.evidenceEma - this.config.evidenceActivationThreshold) /
            (1 - this.config.evidenceActivationThreshold)
        );
        const maximumStep = this.config.maximumAdjustmentRatePerMinute *
            (elapsed / (60 * 1000));

        if (target > current) {
            return Math.min(
                target,
                current + maximumStep,
                this.config.maximumAdaptiveAdjustment
            );
        }

        return Math.max(target, current - maximumStep, 0);
    }
}
