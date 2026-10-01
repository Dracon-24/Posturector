// =====================================
// CORRECTION RESPONSE DETECTION
// =====================================

export type CorrectionStatus =
    | 'WAITING'
    | 'OBSERVING'
    | 'CORRECTED';

export type CorrectionDirection =
    | 'neutral'
    | 'forward'
    | 'backward'
    | 'left'
    | 'right';

export interface CorrectionResponseState {
    status: CorrectionStatus;
    observing: boolean;
    corrected: boolean;

    initialDeviation: number;
    currentDeviation: number;

    responseTime: number;
    elapsedTime: number;

    feedbackTimestamp: number | null;

    direction: CorrectionDirection | null;
}

// =====================================
// CORRECTION RESPONSE DETECTOR
// =====================================

export class CorrectionResponseDetector {

    private feedbackTimestamp:
        number | null = null;

    private initialDeviation = 0;

    private observing = false;

    private corrected = false;

    private direction:
        CorrectionDirection | null = null;

    /*
     * Stores the final correction result.
     *
     * Once correction has been detected,
     * the result remains frozen until
     * another feedback event or reset.
     */
    private completedState:
        CorrectionResponseState | null = null;


    // ===================================
    // START OBSERVATION
    // ===================================

    startObservation(
        initialDeviation: number,
        timestamp: number,
        direction: CorrectionDirection
    ): void {

        this.feedbackTimestamp = timestamp;

        this.initialDeviation = initialDeviation;

        this.direction = direction;

        this.observing = true;

        this.corrected = false;

        this.completedState = null;
    }


    // ===================================
    // CHECK OBSERVATION STATE
    // ===================================

    getIsObserving(): boolean {
        return this.observing;
    }


    // ===================================
    // CHECK WHETHER TARGET AXIS IS
    // CORRECTED
    // ===================================

    private isTargetAxisCorrected(
        pitchOutside: boolean,
        rollOutside: boolean
    ): boolean {

        if (
            this.direction === 'left' ||
            this.direction === 'right'
        ) {
            // Left/right correction depends ONLY
            // on the roll axis.
            return !rollOutside;
        }

        if (
            this.direction === 'forward' ||
            this.direction === 'backward'
        ) {
            // Forward/backward correction depends
            // ONLY on the pitch axis.
            return !pitchOutside;
        }

        return false;
    }


    // ===================================
    // UPDATE
    // ===================================

    update(
        currentDeviation: number,
        timestamp: number,
        pitchOutside: boolean,
        rollOutside: boolean
    ): CorrectionResponseState {

        // ---------------------------------
        // Return frozen result
        // ---------------------------------

        if (
            this.completedState !== null
        ) {
            return this.completedState;
        }


        // ---------------------------------
        // No active observation
        // ---------------------------------

        if (
            !this.observing ||
            this.feedbackTimestamp === null
        ) {

            return {

                status:
                    this.corrected
                        ? 'CORRECTED'
                        : 'WAITING',

                observing: false,

                corrected:
                    this.corrected,

                initialDeviation:
                    this.initialDeviation,

                currentDeviation,

                responseTime: 0,

                elapsedTime: 0,

                feedbackTimestamp:
                    this.feedbackTimestamp,

                direction:
                    this.direction,
            };
        }


        // ---------------------------------
        // Calculate elapsed time
        // ---------------------------------

        const elapsedTime =
            (
                timestamp -
                this.feedbackTimestamp
            ) / 1000;


        // =================================
        // CHECK TARGET AXIS
        // =================================

        const targetAxisCorrected =
            this.isTargetAxisCorrected(
                pitchOutside,
                rollOutside
            );


        // =================================
        // POSTURE CORRECTED
        // =================================

        if (targetAxisCorrected) {

            const responseTime =
                elapsedTime;


            // -----------------------------
            // Stop observation
            // -----------------------------

            this.observing = false;

            this.corrected = true;


            // -----------------------------
            // Freeze final result
            // -----------------------------

            this.completedState = {

                status: 'CORRECTED',

                observing: false,

                corrected: true,

                initialDeviation:
                    this.initialDeviation,

                currentDeviation,

                responseTime,

                elapsedTime,

                feedbackTimestamp:
                    this.feedbackTimestamp,

                direction:
                    this.direction,
            };


            return this.completedState;
        }


        // =================================
        // STILL OBSERVING
        // =================================

        return {

            status: 'OBSERVING',

            observing: true,

            corrected: false,

            initialDeviation:
                this.initialDeviation,

            currentDeviation,

            responseTime: 0,

            elapsedTime,

            feedbackTimestamp:
                this.feedbackTimestamp,

            direction:
                this.direction,
        };
    }


    // ===================================
    // RESET
    // ===================================

    reset(): void {

        this.feedbackTimestamp = null;

        this.initialDeviation = 0;

        this.observing = false;

        this.corrected = false;

        this.direction = null;

        this.completedState = null;
    }
}