import { ReactNode, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DeviationHistoryPoint,
  PerformanceMetrics,
} from '../processing/performanceMetrics';
import {
  CorrectionResponse,
  PostureDirection,
  Session,
} from '../processing/sessionRecorder';
import {
  MAX_ADAPTIVE_ADJUSTMENT,
} from '../processing/adaptiveThreshold';

type SessionUploadState =
  | 'idle'
  | 'uploading'
  | 'saved'
  | 'failed'
  | 'possibly-saved';

interface SessionResultsDashboardProps {
  session: Session;
  metrics: PerformanceMetrics;
  uploadState: SessionUploadState;
  adaptiveMode: 'PRODUCTION' | 'DEMO';
  canonicalPitchThreshold: number;
  canonicalRollThreshold: number;
  onRetryUpload: () => void;
  onStartNewSession: () => void;
  canStartNewSession?: boolean;
}

interface DeviationChartBucket {
  pitchDeviation: number;
  rollDeviation: number;
  pitchThreshold: number;
  rollThreshold: number;
}

type TimelineState = 'good' | 'mixed' | 'deviation';

const CHART_BUCKET_COUNT = 36;
const TIMELINE_BUCKET_COUNT = 40;

export function SessionResultsDashboard({
  session,
  metrics,
  uploadState,
  adaptiveMode,
  canonicalPitchThreshold,
  canonicalRollThreshold,
  onRetryUpload,
  onStartNewSession,
  canStartNewSession = true,
}: SessionResultsDashboardProps) {
  const [technicalExpanded, setTechnicalExpanded] =
    useState(false);

  const hasSessionData =
    session.sampleCount > 0 &&
    session.monitoredDuration > 0;

  const hasFeedback =
    metrics.feedbackEvents > 0;

  const hasCorrections =
    session.correctionResponses.length > 0;

  const finalSample =
    session.samples.at(-1) ?? null;

  const maximumPitchThreshold =
    maximumValue(
      session.samples.map(sample => sample.pitchThreshold),
      canonicalPitchThreshold
    );

  const maximumRollThreshold =
    maximumValue(
      session.samples.map(sample => sample.rollThreshold),
      canonicalRollThreshold
    );

  const maximumPitchAdjustment =
    Math.max(0, maximumPitchThreshold - canonicalPitchThreshold);

  const maximumRollAdjustment =
    Math.max(0, maximumRollThreshold - canonicalRollThreshold);

  const finalPitchAdjustment =
    finalSample === null
      ? null
      : Math.max(0, finalSample.pitchThreshold - canonicalPitchThreshold);

  const finalRollAdjustment =
    finalSample === null
      ? null
      : Math.max(0, finalSample.rollThreshold - canonicalRollThreshold);

  const timeline =
    buildPostureTimeline(session, TIMELINE_BUCKET_COUNT);

  const deviationChart =
    buildDeviationChart(metrics.deviationHistory, CHART_BUCKET_COUNT);

  const chartMaximum =
    maximumValue(
      deviationChart.flatMap(bucket => [
        bucket.pitchDeviation,
        bucket.rollDeviation,
        bucket.pitchThreshold,
        bucket.rollThreshold,
      ]),
      1
    );

  const directionMaximum =
    maximumValue(
      Object.values(metrics.postureSpecific),
      1
    );

  return (
    <View style={styles.resultsRoot}>
      <View style={styles.resultsHeader}>
        <Text style={styles.eyebrow}>COMPLETED SESSION</Text>
        <Text style={styles.resultsTitle}>Session Performance</Text>
        <Text style={styles.resultsSubtitle}>
          Finalized locally from the completed monitoring session.
        </Text>
        <UploadStatus state={uploadState} onRetry={onRetryUpload} />
        {(uploadState === 'saved' || uploadState === 'possibly-saved') && canStartNewSession && (
          <Pressable
            accessibilityRole="button"
            onPress={onStartNewSession}
            style={({ pressed }) => [styles.newSessionButton, pressed && styles.pressed]}
          >
            <Text style={styles.newSessionButtonText}>Start Another Session</Text>
          </Pressable>
        )}
      </View>

      {!hasSessionData && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Insufficient session data</Text>
          <Text style={styles.emptyBody}>
            This session ended before enough monitoring samples were recorded for meaningful performance results.
          </Text>
        </View>
      )}

      {hasSessionData && (
        <>
          <ResultsSection
            title="Session Overview"
            caption="The primary results calculated from the finalized session."
          >
            <View style={styles.primaryMetricGrid}>
              <PrimaryMetric
                label="Consistency"
                value={`${metrics.consistency.toFixed(1)}%`}
                tone="good"
              />
              <PrimaryMetric
                label="Monitoring time"
                value={formatDuration(metrics.monitoredDuration)}
              />
              <PrimaryMetric
                label="Good posture"
                value={formatDuration(metrics.timeInGoodPosture)}
                tone="good"
              />
              <PrimaryMetric
                label="Correction completion"
                value={hasFeedback ? `${metrics.completionRate.toFixed(1)}%` : 'No feedback'}
                tone={hasFeedback ? 'accent' : 'neutral'}
              />
              <PrimaryMetric
                label="Average correction"
                value={metrics.averageCorrectionTime === null
                  ? 'No completed corrections'
                  : `${metrics.averageCorrectionTime.toFixed(2)} s`}
              />
              <PrimaryMetric
                label="Longest good period"
                value={formatDuration(metrics.longestContinuousGoodPosture)}
              />
            </View>
          </ResultsSection>

          <ResultsSection
            title="Posture Performance"
            caption="Consistency = good-posture time ÷ monitored duration × 100."
          >
            <View style={styles.consistencyHeader}>
              <View>
                <Text style={styles.consistencyValue}>{metrics.consistency.toFixed(1)}%</Text>
                <Text style={styles.metricCaption}>time within effective thresholds</Text>
              </View>
              <View style={styles.consistencyFacts}>
                <FactRow label="Good posture" value={formatDuration(metrics.timeInGoodPosture)} />
                <FactRow label="Monitored" value={formatDuration(metrics.monitoredDuration)} />
              </View>
            </View>
            <ProgressBar value={metrics.consistency / 100} />

            <Text style={styles.subsectionLabel}>POSTURE ACCEPTABILITY TIMELINE</Text>
            <View style={styles.timeline}>
              {timeline.map((state, index) => (
                <View
                  key={`timeline-${index}`}
                  style={[
                    styles.timelineSegment,
                    state === 'good'
                      ? styles.timelineGood
                      : state === 'mixed'
                        ? styles.timelineMixed
                        : styles.timelineDeviation,
                  ]}
                />
              ))}
            </View>
            <View style={styles.legendRow}>
              <Legend color="#2E8A72" label="Acceptable" />
              <Legend color="#D39A42" label="Mixed bucket" />
              <Legend color="#C95B45" label="Deviation" />
            </View>
            <Text style={styles.chartNote}>
              Each segment uses recorded samples only; mixed buckets contain both acceptable and deviation samples.
            </Text>
          </ResultsSection>

          <ResultsSection
            title="Correction Performance"
            caption="Correction completion means completed responses divided by feedback events."
          >
            {!hasFeedback ? (
              <EmptyMessage text="No posture corrections were triggered during this session." />
            ) : (
              <View style={styles.metricGrid}>
                <SecondaryMetric label="Feedback events" value={`${metrics.feedbackEvents}`} />
                <SecondaryMetric label="Completed corrections" value={`${metrics.completedCorrections}`} />
                <SecondaryMetric label="Completion" value={`${metrics.completionRate.toFixed(1)}%`} />
                <SecondaryMetric
                  label="Average response"
                  value={metrics.averageCorrectionTime === null
                    ? 'Unavailable'
                    : `${metrics.averageCorrectionTime.toFixed(2)} s`}
                />
              </View>
            )}

            <Text style={styles.subsectionLabel}>CORRECTION HISTORY</Text>
            {!hasCorrections ? (
              <EmptyMessage text="No completed correction responses recorded." />
            ) : (
              session.correctionResponses.map((response, index) => (
                <CorrectionHistoryItem
                  key={`${response.feedbackTimestamp}-${index}`}
                  response={response}
                  sessionStartTime={session.startTime}
                  index={index}
                />
              ))
            )}
          </ResultsSection>

          <ResultsSection
            title="Adaptive-System Behaviour"
            caption="Adaptive threshold and adaptive feedback remain separate mechanisms."
          >
            <View style={styles.adaptiveDefinitionGrid}>
              <DefinitionCard
                title="Adaptive Threshold"
                body="Temporarily adjusts posture acceptance thresholds from behavioral evidence."
              />
              <DefinitionCard
                title="Adaptive Feedback"
                body="Changes feedback persistence and reassertion from recent correction responses."
              />
            </View>

            <Text style={styles.subsectionLabel}>THRESHOLD SESSION STATE</Text>
            <View style={styles.axisResultGrid}>
              <ThresholdResult
                axis="Pitch"
                canonical={canonicalPitchThreshold}
                maximumEffective={maximumPitchThreshold}
                finalEffective={finalSample?.pitchThreshold ?? null}
                maximumAdjustment={maximumPitchAdjustment}
                finalAdjustment={finalPitchAdjustment}
              />
              <ThresholdResult
                axis="Roll"
                canonical={canonicalRollThreshold}
                maximumEffective={maximumRollThreshold}
                finalEffective={finalSample?.rollThreshold ?? null}
                maximumAdjustment={maximumRollAdjustment}
                finalAdjustment={finalRollAdjustment}
              />
            </View>

            <View style={styles.boundNotice}>
              <Text style={styles.boundNoticeTitle}>Canonical baseline is immutable</Text>
              <Text style={styles.boundNoticeBody}>
                Effective thresholds may adapt within the configured +{MAX_ADAPTIVE_ADJUSTMENT.toFixed(0)}° bound.
              </Text>
            </View>

            <UnavailableHistory
              title="Behavioral evidence & safety history"
              body="The session stores effective thresholds, but it does not persist feature EMA or adaptive safety-gate history. No historical gate events are inferred here."
            />
            <UnavailableHistory
              title="Adaptive feedback mode history"
              body="Completed responses are persisted, but NORMAL / PERSISTENT / HIGH_PERSISTENCE mode history and reassertions are runtime-only and are not reconstructed."
            />
          </ResultsSection>

          <ResultsSection
            title="Direction Analysis"
            caption="Feedback-trigger counts and existing direction-specific correction averages."
          >
            {(['forward', 'backward', 'left', 'right'] as const).map(direction => (
              <DirectionRow
                key={direction}
                direction={direction}
                count={metrics.postureSpecific[direction]}
                maximum={directionMaximum}
                averageCorrectionTime={metrics.directionCorrectionTimes[direction]}
              />
            ))}
            <Text style={styles.chartNote}>
              Neutral samples are not feedback-trigger directions and are not included in these counts.
            </Text>
          </ResultsSection>

          <ResultsSection
            title="Deviation History"
            caption="Recorded pitch/roll deviation and effective-threshold bucket maxima."
          >
            {deviationChart.length === 0 ? (
              <EmptyMessage text="No deviation history is available for this session." />
            ) : (
              <>
                <View style={styles.deviationChart}>
                  {deviationChart.map((bucket, index) => (
                    <DeviationColumn
                      key={`deviation-${index}`}
                      bucket={bucket}
                      maximum={chartMaximum}
                    />
                  ))}
                </View>
                <View style={styles.legendRow}>
                  <Legend color="#2870A8" label="Pitch deviation" />
                  <Legend color="#C36C48" label="Roll deviation" />
                  <Legend color="#69A7D2" label="Pitch threshold" line />
                  <Legend color="#D7A187" label="Roll threshold" line />
                </View>
                <Text style={styles.chartNote}>
                  Buckets retain maxima instead of selecting arbitrary samples, preserving severe deviations.
                </Text>
              </>
            )}
          </ResultsSection>
        </>
      )}

      <View style={styles.technicalCard}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setTechnicalExpanded(value => !value)}
          style={({ pressed }) => [styles.technicalHeader, pressed && styles.pressed]}
        >
          <View style={styles.flexOne}>
            <Text style={styles.technicalTitle}>Technical Session Information</Text>
            <Text style={styles.technicalCaption}>Engineering and reviewer details</Text>
          </View>
          <Text style={styles.expandText}>{technicalExpanded ? 'Hide' : 'Show'}</Text>
        </Pressable>

        {technicalExpanded && (
          <View style={styles.technicalBody}>
            <FactRow label="Session ID" value={session.id} wrap />
            <FactRow label="Start time" value={formatDateTime(session.startTime)} />
            <FactRow label="End time" value={formatDateTime(session.endTime)} />
            <FactRow label="Monitored duration" value={formatDuration(session.monitoredDuration)} />
            <FactRow label="Sample count" value={`${session.sampleCount}`} />
            <FactRow label="Actual sampling rate" value={`${session.actualSamplingRate.toFixed(1)} Hz`} />
            <FactRow label="Calibration samples" value={`${session.calibration.sampleCount}`} />
            <FactRow label="Calibration confidence" value={`${session.calibration.confidence.toFixed(1)}%`} />
            <FactRow label="Calibration validity" value={session.calibration.valid ? 'Valid' : 'Invalid'} />
            <FactRow
              label="Adaptive timing"
              value={adaptiveMode === 'DEMO'
                ? 'DEMO — accelerated adaptive timing'
                : 'PRODUCTION — normal adaptive timing'}
            />
            <FactRow label="Upload state" value={formatUploadState(uploadState)} />
            {adaptiveMode === 'DEMO' && (
              <Text style={styles.demoNotice}>
                DEMO timing is a temporary engineering-review configuration and is not production-validated.
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function ResultsSection({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCaption}>{caption}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function UploadStatus({
  state,
  onRetry,
}: {
  state: SessionUploadState;
  onRetry: () => void;
}) {
  const label = formatUploadState(state);
  const toneStyle =
    state === 'saved'
      ? styles.uploadGood
      : state === 'failed' || state === 'possibly-saved'
        ? styles.uploadWarning
        : styles.uploadActive;

  return (
    <View>
      <View style={styles.uploadRow}>
        <View style={[styles.uploadBadge, toneStyle]}>
          <Text style={styles.uploadBadgeText}>SYNC · {label.toUpperCase()}</Text>
        </View>
        {state === 'failed' && (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryButtonText}>Retry Sync</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.uploadMessage}>{formatUploadMessage(state)}</Text>
    </View>
  );
}

function PrimaryMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'accent';
}) {
  return (
    <View style={[
      styles.primaryMetric,
      tone === 'good'
        ? styles.primaryMetricGood
        : tone === 'accent'
          ? styles.primaryMetricAccent
          : styles.primaryMetricNeutral,
    ]}>
      <Text style={styles.primaryMetricValue}>{value}</Text>
      <Text style={styles.primaryMetricLabel}>{label}</Text>
    </View>
  );
}

function SecondaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.secondaryMetric}>
      <Text style={styles.secondaryMetricLabel}>{label}</Text>
      <Text style={styles.secondaryMetricValue}>{value}</Text>
    </View>
  );
}

function FactRow({
  label,
  value,
  wrap = false,
}: {
  label: string;
  value: string;
  wrap?: boolean;
}) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, wrap && styles.factValueWrap]}>{value}</Text>
    </View>
  );
}

function ProgressBar({ value }: { value: number }) {
  const bounded = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${bounded * 100}%` }]} />
    </View>
  );
}

function Legend({
  color,
  label,
  line = false,
}: {
  color: string;
  label: string;
  line?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[
        line ? styles.legendLine : styles.legendSwatch,
        { backgroundColor: color },
      ]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <View style={styles.emptyMessage}>
      <Text style={styles.emptyMessageText}>{text}</Text>
    </View>
  );
}

function CorrectionHistoryItem({
  response,
  sessionStartTime,
  index,
}: {
  response: CorrectionResponse;
  sessionStartTime: number;
  index: number;
}) {
  return (
    <View style={styles.correctionItem}>
      <View style={styles.correctionHeader}>
        <Text style={styles.correctionTitle}>
          {index + 1}. {formatDirection(response.direction)} correction
        </Text>
        <Text style={styles.correctionTime}>{response.responseTime.toFixed(2)} s</Text>
      </View>
      <FactRow label="Feedback at" value={formatRelativeTime(response.feedbackTimestamp, sessionStartTime)} />
      <FactRow label="Corrected at" value={formatRelativeTime(response.correctionTimestamp, sessionStartTime)} />
      <FactRow label="Initial deviation" value={`${response.initialDeviation.toFixed(2)}°`} />
      <FactRow label="Final deviation" value={`${response.finalDeviation.toFixed(2)}°`} />
      <FactRow label="Adaptive feedback classification" value="Not persisted" />
    </View>
  );
}

function DefinitionCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.definitionCard}>
      <Text style={styles.definitionTitle}>{title}</Text>
      <Text style={styles.definitionBody}>{body}</Text>
    </View>
  );
}

function ThresholdResult({
  axis,
  canonical,
  maximumEffective,
  finalEffective,
  maximumAdjustment,
  finalAdjustment,
}: {
  axis: string;
  canonical: number;
  maximumEffective: number;
  finalEffective: number | null;
  maximumAdjustment: number;
  finalAdjustment: number | null;
}) {
  return (
    <View style={styles.thresholdResult}>
      <Text style={styles.thresholdAxis}>{axis}</Text>
      <FactRow label="Canonical" value={`${canonical.toFixed(2)}°`} />
      <FactRow label="Max effective" value={`${maximumEffective.toFixed(2)}°`} />
      <FactRow
        label="Final effective"
        value={finalEffective === null ? 'Unavailable' : `${finalEffective.toFixed(2)}°`}
      />
      <FactRow label="Max adjustment" value={`+${maximumAdjustment.toFixed(2)}°`} />
      <FactRow
        label="Final adjustment"
        value={finalAdjustment === null ? 'Unavailable' : `+${finalAdjustment.toFixed(2)}°`}
      />
    </View>
  );
}

function UnavailableHistory({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.unavailableCard}>
      <Text style={styles.unavailableTitle}>{title}</Text>
      <Text style={styles.unavailableBody}>{body}</Text>
    </View>
  );
}

function DirectionRow({
  direction,
  count,
  maximum,
  averageCorrectionTime,
}: {
  direction: Exclude<PostureDirection, 'neutral'>;
  count: number;
  maximum: number;
  averageCorrectionTime: number | null;
}) {
  return (
    <View style={styles.directionRow}>
      <View style={styles.directionHeader}>
        <Text style={styles.directionName}>{formatDirection(direction)}</Text>
        <Text style={styles.directionValue}>
          {count} feedback · {averageCorrectionTime === null ? 'no completed response' : `${averageCorrectionTime.toFixed(2)} s avg`}
        </Text>
      </View>
      <ProgressBar value={count / maximum} />
    </View>
  );
}

function DeviationColumn({
  bucket,
  maximum,
}: {
  bucket: DeviationChartBucket;
  maximum: number;
}) {
  const pitchHeight = `${(bucket.pitchDeviation / maximum) * 100}%` as `${number}%`;
  const rollHeight = `${(bucket.rollDeviation / maximum) * 100}%` as `${number}%`;
  const pitchThresholdBottom = `${(bucket.pitchThreshold / maximum) * 100}%` as `${number}%`;
  const rollThresholdBottom = `${(bucket.rollThreshold / maximum) * 100}%` as `${number}%`;

  return (
    <View style={styles.deviationColumn}>
      <View style={[styles.deviationBar, styles.pitchBar, { height: pitchHeight }]} />
      <View style={[styles.deviationBar, styles.rollBar, { height: rollHeight }]} />
      <View style={[styles.thresholdMarker, styles.pitchThresholdMarker, { bottom: pitchThresholdBottom }]} />
      <View style={[styles.thresholdMarker, styles.rollThresholdMarker, { bottom: rollThresholdBottom }]} />
    </View>
  );
}

function buildPostureTimeline(
  session: Session,
  bucketCount: number
): TimelineState[] {
  if (session.samples.length === 0) return [];
  const count = Math.min(bucketCount, session.samples.length);

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * session.samples.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * session.samples.length / count));
    const samples = session.samples.slice(start, end);
    const goodCount = samples.filter(sample => sample.postureAcceptable).length;
    if (goodCount === samples.length) return 'good';
    if (goodCount === 0) return 'deviation';
    return 'mixed';
  });
}

function buildDeviationChart(
  history: DeviationHistoryPoint[],
  bucketCount: number
): DeviationChartBucket[] {
  if (history.length === 0) return [];
  const count = Math.min(bucketCount, history.length);

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * history.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * history.length / count));
    const points = history.slice(start, end);

    return {
      pitchDeviation: maximumValue(points.map(point => point.pitchDeviation), 0),
      rollDeviation: maximumValue(points.map(point => point.rollDeviation), 0),
      pitchThreshold: maximumValue(points.map(point => point.pitchThreshold), 0),
      rollThreshold: maximumValue(points.map(point => point.rollThreshold), 0),
    };
  });
}

function maximumValue(values: number[], fallback: number): number {
  let maximum = fallback;
  for (const value of values) {
    maximum = Math.max(maximum, value);
  }
  return maximum;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatRelativeTime(timestamp: number, startTime: number): string {
  return `+${Math.max(0, (timestamp - startTime) / 1000).toFixed(2)} s`;
}

function formatDateTime(timestamp: number | null): string {
  if (timestamp === null || timestamp <= 0) return 'Unavailable';
  return new Date(timestamp).toLocaleString();
}

function formatDirection(direction: PostureDirection): string {
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}

function formatUploadState(state: SessionUploadState): string {
  switch (state) {
    case 'uploading': return 'Saving session';
    case 'saved': return 'Session synced';
    case 'failed': return 'Sync failed';
    case 'possibly-saved': return 'May already be synced';
    case 'idle': return 'Local result';
  }
}

function formatUploadMessage(state: SessionUploadState): string {
  switch (state) {
    case 'uploading': return 'Your finalized results are available while the session is saved.';
    case 'saved': return 'The completed session is available in historical analytics.';
    case 'failed': return 'Session remains available in this app session. Sync failed; retry when the backend is available.';
    case 'possibly-saved': return 'Session may already be synced. History was refreshed without creating a duplicate.';
    case 'idle': return 'The finalized session is available locally.';
  }
}

const styles = StyleSheet.create({
  resultsRoot: { marginBottom: 2 },
  flexOne: { flex: 1 },
  pressed: { opacity: 0.78 },
  resultsHeader: {
    backgroundColor: '#173F67',
    borderRadius: 22,
    padding: 22,
    marginBottom: 14,
  },
  eyebrow: {
    color: '#9FC6E4',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  resultsTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 5,
  },
  resultsSubtitle: {
    color: '#D3E2ED',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  uploadRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  uploadBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  uploadGood: { backgroundColor: '#D9EEE8' },
  uploadWarning: { backgroundColor: '#FFE7D8' },
  uploadActive: { backgroundColor: '#DCEAF5' },
  uploadBadgeText: { color: '#17324B', fontSize: 10, fontWeight: '900' },
  uploadMessage: { color: '#D3E2ED', fontSize: 11, lineHeight: 16, marginTop: 7 },
  retryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  retryButtonText: { color: '#8D3D2C', fontSize: 11, fontWeight: '900' },
  newSessionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  newSessionButtonText: { color: '#173F67', fontSize: 13, fontWeight: '900' },
  emptyCard: {
    backgroundColor: '#FFF5EA',
    borderColor: '#ECD0A7',
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
  },
  emptyTitle: { color: '#704718', fontSize: 17, fontWeight: '900' },
  emptyBody: { color: '#81633F', fontSize: 13, lineHeight: 19, marginTop: 5 },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E0E7EE',
    marginBottom: 14,
  },
  sectionTitle: { color: '#132238', fontSize: 19, fontWeight: '900' },
  sectionCaption: { color: '#6D7D8D', fontSize: 12, lineHeight: 17, marginTop: 4 },
  sectionBody: { marginTop: 16 },
  primaryMetricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  primaryMetric: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 138,
    borderRadius: 13,
    padding: 14,
    borderWidth: 1,
  },
  primaryMetricNeutral: { backgroundColor: '#F7F9FB', borderColor: '#E0E7EE' },
  primaryMetricGood: { backgroundColor: '#EDF8F4', borderColor: '#CBE6DC' },
  primaryMetricAccent: { backgroundColor: '#EDF4FB', borderColor: '#C8DBEC' },
  primaryMetricValue: { color: '#17324B', fontSize: 21, fontWeight: '900' },
  primaryMetricLabel: { color: '#6B7D8E', fontSize: 11, fontWeight: '700', marginTop: 4 },
  consistencyHeader: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 12 },
  consistencyValue: { color: '#16705A', fontSize: 38, fontWeight: '900' },
  metricCaption: { color: '#748394', fontSize: 10, maxWidth: 130 },
  consistencyFacts: { flex: 1 },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  factLabel: { color: '#718092', fontSize: 12, flex: 1 },
  factValue: { color: '#1A344D', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  factValueWrap: { flex: 1.5 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#E6EDF2', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#2E8A72' },
  subsectionLabel: {
    color: '#64778A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    marginTop: 20,
    marginBottom: 9,
  },
  timeline: { height: 34, flexDirection: 'row', gap: 2, alignItems: 'stretch' },
  timelineSegment: { flex: 1, borderRadius: 3 },
  timelineGood: { backgroundColor: '#2E8A72' },
  timelineMixed: { backgroundColor: '#D39A42' },
  timelineDeviation: { backgroundColor: '#C95B45' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 11 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 9, height: 9, borderRadius: 3 },
  legendLine: { width: 13, height: 2 },
  legendText: { color: '#6C7C8D', fontSize: 10 },
  chartNote: { color: '#778797', fontSize: 10, lineHeight: 15, marginTop: 9 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryMetric: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 132,
    backgroundColor: '#F7F9FB',
    borderRadius: 11,
    padding: 12,
  },
  secondaryMetricLabel: { color: '#748394', fontSize: 11 },
  secondaryMetricValue: { color: '#19334D', fontSize: 18, fontWeight: '900', marginTop: 3 },
  emptyMessage: { backgroundColor: '#F7F9FB', borderRadius: 11, padding: 13 },
  emptyMessageText: { color: '#697B8D', fontSize: 12, lineHeight: 17 },
  correctionItem: {
    borderTopWidth: 1,
    borderTopColor: '#E3E9EF',
    paddingTop: 13,
    marginTop: 8,
  },
  correctionHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  correctionTitle: { color: '#17324B', fontSize: 14, fontWeight: '900' },
  correctionTime: { color: '#23715F', fontSize: 14, fontWeight: '900' },
  adaptiveDefinitionGrid: { gap: 8 },
  definitionCard: { backgroundColor: '#F1F6FA', borderRadius: 11, padding: 13 },
  definitionTitle: { color: '#173A59', fontSize: 13, fontWeight: '900' },
  definitionBody: { color: '#63778A', fontSize: 11, lineHeight: 16, marginTop: 3 },
  axisResultGrid: { gap: 9 },
  thresholdResult: { borderWidth: 1, borderColor: '#E1E8EE', borderRadius: 12, padding: 13 },
  thresholdAxis: { color: '#17324B', fontSize: 14, fontWeight: '900', marginBottom: 6 },
  boundNotice: { backgroundColor: '#EDF8F4', borderRadius: 11, padding: 13, marginTop: 10 },
  boundNoticeTitle: { color: '#1C6555', fontSize: 12, fontWeight: '900' },
  boundNoticeBody: { color: '#53796F', fontSize: 11, lineHeight: 16, marginTop: 3 },
  unavailableCard: { backgroundColor: '#F7F9FB', borderRadius: 11, padding: 13, marginTop: 9 },
  unavailableTitle: { color: '#3B5268', fontSize: 12, fontWeight: '900' },
  unavailableBody: { color: '#718294', fontSize: 11, lineHeight: 16, marginTop: 3 },
  directionRow: { marginBottom: 14 },
  directionHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  directionName: { color: '#18334D', fontSize: 13, fontWeight: '900' },
  directionValue: { color: '#6B7C8D', fontSize: 11, textAlign: 'right', flex: 1 },
  deviationChart: {
    height: 150,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE4EB',
  },
  deviationColumn: { flex: 1, height: '100%', position: 'relative', flexDirection: 'row', alignItems: 'flex-end' },
  deviationBar: { flex: 1, minHeight: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  pitchBar: { backgroundColor: '#2870A8' },
  rollBar: { backgroundColor: '#C36C48' },
  thresholdMarker: { position: 'absolute', height: 1, width: '100%', left: 0 },
  pitchThresholdMarker: { backgroundColor: '#69A7D2' },
  rollThresholdMarker: { backgroundColor: '#D7A187', left: 1 },
  technicalCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E7EE',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  technicalHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  technicalTitle: { color: '#17324B', fontSize: 15, fontWeight: '900' },
  technicalCaption: { color: '#718294', fontSize: 11, marginTop: 2 },
  expandText: { color: '#2B648F', fontSize: 12, fontWeight: '900' },
  technicalBody: { borderTopWidth: 1, borderTopColor: '#E5EBF0', padding: 16 },
  demoNotice: {
    backgroundColor: '#FFF5DF',
    color: '#765019',
    fontSize: 11,
    lineHeight: 16,
    padding: 11,
    borderRadius: 9,
    marginTop: 10,
  },
});
