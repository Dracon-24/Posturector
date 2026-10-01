import {
    Session,
    PostureDirection,
} from './sessionRecorder';


// =====================================
// POSTURE-SPECIFIC METRICS
// =====================================

export interface PostureSpecificMetrics {

    forward: number;

    backward: number;

    left: number;

    right: number;
}


// =====================================
// CORRECTION TIME METRICS
// =====================================

export interface DirectionCorrectionTimes {

    forward: number | null;

    backward: number | null;

    left: number | null;

    right: number | null;
}


// =====================================
// DEVIATION HISTORY
// =====================================

export interface DeviationHistoryPoint {

    timestamp: number;

    pitchDeviation: number;

    rollDeviation: number;

    overallDeviation: number;

    pitchThreshold: number;

    rollThreshold: number;
}


// =====================================
// PERFORMANCE METRICS
// =====================================

export interface PerformanceMetrics {

    consistency: number;

    averageCorrectionTime:
    number | null;

    feedbackEvents: number;

    completedCorrections: number;

    completionRate: number;

    timeInGoodPosture: number;

    longestContinuousGoodPosture:
    number;

    postureSpecific:
    PostureSpecificMetrics;

    directionCorrectionTimes:
    DirectionCorrectionTimes;

    actualSamplingRate: number;

    monitoredDuration: number;

    sampleCount: number;

    deviationHistory:
    DeviationHistoryPoint[];
}


// =====================================
// MAIN CALCULATOR
// =====================================

export function calculatePerformanceMetrics(
    session: Session
): PerformanceMetrics {

    const timeInGoodPosture =
        calculateTimeInGoodPosture(
            session
        );


    const longestContinuousGoodPosture =
        calculateLongestContinuousGoodPosture(
            session
        );


    const consistency =
        calculateConsistency(
            timeInGoodPosture,
            session.monitoredDuration
        );


    const averageCorrectionTime =
        calculateAverageCorrectionTime(
            session
        );


    const feedbackEvents =
        session.feedbackEvents.length;


    const completedCorrections =
        session.correctionResponses.length;


    const completionRate =
        calculateCompletionRate(
            feedbackEvents,
            completedCorrections
        );


    const postureSpecific =
        calculatePostureSpecificMetrics(
            session
        );


    const directionCorrectionTimes =
        calculateDirectionCorrectionTimes(
            session
        );


    const deviationHistory =
        createDeviationHistory(
            session
        );


    return {

        consistency,

        averageCorrectionTime,

        feedbackEvents,

        completedCorrections,

        completionRate,

        timeInGoodPosture,

        longestContinuousGoodPosture,

        postureSpecific,

        directionCorrectionTimes,

        actualSamplingRate:
            session.actualSamplingRate,

        monitoredDuration:
            session.monitoredDuration,

        sampleCount:
            session.sampleCount,

        deviationHistory,

    };
}


// =====================================
// CONSISTENCY
// =====================================

function calculateConsistency(
    goodPostureTime: number,
    monitoredDuration: number
): number {

    if (
        monitoredDuration <= 0
    ) {
        return 0;
    }


    const consistency =
        (
            goodPostureTime /
            monitoredDuration
        ) * 100;


    return clamp(
        consistency,
        0,
        100
    );
}


// =====================================
// GOOD POSTURE TIME
// =====================================

function calculateTimeInGoodPosture(
    session: Session
): number {

    const samples =
        session.samples;


    if (
        samples.length < 2
    ) {
        return 0;
    }


    let totalGoodTime = 0;


    for (
        let i = 0;
        i < samples.length - 1;
        i++
    ) {

        const current =
            samples[i];

        const next =
            samples[i + 1];


        const duration =
            next.timestamp -
            current.timestamp;


        if (
            duration <= 0
        ) {
            continue;
        }


        if (
            current.postureAcceptable
        ) {

            totalGoodTime +=
                duration;

        }

    }


    return totalGoodTime;
}


// =====================================
// LONGEST GOOD POSTURE
// =====================================

function calculateLongestContinuousGoodPosture(
    session: Session
): number {

    const samples =
        session.samples;


    if (
        samples.length < 2
    ) {
        return 0;
    }


    let currentGoodDuration = 0;

    let longestGoodDuration = 0;


    for (
        let i = 0;
        i < samples.length - 1;
        i++
    ) {

        const current =
            samples[i];

        const next =
            samples[i + 1];


        const duration =
            next.timestamp -
            current.timestamp;


        if (
            duration <= 0
        ) {
            continue;
        }


        if (
            current.postureAcceptable
        ) {

            currentGoodDuration +=
                duration;


            longestGoodDuration =
                Math.max(
                    longestGoodDuration,
                    currentGoodDuration
                );

        } else {

            currentGoodDuration = 0;

        }

    }


    return longestGoodDuration;
}


// =====================================
// AVERAGE CORRECTION TIME
// =====================================

function calculateAverageCorrectionTime(
    session: Session
): number | null {

    const responses =
        session.correctionResponses;


    if (
        responses.length === 0
    ) {
        return null;
    }


    const total =
        responses.reduce(
            (
                sum,
                response
            ) =>
                sum +
                response.responseTime,
            0
        );


    return (
        total /
        responses.length
    );
}


// =====================================
// COMPLETION RATE
// =====================================

function calculateCompletionRate(
    feedbackEvents: number,
    completedCorrections: number
): number {

    if (
        feedbackEvents <= 0
    ) {
        return 0;
    }


    return clamp(
        (
            completedCorrections /
            feedbackEvents
        ) * 100,
        0,
        100
    );
}


// =====================================
// POSTURE-SPECIFIC METRICS
// =====================================

function calculatePostureSpecificMetrics(
    session: Session
): PostureSpecificMetrics {

    const result:
        PostureSpecificMetrics = {

        forward: 0,

        backward: 0,

        left: 0,

        right: 0,

    };


    for (
        const event
        of session.feedbackEvents
    ) {

        switch (
        event.direction
        ) {

            case 'forward':
                result.forward++;
                break;

            case 'backward':
                result.backward++;
                break;

            case 'left':
                result.left++;
                break;

            case 'right':
                result.right++;
                break;

            case 'neutral':
                break;

        }

    }


    return result;
}


// =====================================
// DIRECTION-SPECIFIC CORRECTION TIMES
// =====================================

function calculateDirectionCorrectionTimes(
    session: Session
): DirectionCorrectionTimes {

    const result = {

        forward: [] as number[],

        backward: [] as number[],

        left: [] as number[],

        right: [] as number[],

    };


    for (
        const response
        of session.correctionResponses
    ) {

        switch (
        response.direction
        ) {

            case 'forward':
                result.forward.push(
                    response.responseTime
                );
                break;

            case 'backward':
                result.backward.push(
                    response.responseTime
                );
                break;

            case 'left':
                result.left.push(
                    response.responseTime
                );
                break;

            case 'right':
                result.right.push(
                    response.responseTime
                );
                break;

            case 'neutral':
                break;

        }

    }


    return {

        forward:
            calculateAverage(
                result.forward
            ),

        backward:
            calculateAverage(
                result.backward
            ),

        left:
            calculateAverage(
                result.left
            ),

        right:
            calculateAverage(
                result.right
            ),

    };
}


// =====================================
// AVERAGE
// =====================================

function calculateAverage(
    values: number[]
): number | null {

    if (
        values.length === 0
    ) {
        return null;
    }


    const total =
        values.reduce(
            (sum, value) =>
                sum + value,
            0
        );


    return (
        total /
        values.length
    );
}


// =====================================
// DEVIATION HISTORY
// =====================================

function createDeviationHistory(
    session: Session
): DeviationHistoryPoint[] {

    return session.samples.map(
        sample => ({

            timestamp:
                sample.timestamp,

            pitchDeviation:
                sample.pitchDeviation,

            rollDeviation:
                sample.rollDeviation,

            overallDeviation:
                sample.overallDeviation,

            pitchThreshold:
                sample.pitchThreshold,

            rollThreshold:
                sample.rollThreshold,

        })
    );
}


// =====================================
// CLAMP
// =====================================

function clamp(
    value: number,
    min: number,
    max: number
): number {

    return Math.min(
        Math.max(
            value,
            min
        ),
        max
    );
}