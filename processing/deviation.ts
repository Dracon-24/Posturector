// processing/deviation.ts

export interface DeviationResult {
    pitchDeviation: number;
    rollDeviation: number;

    pitchThreshold: number;
    rollThreshold: number;

    pitchOutside: boolean;
    rollOutside: boolean;

    overallDeviation: boolean;
}

export interface DeviationConfig {
    minimumThreshold: number;
    variabilityFactor: number;
    pitchThresholdAdjustment?: number;
    rollThresholdAdjustment?: number;
}

export function calculatePersonalizedThreshold(
    standardDeviation: number,
    config: DeviationConfig
): number {

    return (
        config.minimumThreshold +
        config.variabilityFactor * standardDeviation
    );
}


export function calculateDeviation(
    currentPitch: number,
    currentRoll: number,

    pitchBaseline: number,
    rollBaseline: number,

    pitchStd: number,
    rollStd: number,

    config: DeviationConfig
): DeviationResult {

    // -----------------------------------
    // Calculate deviation from baseline
    // -----------------------------------

    const pitchDeviation =
        Math.abs(
            currentPitch - pitchBaseline
        );

    const rollDeviation =
        Math.abs(
            currentRoll - rollBaseline
        );


    // -----------------------------------
    // Personalized thresholds
    // -----------------------------------

    const pitchThreshold =
        calculatePersonalizedThreshold(
            pitchStd,
            config
        ) + (config.pitchThresholdAdjustment ?? 0);

    const rollThreshold =
        calculatePersonalizedThreshold(
            rollStd,
            config
        ) + (config.rollThresholdAdjustment ?? 0);


    // -----------------------------------
    // Check whether deviation is excessive
    // -----------------------------------

    const pitchOutside =
        pitchDeviation > pitchThreshold;

    const rollOutside =
        rollDeviation > rollThreshold;


    return {

        pitchDeviation,

        rollDeviation,

        pitchThreshold,

        rollThreshold,

        pitchOutside,

        rollOutside,

        overallDeviation:
            pitchOutside || rollOutside,

    };
}
