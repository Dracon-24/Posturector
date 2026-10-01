import { Session } from '../processing/sessionRecorder';
import { PerformanceMetrics } from '../processing/performanceMetrics';

export type SessionUpload = Session & {
    metrics: PerformanceMetrics;
};

const API_BASE_URL = 'http://10.219.193.17:3000';

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