import {
    AdaptiveFeedbackMode,
} from './adaptiveFeedback';

// =====================================
// FEEDBACK CONTROLLER
// =====================================

export interface FeedbackConfig {
    vibrationDuration: number;
}

export interface FeedbackState {
    shouldVibrate: boolean;
    vibrationDuration: number;
    adaptiveMode: AdaptiveFeedbackMode;
}


// =====================================
// FEEDBACK CONTROLLER
// =====================================

export class FeedbackController {

    constructor(
        private config: FeedbackConfig
    ) { }


    // ===================================
    // UPDATE
    // ===================================

    update(
        sustainedDeviation: boolean,
        timestamp: number,
        adaptiveMode: AdaptiveFeedbackMode
    ): FeedbackState {

        // Timestamp is retained for
        // compatibility with the existing
        // processing pipeline.
        void timestamp;


        // ---------------------------------
        // No sustained deviation
        // ---------------------------------

        if (!sustainedDeviation) {

            return {
                shouldVibrate: false,
                vibrationDuration: 0,
                adaptiveMode,
            };

        }


        // =================================
        // TRIGGER FEEDBACK
        // =================================

        return {
            shouldVibrate: true,
            vibrationDuration:
                this.config.vibrationDuration,
            adaptiveMode,
        };
    }


    // ===================================
    // RESET
    // ===================================

    reset(): void {
        // No internal state to reset.
    }

}
