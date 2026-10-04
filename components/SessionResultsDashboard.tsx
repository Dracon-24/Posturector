import { ReactNode, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PerformanceMetrics } from '../processing/performanceMetrics';
import type { Session } from '../processing/sessionRecorder';
import { MAX_ADAPTIVE_ADJUSTMENT } from '../processing/adaptiveThreshold';
import { formatDuration, formatPercent } from '../ui/presentation';
import {
  buildSessionAnalytics, elapsedSeconds, formatElapsed, SESSION_SECTIONS,
  type ChartPoint, type ChartSeries, type ThresholdSummary,
} from '../ui/sessionAnalytics';
import { CHART_COLORS, SessionBarChart, SessionLineChart } from './SessionAnalyticsCharts';

type UploadState = 'idle' | 'uploading' | 'saved' | 'failed' | 'possibly-saved';
type SectionName = typeof SESSION_SECTIONS[number];
const PAGE_SIZE = 15;
const directions = ['forward', 'backward', 'left', 'right'] as const;

interface Props {
  session: Session;
  metrics: PerformanceMetrics;
  uploadState: UploadState;
  adaptiveMode: 'PRODUCTION' | 'DEMO';
  canonicalPitchThreshold: number;
  canonicalRollThreshold: number;
  onRetryUpload: () => void;
  onStartNewSession: () => void;
  canStartNewSession?: boolean;
}

export function SessionResultsDashboard({ session, metrics, uploadState,
  canonicalPitchThreshold, canonicalRollThreshold, onRetryUpload, onStartNewSession,
  canStartNewSession = true }: Props) {
  const [section, setSection] = useState<SectionName>('overview');
  const [expandedCorrection, setExpandedCorrection] = useState<number | null>(null);
  const [technicalExpanded, setTechnicalExpanded] = useState(false);
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [correctionPage, setCorrectionPage] = useState(0);
  const [eventPage, setEventPage] = useState(0);
  const analytics = useMemo(() => buildSessionAnalytics(session, metrics,
    canonicalPitchThreshold, canonicalRollThreshold),
  [session.id, session.samples, session.feedbackEvents, session.correctionResponses,
    session.startTime, session.endTime, session.monitoredDuration, metrics,
    canonicalPitchThreshold, canonicalRollThreshold]);
  const charts = useMemo(() => ({
    posture: [{ name: 'Recorded posture state', color: CHART_COLORS.state, points: analytics.posture, scatter: true }],
    pitchDeviation: deviationSeries('Pitch', analytics.pitchDeviation, analytics.pitchThreshold, canonicalPitchThreshold),
    rollDeviation: deviationSeries('Roll', analytics.rollDeviation, analytics.rollThreshold, canonicalRollThreshold),
    pitchThreshold: thresholdSeries(analytics.pitchThreshold, canonicalPitchThreshold),
    rollThreshold: thresholdSeries(analytics.rollThreshold, canonicalRollThreshold),
    corrections: [{ name: 'Completed correction', color: CHART_COLORS.correction, points: analytics.correctionPoints, scatter: true }],
  }), [analytics, canonicalPitchThreshold, canonicalRollThreshold]);
  const markers = useMemo(() => analytics.events
    .filter(event => (event.kind === 'feedback' || event.kind === 'correction') && event.elapsed !== null)
    .map(event => ({ x: event.elapsed ?? 0, label: event.label,
      color: event.kind === 'feedback' ? CHART_COLORS.feedback : CHART_COLORS.correction })), [analytics]);
  const corrections = useMemo(() => [...session.correctionResponses]
    .sort((a, b) => a.correctionTimestamp - b.correctionTimestamp), [session.correctionResponses]);
  const chartDuration = session.monitoredDuration / 1000;

  return <View>
    {uploadState !== 'idle' && <View style={[styles.upload, uploadState === 'failed' && styles.error]}>
      <View style={styles.flex}><Text style={styles.strong}>{uploadText(uploadState)}</Text>
        <Text style={styles.note}>Finalized results remain available.</Text></View>
      {uploadState === 'failed' && <Action label="Retry upload" onPress={onRetryUpload} compact />}
    </View>}
    <View style={styles.tabs}>{SESSION_SECTIONS.map(item => <Pressable key={item}
      accessibilityRole="tab" accessibilityState={{ selected: section === item }}
      onPress={() => setSection(item)} style={[styles.tab, section === item && styles.tabActive]}>
      <Text style={[styles.tabText, section === item && styles.tabTextActive]}>{cap(item)}</Text>
    </Pressable>)}</View>

    {section === 'overview' && <>
      <Panel title="Session Overview" subtitle="The finalized monitoring result">
        <View style={styles.metrics}>
          <Metric label="Session duration" value={formatDuration(metrics.monitoredDuration)} />
          <Metric label="Posture consistency" value={formatPercent(metrics.consistency)} accent />
          <Metric label="Good posture time" value={formatDuration(metrics.timeInGoodPosture)} />
          <Metric label="Poor posture time" value={session.samples.length < 2 ? 'Unavailable' : formatDuration(analytics.poorPostureTime)} />
          <Metric label="Feedback events" value={`${metrics.feedbackEvents}`} />
          <Metric label="Completed corrections" value={`${metrics.completedCorrections}`} />
          <Metric label="Correction completion rate" value={analytics.completionRate === null ? 'No feedback events' : formatPercent(analytics.completionRate)} />
          <Metric label="Average correction time" value={seconds(metrics.averageCorrectionTime)} accent />
          <Metric label="Longest good-posture period" value={formatDuration(metrics.longestContinuousGoodPosture)} />
          <Metric label="Actual sampling rate" value={`${metrics.actualSamplingRate.toFixed(1)} Hz`} />
        </View>
        <Text style={styles.note}>Consistency is good-posture time / monitored duration. Completion rate is completed responses / feedback events.</Text>
        <Text style={styles.note}>Poor-posture time uses unacceptable recorded sample intervals, with the same interval convention as good-posture time.</Text>
        {analytics.unclassifiedTime > 0 && <Text style={styles.note}>{formatDuration(analytics.unclassifiedTime)} has no classified sample interval, including any time after the last sample. It is not assigned to poor posture.</Text>}
        {session.samples.length === 0 && <Text style={styles.empty}>No posture samples recorded.</Text>}
        {metrics.feedbackEvents === 0 && <Text style={styles.note}>No feedback events occurred during this session.</Text>}
        {(uploadState === 'saved' || uploadState === 'possibly-saved') && canStartNewSession && <Action label="Start another session" onPress={onStartNewSession} />}
      </Panel>
      <Disclosure label="Session event timeline" expanded={eventsExpanded} onPress={() => setEventsExpanded(value => !value)} />
      {eventsExpanded && <Panel title="Recorded event story">
        <Text style={styles.note}>Elapsed time from the first sample. Deviation entries are recorded state/direction transitions; correction entries are completed target-axis responses.</Text>
        {analytics.events.slice(eventPage * PAGE_SIZE, (eventPage + 1) * PAGE_SIZE).map((event, index) =>
          <View key={`${event.timestamp}-${index}`} style={styles.event}>
            <Text style={styles.eventTime}>{formatElapsed(event.elapsed)}</Text><Text style={styles.eventLabel}>{event.label}</Text>
          </View>)}
        {analytics.events.length === 0 && <Text style={styles.empty}>No recorded events available.</Text>}
        <Pager page={eventPage} count={analytics.events.length} onChange={setEventPage} />
      </Panel>}
    </>}

    {section === 'posture' && <>
      <SessionLineChart title="Posture acceptability timeline" xLabel="Elapsed session time" yLabel="Posture state"
        series={charts.posture} xMax={chartDuration} yMax={1} formatX={formatElapsed} formatY={postureTick}
        interpretation="Markers show recorded posture states, with no interpolated state between samples. Acceptable = both axes within recorded effective thresholds. Deviation alone does not mean feedback was triggered." />
      <SessionLineChart title="Pitch deviation trend" xLabel="Elapsed session time" yLabel="Pitch deviation (°)"
        series={charts.pitchDeviation} xMax={chartDuration} formatX={formatElapsed} formatY={degrees} markers={markers}
        interpretation="Compare recorded absolute pitch deviation with canonical and effective thresholds. Event lines locate feedback (orange) and completed correction (green)." />
      <SessionLineChart title="Roll deviation trend" xLabel="Elapsed session time" yLabel="Roll deviation (°)"
        series={charts.rollDeviation} xMax={chartDuration} formatX={formatElapsed} formatY={degrees} markers={markers}
        interpretation="A target-axis correction can complete while the other axis remains outside its threshold." />
      <SessionBarChart title="Deviation magnitude distribution" xLabel="Deviation magnitude (°)" yLabel="Recorded samples"
        data={session.samples.length === 0 ? [] : analytics.distribution.map(bin => ({ label: bin.label, value: bin.count }))}
        formatValue={sampleCount} emptyText="No posture samples recorded."
        interpretation={`Each sample contributes its recorded maximum axis deviation. ${session.samples.length} samples; lower bounds inclusive, upper bounds exclusive. These are display ranges, not posture thresholds.`} />
    </>}

    {section === 'corrections' && <>
      <SessionLineChart title="Correction response-time trend" xLabel="Correction number" yLabel="Response time (s)"
        series={charts.corrections} formatX={correctionNumber} formatY={secondsValue}
        emptyText="No completed corrections recorded."
        interpretation="Each point is one completed response in correction-time order. Touch to inspect direction and session time; unfinished observations are excluded." />
      <SessionBarChart title="Correction events by direction" xLabel="Direction" yLabel="Number of feedback events"
        data={metrics.feedbackEvents === 0 ? [] : directions.map(direction => ({ label: cap(direction), value: metrics.postureSpecific[direction] }))}
        formatValue={sampleCount} emptyText="No feedback events occurred during this session."
        interpretation="Counts represent recorded correction alerts, not all deviated posture samples." />
      <SessionBarChart title="Average correction time by direction" xLabel="Direction" yLabel="Average correction time (s)"
        data={directions.map(direction => ({ label: cap(direction), value: metrics.directionCorrectionTimes[direction] }))}
        formatValue={secondsValue} emptyText="No completed corrections recorded."
        interpretation="Only completed responses contribute. N/A means no completed correction for that direction." />
      <Panel title="Completed correction records">
        {corrections.length === 0 ? <Text style={styles.empty}>No completed corrections recorded.</Text> :
          corrections.slice(correctionPage * PAGE_SIZE, (correctionPage + 1) * PAGE_SIZE).map((response, index) => {
            const number = correctionPage * PAGE_SIZE + index;
            const expanded = expandedCorrection === number;
            return <View key={`${response.feedbackTimestamp}-${number}`} style={styles.correction}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedCorrection(expanded ? null : number)} style={styles.correctionSummary}>
                <Text style={styles.strong}>#{String(number + 1).padStart(2, '0')}</Text>
                <View style={styles.flex}><Text style={styles.direction}>{cap(response.direction)}</Text>
                  <Text style={styles.note}>{formatElapsed(elapsedSeconds(response.correctionTimestamp, session.startTime))}</Text></View>
                <Text style={styles.strong}>{response.responseTime.toFixed(2)} s {expanded ? '▴' : '▾'}</Text>
              </Pressable>
              {expanded && <View style={styles.detail}>
                <Row label="Correction #" value={`${number + 1}`} />
                <Row label="Timestamp" value={date(response.correctionTimestamp)} />
                <Row label="Direction" value={cap(response.direction)} />
                <Row label="Initial deviation" value={degrees(response.initialDeviation)} />
                <Row label="Final deviation" value={degrees(response.finalDeviation)} />
                <Row label="Response time" value={secondsValue(response.responseTime)} />
                <Row label="Feedback timestamp" value={`${date(response.feedbackTimestamp)} (${response.feedbackTimestamp} ms)`} />
                <Row label="Correction timestamp" value={`${date(response.correctionTimestamp)} (${response.correctionTimestamp} ms)`} />
              </View>}
            </View>;
          })}
        <Pager page={correctionPage} count={corrections.length} onChange={page => { setCorrectionPage(page); setExpandedCorrection(null); }} />
      </Panel>
    </>}

    {section === 'adaptive' && <>
      <SessionLineChart title="Adaptive pitch threshold trend" xLabel="Elapsed session time" yLabel="Threshold / adjustment (°)"
        series={charts.pitchThreshold} xMax={chartDuration} formatX={formatElapsed} formatY={degrees}
        interpretation="Adjustment is the stored effective threshold minus the immutable canonical threshold. This does not replay adaptation." />
      <SessionLineChart title="Adaptive roll threshold trend" xLabel="Elapsed session time" yLabel="Threshold / adjustment (°)"
        series={charts.rollThreshold} xMax={chartDuration} formatX={formatElapsed} formatY={degrees} />
      <Panel title="Behavioral evidence history"><Text style={styles.empty}>Not persisted for this session.</Text>
        <Text style={styles.note}>Combined evidence and evidence EMA cannot be inferred from recorded thresholds.</Text></Panel>
      <Panel title="Adaptive feature history"><Text style={styles.note}>{analytics.history.features}</Text>
        <Text style={styles.note}>Deviation trend · deviation frequency · correction-response trend · good-posture duration decline · near-threshold exposure.</Text></Panel>
      <Panel title="Final adaptive result">
        <ThresholdRows axis="Pitch" summary={analytics.pitch} />
        <ThresholdRows axis="Roll" summary={analytics.roll} />
        <Row label="Configured adjustment bound" value={`+${MAX_ADAPTIVE_ADJUSTMENT.toFixed(2)}°`} />
        <Row label="Final adaptive feedback mode" value={analytics.history.feedbackMode} />
        <Text style={styles.note}>Adaptive history was not persisted for this session. Evidence, features, safety gates, feedback mode and reassertion histories are unavailable. Final thresholds are the last recorded sample values.</Text>
      </Panel>
    </>}

    {section === 'stability' && <Panel title="Stability timeline unavailable">
      <Text style={styles.empty}>Historical stability is not available for this session.</Text>
      <Text style={styles.note}>{analytics.history.stability}</Text>
      <Text style={styles.note}>The current detector uses a 2-second window, at least 10 samples, and pitch/roll standard deviations ≤ 2°. No stable time, unstable time or stability percentage is fabricated.</Text>
    </Panel>}

    {section === 'technical' && <>
      <Disclosure label="Technical metadata" expanded={technicalExpanded} onPress={() => setTechnicalExpanded(value => !value)} />
      {technicalExpanded && <Panel title="Technical metadata">
        <Text style={styles.subheading}>Session</Text>
        <Row label="Session ID" value={session.id} />
        <Row label="Start time" value={date(session.startTime)} />
        <Row label="End time" value={date(session.endTime)} />
        <Row label="Sample count" value={`${metrics.sampleCount}`} />
        <Text style={styles.note}>Duration and actual sampling rate are shown in Overview.</Text>
        <Text style={styles.subheading}>Original calibration snapshot</Text>
        <Row label="Calibration timestamp" value={analytics.history.calibrationTimestamp} />
        <Row label="Pitch baseline" value={degrees(session.calibration.pitchBaseline)} />
        <Row label="Roll baseline" value={degrees(session.calibration.rollBaseline)} />
        <Row label="Pitch standard deviation" value={degrees(session.calibration.pitchStd)} />
        <Row label="Roll standard deviation" value={degrees(session.calibration.rollStd)} />
        <Row label="Confidence" value={formatPercent(session.calibration.confidence)} />
        <Row label="Validity" value={session.calibration.valid ? 'Valid' : 'Invalid'} />
        <Row label="Calibration sample count" value={`${session.calibration.sampleCount}`} />
        <Row label="Calibration duration" value={secondsValue(session.calibration.duration)} />
        <Text style={styles.subheading}>Threshold / feedback metadata</Text>
        <Text style={styles.note}>Canonical, final and maximum recorded thresholds are shown in Adaptive. Feedback counts are shown in Overview; direction details are in Corrections.</Text>
        <Text style={styles.note}>Final adaptive feedback mode: {analytics.history.feedbackMode}. Runtime controller state from another session is never substituted.</Text>
        <Text style={styles.subheading}>Upload</Text>
        <Row label="Upload / sync state" value={uploadState} />
      </Panel>}
    </>}
  </View>;
}

function referencePoints(points: ChartPoint[], value: number): ChartPoint[] {
  if (points.length === 0) return [];
  const first = { x: points[0].x, y: value };
  return points.length === 1 ? [first] : [first, { x: points[points.length - 1].x, y: value }];
}
function deviationSeries(axis: string, points: ChartPoint[], thresholds: ChartPoint[], canonical: number): ChartSeries[] {
  return [
    { name: `${axis} deviation`, color: axis === 'Pitch' ? CHART_COLORS.pitch : CHART_COLORS.roll, points },
    { name: 'Canonical threshold', color: CHART_COLORS.canonical, points: referencePoints(points, canonical), step: true },
    { name: 'Effective threshold', color: CHART_COLORS.effective, points: thresholds, step: true },
  ];
}
function thresholdSeries(points: ChartPoint[], canonical: number): ChartSeries[] {
  return [
    { name: 'Canonical threshold', color: CHART_COLORS.canonical, points: referencePoints(points, canonical), step: true },
    { name: 'Effective threshold', color: CHART_COLORS.effective, points, step: true },
    { name: 'Recorded adjustment', color: CHART_COLORS.pitch, points: points.map(point => ({ x: point.x, y: point.y - canonical })), step: true },
  ];
}
function ThresholdRows({ axis, summary }: { axis: string; summary: ThresholdSummary }) {
  return <><Text style={styles.subheading}>{axis}</Text>
    <Row label="Canonical threshold" value={degrees(summary.canonical)} />
    <Row label="Final effective threshold" value={optionalDegrees(summary.final)} />
    <Row label="Final adjustment" value={optionalDegrees(summary.finalAdjustment)} />
    <Row label="Maximum recorded effective" value={optionalDegrees(summary.maximumEffective)} />
    <Row label="Maximum recorded adjustment" value={optionalDegrees(summary.maximumRecordedAdjustment)} />
  </>;
}
function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <View style={styles.panel}><Text style={styles.title}>{title}</Text>{subtitle && <Text style={styles.note}>{subtitle}</Text>}<View style={styles.body}>{children}</View></View>;
}
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={[styles.metricValue, accent && styles.accent]}>{value}</Text></View>;
}
function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>; }
function Action({ label, onPress, compact = false, disabled = false }: { label: string; onPress: () => void; compact?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, compact && styles.compact, disabled && styles.disabled]}><Text style={styles.actionText}>{label}</Text></Pressable>;
}
function Disclosure({ label, expanded, onPress }: { label: string; expanded: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onPress} style={styles.expand}><Text style={styles.expandText}>{label} {expanded ? '▴' : '▾'}</Text></Pressable>;
}
function Pager({ page, count, onChange }: { page: number; count: number; onChange: (page: number) => void }) {
  const pages = Math.ceil(count / PAGE_SIZE);
  if (pages <= 1) return null;
  return <View style={styles.pager}><Action label="Previous" compact disabled={page === 0} onPress={() => onChange(page - 1)} /><Text style={styles.note}>{page + 1} / {pages}</Text><Action label="Next" compact disabled={page + 1 >= pages} onPress={() => onChange(page + 1)} /></View>;
}
function cap(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function degrees(value: number) { return `${value.toFixed(2)}°`; }
function optionalDegrees(value: number | null) { return value === null ? 'Unavailable — no recorded sample' : degrees(value); }
function seconds(value: number | null) { return value === null ? 'No completed corrections' : secondsValue(value); }
function secondsValue(value: number) { return `${value.toFixed(2)} s`; }
function sampleCount(value: number) { return Number.isInteger(value) ? `${value}` : value.toFixed(1); }
function correctionNumber(value: number) { return value >= 1 && Number.isInteger(value) ? `#${value}` : ''; }
function postureTick(value: number) { return value === 1 ? 'Acceptable' : value === 0 ? 'Deviation' : ''; }
function date(value: number | null) { return value === null || value === 0 ? 'Unavailable' : new Date(value).toLocaleString(); }
function uploadText(value: UploadState) { return value === 'uploading' ? 'Saving session…' : value === 'saved' ? 'Session saved' : value === 'possibly-saved' ? 'Session may already be saved' : 'Session upload failed'; }

const styles = StyleSheet.create({
  flex: { flex: 1 }, tabs: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#0D2231', padding: 4, borderRadius: 12, marginBottom: 14 },
  tab: { paddingHorizontal: 10, minHeight: 44, justifyContent: 'center', borderRadius: 9 }, tabActive: { backgroundColor: '#1D4C5A' },
  tabText: { color: '#78909E', fontSize: 11, fontWeight: '700' }, tabTextActive: { color: '#F3F7F9' },
  panel: { backgroundColor: '#0D2231', borderRadius: 16, borderWidth: 1, borderColor: '#183B4E', padding: 17, marginBottom: 14 },
  title: { color: '#F3F7F9', fontSize: 18, fontWeight: '800' }, body: { marginTop: 14 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }, metric: { width: '50%', padding: 5, minHeight: 78 },
  label: { color: '#8FA5B3', fontSize: 11, flex: 1 }, metricValue: { color: '#F3F7F9', fontSize: 18, fontWeight: '800', marginTop: 5 }, accent: { color: '#5CD1C2' },
  row: { minHeight: 44, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#173443', flexDirection: 'row', alignItems: 'center', gap: 10 },
  value: { color: '#F3F7F9', fontSize: 12, fontWeight: '700', flex: 1.3, textAlign: 'right' },
  note: { color: '#8FA5B3', fontSize: 12, lineHeight: 18, marginTop: 8 }, empty: { color: '#A9BFCD', fontSize: 14, lineHeight: 21, paddingVertical: 8 },
  correction: { borderBottomWidth: 1, borderBottomColor: '#234252', paddingVertical: 8 }, correctionSummary: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 12 },
  strong: { color: '#F3F7F9', fontWeight: '800' }, direction: { color: '#5CD1C2', fontSize: 13, fontWeight: '800' }, detail: { marginTop: 10, paddingLeft: 10 },
  action: { minHeight: 50, backgroundColor: '#2E8A72', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingHorizontal: 14 },
  actionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 }, compact: { minHeight: 44, marginTop: 0 }, disabled: { opacity: .35 },
  expand: { minHeight: 48, borderWidth: 1, borderColor: '#31576C', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, expandText: { color: '#B9CDD8', fontWeight: '800' },
  upload: { borderWidth: 1, borderColor: '#2E8A72', backgroundColor: '#103128', borderRadius: 14, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  error: { borderColor: '#B95847', backgroundColor: '#321D1A' }, subheading: { color: '#5CD1C2', fontSize: 12, fontWeight: '900', marginTop: 14, marginBottom: 4 },
  event: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#173443' },
  eventTime: { color: '#5CD1C2', width: 62, fontSize: 12, fontWeight: '800' }, eventLabel: { color: '#D2E3EC', flex: 1, fontSize: 12, lineHeight: 18 },
  pager: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
});
