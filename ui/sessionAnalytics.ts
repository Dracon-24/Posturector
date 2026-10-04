import type { PerformanceMetrics } from '../processing/performanceMetrics';
import type { Session } from '../processing/sessionRecorder';

export const SESSION_SECTIONS = [
  'overview', 'posture', 'corrections', 'adaptive', 'stability', 'technical',
] as const;

export const UNAVAILABLE_SESSION_HISTORY = {
  evidence: 'Behavioral evidence history: Not persisted for this session.',
  features: 'Adaptive feature history is not persisted in the current session schema. Recorded threshold results are shown below.',
  feedbackMode: 'Not persisted for this session',
  calibrationTimestamp: 'Not recorded in the session snapshot',
  stability: 'Stability state is not persisted. Stored samples omit any inputs rejected by the recorder and do not include detector configuration provenance, so a replay cannot certify the original stable/unstable decisions.',
} as const;

export interface ChartPoint {
  x: number;
  y: number;
  detail?: string;
}

export interface ChartSeries {
  name: string;
  color: string;
  points: ChartPoint[];
  step?: boolean;
  scatter?: boolean;
}

export interface DistributionBin {
  label: string;
  count: number;
}

export interface ThresholdSummary {
  canonical: number;
  final: number | null;
  maximumEffective: number | null;
  finalAdjustment: number | null;
  maximumRecordedAdjustment: number | null;
}

export interface SessionStoryEvent {
  timestamp: number;
  elapsed: number | null;
  kind: 'start' | 'deviation' | 'acceptable' | 'feedback' | 'correction' | 'end';
  label: string;
}

export function elapsedSeconds(timestamp: number, startTime: number): number | null {
  return startTime > 0 && timestamp >= startTime ? (timestamp - startTime) / 1000 : null;
}

/** Keep original points, endpoints and each bucket's extrema; never average peaks away. */
export function preserveExtrema(points: readonly ChartPoint[], limit = 160): ChartPoint[] {
  if (points.length <= limit) return [...points];
  const bucketCount = Math.max(1, Math.floor((limit - 2) / 4));
  const bucketSize = Math.ceil((points.length - 2) / bucketCount);
  const indices = new Set<number>([0, points.length - 1]);
  for (let start = 1; start < points.length - 1; start += bucketSize) {
    const end = Math.min(points.length - 1, start + bucketSize);
    let minimum = start;
    let maximum = start;
    for (let index = start + 1; index < end; index++) {
      if (points[index].y < points[minimum].y) minimum = index;
      if (points[index].y > points[maximum].y) maximum = index;
    }
    indices.add(start);
    indices.add(end - 1);
    indices.add(minimum);
    indices.add(maximum);
  }
  return [...indices].sort((a, b) => a - b).map(index => points[index]);
}

export function nearestPoint(points: readonly ChartPoint[], x: number): ChartPoint | null {
  if (!points.length) return null;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].x < x) low = middle + 1;
    else high = middle;
  }
  const previous = points[Math.max(0, low - 1)];
  return Math.abs(previous.x - x) <= Math.abs(points[low].x - x) ? previous : points[low];
}

function thresholdSummary(canonical: number, values: readonly ChartPoint[]): ThresholdSummary {
  let maximumEffective: number | null = null;
  for (const point of values) {
    maximumEffective = maximumEffective === null ? point.y : Math.max(maximumEffective, point.y);
  }
  const final = values.at(-1)?.y ?? null;
  return {
    canonical, final, maximumEffective,
    finalAdjustment: final === null ? null : final - canonical,
    maximumRecordedAdjustment: maximumEffective === null ? null : maximumEffective - canonical,
  };
}

/** Presentation-only derivations from a finalized payload. No detector/controller replay. */
export function buildSessionAnalytics(
  session: Session,
  metrics: PerformanceMetrics,
  canonicalPitch: number,
  canonicalRoll: number
) {
  const pitchDeviation: ChartPoint[] = [];
  const rollDeviation: ChartPoint[] = [];
  const pitchThreshold: ChartPoint[] = [];
  const rollThreshold: ChartPoint[] = [];
  const posture: ChartPoint[] = [];
  const distribution: DistributionBin[] = [
    { label: '0–2°', count: 0 }, { label: '2–4°', count: 0 },
    { label: '4–6°', count: 0 }, { label: '6–8°', count: 0 },
    { label: '8°+', count: 0 },
  ];
  let poorPostureTime = 0;
  let observedIntervalTime = 0;
  const events: SessionStoryEvent[] = [];
  const addEvent = (timestamp: number, kind: SessionStoryEvent['kind'], label: string) => {
    events.push({ timestamp, elapsed: elapsedSeconds(timestamp, session.startTime), kind, label });
  };
  if (session.startTime > 0) addEvent(session.startTime, 'start', 'Monitoring started (first recorded sample)');

  for (let index = 0; index < session.samples.length; index++) {
    const sample = session.samples[index];
    const x = elapsedSeconds(sample.timestamp, session.startTime);
    if (x !== null) {
      pitchDeviation.push({ x, y: sample.pitchDeviation });
      rollDeviation.push({ x, y: sample.rollDeviation });
      pitchThreshold.push({ x, y: sample.pitchThreshold });
      rollThreshold.push({ x, y: sample.rollThreshold });
      posture.push({ x, y: sample.postureAcceptable ? 1 : 0,
        detail: sample.postureAcceptable ? 'Acceptable posture' : `${sample.direction} deviation detected` });
    }
    const bin = Math.min(4, Math.max(0, Math.floor(sample.overallDeviation / 2)));
    distribution[bin].count++;
    const next = session.samples[index + 1];
    if (next) {
      const duration = next.timestamp - sample.timestamp;
      if (duration > 0) {
        observedIntervalTime += duration;
        if (!sample.postureAcceptable) poorPostureTime += duration;
      }
    }
    const previous = session.samples[index - 1];
    if (!sample.postureAcceptable && (!previous || previous.postureAcceptable || previous.direction !== sample.direction)) {
      addEvent(sample.timestamp, 'deviation', `${sample.direction} deviation detected (recorded sample)`);
    } else if (sample.postureAcceptable && previous && !previous.postureAcceptable) {
      addEvent(sample.timestamp, 'acceptable', 'Posture acceptable again (recorded sample)');
    }
  }

  for (const event of session.feedbackEvents) {
    addEvent(event.timestamp, 'feedback', `Feedback triggered — ${event.direction} · ${event.deviation.toFixed(2)}°`);
  }
  const correctionPoints = [...session.correctionResponses]
    .sort((a, b) => a.correctionTimestamp - b.correctionTimestamp)
    .map((response, index) => ({
      x: index + 1, y: response.responseTime,
      detail: `${response.direction} · ${formatElapsed(elapsedSeconds(response.correctionTimestamp, session.startTime))}`,
    }));
  for (const response of session.correctionResponses) {
    addEvent(response.correctionTimestamp, 'correction', `Posture corrected — ${response.direction} · ${response.responseTime.toFixed(2)} s`);
  }
  if (session.endTime !== null) addEvent(session.endTime, 'end', 'Monitoring stopped');
  events.sort((a, b) => a.timestamp - b.timestamp);

  return {
    poorPostureTime,
    observedIntervalTime,
    unclassifiedTime: Math.max(0, session.monitoredDuration - observedIntervalTime),
    completionRate: metrics.feedbackEvents > 0 ? metrics.completionRate : null,
    distribution,
    pitchDeviation, rollDeviation, pitchThreshold, rollThreshold, posture,
    pitch: thresholdSummary(canonicalPitch, pitchThreshold),
    roll: thresholdSummary(canonicalRoll, rollThreshold),
    correctionPoints,
    events,
    history: UNAVAILABLE_SESSION_HISTORY,
  };
}

export function formatElapsed(seconds: number | null): string {
  if (seconds === null) return 'Elapsed time unavailable';
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(1).padStart(4, '0')}`;
}
