export interface PostureSpecificMetrics {
    forward: number;
    backward: number;
    left: number;
    right: number;
}

export interface DirectionCorrectionTimes {
    forward: number | null;
    backward: number | null;
    left: number | null;
    right: number | null;
}

export interface HistoricalSessionTrend {
    id: string;
    startTime: number;
    endTime: number;
    monitoredDuration: number;
    sampleCount: number;
    actualSamplingRate: number;
    consistency: number;
    averageCorrectionTime: number | null;
    feedbackEvents: number;
    completedCorrections: number;
    completionRate: number;
    timeInGoodPosture: number;
    longestContinuousGoodPosture: number;
    postureSpecific: PostureSpecificMetrics;
    directionCorrectionTimes: DirectionCorrectionTimes;
}

export interface HistoricalSummary {
    totalSessions: number;
    includedSessions: number;
    excludedSessions: number;
    totalMonitoredDuration: number;
    averageConsistency: number | null;
    averageCorrectionTime: number | null;
    totalFeedbackEvents: number;
    totalCompletedCorrections: number;
    overallCompletionRate: number;
    averageSamplingRate: number | null;
}

export interface HistoricalTrends {
    sessions: HistoricalSessionTrend[];
}

export interface StoredSessionRow {
    id: unknown;
    start_time: unknown;
    end_time: unknown;
    monitored_duration: unknown;
    sample_count: unknown;
    actual_sampling_rate: unknown;
    session_data: unknown;
}

interface AnalyticsSession {
    trend: HistoricalSessionTrend;
    correctionResponseTimes: number[];
}

interface AnalyticsResult {
    summary: HistoricalSummary;
    trends: HistoricalTrends;
}

type JsonObject = Record<string, unknown>;

const DIRECTIONS = ['forward', 'backward', 'left', 'right'] as const;

function isObject(value: unknown): value is JsonObject {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
    );
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
    return isFiniteNumber(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
    return isNonNegativeFiniteNumber(value) && Number.isInteger(value);
}

function parsePostureSpecific(value: unknown): PostureSpecificMetrics | null {
    if (!isObject(value)) {
        return null;
    }

    for (const direction of DIRECTIONS) {
        if (!isNonNegativeInteger(value[direction])) {
            return null;
        }
    }

    return {
        forward: value.forward as number,
        backward: value.backward as number,
        left: value.left as number,
        right: value.right as number,
    };
}

function parseDirectionCorrectionTimes(
    value: unknown
): DirectionCorrectionTimes | null {
    if (!isObject(value)) {
        return null;
    }

    for (const direction of DIRECTIONS) {
        const correctionTime = value[direction];

        if (
            correctionTime !== null &&
            !isNonNegativeFiniteNumber(correctionTime)
        ) {
            return null;
        }
    }

    return {
        forward: value.forward as number | null,
        backward: value.backward as number | null,
        left: value.left as number | null,
        right: value.right as number | null,
    };
}

function parseCorrectionResponseTimes(value: unknown): number[] | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const responseTimes: number[] = [];

    for (const response of value) {
        if (
            !isObject(response) ||
            !isNonNegativeFiniteNumber(response.responseTime)
        ) {
            return null;
        }

        responseTimes.push(response.responseTime);
    }

    return responseTimes;
}

function parseStoredSession(row: StoredSessionRow): AnalyticsSession | null {
    if (
        typeof row.id !== 'string' ||
        !isFiniteNumber(row.start_time) ||
        !isFiniteNumber(row.end_time) ||
        !isNonNegativeFiniteNumber(row.monitored_duration) ||
        !isNonNegativeInteger(row.sample_count) ||
        !isNonNegativeFiniteNumber(row.actual_sampling_rate) ||
        typeof row.session_data !== 'string'
    ) {
        return null;
    }

    let sessionData: unknown;

    try {
        sessionData = JSON.parse(row.session_data);
    } catch {
        return null;
    }

    if (!isObject(sessionData) || !isObject(sessionData.metrics)) {
        return null;
    }

    const metrics = sessionData.metrics;
    const postureSpecific = parsePostureSpecific(metrics.postureSpecific);
    const directionCorrectionTimes = parseDirectionCorrectionTimes(
        metrics.directionCorrectionTimes
    );
    const correctionResponseTimes = parseCorrectionResponseTimes(
        sessionData.correctionResponses
    );

    if (
        !isNonNegativeFiniteNumber(metrics.consistency) ||
        (
            metrics.averageCorrectionTime !== null &&
            !isNonNegativeFiniteNumber(metrics.averageCorrectionTime)
        ) ||
        !isNonNegativeInteger(metrics.feedbackEvents) ||
        !isNonNegativeInteger(metrics.completedCorrections) ||
        !isNonNegativeFiniteNumber(metrics.completionRate) ||
        !isNonNegativeFiniteNumber(metrics.timeInGoodPosture) ||
        !isNonNegativeFiniteNumber(metrics.longestContinuousGoodPosture) ||
        postureSpecific === null ||
        directionCorrectionTimes === null ||
        correctionResponseTimes === null ||
        correctionResponseTimes.length !== metrics.completedCorrections
    ) {
        return null;
    }

    return {
        trend: {
            id: row.id,
            startTime: row.start_time,
            endTime: row.end_time,
            monitoredDuration: row.monitored_duration,
            sampleCount: row.sample_count,
            actualSamplingRate: row.actual_sampling_rate,
            consistency: metrics.consistency,
            averageCorrectionTime: metrics.averageCorrectionTime,
            feedbackEvents: metrics.feedbackEvents,
            completedCorrections: metrics.completedCorrections,
            completionRate: metrics.completionRate,
            timeInGoodPosture: metrics.timeInGoodPosture,
            longestContinuousGoodPosture:
                metrics.longestContinuousGoodPosture,
            postureSpecific,
            directionCorrectionTimes,
        },
        correctionResponseTimes,
    };
}

function average(values: number[]): number | null {
    if (values.length === 0) {
        return null;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateHistoricalAnalytics(
    rows: StoredSessionRow[]
): AnalyticsResult {
    const included = rows
        .map(parseStoredSession)
        .filter((session): session is AnalyticsSession => session !== null);

    const totalMonitoredDuration = included.reduce(
        (sum, session) => sum + session.trend.monitoredDuration,
        0
    );
    const totalGoodPostureTime = included.reduce(
        (sum, session) => sum + session.trend.timeInGoodPosture,
        0
    );
    const totalSamples = included.reduce(
        (sum, session) => sum + session.trend.sampleCount,
        0
    );
    const totalFeedbackEvents = included.reduce(
        (sum, session) => sum + session.trend.feedbackEvents,
        0
    );
    const totalCompletedCorrections = included.reduce(
        (sum, session) => sum + session.trend.completedCorrections,
        0
    );
    const correctionResponseTimes = included.flatMap(
        session => session.correctionResponseTimes
    );

    const summary: HistoricalSummary = {
        totalSessions: rows.length,
        includedSessions: included.length,
        excludedSessions: rows.length - included.length,
        totalMonitoredDuration,
        averageConsistency: totalMonitoredDuration > 0
            ? totalGoodPostureTime / totalMonitoredDuration * 100
            : null,
        averageCorrectionTime: average(correctionResponseTimes),
        totalFeedbackEvents,
        totalCompletedCorrections,
        overallCompletionRate: totalFeedbackEvents > 0
            ? totalCompletedCorrections / totalFeedbackEvents * 100
            : 0,
        averageSamplingRate: totalMonitoredDuration > 0
            ? totalSamples / (totalMonitoredDuration / 1000)
            : null,
    };

    const sessions = included
        .map(session => session.trend)
        .sort((left, right) => left.startTime - right.startTime);

    return {
        summary,
        trends: { sessions },
    };
}
