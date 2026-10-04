import type { HistoricalSessionTrend } from '../services/apiService';

export interface HistoricalGroup {
    key: string;
    label: string;
    sessions: HistoricalSessionTrend[];
    monitoredDuration: number;
    consistency: number | null;
    completionRate: number;
    averageCorrectionTime: number | null;
    feedbackEvents: number;
    completedCorrections: number;
    directionCounts: { forward: number; backward: number; left: number; right: number };
}

function localDateKey(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weekKey(timestamp: number): string {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day);
    return localDateKey(date.getTime());
}

function buildGroup(key: string, sessions: HistoricalSessionTrend[], prefix: string): HistoricalGroup {
    const monitoredDuration = sessions.reduce((sum, session) => sum + session.monitoredDuration, 0);
    const goodTime = sessions.reduce((sum, session) => sum + session.timeInGoodPosture, 0);
    const feedbackEvents = sessions.reduce((sum, session) => sum + session.feedbackEvents, 0);
    const completedCorrections = sessions.reduce((sum, session) => sum + session.completedCorrections, 0);
    const correctionWeightedTotal = sessions.reduce((sum, session) => sum + (session.averageCorrectionTime ?? 0) * session.completedCorrections, 0);
    const directionCounts = sessions.reduce((total, session) => ({
        forward: total.forward + session.postureSpecific.forward,
        backward: total.backward + session.postureSpecific.backward,
        left: total.left + session.postureSpecific.left,
        right: total.right + session.postureSpecific.right,
    }), { forward: 0, backward: 0, left: 0, right: 0 });

    return {
        key,
        label: `${prefix}${new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}`,
        sessions,
        monitoredDuration,
        consistency: monitoredDuration > 0 ? goodTime / monitoredDuration * 100 : null,
        completionRate: feedbackEvents > 0 ? completedCorrections / feedbackEvents * 100 : 0,
        averageCorrectionTime: completedCorrections > 0 ? correctionWeightedTotal / completedCorrections : null,
        feedbackEvents,
        completedCorrections,
        directionCounts,
    };
}

function group(sessions: HistoricalSessionTrend[], keyFor: (timestamp: number) => string, prefix: string): HistoricalGroup[] {
    const groups = new Map<string, HistoricalSessionTrend[]>();
    sessions.forEach(session => {
        const key = keyFor(session.startTime);
        groups.set(key, [...(groups.get(key) ?? []), session]);
    });
    return [...groups.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([key, grouped]) => buildGroup(key, grouped, prefix));
}

export function groupHistoricalSessionsByDay(sessions: HistoricalSessionTrend[]): HistoricalGroup[] {
    return group(sessions, localDateKey, '');
}

export function groupHistoricalSessionsByWeek(sessions: HistoricalSessionTrend[]): HistoricalGroup[] {
    return group(sessions, weekKey, 'Week of ');
}
