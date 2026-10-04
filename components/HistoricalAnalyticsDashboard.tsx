import { ReactNode, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  HistoricalSessionTrend,
  HistoricalSummary,
  HistoricalTrends,
} from '../services/apiService';

interface HistoricalAnalyticsDashboardProps {
  summary: HistoricalSummary | null;
  trends: HistoricalTrends | null;
  loading: boolean;
  error: string | null;
  adaptiveMode: 'PRODUCTION' | 'DEMO';
  onRefresh: () => void;
}

const MAX_CHART_SESSIONS = 16;
const MAX_RECENT_SESSIONS = 6;

export function HistoricalAnalyticsDashboard({
  summary,
  trends,
  loading,
  error,
  adaptiveMode,
  onRefresh,
}: HistoricalAnalyticsDashboardProps) {
  const [technicalExpanded, setTechnicalExpanded] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const sessions = trends?.sessions ?? [];
  const chartSessions = useMemo(
    () => sessions.slice(-MAX_CHART_SESSIONS),
    [sessions]
  );
  const recentSessions = useMemo(
    () => [...sessions].reverse().slice(0, MAX_RECENT_SESSIONS),
    [sessions]
  );
  const selectedSession =
    chartSessions.find(session => session.id === selectedSessionId) ??
    chartSessions.at(-1) ??
    null;
  const hasData = summary !== null && summary.includedSessions > 0 && sessions.length > 0;
  const initialLoading = loading && summary === null && trends === null;

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>COMPLETED SESSION HISTORY</Text>
            <Text style={styles.title}>Historical Analytics</Text>
            <Text style={styles.subtitle}>
              See how posture performance changes across completed monitoring sessions.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh historical analytics"
            disabled={loading}
            onPress={onRefresh}
            style={({ pressed }) => [
              styles.refreshButton,
              loading && styles.refreshButtonDisabled,
              pressed && !loading && styles.pressed,
            ]}
          >
            <Text style={styles.refreshButtonText}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
        </View>
        <View style={styles.architectureNote}>
          <Text style={styles.architectureTitle}>Historical data uses the backend</Text>
          <Text style={styles.architectureBody}>
            Real-time posture monitoring remains local and continues independently if analytics is unavailable.
          </Text>
        </View>
      </View>

      {error !== null && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Unable to load historical analytics</Text>
          <Text style={styles.errorBody}>
            Your real-time monitoring is unaffected. Existing results remain visible where available.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={onRefresh}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {initialLoading && <AnalyticsLoadingState />}

      {!initialLoading && summary !== null && summary.totalSessions === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEyebrow}>NO HISTORICAL DATA YET</Text>
          <Text style={styles.emptyTitle}>Your session history will appear here</Text>
          <Text style={styles.emptyBody}>
            Complete your first posture-monitoring session to start building your history.
          </Text>
        </View>
      )}

      {!initialLoading && summary !== null && summary.totalSessions > 0 && !hasData && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEyebrow}>NO COMPATIBLE ANALYTICS DATA</Text>
          <Text style={styles.emptyTitle}>Completed sessions could not be included</Text>
          <Text style={styles.emptyBody}>
            {summary.excludedSessions} stored {pluralize(summary.excludedSessions, 'session')} did not contain the current analytics fields. Real-time monitoring is unaffected.
          </Text>
        </View>
      )}

      {hasData && summary !== null && selectedSession !== null && (
        <>
          <AnalyticsSection
            title="Overview"
            caption="Backend-derived totals across compatible completed sessions."
          >
            <View style={styles.primaryGrid}>
              <PrimaryMetric
                label="Historical consistency"
                value={formatNullablePercent(summary.averageConsistency)}
                detail="duration-weighted"
                tone="good"
              />
              <PrimaryMetric
                label="Monitoring time"
                value={formatDuration(summary.totalMonitoredDuration)}
                detail={`${summary.includedSessions} included ${pluralize(summary.includedSessions, 'session')}`}
              />
              <PrimaryMetric
                label="Correction completion"
                value={formatPercent(summary.overallCompletionRate)}
                detail={`${summary.totalCompletedCorrections} of ${summary.totalFeedbackEvents} feedback events`}
                tone="accent"
              />
              <PrimaryMetric
                label="Average correction"
                value={formatNullableSeconds(summary.averageCorrectionTime)}
                detail="completed responses only"
              />
            </View>
            <Text style={styles.definitionNote}>
              Historical consistency is good-posture time divided by total monitored duration. It is not a simple average of session percentages.
            </Text>
          </AnalyticsSection>

          <AnalyticsSection
            title="Performance Trend"
            caption="Consistency for each completed session, in chronological order."
          >
            {sessions.length < 2 ? (
              <TrendEmptyState text="Complete more sessions to see your posture trend." />
            ) : (
              <>
                <SessionBarChart
                  sessions={chartSessions}
                  selectedSessionId={selectedSession.id}
                  valueFor={session => session.consistency}
                  formatValue={formatPercent}
                  maximum={100}
                  color="#2E8A72"
                  onSelect={setSelectedSessionId}
                  accessibilityMetric="consistency"
                />
                <SelectedPoint
                  session={selectedSession}
                  label="Consistency"
                  value={formatPercent(selectedSession.consistency)}
                />
                <ChartRangeNote total={sessions.length} visible={chartSessions.length} />
              </>
            )}
          </AnalyticsSection>

          <AnalyticsSection
            title="Correction Trends"
            caption="Correction timing and completion remain separate measures."
          >
            <Text style={styles.chartTitle}>Correction completion rate</Text>
            <SessionBarChart
              sessions={chartSessions}
              selectedSessionId={selectedSession.id}
              valueFor={session => session.completionRate}
              formatValue={formatPercent}
              maximum={100}
              color="#3F6D9A"
              onSelect={setSelectedSessionId}
              accessibilityMetric="correction completion rate"
            />
            <SelectedPoint
              session={selectedSession}
              label="Completion rate"
              value={formatPercent(selectedSession.completionRate)}
            />

            <Text style={styles.chartTitle}>Average correction time</Text>
            <SessionBarChart
              sessions={chartSessions}
              selectedSessionId={selectedSession.id}
              valueFor={session => session.averageCorrectionTime}
              formatValue={value => `${value.toFixed(2)} s`}
              color="#B17735"
              onSelect={setSelectedSessionId}
              accessibilityMetric="average correction time"
            />
            <SelectedPoint
              session={selectedSession}
              label="Average correction"
              value={formatNullableSeconds(selectedSession.averageCorrectionTime)}
            />
            <Text style={styles.chartNote}>
              Sessions without completed correction responses are marked unavailable; no values are interpolated.
            </Text>

            <View style={styles.secondaryGrid}>
              <SecondaryMetric label="Feedback events" value={`${summary.totalFeedbackEvents}`} />
              <SecondaryMetric label="Completed corrections" value={`${summary.totalCompletedCorrections}`} />
            </View>
          </AnalyticsSection>

          <AnalyticsSection
            title="Session Activity"
            caption="Monitoring duration and correction activity from actual completed sessions."
          >
            <Text style={styles.chartTitle}>Monitoring duration</Text>
            <SessionBarChart
              sessions={chartSessions}
              selectedSessionId={selectedSession.id}
              valueFor={session => session.monitoredDuration}
              formatValue={formatDuration}
              color="#6B5A96"
              onSelect={setSelectedSessionId}
              accessibilityMetric="monitoring duration"
            />
            <SelectedPoint
              session={selectedSession}
              label="Monitoring duration"
              value={formatDuration(selectedSession.monitoredDuration)}
            />

            <Text style={styles.subsectionLabel}>RECENT COMPLETED SESSIONS</Text>
            <View style={styles.recentList}>
              {recentSessions.map(session => (
                <Pressable
                  key={session.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Select session from ${formatDateTime(session.startTime)}`}
                  onPress={() => setSelectedSessionId(session.id)}
                  style={({ pressed }) => [
                    styles.recentRow,
                    selectedSession.id === session.id && styles.recentRowSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.recentCopy}>
                    <Text style={styles.recentDate}>{formatDateTime(session.startTime)}</Text>
                    <Text style={styles.recentMeta}>
                      {formatDuration(session.monitoredDuration)} · {session.actualSamplingRate.toFixed(1)} Hz
                    </Text>
                  </View>
                  <View style={styles.recentValueBlock}>
                    <Text style={styles.recentValue}>{formatPercent(session.consistency)}</Text>
                    <Text style={styles.recentValueLabel}>consistency</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </AnalyticsSection>

          <AnalyticsSection
            title="Direction Detail"
            caption={`Actual direction metrics for the selected session: ${formatDateTime(selectedSession.startTime)}.`}
          >
            <View style={styles.directionGrid}>
              {(['forward', 'backward', 'left', 'right'] as const).map(direction => (
                <View key={direction} style={styles.directionCard}>
                  <Text style={styles.directionName}>{capitalize(direction)}</Text>
                  <Text style={styles.directionCount}>
                    {selectedSession.postureSpecific[direction]}
                  </Text>
                  <Text style={styles.directionLabel}>deviation samples</Text>
                  <Text style={styles.directionTime}>
                    {formatNullableSeconds(selectedSession.directionCorrectionTimes[direction])}
                  </Text>
                  <Text style={styles.directionLabel}>average correction</Text>
                </View>
              ))}
            </View>
            <Text style={styles.chartNote}>
              Direction values come directly from the selected session returned by the trends endpoint; they are not reconstructed from raw samples.
            </Text>
          </AnalyticsSection>

          <View style={styles.technicalCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: technicalExpanded }}
              onPress={() => setTechnicalExpanded(current => !current)}
              style={({ pressed }) => [styles.technicalHeader, pressed && styles.pressed]}
            >
              <View style={styles.technicalHeadingCopy}>
                <Text style={styles.sectionTitle}>Technical Analytics</Text>
                <Text style={styles.sectionCaption}>Coverage, aggregation inputs, and review configuration.</Text>
              </View>
              <Text style={styles.expandLabel}>{technicalExpanded ? 'Hide' : 'Show'}</Text>
            </Pressable>
            {technicalExpanded && (
              <View style={styles.technicalBody}>
                <FactRow label="Stored sessions" value={`${summary.totalSessions}`} />
                <FactRow label="Included" value={`${summary.includedSessions}`} />
                <FactRow label="Excluded as legacy/incompatible" value={`${summary.excludedSessions}`} />
                <FactRow label="Aggregation duration" value={formatDuration(summary.totalMonitoredDuration)} />
                <FactRow label="Aggregate sampling rate" value={formatNullableHertz(summary.averageSamplingRate)} />
                <FactRow
                  label="Data coverage"
                  value={summary.totalSessions === 0
                    ? 'Unavailable'
                    : formatPercent(summary.includedSessions / summary.totalSessions * 100)}
                />
                <View style={styles.coverageTrack}>
                  <View
                    style={[
                      styles.coverageFill,
                      { width: `${summary.totalSessions === 0 ? 0 : Math.min(100, summary.includedSessions / summary.totalSessions * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.technicalNote}>
                  Legacy or incompatible records are skipped by the backend. Raw deviation aggregates are not part of the historical analytics model.
                </Text>
                {adaptiveMode === 'DEMO' && (
                  <Text style={styles.demoNote}>
                    Current review build: DEMO — accelerated adaptive timing. Historical trends are engineering prototype data, not clinically validated results.
                  </Text>
                )}
              </View>
            )}
          </View>

          <View style={styles.syncCard}>
            <View style={styles.syncIndicator} />
            <View style={styles.syncCopy}>
              <Text style={styles.syncTitle}>{loading ? 'Refreshing historical data' : 'Historical data loaded'}</Text>
              <Text style={styles.syncBody}>
                Startup, manual, and completed-upload refreshes use the same backend analytics endpoints. No continuous polling is used.
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function AnalyticsSection({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCaption}>{caption}</Text>
      {children}
    </View>
  );
}

function PrimaryMetric({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'good' | 'accent';
}) {
  return (
    <View style={[styles.primaryMetric, tone === 'good' && styles.primaryMetricGood, tone === 'accent' && styles.primaryMetricAccent]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function SecondaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.secondaryMetric}>
      <Text style={styles.secondaryValue}>{value}</Text>
      <Text style={styles.secondaryLabel}>{label}</Text>
    </View>
  );
}

function SessionBarChart({
  sessions,
  selectedSessionId,
  valueFor,
  formatValue,
  maximum,
  color,
  onSelect,
  accessibilityMetric,
}: {
  sessions: HistoricalSessionTrend[];
  selectedSessionId: string;
  valueFor: (session: HistoricalSessionTrend) => number | null;
  formatValue: (value: number) => string;
  maximum?: number;
  color: string;
  onSelect: (id: string) => void;
  accessibilityMetric: string;
}) {
  const values = sessions.map(valueFor);
  const finiteValues = values.filter((value): value is number => value !== null);
  const scaleMaximum = maximum ?? Math.max(1, ...finiteValues);

  return (
    <View>
      <View style={styles.axisTopRow}>
        <Text style={styles.axisLabel}>{formatValue(scaleMaximum)}</Text>
        <Text style={styles.axisLabel}>each bar = one session</Text>
      </View>
      <View style={styles.chartBody}>
        {sessions.map((session, index) => {
          const value = values[index];
          const selected = session.id === selectedSessionId;
          const height = value === null ? 0 : Math.max(4, Math.min(100, value / scaleMaximum * 100));

          return (
            <Pressable
              key={session.id}
              accessibilityRole="button"
              accessibilityLabel={`${formatDateTime(session.startTime)}, ${accessibilityMetric}: ${value === null ? 'unavailable' : formatValue(value)}`}
              onPress={() => onSelect(session.id)}
              style={styles.barTouchTarget}
            >
              <View style={[styles.barRail, selected && styles.barRailSelected]}>
                {value === null ? (
                  <View style={styles.unavailableMarker} />
                ) : (
                  <View style={[styles.barFill, { backgroundColor: color, height: `${height}%` }]} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.axisBottomRow}>
        <Text style={styles.axisLabel}>{formatShortDate(sessions[0]?.startTime)}</Text>
        <Text style={styles.axisLabel}>0</Text>
        <Text style={styles.axisLabel}>{formatShortDate(sessions.at(-1)?.startTime)}</Text>
      </View>
    </View>
  );
}

function SelectedPoint({
  session,
  label,
  value,
}: {
  session: HistoricalSessionTrend;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.selectedPoint}>
      <View>
        <Text style={styles.selectedPointLabel}>SELECTED SESSION</Text>
        <Text style={styles.selectedPointDate}>{formatDateTime(session.startTime)}</Text>
      </View>
      <View style={styles.selectedPointValueBlock}>
        <Text style={styles.selectedPointValue}>{value}</Text>
        <Text style={styles.selectedPointMetric}>{label}</Text>
      </View>
    </View>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function TrendEmptyState({ text }: { text: string }) {
  return (
    <View style={styles.trendEmpty}>
      <Text style={styles.trendEmptyTitle}>More history needed</Text>
      <Text style={styles.trendEmptyBody}>{text}</Text>
    </View>
  );
}

function AnalyticsLoadingState() {
  return (
    <View style={styles.loadingCard}>
      <Text style={styles.loadingTitle}>Loading historical analytics</Text>
      <Text style={styles.loadingBody}>Retrieving completed-session summaries and trends…</Text>
      <View style={styles.skeletonGrid}>
        {[0, 1, 2, 3].map(index => <View key={index} style={styles.skeletonBlock} />)}
      </View>
    </View>
  );
}

function ChartRangeNote({ total, visible }: { total: number; visible: number }) {
  if (total <= visible) {
    return null;
  }

  return (
    <Text style={styles.chartNote}>
      Showing the latest {visible} of {total} sessions for mobile readability. Summary metrics still include all compatible sessions.
    </Text>
  );
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatNullablePercent(value: number | null): string {
  return value === null ? 'Unavailable' : formatPercent(value);
}

function formatNullableSeconds(value: number | null): string {
  return value === null ? 'Unavailable' : `${value.toFixed(2)} s`;
}

function formatNullableHertz(value: number | null): string {
  return value === null ? 'Unavailable' : `${value.toFixed(1)} Hz`;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = milliseconds / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)} s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatShortDate(timestamp: number | undefined): string {
  if (timestamp === undefined) {
    return '';
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function pluralize(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  root: { marginBottom: 14 },
  hero: { backgroundColor: '#122D46', borderRadius: 22, padding: 20, marginBottom: 14 },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroCopy: { flex: 1 },
  eyebrow: { color: '#86CBB9', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  title: { color: '#FFFFFF', fontSize: 25, lineHeight: 30, fontWeight: '800' },
  subtitle: { color: '#C8D6E2', fontSize: 14, lineHeight: 20, marginTop: 6 },
  refreshButton: { backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 },
  refreshButtonDisabled: { opacity: 0.62 },
  refreshButtonText: { color: '#173F67', fontSize: 13, fontWeight: '800' },
  architectureNote: { borderTopWidth: 1, borderTopColor: '#31506B', marginTop: 18, paddingTop: 14 },
  architectureTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  architectureBody: { color: '#AEC0CF', fontSize: 12, lineHeight: 17, marginTop: 3 },
  section: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E0E7ED', padding: 18, marginBottom: 14 },
  sectionTitle: { color: '#132238', fontSize: 19, fontWeight: '800' },
  sectionCaption: { color: '#657486', fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 16 },
  primaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primaryMetric: { width: '48%', minHeight: 116, backgroundColor: '#F4F7FA', borderRadius: 14, padding: 13, borderTopWidth: 3, borderTopColor: '#AAB8C5' },
  primaryMetricGood: { backgroundColor: '#EEF8F4', borderTopColor: '#2E8A72' },
  primaryMetricAccent: { backgroundColor: '#EEF4FA', borderTopColor: '#3F6D9A' },
  metricLabel: { color: '#5D6A78', fontSize: 12, fontWeight: '700' },
  metricValue: { color: '#132238', fontSize: 23, lineHeight: 28, fontWeight: '800', marginTop: 7 },
  metricDetail: { color: '#6F7D8B', fontSize: 11, lineHeight: 15, marginTop: 4 },
  definitionNote: { color: '#46596C', backgroundColor: '#F4F7FA', borderRadius: 10, fontSize: 12, lineHeight: 18, padding: 12, marginTop: 12 },
  chartTitle: { color: '#263A4E', fontSize: 13, fontWeight: '800', marginTop: 4, marginBottom: 8 },
  chartBody: { height: 132, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: '#C9D4DE', borderTopWidth: 1, borderTopColor: '#E6EBF0', gap: 4, paddingHorizontal: 4 },
  barTouchTarget: { flex: 1, height: '100%', justifyContent: 'flex-end', paddingTop: 5 },
  barRail: { height: '100%', justifyContent: 'flex-end', backgroundColor: '#F1F4F7', borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: 'hidden' },
  barRailSelected: { backgroundColor: '#DDE7EF', borderWidth: 1, borderColor: '#7791A8' },
  barFill: { width: '100%', minHeight: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  unavailableMarker: { height: 2, backgroundColor: '#AAB5BF', marginBottom: 5 },
  axisTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  axisBottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  axisLabel: { color: '#7A8794', fontSize: 10 },
  selectedPoint: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F5F8FA', borderRadius: 12, padding: 12, marginTop: 10 },
  selectedPointLabel: { color: '#718090', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  selectedPointDate: { color: '#263A4E', fontSize: 12, fontWeight: '700', marginTop: 3 },
  selectedPointValueBlock: { alignItems: 'flex-end', marginLeft: 10 },
  selectedPointValue: { color: '#132238', fontSize: 17, fontWeight: '800' },
  selectedPointMetric: { color: '#718090', fontSize: 10, marginTop: 1 },
  chartNote: { color: '#718090', fontSize: 11, lineHeight: 16, marginTop: 9 },
  secondaryGrid: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondaryMetric: { flex: 1, backgroundColor: '#F4F7FA', borderRadius: 12, padding: 12 },
  secondaryValue: { color: '#132238', fontSize: 20, fontWeight: '800' },
  secondaryLabel: { color: '#667687', fontSize: 11, marginTop: 3 },
  subsectionLabel: { color: '#617184', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 18, marginBottom: 7 },
  recentList: { borderTopWidth: 1, borderTopColor: '#E4E9EE' },
  recentRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E4E9EE', paddingVertical: 12 },
  recentRowSelected: { backgroundColor: '#F2F7FA' },
  recentCopy: { flex: 1 },
  recentDate: { color: '#25394D', fontSize: 13, fontWeight: '700' },
  recentMeta: { color: '#718090', fontSize: 11, marginTop: 3 },
  recentValueBlock: { alignItems: 'flex-end', marginLeft: 10 },
  recentValue: { color: '#2E7463', fontSize: 16, fontWeight: '800' },
  recentValueLabel: { color: '#718090', fontSize: 9 },
  directionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  directionCard: { width: '48%', backgroundColor: '#F4F7FA', borderRadius: 12, padding: 12 },
  directionName: { color: '#4F6173', fontSize: 12, fontWeight: '800' },
  directionCount: { color: '#132238', fontSize: 20, fontWeight: '800', marginTop: 7 },
  directionTime: { color: '#3F6D9A', fontSize: 15, fontWeight: '800', marginTop: 9 },
  directionLabel: { color: '#718090', fontSize: 10, marginTop: 1 },
  technicalCard: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DDE5EC', marginBottom: 14, overflow: 'hidden' },
  technicalHeader: { flexDirection: 'row', alignItems: 'center', padding: 18 },
  technicalHeadingCopy: { flex: 1 },
  expandLabel: { color: '#285E84', fontSize: 13, fontWeight: '800', marginLeft: 12 },
  technicalBody: { borderTopWidth: 1, borderTopColor: '#E4E9EE', padding: 18 },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EEF1F4' },
  factLabel: { flex: 1, color: '#607080', fontSize: 12 },
  factValue: { color: '#24394D', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  coverageTrack: { height: 7, backgroundColor: '#E4E9EE', borderRadius: 4, overflow: 'hidden', marginTop: 10 },
  coverageFill: { height: '100%', backgroundColor: '#2E8A72', borderRadius: 4 },
  technicalNote: { color: '#667687', fontSize: 11, lineHeight: 16, marginTop: 12 },
  demoNote: { color: '#765021', backgroundColor: '#FFF7E8', borderRadius: 10, fontSize: 11, lineHeight: 16, padding: 11, marginTop: 10 },
  syncCard: { flexDirection: 'row', backgroundColor: '#EDF6F3', borderRadius: 14, borderWidth: 1, borderColor: '#CAE3DA', padding: 14 },
  syncIndicator: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#2E8A72', marginTop: 4, marginRight: 10 },
  syncCopy: { flex: 1 },
  syncTitle: { color: '#225D4D', fontSize: 13, fontWeight: '800' },
  syncBody: { color: '#4E6D64', fontSize: 11, lineHeight: 16, marginTop: 3 },
  errorCard: { backgroundColor: '#FFF3EF', borderRadius: 16, borderWidth: 1, borderColor: '#EDC8BC', padding: 16, marginBottom: 14 },
  errorTitle: { color: '#8E3F2D', fontSize: 16, fontWeight: '800' },
  errorBody: { color: '#7A5148', fontSize: 12, lineHeight: 18, marginTop: 5 },
  retryButton: { alignSelf: 'flex-start', backgroundColor: '#9B4935', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9, marginTop: 12 },
  retryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E0E7ED', padding: 24, alignItems: 'center' },
  emptyEyebrow: { color: '#718090', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  emptyTitle: { color: '#132238', fontSize: 19, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  emptyBody: { color: '#657486', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  loadingCard: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E0E7ED', padding: 18 },
  loadingTitle: { color: '#132238', fontSize: 17, fontWeight: '800' },
  loadingBody: { color: '#657486', fontSize: 12, marginTop: 5 },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  skeletonBlock: { width: '48%', height: 78, backgroundColor: '#E9EEF2', borderRadius: 12 },
  trendEmpty: { backgroundColor: '#F4F7FA', borderRadius: 12, padding: 16 },
  trendEmptyTitle: { color: '#263A4E', fontSize: 14, fontWeight: '800' },
  trendEmptyBody: { color: '#667687', fontSize: 12, lineHeight: 17, marginTop: 4 },
  pressed: { opacity: 0.72 },
});
