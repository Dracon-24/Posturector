import {
    AdaptiveFeedbackMode,
    getAdaptiveFeedbackBehavior,
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
    reassertInterval: number | null;
}


// =====================================
// FEEDBACK CONTROLLER
// =====================================

export class FeedbackController {

    private config: FeedbackConfig;

    constructor(
        config: FeedbackConfig
    ) {
        this.config = config;
    }


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


        const behavior =
            getAdaptiveFeedbackBehavior(
                sustainedDeviation,
                adaptiveMode
            );

        if (!behavior.shouldVibrate) {

            return {
                shouldVibrate: false,
                vibrationDuration: 0,
                adaptiveMode,
                reassertInterval: null,
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
            reassertInterval:
                behavior.reassertInterval,
        };
    }


    // ===================================
    // RESET
    // ===================================

    reset(): void {
        // No internal state to reset.
    }

}
