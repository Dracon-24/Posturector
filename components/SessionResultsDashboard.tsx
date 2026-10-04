import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PerformanceMetrics } from '../processing/performanceMetrics';
import { Session } from '../processing/sessionRecorder';
import { MAX_ADAPTIVE_ADJUSTMENT } from '../processing/adaptiveThreshold';
import { formatDuration, formatPercent } from '../ui/presentation';

type UploadState = 'idle' | 'uploading' | 'saved' | 'failed' | 'possibly-saved';
type SectionName = 'overview' | 'posture' | 'corrections' | 'adaptive' | 'technical';
const sections: SectionName[] = ['overview', 'posture', 'corrections', 'adaptive', 'technical'];

interface Props {
  session: Session; metrics: PerformanceMetrics; uploadState: UploadState;
  adaptiveMode: 'PRODUCTION' | 'DEMO'; canonicalPitchThreshold: number;
  canonicalRollThreshold: number; onRetryUpload: () => void;
  onStartNewSession: () => void; canStartNewSession?: boolean;
}

export function SessionResultsDashboard({ session, metrics, uploadState, adaptiveMode,
  canonicalPitchThreshold, canonicalRollThreshold, onRetryUpload, onStartNewSession,
  canStartNewSession = true }: Props) {
  const [section, setSection] = useState<SectionName>('overview');
  const [expandedCorrection, setExpandedCorrection] = useState<number | null>(null);
  const [technicalExpanded, setTechnicalExpanded] = useState(false);
  const finalSample = session.samples.at(-1) ?? null;
  const finalPitch = finalSample?.pitchThreshold ?? canonicalPitchThreshold;
  const finalRoll = finalSample?.rollThreshold ?? canonicalRollThreshold;

  return <View>
    {uploadState !== 'idle' && <View style={[styles.upload, uploadState === 'failed' && styles.error]}><View style={styles.flex}><Text style={styles.strong}>{uploadText(uploadState)}</Text><Text style={styles.note}>Local results remain available.</Text></View>{uploadState === 'failed' && <Pressable onPress={onRetryUpload}><Text style={styles.retry}>Retry</Text></Pressable>}</View>}
    <View style={styles.tabs}>{sections.map(item => <Pressable key={item} onPress={() => setSection(item)} style={[styles.tab, section === item && styles.tabActive]}><Text style={[styles.tabText, section === item && styles.tabTextActive]}>{cap(item)}</Text></Pressable>)}</View>

    {section === 'overview' && <Panel title="Session Overview"><View style={styles.metrics}>
      <Metric label="Monitored" value={formatDuration(metrics.monitoredDuration)} />
      <Metric label="Consistency" value={formatPercent(metrics.consistency)} accent />
      <Metric label="Good posture" value={formatDuration(metrics.timeInGoodPosture)} />
      <Metric label="Longest good period" value={formatDuration(metrics.longestContinuousGoodPosture)} />
      <Metric label="Feedback events" value={`${metrics.feedbackEvents}`} />
      <Metric label="Completed corrections" value={`${metrics.completedCorrections}`} />
      <Metric label="Completion rate" value={formatPercent(metrics.completionRate)} accent />
    </View>{(uploadState === 'saved' || uploadState === 'possibly-saved') && canStartNewSession && <Action label="Start another session" onPress={onStartNewSession} />}</Panel>}

    {section === 'posture' && <>
      <Panel title="Posture acceptability timeline"><View style={styles.timeline}>{bucketAcceptability(session, 40).map((value, index) => <View key={index} style={[styles.timelineSegment, value === 'good' ? styles.good : value === 'mixed' ? styles.mixed : styles.bad]} />)}</View><Text style={styles.note}>Recorded samples only: acceptable, mixed, and deviation buckets.</Text></Panel>
      <Panel title="Pitch and roll deviation">{bucketDeviations(session, 24).map((item, index) => <View key={index} style={styles.chartRow}><View style={[styles.chartBar, styles.pitch, { width: `${Math.min(100, item.pitch / Math.max(item.pitchThreshold, .01) * 50)}%` }]} /><View style={[styles.chartBar, styles.roll, { width: `${Math.min(100, item.roll / Math.max(item.rollThreshold, .01) * 50)}%` }]} /></View>)}<Text style={styles.note}>Bars use stored deviation and effective-threshold values.</Text></Panel>
      <Panel title="Direction distribution">{Object.entries(metrics.postureSpecific).map(([direction, count]) => <Row key={direction} label={cap(direction)} value={`${count} feedback events`} />)}</Panel>
    </>}

    {section === 'corrections' && <Panel title="Completed correction records">{session.correctionResponses.length === 0 ? <Text style={styles.note}>No completed correction responses were recorded.</Text> : session.correctionResponses.map((response, index) => { const expanded = expandedCorrection === index; return <Pressable key={`${response.feedbackTimestamp}-${index}`} onPress={() => setExpandedCorrection(expanded ? null : index)} style={styles.correction}><View style={styles.correctionSummary}><Text style={styles.strong}>Correction {String(index + 1).padStart(2, '0')}</Text><Text style={styles.direction}>{response.direction.toUpperCase()}</Text><Text style={styles.value}>{response.responseTime.toFixed(2)} s {expanded ? '▴' : '▾'}</Text></View>{expanded && <View style={styles.detail}><Row label="Initial deviation" value={`${response.initialDeviation.toFixed(2)}°`} /><Row label="Final deviation" value={`${response.finalDeviation.toFixed(2)}°`} /><Row label="Feedback timestamp" value={timestamp(response.feedbackTimestamp)} /><Row label="Correction timestamp" value={timestamp(response.correctionTimestamp)} /><Row label="Response time" value={`${response.responseTime.toFixed(2)} s`} /><Row label="Direction" value={cap(response.direction)} /></View>}</Pressable>; })}</Panel>}

    {section === 'adaptive' && <Panel title="Final adaptive result"><Row label="Pitch canonical threshold" value={`${canonicalPitchThreshold.toFixed(2)}°`} /><Row label="Pitch final threshold" value={`${finalPitch.toFixed(2)}°`} /><Row label="Pitch final adjustment" value={`+${Math.max(0, finalPitch - canonicalPitchThreshold).toFixed(2)}°`} /><Row label="Roll canonical threshold" value={`${canonicalRollThreshold.toFixed(2)}°`} /><Row label="Roll final threshold" value={`${finalRoll.toFixed(2)}°`} /><Row label="Roll final adjustment" value={`+${Math.max(0, finalRoll - canonicalRollThreshold).toFixed(2)}°`} /><Row label="Maximum adjustment" value={`+${MAX_ADAPTIVE_ADJUSTMENT.toFixed(0)}°`} /><Row label="Adaptive timing" value={adaptiveMode} /><Text style={styles.note}>Behavioral evidence and adaptive-feedback mode history are session-local and are not persisted in the current session model.</Text></Panel>}

    {section === 'technical' && <><Pressable onPress={() => setTechnicalExpanded(value => !value)} style={styles.expand}><Text style={styles.expandText}>{technicalExpanded ? 'Hide technical metadata' : 'Show technical metadata'}</Text></Pressable>{technicalExpanded && <Panel title="Technical metadata"><Row label="Session ID" value={session.id} /><Row label="Start" value={date(session.startTime)} /><Row label="End" value={date(session.endTime)} /><Row label="Sample count" value={`${metrics.sampleCount}`} /><Row label="Actual sampling rate" value={`${metrics.actualSamplingRate.toFixed(1)} Hz`} /><Row label="Upload status" value={uploadState} /><Row label="Calibration samples" value={`${session.calibration.sampleCount}`} /><Row label="Calibration confidence" value={`${session.calibration.confidence.toFixed(1)}%`} /></Panel>}</>}
  </View>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) { return <View style={styles.panel}><Text style={styles.title}>{title}</Text><View style={styles.body}>{children}</View></View>; }
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={[styles.metricValue, accent && styles.accent]}>{value}</Text></View>; }
function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
function Action({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.action}><Text style={styles.actionText}>{label}</Text></Pressable>; }
function cap(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function timestamp(value: number) { return `${(value / 1000).toFixed(2)} s`; }
function date(value: number | null) { return value === null || value === 0 ? '—' : new Date(value).toLocaleString(); }
function uploadText(value: UploadState) { return value === 'uploading' ? 'Saving session…' : value === 'saved' ? 'Session saved' : value === 'possibly-saved' ? 'Session possibly saved' : 'Session upload failed'; }

function bucketAcceptability(session: Session, count: number): Array<'good' | 'mixed' | 'bad'> { if (!session.samples.length) return []; const size = Math.max(1, Math.ceil(session.samples.length / count)); const result: Array<'good' | 'mixed' | 'bad'> = []; for (let i = 0; i < session.samples.length; i += size) { const bucket = session.samples.slice(i, i + size); const good = bucket.filter(sample => sample.postureAcceptable).length; result.push(good === bucket.length ? 'good' : good === 0 ? 'bad' : 'mixed'); } return result; }
function bucketDeviations(session: Session, count: number) { if (!session.samples.length) return []; const size = Math.max(1, Math.ceil(session.samples.length / count)); return Array.from({ length: Math.ceil(session.samples.length / size) }, (_, i) => { const bucket = session.samples.slice(i * size, (i + 1) * size); const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length; return { pitch: avg(bucket.map(x => x.pitchDeviation)), roll: avg(bucket.map(x => x.rollDeviation)), pitchThreshold: avg(bucket.map(x => x.pitchThreshold)), rollThreshold: avg(bucket.map(x => x.rollThreshold)) }; }); }

const styles = StyleSheet.create({
  flex: { flex: 1 }, tabs: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#0D2231', padding: 4, borderRadius: 12, marginBottom: 14 }, tab: { paddingHorizontal: 10, minHeight: 40, justifyContent: 'center', borderRadius: 9 }, tabActive: { backgroundColor: '#1D4C5A' }, tabText: { color: '#78909E', fontSize: 11, fontWeight: '700' }, tabTextActive: { color: '#F3F7F9' },
  panel: { backgroundColor: '#0D2231', borderRadius: 16, borderWidth: 1, borderColor: '#183B4E', padding: 17, marginBottom: 14 }, title: { color: '#F3F7F9', fontSize: 18, fontWeight: '800' }, body: { marginTop: 14 }, metrics: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }, metric: { width: '50%', padding: 5, minHeight: 72 }, label: { color: '#8FA5B3', fontSize: 11, flex: 1 }, metricValue: { color: '#F3F7F9', fontSize: 18, fontWeight: '800', marginTop: 5 }, accent: { color: '#5CD1C2' }, row: { minHeight: 42, borderBottomWidth: 1, borderBottomColor: '#173443', flexDirection: 'row', alignItems: 'center' }, value: { color: '#F3F7F9', fontSize: 12, fontWeight: '700', flex: 1.3, textAlign: 'right' }, note: { color: '#8FA5B3', fontSize: 12, lineHeight: 18, marginTop: 8 },
  timeline: { flexDirection: 'row', height: 34, gap: 2 }, timelineSegment: { flex: 1, borderRadius: 2 }, good: { backgroundColor: '#2E8A72' }, mixed: { backgroundColor: '#D39A42' }, bad: { backgroundColor: '#C95B45' }, chartRow: { minHeight: 18, justifyContent: 'center' }, chartBar: { height: 4, borderRadius: 2 }, pitch: { backgroundColor: '#4DC8B8' }, roll: { backgroundColor: '#6698D0', marginTop: 2 },
  correction: { borderBottomWidth: 1, borderBottomColor: '#234252', paddingVertical: 12 }, correctionSummary: { flexDirection: 'row', alignItems: 'center' }, strong: { color: '#F3F7F9', fontWeight: '800' }, direction: { color: '#5CD1C2', fontSize: 11, fontWeight: '900', marginHorizontal: 10, flex: 1, textAlign: 'right' }, detail: { marginTop: 10, paddingLeft: 10 }, action: { minHeight: 50, backgroundColor: '#2E8A72', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14 }, actionText: { color: '#FFFFFF', fontWeight: '900' }, expand: { minHeight: 48, borderWidth: 1, borderColor: '#31576C', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, expandText: { color: '#B9CDD8', fontWeight: '800' },
  upload: { borderWidth: 1, borderColor: '#2E8A72', backgroundColor: '#103128', borderRadius: 14, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center' }, error: { borderColor: '#B95847', backgroundColor: '#321D1A' }, retry: { color: '#FFB36B', fontWeight: '900', padding: 12 },
});
