import {
    CalibrationResult,
    PostureSample as CalibrationPostureSample,
} from './calibration';


// =====================================
// POSTURE DIRECTION
// =====================================

export type PostureDirection =
    | 'forward'
    | 'backward'
    | 'left'
    | 'right'
    | 'neutral';


// =====================================
// CALIBRATION SNAPSHOT
// =====================================

export interface CalibrationSnapshot {

    pitchBaseline: number;

    rollBaseline: number;

    pitchStd: number;

    rollStd: number;

    confidence: number;

    sampleCount: number;

    duration: number;

    valid: boolean;
}


// =====================================
// MONITORING POSTURE SAMPLE
// =====================================

export interface MonitoringPostureSample
    extends CalibrationPostureSample {

    pitchDeviation: number;

    rollDeviation: number;

    overallDeviation: number;

    postureAcceptable: boolean;

    direction: PostureDirection;

    pitchThreshold: number;

    rollThreshold: number;
}


// =====================================
// FEEDBACK EVENT
// =====================================

export interface FeedbackEvent {

    timestamp: number;

    deviation: number;

    direction: PostureDirection;
}


// =====================================
// CORRECTION RESPONSE
// =====================================

export interface CorrectionResponse {

    feedbackTimestamp: number;

    correctionTimestamp: number;

    initialDeviation: number;

    finalDeviation: number;

    /*
     * Stored in seconds.
     */
    responseTime: number;

    direction: PostureDirection;
}


// =====================================
// SESSION
// =====================================

export interface Session {

    id: string;

    /*
     * 0 means the session has been created
     * but monitoring has not started yet.
     */
    startTime: number;

    endTime: number | null;

    /*
     * Milliseconds.
     */
    monitoredDuration: number;

    /*
     * Number of recorded monitoring samples.
     */
    sampleCount: number;

    /*
     * Actual measured sampling frequency.
     *
     * Calculated when the session ends.
     */
    actualSamplingRate: number;

    calibration: CalibrationSnapshot;

    samples: MonitoringPostureSample[];

    feedbackEvents: FeedbackEvent[];

    correctionResponses: CorrectionResponse[];
}


// =====================================
// CREATE CALIBRATION SNAPSHOT
// =====================================

export function createCalibrationSnapshot(
    calibration: CalibrationResult
): CalibrationSnapshot {

    return {

        pitchBaseline:
            calibration.pitchBaseline,

        rollBaseline:
            calibration.rollBaseline,

        pitchStd:
            calibration.pitchStd,

        rollStd:
            calibration.rollStd,

        confidence:
            calibration.confidence,

        sampleCount:
            calibration.sampleCount,

        duration:
            calibration.duration,

        valid:
            calibration.valid,

    };
}


// =====================================
// START SESSION
// =====================================

export function startSession(
    calibration: CalibrationResult
): Session {

    return {

        id:
            `session-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`,

        /*
         * Actual monitoring starts on the
         * first post-calibration sample.
         */
        startTime: 0,

        endTime: null,

        monitoredDuration: 0,

        sampleCount: 0,

        actualSamplingRate: 0,

        calibration:
            createCalibrationSnapshot(
                calibration
            ),

        samples: [],

        feedbackEvents: [],

        correctionResponses: [],

    };
}


// =====================================
// RECORD POSTURE SAMPLE
// =====================================

export function recordPostureSample(
    session: Session,
    sample: MonitoringPostureSample
): void {

    if (
        !Number.isFinite(sample.timestamp) ||
        !Number.isFinite(sample.pitch) ||
        !Number.isFinite(sample.roll) ||
        !Number.isFinite(sample.pitchDeviation) ||
        !Number.isFinite(sample.rollDeviation) ||
        !Number.isFinite(sample.overallDeviation) ||
        !Number.isFinite(sample.pitchThreshold) ||
        !Number.isFinite(sample.rollThreshold)
    ) {
        return;
    }


    /*
     * First valid monitoring sample
     * establishes the monitoring start time.
     */
    if (
        session.startTime === 0
    ) {

        session.startTime =
            sample.timestamp;

    }


    session.samples.push(
        sample
    );


    session.sampleCount =
        session.samples.length;
}


// =====================================
// RECORD FEEDBACK EVENT
// =====================================

export function recordFeedbackEvent(
    session: Session,
    event: FeedbackEvent
): void {

    if (
        !Number.isFinite(event.timestamp) ||
        !Number.isFinite(event.deviation)
    ) {
        return;
    }


    /*
     * Prevent duplicate events.
     */
    const duplicate =
        session.feedbackEvents.some(
            existing =>
                existing.timestamp ===
                event.timestamp
        );

    if (duplicate) {
        return;
    }


    session.feedbackEvents.push(
        event
    );
}


// =====================================
// RECORD CORRECTION RESPONSE
// =====================================

export function recordCorrectionResponse(
    session: Session,
    response: CorrectionResponse
): void {

    if (
        !Number.isFinite(
            response.feedbackTimestamp
        ) ||
        !Number.isFinite(
            response.correctionTimestamp
        ) ||
        !Number.isFinite(
            response.initialDeviation
        ) ||
        !Number.isFinite(
            response.finalDeviation
        ) ||
        !Number.isFinite(
            response.responseTime
        )
    ) {
        return;
    }


    /*
     * One completed correction per
     * feedback event.
     */
    const duplicate =
        session.correctionResponses.some(
            existing =>
                existing.feedbackTimestamp ===
                response.feedbackTimestamp
        );

    if (duplicate) {
        return;
    }


    session.correctionResponses.push(
        response
    );
}


// =====================================
// END SESSION
// =====================================

export function endSession(
    session: Session,
    endTimestamp: number = Date.now()
): Session {

    session.endTime =
        endTimestamp;


    /*
     * No monitoring samples means
     * zero monitoring duration.
     */
    if (
        session.startTime === 0
    ) {

        session.monitoredDuration =
            0;

        session.actualSamplingRate =
            0;

        return session;

    }


    session.monitoredDuration =
        Math.max(
            0,
            endTimestamp -
            session.startTime
        );


    /*
     * Calculate actual sampling frequency.
     *
     * samples / elapsed seconds
     *
     * This is an empirical measurement,
     * not the configured target frequency.
     */
    if (
        session.monitoredDuration > 0
    ) {

        session.actualSamplingRate =
            session.sampleCount /
            (
                session.monitoredDuration /
                1000
            );

    } else {

        session.actualSamplingRate = 0;

    }


    return session;
}