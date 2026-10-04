import type { HistoricalSessionTrend } from '../services/apiService';

export interface HistoricalGroup {
  key: string;
  label: string;
  sessions: HistoricalSessionTrend[];
  monitoredDuration: number;
  goodPostureTime: number;
  poorPostureTime: null;
  longestGoodPosture: number;
  averageSessionDuration: number | null;
  averageSamplingRate: number | null;
  consistency: number | null;
  completionRate: number | null;
  averageCorrectionTime: number | null;
  feedbackEvents: number;
  completedCorrections: number;
  directionCounts: { forward: number; backward: number; left: number; right: number };
}

export interface HistoryDatum {
  key: string;
  label: string;
  values: Array<number | null>;
  detail?: string;
}

export const HISTORY_POOR_TIME_UNAVAILABLE =
  'Poor-posture time is not available in historical trends. Total minus good time also includes unclassified time after the last sample, so it is not labelled poor posture.';

export function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftDateKey(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date.getTime());
}

export function weekKey(timestamp: number): string {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return localDateKey(date.getTime());
}

export function dateLabel(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined,
    { day: 'numeric', month: 'long', year: 'numeric' });
}

function buildGroup(key: string, sessions: HistoricalSessionTrend[], prefix = ''): HistoricalGroup {
  let monitoredDuration = 0, goodPostureTime = 0, feedbackEvents = 0,
    completedCorrections = 0, correctionTotal = 0, samples = 0, longestGoodPosture = 0;
  let correctionCoverage = true;
  const directionCounts = { forward: 0, backward: 0, left: 0, right: 0 };
  for (const session of sessions) {
    monitoredDuration += session.monitoredDuration;
    goodPostureTime += session.timeInGoodPosture;
    feedbackEvents += session.feedbackEvents;
    completedCorrections += session.completedCorrections;
    samples += session.sampleCount;
    longestGoodPosture = Math.max(longestGoodPosture, session.longestContinuousGoodPosture);
    if (session.completedCorrections > 0) {
      if (session.averageCorrectionTime === null) correctionCoverage = false;
      else correctionTotal += session.averageCorrectionTime * session.completedCorrections;
    }
    for (const direction of ['forward', 'backward', 'left', 'right'] as const) {
      directionCounts[direction] += session.postureSpecific[direction];
    }
  }
  return {
    key, label: `${prefix}${dateLabel(key)}`, sessions, monitoredDuration, goodPostureTime,
    poorPostureTime: null, longestGoodPosture,
    averageSessionDuration: sessions.length > 0 ? monitoredDuration / sessions.length : null,
    averageSamplingRate: monitoredDuration > 0 ? samples / (monitoredDuration / 1000) : null,
    consistency: monitoredDuration > 0 ? goodPostureTime / monitoredDuration * 100 : null,
    completionRate: feedbackEvents > 0 ? completedCorrections / feedbackEvents * 100 : null,
    averageCorrectionTime: completedCorrections > 0 && correctionCoverage ? correctionTotal / completedCorrections : null,
    feedbackEvents, completedCorrections, directionCounts,
  };
}

function group(sessions: HistoricalSessionTrend[], keyFor: (timestamp: number) => string, prefix = ''): HistoricalGroup[] {
  const groups = new Map<string, HistoricalSessionTrend[]>();
  for (const session of sessions) {
    // A zero startTime means monitoring never received its first sample, not 1970.
    if (!Number.isFinite(session.startTime) || session.startTime <= 0) continue;
    const key = keyFor(session.startTime);
    const bucket = groups.get(key);
    if (bucket) bucket.push(session);
    else groups.set(key, [session]);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => buildGroup(key, [...items].sort((a, b) => a.startTime - b.startTime), prefix));
}

export function groupHistoricalSessionsByDay(sessions: HistoricalSessionTrend[]): HistoricalGroup[] {
  return group(sessions, localDateKey);
}
export function groupHistoricalSessionsByWeek(sessions: HistoricalSessionTrend[]): HistoricalGroup[] {
  return group(sessions, weekKey, 'Week of ');
}

const dailySeries = (groups: Array<HistoricalGroup | null>, keys: string[], labels: string[],
  value: (group: HistoricalGroup) => Array<number | null>): HistoryDatum[] =>
  groups.map((item, index) => ({ key: keys[index], label: labels[index],
    values: item ? value(item) : [null], detail: dateLabel(keys[index]) }));

function dominantDirection(group: HistoricalGroup): string | null {
  const maximum = Math.max(...Object.values(group.directionCounts));
  return maximum > 0 ? Object.entries(group.directionCounts).filter(([, count]) => count === maximum)
    .map(([direction]) => direction).join(' / ') : null;
}

function best<T>(items: T[], value: (item: T) => number | null, label: (item: T) => string, highest = true) {
  const eligible = items.filter(item => value(item) !== null);
  if (eligible.length === 0) return null;
  let result = eligible[0];
  for (const item of eligible.slice(1)) {
    if (highest ? (value(item) ?? 0) > (value(result) ?? 0) : (value(item) ?? 0) < (value(result) ?? 0)) result = item;
  }
  const ties = eligible.filter(item => value(item) === value(result));
  return { label: ties.slice(0, 3).map(label).join(' / ') + (ties.length > 3 ? ` / +${ties.length - 3} tied` : ''), value: value(result) ?? 0 };
}

export function selectedWeekAnalytics(days: HistoricalGroup[], monday: string) {
  const keys = Array.from({ length: 7 }, (_, index) => shiftDateKey(monday, index));
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const index = new Map(days.map(day => [day.key, day]));
  const selected = keys.map(key => index.get(key) ?? null);
  const available = selected.filter((day): day is HistoricalGroup => day !== null);
  const aggregate = buildGroup(monday, available.flatMap(day => day.sessions), 'Week of ');
  return {
    aggregate, keys, endKey: keys[6], averageDailyMonitoringTime: aggregate.sessions.length ? aggregate.monitoredDuration / 7 : null,
    charts: {
      consistency: dailySeries(selected, keys, labels, day => [day.consistency]),
      duration: dailySeries(selected, keys, labels, day => [day.monitoredDuration]),
      feedback: dailySeries(selected, keys, labels, day => [day.feedbackEvents]),
      corrections: dailySeries(selected, keys, labels, day => [day.completedCorrections]),
      correctionTime: dailySeries(selected, keys, labels, day => [day.averageCorrectionTime]),
      postureTime: selected.map((day, i) => ({ key: keys[i], label: labels[i],
        values: day ? [day.goodPostureTime, null] : [null, null], detail: dateLabel(keys[i]) })),
      direction: Object.entries(aggregate.directionCounts).map(([label, value]) => ({ key: label, label, values: [aggregate.sessions.length ? value : null] })),
    },
    insights: {
      bestConsistency: best(available, day => day.consistency, day => day.label),
      mostMonitored: best(available, day => day.monitoredDuration, day => day.label),
      fastestCorrection: best(available, day => day.averageCorrectionTime, day => day.label, false),
      dominantDirection: dominantDirection(aggregate),
    },
  };
}

export function selectedDayAnalytics(days: HistoricalGroup[], key: string) {
  const aggregate = days.find(day => day.key === key) ?? buildGroup(key, []);
  const items = aggregate.sessions;
  const points = items.map((session, index) => ({ key: session.id, label: `S${index + 1}`,
    detail: `${new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${session.id}` }));
  const series = (value: (session: HistoricalSessionTrend) => number | null): HistoryDatum[] =>
    items.map((session, index) => ({ ...points[index], values: [value(session)] }));
  const labels = new Map(items.map((session, index) => [session.id, `Session ${index + 1}`]));
  const label = (session: HistoricalSessionTrend) => labels.get(session.id) ?? session.id;
  return {
    aggregate,
    charts: {
      consistency: series(session => session.monitoredDuration > 0 ? session.consistency : null),
      duration: series(session => session.monitoredDuration),
      feedback: series(session => session.feedbackEvents),
      corrections: series(session => session.completedCorrections),
      correctionTime: series(session => session.completedCorrections > 0 ? session.averageCorrectionTime : null),
      direction: Object.entries(aggregate.directionCounts).map(([label, value]) => ({ key: label, label, values: [items.length ? value : null] })),
    },
    insights: {
      bestConsistency: best(items, session => session.monitoredDuration > 0 ? session.consistency : null, label),
      fastestCorrection: best(items, session => session.completedCorrections > 0 ? session.averageCorrectionTime : null, label, false),
      longestSession: best(items, session => session.monitoredDuration, label),
      dominantDirection: dominantDirection(aggregate),
    },
    usage: timeOfDayUsage(items, key),
  };
}

/** Split only actual finalized intervals; never fill time between sessions. */
export function timeOfDayUsage(sessions: HistoricalSessionTrend[], key: string) {
  const start = new Date(`${key}T00:00:00`);
  const boundaries = [0, 6, 12, 18, 24].map(hour => {
    const date = new Date(start); date.setHours(hour, 0, 0, 0); return date.getTime();
  });
  const durations: Array<number | null> = [null, null, null, null];
  let invalidIntervals = 0, outsideDayDuration = 0;
  for (const session of sessions) {
    if (!Number.isFinite(session.startTime) || session.startTime <= 0 || !Number.isFinite(session.endTime) ||
      !Number.isFinite(session.monitoredDuration) || session.monitoredDuration < 0 || session.endTime < session.startTime ||
      Math.abs(session.endTime - session.startTime - session.monitoredDuration) > 1) {
      invalidIntervals++; continue;
    }
    let covered = 0;
    for (let bucket = 0; bucket < 4; bucket++) {
      const duration = Math.max(0, Math.min(session.endTime, boundaries[bucket + 1]) - Math.max(session.startTime, boundaries[bucket]));
      if (duration > 0) { durations[bucket] = (durations[bucket] ?? 0) + duration; covered += duration; }
    }
    outsideDayDuration += Math.max(0, session.monitoredDuration - covered);
  }
  return {
    series: durations.map((duration, index) => ({ key: `${key}-${index}`, label: ['00–06', '06–12', '12–18', '18–24'][index], values: [duration] })),
    invalidIntervals, outsideDayDuration,
  };
}
