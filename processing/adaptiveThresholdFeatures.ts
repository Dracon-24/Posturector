import {
    ACTIVE_ADAPTIVE_THRESHOLD_CONFIG,
    AdaptiveThresholdConfig,
} from './adaptiveThresholdConfig';

const TREND_NORMALIZATION_SPAN = 0.25;
const MAX_DEVIATION_RATIO = 2;
const MAX_CORRECTION_RESPONSE_TIME = 12;
const NEAR_THRESHOLD_LOWER_RATIO = 0.75;

export interface NormalizedBehavioralFeatures {
    deviationTrend: number;
    deviationFrequency: number;
    correctionTrend: number;
    goodPostureDecline: number;
    nearThresholdExposure: number;
}

export function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

export function normalizeDeviationRatio(
    deviation: number,
    threshold: number
): number {
    if (!Number.isFinite(deviation) || !Number.isFinite(threshold) || deviation < 0 || threshold <= 0) {
        return 0;
    }
    return clamp01((deviation / threshold) / MAX_DEVIATION_RATIO);
}

export function normalizeCorrectionResponse(responseTime: number): number {
    if (!Number.isFinite(responseTime) || responseTime < 0) {
        return 0;
    }
    return clamp01(responseTime / MAX_CORRECTION_RESPONSE_TIME);
}

export function normalizeGoodPostureDuration(
    duration: number,
    referenceDuration: number =
        ACTIVE_ADAPTIVE_THRESHOLD_CONFIG.goodPostureDurationReference
): number {
    if (!Number.isFinite(duration) || duration < 0) {
        return 0;
    }
    if (!Number.isFinite(referenceDuration) || referenceDuration <= 0) {
        return 0;
    }
    return clamp01(duration / referenceDuration);
}

export function normalizeIncreasingTrend(shortTerm: number, longTerm: number): number {
    return clamp01((shortTerm - longTerm) / TREND_NORMALIZATION_SPAN);
}

export function normalizeDecliningTrend(shortTerm: number, longTerm: number): number {
    return clamp01((longTerm - shortTerm) / TREND_NORMALIZATION_SPAN);
}

export function isNearThreshold(deviation: number, threshold: number): boolean {
    if (!Number.isFinite(deviation) || !Number.isFinite(threshold) || threshold <= 0) {
        return false;
    }
    const ratio = deviation / threshold;
    return ratio >= NEAR_THRESHOLD_LOWER_RATIO && ratio <= 1;
}

/*
 * Equal weights are intentional. There is neither a defensible labeled
 * exhaustion dataset nor a validated reinforcement-learning reward, so
 * learned-looking unequal weights would be unjustified at this stage.
 */
export function combineEqualWeightEvidence(
    features: NormalizedBehavioralFeatures
): number {
    return clamp01((
        features.deviationTrend +
        features.deviationFrequency +
        features.correctionTrend +
        features.goodPostureDecline +
        features.nearThresholdExposure
    ) / 5);
}

export class TimeAwareEma {
    private value: number | null = null;
    private timestamp: number | null = null;

    constructor(private readonly timeConstant: number) { }

    update(value: number, timestamp: number): number {
        const boundedValue = clamp01(value);
        if (!Number.isFinite(timestamp)) {
            return this.getValue();
        }
        if (this.value === null || this.timestamp === null) {
            this.value = boundedValue;
            this.timestamp = timestamp;
            return this.value;
        }
        if (timestamp <= this.timestamp) {
            return this.value;
        }
        const elapsed = timestamp - this.timestamp;
        const alpha = 1 - Math.exp(-elapsed / this.timeConstant);
        this.value = clamp01(alpha * boundedValue + (1 - alpha) * this.value);
        this.timestamp = timestamp;
        return this.value;
    }

    getValue(): number {
        return this.value ?? 0;
    }

    reset(): void {
        this.value = null;
        this.timestamp = null;
    }
}

class TrendPair {
    private readonly shortTerm: TimeAwareEma;
    private readonly longTerm: TimeAwareEma;

    constructor(config: AdaptiveThresholdConfig) {
        this.shortTerm = new TimeAwareEma(config.shortTermFeatureTau);
        this.longTerm = new TimeAwareEma(config.longTermFeatureTau);
    }

    update(value: number, timestamp: number): void {
        this.shortTerm.update(value, timestamp);
        this.longTerm.update(value, timestamp);
    }

    increasing(): number {
        return normalizeIncreasingTrend(this.shortTerm.getValue(), this.longTerm.getValue());
    }

    declining(): number {
        return normalizeDecliningTrend(this.shortTerm.getValue(), this.longTerm.getValue());
    }

    reset(): void {
        this.shortTerm.reset();
        this.longTerm.reset();
    }
}

export class CorrectionTrendFeature {
    private readonly trend: TrendPair;
    private responseCount = 0;

    constructor(
        config: AdaptiveThresholdConfig = ACTIVE_ADAPTIVE_THRESHOLD_CONFIG
    ) {
        this.trend = new TrendPair(config);
    }

    record(responseTime: number, timestamp: number): void {
        if (!Number.isFinite(responseTime) || responseTime < 0 || !Number.isFinite(timestamp)) {
            return;
        }
        this.trend.update(normalizeCorrectionResponse(responseTime), timestamp);
        this.responseCount += 1;
    }

    getFeature(): number {
        return this.trend.increasing();
    }

    getCount(): number {
        return this.responseCount;
    }

    reset(): void {
        this.trend.reset();
        this.responseCount = 0;
    }
}

export class AxisBehaviorFeatureExtractor {
    private readonly deviation: TrendPair;
    private readonly frequency: TrendPair;
    private readonly goodPostureDuration: TrendPair;
    private readonly nearThreshold: TrendPair;
    private goodPostureStart: number | null = null;
    private goodPosturePeriodCount = 0;

    constructor(
        private readonly config: AdaptiveThresholdConfig =
            ACTIVE_ADAPTIVE_THRESHOLD_CONFIG
    ) {
        this.deviation = new TrendPair(config);
        this.frequency = new TrendPair(config);
        this.goodPostureDuration = new TrendPair(config);
        this.nearThreshold = new TrendPair(config);
    }

    update(deviation: number, threshold: number, timestamp: number): void {
        const outside = deviation > threshold;
        this.deviation.update(normalizeDeviationRatio(deviation, threshold), timestamp);
        this.frequency.update(outside ? 1 : 0, timestamp);
        this.nearThreshold.update(isNearThreshold(deviation, threshold) ? 1 : 0, timestamp);

        if (!outside && this.goodPostureStart === null) {
            this.goodPostureStart = timestamp;
        }
        if (outside && this.goodPostureStart !== null) {
            const duration = Math.max(0, (timestamp - this.goodPostureStart) / 1000);
            this.goodPostureDuration.update(
                normalizeGoodPostureDuration(
                    duration,
                    this.config.goodPostureDurationReference
                ),
                timestamp
            );
            this.goodPosturePeriodCount += 1;
            this.goodPostureStart = null;
        }
    }

    getFeatures(correctionTrend: number): NormalizedBehavioralFeatures {
        return {
            deviationTrend: this.deviation.increasing(),
            deviationFrequency: this.frequency.increasing(),
            correctionTrend: clamp01(correctionTrend),
            goodPostureDecline: this.goodPostureDuration.declining(),
            nearThresholdExposure: this.nearThreshold.increasing(),
        };
    }

    getGoodPosturePeriodCount(): number {
        return this.goodPosturePeriodCount;
    }

    reset(): void {
        this.deviation.reset();
        this.frequency.reset();
        this.goodPostureDuration.reset();
        this.nearThreshold.reset();
        this.goodPostureStart = null;
        this.goodPosturePeriodCount = 0;
    }
}
