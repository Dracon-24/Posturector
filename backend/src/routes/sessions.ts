import { Router, Request, Response } from 'express';
import db from '../database';

const router = Router();

const POSTURE_DIRECTIONS = new Set([
    'forward',
    'backward',
    'left',
    'right',
    'neutral',
]);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
    );
}

function isFiniteNumber(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isFinite(value)
    );
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
    return isFiniteNumber(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
    return (
        isNonNegativeFiniteNumber(value) &&
        Number.isInteger(value)
    );
}

function isDirection(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        POSTURE_DIRECTIONS.has(value)
    );
}

function validateFiniteFields(
    value: JsonObject,
    fields: readonly string[],
    pathPrefix: string,
    errors: string[],
    nonNegative = false
): void {
    for (const field of fields) {
        const valid = nonNegative
            ? isNonNegativeFiniteNumber(value[field])
            : isFiniteNumber(value[field]);

        if (!valid) {
            errors.push(
                `${pathPrefix}.${field} must be ${nonNegative ? 'a non-negative ' : 'a '}finite number`
            );
        }
    }
}

function validateCalibration(
    value: unknown,
    errors: string[]
): void {
    if (!isObject(value)) {
        errors.push('calibration must be an object');
        return;
    }

    validateFiniteFields(
        value,
        ['pitchBaseline', 'rollBaseline'],
        'calibration',
        errors
    );
    validateFiniteFields(
        value,
        ['pitchStd', 'rollStd', 'confidence', 'duration'],
        'calibration',
        errors,
        true
    );

    if (!isNonNegativeInteger(value.sampleCount)) {
        errors.push('calibration.sampleCount must be a non-negative integer');
    }

    if (typeof value.valid !== 'boolean') {
        errors.push('calibration.valid must be a boolean');
    }
}

function validateSamples(
    value: unknown,
    errors: string[]
): number | null {
    if (!Array.isArray(value)) {
        errors.push('samples must be an array');
        return null;
    }

    value.forEach((sample, index) => {
        const pathPrefix = `samples[${index}]`;

        if (!isObject(sample)) {
            errors.push(`${pathPrefix} must be an object`);
            return;
        }

        validateFiniteFields(
            sample,
            ['timestamp', 'pitch', 'roll'],
            pathPrefix,
            errors
        );
        validateFiniteFields(
            sample,
            [
                'pitchDeviation',
                'rollDeviation',
                'overallDeviation',
                'pitchThreshold',
                'rollThreshold',
            ],
            pathPrefix,
            errors,
            true
        );

        if (typeof sample.postureAcceptable !== 'boolean') {
            errors.push(`${pathPrefix}.postureAcceptable must be a boolean`);
        }

        if (!isDirection(sample.direction)) {
            errors.push(`${pathPrefix}.direction must be a valid posture direction`);
        }
    });

    return value.length;
}

function validateFeedbackEvents(
    value: unknown,
    errors: string[]
): number | null {
    if (!Array.isArray(value)) {
        errors.push('feedbackEvents must be an array');
        return null;
    }

    value.forEach((event, index) => {
        const pathPrefix = `feedbackEvents[${index}]`;

        if (!isObject(event)) {
            errors.push(`${pathPrefix} must be an object`);
            return;
        }

        validateFiniteFields(event, ['timestamp'], pathPrefix, errors);
        validateFiniteFields(event, ['deviation'], pathPrefix, errors, true);

        if (!isDirection(event.direction)) {
            errors.push(`${pathPrefix}.direction must be a valid posture direction`);
        }
    });

    return value.length;
}

function validateCorrectionResponses(
    value: unknown,
    errors: string[]
): number | null {
    if (!Array.isArray(value)) {
        errors.push('correctionResponses must be an array');
        return null;
    }

    value.forEach((response, index) => {
        const pathPrefix = `correctionResponses[${index}]`;

        if (!isObject(response)) {
            errors.push(`${pathPrefix} must be an object`);
            return;
        }

        validateFiniteFields(
            response,
            ['feedbackTimestamp', 'correctionTimestamp'],
            pathPrefix,
            errors
        );
        validateFiniteFields(
            response,
            ['initialDeviation', 'finalDeviation', 'responseTime'],
            pathPrefix,
            errors,
            true
        );

        if (!isDirection(response.direction)) {
            errors.push(`${pathPrefix}.direction must be a valid posture direction`);
        }
    });

    return value.length;
}

function validateDirectionCounts(
    value: unknown,
    pathPrefix: string,
    errors: string[]
): void {
    if (!isObject(value)) {
        errors.push(`${pathPrefix} must be an object`);
        return;
    }

    for (const direction of ['forward', 'backward', 'left', 'right']) {
        if (!isNonNegativeInteger(value[direction])) {
            errors.push(`${pathPrefix}.${direction} must be a non-negative integer`);
        }
    }
}

function validateDirectionCorrectionTimes(
    value: unknown,
    errors: string[]
): void {
    if (!isObject(value)) {
        errors.push('metrics.directionCorrectionTimes must be an object');
        return;
    }

    for (const direction of ['forward', 'backward', 'left', 'right']) {
        const correctionTime = value[direction];

        if (
            correctionTime !== null &&
            !isNonNegativeFiniteNumber(correctionTime)
        ) {
            errors.push(
                `metrics.directionCorrectionTimes.${direction} must be null or a non-negative finite number`
            );
        }
    }
}

function validateDeviationHistory(
    value: unknown,
    errors: string[]
): number | null {
    if (!Array.isArray(value)) {
        errors.push('metrics.deviationHistory must be an array');
        return null;
    }

    value.forEach((point, index) => {
        const pathPrefix = `metrics.deviationHistory[${index}]`;

        if (!isObject(point)) {
            errors.push(`${pathPrefix} must be an object`);
            return;
        }

        validateFiniteFields(point, ['timestamp'], pathPrefix, errors);
        validateFiniteFields(
            point,
            [
                'pitchDeviation',
                'rollDeviation',
                'overallDeviation',
                'pitchThreshold',
                'rollThreshold',
            ],
            pathPrefix,
            errors,
            true
        );
    });

    return value.length;
}

function validateMetrics(
    value: unknown,
    errors: string[]
): {
    feedbackEvents: number | null;
    completedCorrections: number | null;
    sampleCount: number | null;
    deviationHistoryLength: number | null;
} | null {
    if (!isObject(value)) {
        errors.push('metrics must be an object');
        return null;
    }

    validateFiniteFields(
        value,
        [
            'consistency',
            'completionRate',
            'timeInGoodPosture',
            'longestContinuousGoodPosture',
            'actualSamplingRate',
            'monitoredDuration',
        ],
        'metrics',
        errors,
        true
    );

    if (
        value.averageCorrectionTime !== null &&
        !isNonNegativeFiniteNumber(value.averageCorrectionTime)
    ) {
        errors.push(
            'metrics.averageCorrectionTime must be null or a non-negative finite number'
        );
    }

    for (const field of ['feedbackEvents', 'completedCorrections', 'sampleCount']) {
        if (!isNonNegativeInteger(value[field])) {
            errors.push(`metrics.${field} must be a non-negative integer`);
        }
    }

    validateDirectionCounts(value.postureSpecific, 'metrics.postureSpecific', errors);
    validateDirectionCorrectionTimes(value.directionCorrectionTimes, errors);

    const deviationHistoryLength = validateDeviationHistory(
        value.deviationHistory,
        errors
    );

    return {
        feedbackEvents: isNonNegativeInteger(value.feedbackEvents)
            ? value.feedbackEvents
            : null,
        completedCorrections: isNonNegativeInteger(value.completedCorrections)
            ? value.completedCorrections
            : null,
        sampleCount: isNonNegativeInteger(value.sampleCount)
            ? value.sampleCount
            : null,
        deviationHistoryLength,
    };
}

function validateSessionUpload(value: unknown): string[] {
    const errors: string[] = [];

    if (!isObject(value)) {
        return ['request body must be an object'];
    }

    if (typeof value.id !== 'string' || value.id.trim().length === 0) {
        errors.push('id must be a non-empty string');
    }

    validateFiniteFields(value, ['startTime', 'endTime'], 'session', errors);
    validateFiniteFields(
        value,
        ['monitoredDuration', 'actualSamplingRate'],
        'session',
        errors,
        true
    );

    if (!isNonNegativeInteger(value.sampleCount)) {
        errors.push('session.sampleCount must be a non-negative integer');
    }

    validateCalibration(value.calibration, errors);

    const samplesLength = validateSamples(value.samples, errors);
    const feedbackEventsLength = validateFeedbackEvents(value.feedbackEvents, errors);
    const correctionResponsesLength = validateCorrectionResponses(
        value.correctionResponses,
        errors
    );
    const metrics = validateMetrics(value.metrics, errors);

    if (
        samplesLength !== null &&
        isNonNegativeInteger(value.sampleCount) &&
        value.sampleCount !== samplesLength
    ) {
        errors.push('session.sampleCount must equal samples.length');
    }

    if (metrics !== null) {
        if (
            metrics.sampleCount !== null &&
            isNonNegativeInteger(value.sampleCount) &&
            metrics.sampleCount !== value.sampleCount
        ) {
            errors.push('metrics.sampleCount must equal session.sampleCount');
        }

        if (
            metrics.feedbackEvents !== null &&
            feedbackEventsLength !== null &&
            metrics.feedbackEvents !== feedbackEventsLength
        ) {
            errors.push('metrics.feedbackEvents must equal feedbackEvents.length');
        }

        if (
            metrics.completedCorrections !== null &&
            correctionResponsesLength !== null &&
            metrics.completedCorrections !== correctionResponsesLength
        ) {
            errors.push(
                'metrics.completedCorrections must equal correctionResponses.length'
            );
        }

        if (
            metrics.deviationHistoryLength !== null &&
            samplesLength !== null &&
            metrics.deviationHistoryLength !== samplesLength
        ) {
            errors.push('metrics.deviationHistory.length must equal samples.length');
        }
    }

    return errors;
}

router.post('/', (req: Request, res: Response) => {
    try {
        const session: unknown = req.body;
        const validationErrors = validateSessionUpload(session);

        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'Invalid session payload',
                details: validationErrors,
            });
        }

        // Validation above establishes the complete object shape.
        const validatedSession = session as JsonObject;
        const sessionId = validatedSession.id as string;

        const duplicate = db
            .prepare('SELECT 1 FROM sessions WHERE id = ?')
            .get(sessionId);

        if (duplicate) {
            return res.status(409).json({
                error: 'A session with this ID already exists',
                sessionId,
            });
        }

        const statement = db.prepare(`
      INSERT INTO sessions (
        id,
        start_time,
        end_time,
        monitored_duration,
        sample_count,
        actual_sampling_rate,
        session_data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        statement.run(
            sessionId,
            validatedSession.startTime,
            validatedSession.endTime,
            validatedSession.monitoredDuration,
            validatedSession.sampleCount,
            validatedSession.actualSamplingRate,
            JSON.stringify(validatedSession)
        );

        res.status(201).json({
            message: 'Session stored successfully',
            sessionId,
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to store session'
        });
    }
});

router.get('/', (_req: Request, res: Response) => {
    try {
        const sessions = db
            .prepare(`
        SELECT
          id,
          start_time,
          end_time,
          monitored_duration,
          sample_count,
          actual_sampling_rate
        FROM sessions
        ORDER BY start_time DESC
      `)
            .all();

        res.json(sessions);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to retrieve sessions'
        });
    }
});

router.get('/:id', (req: Request, res: Response) => {
    try {
        const session = db
            .prepare(`
        SELECT session_data
        FROM sessions
        WHERE id = ?
      `)
            .get(req.params.id) as { session_data: string } | undefined;

        if (!session) {
            return res.status(404).json({
                error: 'Session not found'
            });
        }

        res.json(JSON.parse(session.session_data));

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to retrieve session'
        });
    }
});

export default router;
