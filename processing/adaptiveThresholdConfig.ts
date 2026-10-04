export type AdaptiveThresholdMode = 'PRODUCTION' | 'DEMO';

export interface AdaptiveThresholdConfig {
    mode: AdaptiveThresholdMode;
    shortTermFeatureTau: number;
    longTermFeatureTau: number;
    evidenceEmaTau: number;
    goodPostureDurationReference: number;
    minimumObservationDuration: number;
    minimumValidSamples: number;
    minimumCorrectionResponses: number;
    minimumGoodPosturePeriods: number;
    maximumAdjustmentRatePerMinute: number;
    maximumAdjustmentElapsed: number;
    evidenceActivationThreshold: number;
    maximumAdaptiveAdjustment: number;
    severeDeviationMultiplier: number;
    majorDeteriorationThreshold: number;
}

export const PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG: AdaptiveThresholdConfig = {
    mode: 'PRODUCTION',
    shortTermFeatureTau: 2 * 60 * 1000,
    longTermFeatureTau: 10 * 60 * 1000,
    evidenceEmaTau: 10 * 60 * 1000,
    goodPostureDurationReference: 60,
    minimumObservationDuration: 10 * 60 * 1000,
    minimumValidSamples: 100,
    minimumCorrectionResponses: 3,
    minimumGoodPosturePeriods: 2,
    maximumAdjustmentRatePerMinute: 0.25,
    maximumAdjustmentElapsed: 60 * 1000,
    evidenceActivationThreshold: 0.30,
    maximumAdaptiveAdjustment: 3,
    severeDeviationMultiplier: 2,
    majorDeteriorationThreshold: 0.75,
};

/*
 * TEMPORARY REVIEW DEMO CONFIGURATION.
 * Restore ADAPTIVE_THRESHOLD_DEMO_MODE to false after project reviews.
 * These compressed timings are not final real-world tuning.
 */
export const DEMO_ADAPTIVE_THRESHOLD_CONFIG: AdaptiveThresholdConfig = {
    ...PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG,
    mode: 'DEMO',
    shortTermFeatureTau: 5 * 1000,
    longTermFeatureTau: 30 * 1000,
    evidenceEmaTau: 15 * 1000,
    goodPostureDurationReference: 10,
    minimumObservationDuration: 20 * 1000,
    maximumAdjustmentRatePerMinute: 1.5,
    maximumAdjustmentElapsed: 5 * 1000,
};

export const ADAPTIVE_THRESHOLD_DEMO_MODE = true;

export const ACTIVE_ADAPTIVE_THRESHOLD_CONFIG =
    ADAPTIVE_THRESHOLD_DEMO_MODE
        ? DEMO_ADAPTIVE_THRESHOLD_CONFIG
        : PRODUCTION_ADAPTIVE_THRESHOLD_CONFIG;
