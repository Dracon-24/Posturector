import { Session } from '../processing/sessionRecorder';
import { PerformanceMetrics } from '../processing/performanceMetrics';

export type SessionUpload = Session & {
    metrics: PerformanceMetrics;
};

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
    postureSpecific: {
        forward: number;
        backward: number;
        left: number;
        right: number;
    };
    directionCorrectionTimes: {
        forward: number | null;
        backward: number | null;
        left: number | null;
        right: number | null;
    };
}

export interface HistoricalTrends {
    sessions: HistoricalSessionTrend[];
}

const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
    throw new Error(
        'EXPO_PUBLIC_API_BASE_URL is not configured'
    );
}

export async function uploadSession(
    session: Session,
    metrics: PerformanceMetrics
): Promise<void> {
    const payload: SessionUpload = {
        ...session,
        metrics,
    };

    const response = await fetch(`${API_BASE_URL}/api/sessions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Failed to upload session: ${response.status} ${errorText}`
        );
    }

    const result = await response.json();

    console.log('Session uploaded:', result);
}

export async function fetchHistoricalSummary(): Promise<HistoricalSummary> {
    const response = await fetch(`${API_BASE_URL}/api/metrics/summary`);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Failed to fetch historical summary: ${response.status} ${errorText}`
        );
    }

    const result: unknown = await response.json();

    return result as HistoricalSummary;
}

export async function fetchHistoricalTrends(): Promise<HistoricalTrends> {
    const response = await fetch(`${API_BASE_URL}/api/metrics/trends`);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Failed to fetch historical trends: ${response.status} ${errorText}`
        );
    }

    const result: unknown = await response.json();

    return result as HistoricalTrends;
}
