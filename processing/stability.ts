// =====================================
// STABILITY DETECTION
// =====================================

export interface StabilitySample {
    pitch: number;
    roll: number;
    timestamp: number;
}

export interface StabilityConfig {
    windowDuration: number;
    maxPitchStd: number;
    maxRollStd: number;
}

export interface StabilityResult {
    stable: boolean;
    pitchStd: number;
    rollStd: number;
    sampleCount: number;
    windowDuration: number;
}


// =====================================
// STANDARD DEVIATION
// =====================================

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


// =====================================
// STABILITY DETECTOR
// =====================================

export class StabilityDetector {

    private samples: StabilitySample[] = [];

    constructor(
        private config: StabilityConfig
    ) { }


    // ===================================
    // ADD SAMPLE
    // ===================================

    update(
        pitch: number,
        roll: number,
        timestamp: number
    ): StabilityResult {

        this.samples.push({
            pitch,
            roll,
            timestamp,
        });


        // ---------------------------------
        // Remove samples outside window
        // ---------------------------------

        const windowStart =
            timestamp -
            this.config.windowDuration * 1000;

        this.samples =
            this.samples.filter(
                sample =>
                    sample.timestamp >= windowStart
            );


        // ---------------------------------
        // Need enough samples
        // ---------------------------------

        if (this.samples.length < 10) {

            return {
                stable: false,
                pitchStd: 0,
                rollStd: 0,
                sampleCount: this.samples.length,
                windowDuration: 0,
            };

        }


        // =================================
        // CALCULATE MEAN
        // =================================

        const pitchMean =
            this.samples.reduce(
                (sum, sample) =>
                    sum + sample.pitch,
                0
            ) / this.samples.length;


        const rollMean =
            this.samples.reduce(
                (sum, sample) =>
                    sum + sample.roll,
                0
            ) / this.samples.length;


        // =================================
        // CALCULATE VARIABILITY
        // =================================

        const pitchStd =
            calculateStd(
                this.samples.map(
                    sample => sample.pitch
                ),
                pitchMean
            );


        const rollStd =
            calculateStd(
                this.samples.map(
                    sample => sample.roll
                ),
                rollMean
            );


        // =================================
        // DETERMINE STABILITY
        // =================================

        const stable =
            pitchStd <= this.config.maxPitchStd &&
            rollStd <= this.config.maxRollStd;


        const actualWindowDuration =
            (
                timestamp -
                this.samples[0].timestamp
            ) / 1000;


        return {
            stable,
            pitchStd,
            rollStd,
            sampleCount: this.samples.length,
            windowDuration: actualWindowDuration,
        };
    }


    // ===================================
    // RESET
    // ===================================

    reset(): void {

        this.samples = [];

    }

}