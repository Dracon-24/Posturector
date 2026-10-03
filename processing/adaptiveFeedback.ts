export const FAST_RESPONSE_THRESHOLD = 3;
export const SLOW_RESPONSE_THRESHOLD = 6;
export const MAX_RECENT_RESPONSES = 5;
export const PERSISTENT_REASSERT_INTERVAL =
    SLOW_RESPONSE_THRESHOLD * 1000;
export const HIGH_PERSISTENCE_REASSERT_INTERVAL =
    FAST_RESPONSE_THRESHOLD * 1000;

export type ResponseTimeClassification =
    | 'FAST'
    | 'NORMAL'
    | 'SLOW';

export type AdaptiveFeedbackMode =
    | 'NORMAL'
    | 'PERSISTENT'
    | 'HIGH_PERSISTENCE';

export interface AdaptiveFeedbackState {
    mode: AdaptiveFeedbackMode;
    recentResponseTimes: number[];
}

export interface AdaptiveFeedbackBehavior {
    shouldVibrate: boolean;
    reassertInterval: number | null;
}

export function getFeedbackReassertInterval(
    mode: AdaptiveFeedbackMode
): number | null {
    if (mode === 'PERSISTENT') {
        return PERSISTENT_REASSERT_INTERVAL;
    }

    if (mode === 'HIGH_PERSISTENCE') {
        return HIGH_PERSISTENCE_REASSERT_INTERVAL;
    }

    return null;
}

export function getAdaptiveFeedbackBehavior(
    sustainedDeviation: boolean,
    mode: AdaptiveFeedbackMode
): AdaptiveFeedbackBehavior {
    if (!sustainedDeviation) {
        return {
            shouldVibrate: false,
            reassertInterval: null,
        };
    }

    return {
        shouldVibrate: true,
        reassertInterval:
            getFeedbackReassertInterval(mode),
    };
}

type TimerHandle = ReturnType<typeof setInterval>;

type SetIntervalFunction = (
    callback: () => void,
    interval: number
) => TimerHandle;

type ClearIntervalFunction = (
    timer: TimerHandle
) => void;

export class FeedbackReassertionController {
    private timer: TimerHandle | null = null;
    private setIntervalFunction: SetIntervalFunction;
    private clearIntervalFunction: ClearIntervalFunction;

    constructor(
        setIntervalFunction: SetIntervalFunction = setInterval,
        clearIntervalFunction: ClearIntervalFunction = clearInterval
    ) {
        this.setIntervalFunction = setIntervalFunction;
        this.clearIntervalFunction = clearIntervalFunction;
    }

    start(
        interval: number | null,
        shouldContinue: () => boolean,
        reassert: () => void
    ): void {
        this.stop();

        if (interval === null) {
            return;
        }

        this.timer = this.setIntervalFunction(
            () => {
                if (!shouldContinue()) {
                    this.stop();
                    return;
                }

                reassert();
            },
            interval
        );
    }

    stop(): void {
        if (this.timer === null) {
            return;
        }

        this.clearIntervalFunction(this.timer);
        this.timer = null;
    }

    getIsActive(): boolean {
        return this.timer !== null;
    }
}

export function classifyResponseTime(
    responseTime: number
): ResponseTimeClassification {
    if (responseTime < FAST_RESPONSE_THRESHOLD) {
        return 'FAST';
    }

    if (responseTime <= SLOW_RESPONSE_THRESHOLD) {
        return 'NORMAL';
    }

    return 'SLOW';
}

function countSlowResponses(responseTimes: number[]): number {
    return responseTimes.reduce(
        (count, responseTime) =>
            classifyResponseTime(responseTime) === 'SLOW'
                ? count + 1
                : count,
        0
    );
}

export class AdaptiveFeedbackController {
    private recentResponseTimes: number[] = [];

    recordCompletedResponse(
        responseTime: number
    ): AdaptiveFeedbackState {
        if (!Number.isFinite(responseTime) || responseTime < 0) {
            return this.getState();
        }

        this.recentResponseTimes.push(responseTime);

        if (this.recentResponseTimes.length > MAX_RECENT_RESPONSES) {
            this.recentResponseTimes = this.recentResponseTimes.slice(
                -MAX_RECENT_RESPONSES
            );
        }

        return this.getState();
    }

    getState(): AdaptiveFeedbackState {
        return {
            mode: this.determineMode(),
            recentResponseTimes: [...this.recentResponseTimes],
        };
    }

    reset(): void {
        this.recentResponseTimes = [];
    }

    private determineMode(): AdaptiveFeedbackMode {
        if (this.recentResponseTimes.length >= 5) {
            const latestFive = this.recentResponseTimes.slice(-5);

            if (countSlowResponses(latestFive) >= 4) {
                return 'HIGH_PERSISTENCE';
            }
        }

        if (this.recentResponseTimes.length >= 3) {
            const latestThree = this.recentResponseTimes.slice(-3);

            if (countSlowResponses(latestThree) >= 2) {
                return 'PERSISTENT';
            }
        }

        return 'NORMAL';
    }
}
