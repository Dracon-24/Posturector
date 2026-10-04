import { StatusBar } from 'expo-status-bar';
import { ReactNode, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CalibrationResult } from '../processing/calibration';
import { CorrectionResponseState } from '../processing/correctionResponse';
import { DeviationResult } from '../processing/deviation';
import { FeedbackState } from '../processing/feedback';
import { PerformanceMetrics } from '../processing/performanceMetrics';
import { PersistenceState } from '../processing/persistence';
import { Session, PostureDirection } from '../processing/sessionRecorder';
import { StabilityResult } from '../processing/stability';
import {
  AdaptiveThresholdDiagnostics,
  AdaptiveThresholdState,
  AxisAdaptiveThresholdDiagnostics,
  MAX_ADAPTIVE_ADJUSTMENT,
} from '../processing/adaptiveThreshold';
import { IMUData } from '../services/imuService';
import {
  HistoricalSummary,
  HistoricalTrends,
  SessionUpload,
} from '../services/apiService';
import { HistoricalAnalyticsDashboard } from './HistoricalAnalyticsDashboard';
import { SessionResultsDashboard } from './SessionResultsDashboard';
import {
  formatAdaptiveTimingMode,
  formatDuration,
} from '../ui/presentation';

export type AppDestination = 'monitor' | 'session' | 'history' | 'settings';
export type CalibrationStorageStatus =
  | 'loading'
  | 'ready'
  | 'missing'
  | 'invalid'
  | 'unavailable';
export type SessionUploadState =
  | 'idle'
  | 'uploading'
  | 'saved'
  | 'failed'
  | 'possibly-saved';

interface RuntimeSnapshot {
  direction: PostureDirection;
  adaptiveDiagnostics: AdaptiveThresholdDiagnostics;
  adaptiveAdjustment: AdaptiveThresholdState;
  overallDeviation: number;
  samplingRate: number;
  monitoredDuration: number;
}

interface ApplicationShellProps {
  activeDestination: AppDestination;
  onChangeDestination: (destination: AppDestination) => void;
  imuData: IMUData;
  pitch: number;
  roll: number;
  calibration: CalibrationResult | null;
  calibrationSavedAt: number | null;
  calibrationStorageStatus: CalibrationStorageStatus;
  isCalibrating: boolean;
  calibrationTime: number;
  calibrationDuration: number;
  monitoring: boolean;
  deviation: DeviationResult | null;
  stability: StabilityResult | null;
  persistence: PersistenceState | null;
  feedback: FeedbackState | null;
  correction: CorrectionResponseState | null;
  runtime: RuntimeSnapshot;
  canonicalPitchThreshold: number | null;
  canonicalRollThreshold: number | null;
  adaptiveDiagnostics: AdaptiveThresholdDiagnostics;
  adaptiveAdjustment: AdaptiveThresholdState;
  adaptiveMode: 'PRODUCTION' | 'DEMO';
  session: Session | null;
  metrics: PerformanceMetrics | null;
  displayedResult: SessionUpload | null;
  displayedCanonicalPitchThreshold: number | null;
  displayedCanonicalRollThreshold: number | null;
  uploadState: SessionUploadState;
  uploadPending: boolean;
  onStartCalibration: () => void;
  onStartMonitoring: () => void;
  onStopMonitoring: () => void;
  onRetryUpload: () => void;
  historicalSummary: HistoricalSummary | null;
  historicalTrends: HistoricalTrends | null;
  historicalLoading: boolean;
  historicalError: string | null;
  onRefreshHistory: () => void;
  onOpenHistoricalSession: (id: string) => void;
  historicalSessionLoading: boolean;
  historicalSessionError: string | null;
}

type MonitorSection = 'live' | 'calibration' | 'adaptive' | 'system';

export function ApplicationShell(props: ApplicationShellProps) {
  const [monitorSection, setMonitorSection] = useState<MonitorSection>('live');
  const [technicalExpanded, setTechnicalExpanded] = useState(false);

  const calibrated = props.calibration?.valid === true;
  const postureLabel = !props.monitoring || props.deviation === null
    ? calibrated ? 'READY TO MONITOR' : 'CALIBRATION REQUIRED'
    : props.deviation.overallDeviation
      ? `${formatDirection(props.runtime.direction).toUpperCase()} DEVIATION`
      : 'GOOD POSTURE';
  const postureTone = props.monitoring && props.deviation?.overallDeviation
    ? styles.warning
    : props.monitoring && props.deviation !== null
      ? styles.good
      : styles.neutral;

  return (
    <View style={styles.app}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>P</Text></View>
        <View style={styles.flexOne}>
          <Text style={styles.eyebrow}>PJT-I</Text>
          <Text style={styles.appTitle}>Posture Intelligence</Text>
        </View>
        <View style={[styles.liveDot, props.monitoring && styles.liveDotActive]} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {props.activeDestination === 'monitor' && (
          <>
            <ScreenHeader title="Monitor" subtitle="Real-time posture workspace" />
            <SegmentedControl
              options={['live', 'calibration', 'adaptive', 'system'] as const}
              value={monitorSection}
              onChange={setMonitorSection}
            />

            {monitorSection === 'live' && (
              <>
                <View style={[styles.postureHero, postureTone]}>
                  <Text style={styles.heroEyebrow}>CURRENT POSTURE</Text>
                  <Text style={styles.heroTitle}>{postureLabel}</Text>
                  <Text style={styles.heroSubtext}>
                    {props.monitoring
                      ? `Session ${formatDuration(props.runtime.monitoredDuration)}`
                      : calibrated ? 'Canonical calibration is ready.' : 'Complete calibration before monitoring.'}
                  </Text>
                </View>

                <Section title="Orientation">
                  <View style={styles.tableHeader}>
                    <Text style={styles.tableLabel} />
                    <Text style={styles.tableValue}>Pitch</Text>
                    <Text style={styles.tableValue}>Roll</Text>
                  </View>
                  <DataRow label="Current" pitch={props.pitch} roll={props.roll} />
                  <DataRow
                    label="Canonical"
                    pitch={props.calibration?.pitchBaseline ?? null}
                    roll={props.calibration?.rollBaseline ?? null}
                  />
                  <DataRow
                    label="Adjustment"
                    pitch={props.adaptiveAdjustment.pitchAdjustment}
                    roll={props.adaptiveAdjustment.rollAdjustment}
                  />
                  <DataRow
                    label="Effective threshold"
                    pitch={props.deviation?.pitchThreshold ?? props.canonicalPitchThreshold}
                    roll={props.deviation?.rollThreshold ?? props.canonicalRollThreshold}
                  />
                </Section>

                <View style={styles.compactGrid}>
                  <StatusItem label="Stability" value={props.monitoring && props.stability ? props.stability.stable ? 'Stable' : 'Unstable' : 'Waiting'} />
                  <StatusItem label="Persistence" value={persistenceLabel(props.persistence, props.monitoring)} />
                  <StatusItem label="Feedback" value={props.feedback?.shouldVibrate ? `Active · ${formatDirection(props.runtime.direction)}` : 'Ready'} />
                  <StatusItem label="Correction" value={props.correction?.status ?? 'Waiting'} />
                </View>

                {props.monitoring && props.persistence?.isOutside && (
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.min(100, props.persistence.elapsedOutside / 3 * 100)}%` }]} />
                  </View>
                )}

                <PrimaryAction
                  label={props.monitoring ? 'Stop Monitoring' : 'Start Monitoring'}
                  disabled={!props.monitoring && (!calibrated || props.uploadPending || props.isCalibrating)}
                  destructive={props.monitoring}
                  onPress={props.monitoring ? props.onStopMonitoring : props.onStartMonitoring}
                />
              </>
            )}

            {monitorSection === 'calibration' && (
              <>
                <Section title="Canonical calibration" subtitle="The personalized reference used by every new session.">
                  <StatusLine label="Status" value={props.isCalibrating ? 'Calibrating' : calibrated ? 'Valid' : storageStatusLabel(props.calibrationStorageStatus)} />
                  <StatusLine label="Pitch baseline" value={degree(props.calibration?.pitchBaseline)} />
                  <StatusLine label="Roll baseline" value={degree(props.calibration?.rollBaseline)} />
                  <StatusLine label="Pitch variability" value={degree(props.calibration?.pitchStd)} />
                  <StatusLine label="Roll variability" value={degree(props.calibration?.rollStd)} />
                  <StatusLine label="Confidence" value={props.calibration ? `${props.calibration.confidence.toFixed(1)}%` : '—'} />
                  <StatusLine label="Collected" value={props.calibration ? `${props.calibration.sampleCount} samples · ${props.calibration.duration.toFixed(1)} s` : '—'} />
                  <StatusLine label="Saved" value={formatSavedAt(props.calibrationSavedAt)} />
                  <StatusLine label="Age" value={formatAge(props.calibrationSavedAt)} />
                  {props.isCalibrating && (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.min(100, props.calibrationTime / props.calibrationDuration * 100)}%` }]} />
                    </View>
                  )}
                </Section>
                <SecondaryAction label="Manage recalibration in Settings" onPress={() => props.onChangeDestination('settings')} />
              </>
            )}

            {monitorSection === 'adaptive' && (
              <>
                <AxisAdaptive title="Pitch" diagnostics={props.adaptiveDiagnostics.pitch} adjustment={props.adaptiveAdjustment.pitchAdjustment} canonical={props.canonicalPitchThreshold} effective={props.deviation?.pitchThreshold ?? props.canonicalPitchThreshold} />
                <AxisAdaptive title="Roll" diagnostics={props.adaptiveDiagnostics.roll} adjustment={props.adaptiveAdjustment.rollAdjustment} canonical={props.canonicalRollThreshold} effective={props.deviation?.rollThreshold ?? props.canonicalRollThreshold} />
                <Section title="Adaptive feedback">
                  <StatusLine label="Mode" value={props.feedback?.adaptiveMode ?? 'NORMAL'} />
                  <StatusLine label="Reassertion" value={props.feedback?.reassertInterval ? `${props.feedback.reassertInterval / 1000} s` : 'None'} />
                </Section>
              </>
            )}

            {monitorSection === 'system' && (
              <>
                <Section title="System status">
                  <StatusLine label="Sensor" value={props.imuData.timestamp > 0 ? 'Active' : 'Connecting'} />
                  <StatusLine label="Sampling rate" value={props.monitoring ? `${props.runtime.samplingRate.toFixed(1)} Hz` : '—'} />
                  <StatusLine label="Monitoring duration" value={props.monitoring ? formatDuration(props.runtime.monitoredDuration) : '—'} />
                  <StatusLine label="Session" value={props.monitoring ? 'Active' : props.session?.endTime !== null && props.session ? 'Completed' : 'Idle'} />
                  <StatusLine label="Backend analytics" value={props.historicalLoading ? 'Checking' : props.historicalError ? 'Unavailable' : props.historicalSummary ? 'Available' : 'Not checked'} />
                  <StatusLine label="Upload" value={uploadLabel(props.uploadState)} />
                </Section>
                <View style={styles.demoNotice}>
                  <Text style={styles.demoTitle}>{formatAdaptiveTimingMode(props.adaptiveMode)}</Text>
                  <Text style={styles.muted}>Temporary review timing. Production timing remains pending real-hardware validation.</Text>
                </View>
                <SecondaryAction label={technicalExpanded ? 'Hide Technical Details' : 'Technical Details'} onPress={() => setTechnicalExpanded(value => !value)} />
                {technicalExpanded && (
                  <Section title="Technical details">
                    <StatusLine label="Accelerometer" value={`${props.imuData.accelerometer.x.toFixed(3)}, ${props.imuData.accelerometer.y.toFixed(3)}, ${props.imuData.accelerometer.z.toFixed(3)}`} />
                    <StatusLine label="Gyroscope" value={`${props.imuData.gyroscope.x.toFixed(3)}, ${props.imuData.gyroscope.y.toFixed(3)}, ${props.imuData.gyroscope.z.toFixed(3)}`} />
                    <StatusLine label="Adaptive samples" value={`${props.adaptiveDiagnostics.validSampleCount}`} />
                    <StatusLine label="Observation" value={`${(props.adaptiveDiagnostics.observationDuration / 1000).toFixed(1)} s`} />
                  </Section>
                )}
              </>
            )}
          </>
        )}

        {props.activeDestination === 'session' && (
          <>
            <ScreenHeader title="Session" subtitle="Current or most recently opened result" />
            {props.displayedResult === null ||
            props.displayedCanonicalPitchThreshold === null ||
            props.displayedCanonicalRollThreshold === null ? (
              <EmptyState title={props.monitoring ? 'Monitoring in progress' : 'No completed session'} body={props.monitoring ? 'Stop monitoring to finalize metrics and review the result.' : 'Complete a monitoring session or open one from History.'} />
            ) : (
              <SessionResultsDashboard
                session={props.displayedResult}
                metrics={props.displayedResult.metrics}
                uploadState={props.uploadState}
                adaptiveMode={props.adaptiveMode}
                canonicalPitchThreshold={props.displayedCanonicalPitchThreshold}
                canonicalRollThreshold={props.displayedCanonicalRollThreshold}
                onRetryUpload={props.onRetryUpload}
                onStartNewSession={props.onStartMonitoring}
                canStartNewSession={!props.uploadPending && calibrated}
              />
            )}
          </>
        )}

        {props.activeDestination === 'history' && (
          <>
            <ScreenHeader title="History" subtitle="Progress across completed sessions" />
            <HistoricalAnalyticsDashboard
              summary={props.historicalSummary}
              trends={props.historicalTrends}
              loading={props.historicalLoading}
              error={props.historicalError}
              adaptiveMode={props.adaptiveMode}
              onRefresh={props.onRefreshHistory}
              onOpenSession={props.onOpenHistoricalSession}
              sessionDetailLoading={props.historicalSessionLoading}
              sessionDetailError={props.historicalSessionError}
            />
          </>
        )}

        {props.activeDestination === 'settings' && (
          <>
            <ScreenHeader title="Settings" subtitle="Calibration, connection, and project information" />
            <Section title="Calibration">
              <StatusLine label="Status" value={calibrated ? 'Valid' : storageStatusLabel(props.calibrationStorageStatus)} />
              <StatusLine label="Saved" value={formatSavedAt(props.calibrationSavedAt)} />
              <Text style={styles.muted}>Recalibration replaces the canonical reference only after a new valid result is produced.</Text>
              <PrimaryAction
                label={props.isCalibrating ? `Calibrating · ${Math.ceil(props.calibrationDuration - props.calibrationTime)} s` : calibrated ? 'Recalibrate' : 'Start Calibration'}
                disabled={props.monitoring || props.uploadPending || props.isCalibrating}
                onPress={props.onStartCalibration}
              />
            </Section>
            <Section title="Connection">
              <StatusLine label="Backend" value={props.historicalError ? 'Unavailable' : props.historicalSummary ? 'Available' : 'Not checked'} />
              <StatusLine label="Session upload" value={uploadLabel(props.uploadState)} />
              <Text style={styles.muted}>The development API address comes from the local Expo environment configuration.</Text>
            </Section>
            <Section title="About / Technical">
              <StatusLine label="Application" value="PJT-I posture prototype" />
              <StatusLine label="Runtime" value="Expo SDK 57 · React Native" />
              <StatusLine label="Processing" value="Local real-time pipeline" />
              <StatusLine label="Hardware" value="Phone prototype · physical belt pending" />
            </Section>
          </>
        )}
      </ScrollView>

      <View style={styles.bottomNav}>
        <NavItem icon="◎" label="Monitor" selected={props.activeDestination === 'monitor'} onPress={() => props.onChangeDestination('monitor')} />
        <NavItem icon="▣" label="Session" selected={props.activeDestination === 'session'} onPress={() => props.onChangeDestination('session')} />
        <NavItem icon="◷" label="History" selected={props.activeDestination === 'history'} onPress={() => props.onChangeDestination('history')} />
        <NavItem icon="⚙" label="Settings" selected={props.activeDestination === 'settings'} onPress={() => props.onChangeDestination('settings')} />
      </View>
    </View>
  );
}

function ScreenHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={styles.screenHeader}><Text style={styles.screenTitle}>{title}</Text><Text style={styles.screenSubtitle}>{subtitle}</Text></View>;
}

function SegmentedControl<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (value: T) => void }) {
  return <View style={styles.segmented}>{options.map(option => <Pressable key={option} onPress={() => onChange(option)} style={[styles.segment, value === option && styles.segmentActive]}><Text style={[styles.segmentText, value === option && styles.segmentTextActive]}>{option.charAt(0).toUpperCase() + option.slice(1)}</Text></Pressable>)}</View>;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}<View style={styles.sectionBody}>{children}</View></View>;
}

function DataRow({ label, pitch, roll }: { label: string; pitch: number | null; roll: number | null }) {
  return <View style={styles.dataRow}><Text style={styles.tableLabel}>{label}</Text><Text style={styles.tableValue}>{degree(pitch)}</Text><Text style={styles.tableValue}>{degree(roll)}</Text></View>;
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return <View style={styles.statusLine}><Text style={styles.statusLabel}>{label}</Text><Text style={styles.statusValue}>{value}</Text></View>;
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return <View style={styles.statusItem}><Text style={styles.statusLabel}>{label}</Text><Text style={styles.statusItemValue}>{value}</Text></View>;
}

function FeatureRow({ label, diagnostics, keyName }: { label: string; diagnostics: AxisAdaptiveThresholdDiagnostics; keyName: keyof AxisAdaptiveThresholdDiagnostics['features'] }) {
  const values = diagnostics.featureEmaValues;
  const ema = keyName === 'deviationTrend' ? values.deviation : keyName === 'deviationFrequency' ? values.frequency : keyName === 'correctionTrend' ? values.correction : keyName === 'goodPostureDecline' ? values.goodPostureDuration : values.nearThreshold;
  return <View style={styles.featureRow}><Text style={styles.featureName}>{label}</Text><Text style={styles.featureValue}>{(diagnostics.features[keyName] * 100).toFixed(0)}%</Text><Text style={styles.featureEma}>{ema.shortTerm.toFixed(2)} / {ema.longTerm.toFixed(2)}</Text></View>;
}

function AxisAdaptive({ title, diagnostics, adjustment, canonical, effective }: { title: string; diagnostics: AxisAdaptiveThresholdDiagnostics; adjustment: number; canonical: number | null; effective: number | null }) {
  const gatesPass = diagnostics.dataSufficient && !diagnostics.unstable && !diagnostics.severeDeviation && !diagnostics.majorDeterioration;
  return <Section title={`${title} adaptation`} subtitle="Feature value · short / long EMA">
    <View style={styles.featureHeader}><Text style={styles.featureName}>Feature</Text><Text style={styles.featureValue}>Value</Text><Text style={styles.featureEma}>EMA</Text></View>
    <FeatureRow label="Deviation trend" diagnostics={diagnostics} keyName="deviationTrend" />
    <FeatureRow label="Deviation frequency" diagnostics={diagnostics} keyName="deviationFrequency" />
    <FeatureRow label="Correction-response trend" diagnostics={diagnostics} keyName="correctionTrend" />
    <FeatureRow label="Good-posture duration decline" diagnostics={diagnostics} keyName="goodPostureDecline" />
    <FeatureRow label="Near-threshold exposure" diagnostics={diagnostics} keyName="nearThresholdExposure" />
    <View style={styles.divider} />
    <StatusLine label="Evidence EMA" value={diagnostics.evidenceEma.toFixed(2)} />
    <StatusLine label="Canonical threshold" value={degree(canonical)} />
    <StatusLine label="Adjustment" value={`+${adjustment.toFixed(2)}°`} />
    <StatusLine label="Effective threshold" value={degree(effective)} />
    <StatusLine label="Maximum adjustment" value={`+${MAX_ADAPTIVE_ADJUSTMENT.toFixed(0)}°`} />
    <Text style={styles.subheading}>Safety gates</Text>
    <Gate label="Data sufficient" passed={diagnostics.dataSufficient} />
    <Gate label="Stable" passed={!diagnostics.unstable} />
    <Gate label="Severe deviation clear" passed={!diagnostics.severeDeviation} />
    <Gate label="Major deterioration clear" passed={!diagnostics.majorDeterioration} />
    <Gate label="Adaptation" passed={gatesPass} activeLabel="ACTIVE" inactiveLabel="FROZEN" />
  </Section>;
}

function Gate({ label, passed, activeLabel = '✓', inactiveLabel = '—' }: { label: string; passed: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return <View style={styles.statusLine}><Text style={styles.statusLabel}>{label}</Text><Text style={passed ? styles.gatePass : styles.gateBlocked}>{passed ? activeLabel : inactiveLabel}</Text></View>;
}

function PrimaryAction({ label, onPress, disabled = false, destructive = false }: { label: string; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, destructive && styles.destructiveButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={styles.primaryButtonText}>{label}</Text></Pressable>;
}

function SecondaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>{label}</Text></Pressable>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <View style={styles.empty}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.muted}>{body}</Text></View>;
}

function NavItem({ icon, label, selected, onPress }: { icon: string; label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={styles.navItem}><Text style={[styles.navIcon, selected && styles.navSelected]}>{icon}</Text><Text style={[styles.navLabel, selected && styles.navSelected]}>{label}</Text></Pressable>;
}

function degree(value: number | null | undefined): string { return value === null || value === undefined ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}°`; }
function formatDirection(value: PostureDirection): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function persistenceLabel(value: PersistenceState | null, monitoring: boolean): string { return !monitoring || value === null ? 'Waiting' : value.isSustained ? 'Sustained' : value.isOutside ? `${value.elapsedOutside.toFixed(1)} / 3.0 s` : 'Reset'; }
function uploadLabel(value: SessionUploadState): string { return value === 'possibly-saved' ? 'Possibly saved' : value.charAt(0).toUpperCase() + value.slice(1); }
function storageStatusLabel(value: CalibrationStorageStatus): string { return value === 'ready' ? 'Valid' : value === 'loading' ? 'Loading saved calibration' : value === 'invalid' ? 'Saved calibration invalid' : value === 'unavailable' ? 'Storage unavailable' : 'Calibration required'; }
function formatSavedAt(value: number | null): string { return value === null ? '—' : new Date(value).toLocaleString(); }
function formatAge(value: number | null): string { if (value === null) return '—'; const days = Math.floor(Math.max(0, Date.now() - value) / 86_400_000); return days === 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'}`; }

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#071521' },
  content: { paddingHorizontal: 18, paddingBottom: 34 },
  flexOne: { flex: 1 },
  topBar: { paddingTop: 48, paddingHorizontal: 18, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#183446' },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#2AB7A9', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  brandMarkText: { color: '#06151F', fontSize: 22, fontWeight: '900' },
  eyebrow: { color: '#50D4C5', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  appTitle: { color: '#F3F7F9', fontSize: 18, fontWeight: '800' },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#49616F' },
  liveDotActive: { backgroundColor: '#61D38E' },
  screenHeader: { paddingTop: 24, paddingBottom: 16 },
  screenTitle: { color: '#F3F7F9', fontSize: 30, fontWeight: '900' },
  screenSubtitle: { color: '#91A7B5', fontSize: 14, marginTop: 4 },
  segmented: { flexDirection: 'row', backgroundColor: '#0D2231', borderRadius: 12, padding: 4, marginBottom: 18 },
  segment: { flex: 1, minHeight: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: '#1D4C5A' },
  segmentText: { color: '#8299A7', fontSize: 12, fontWeight: '700' },
  segmentTextActive: { color: '#F3F7F9' },
  postureHero: { borderRadius: 18, padding: 22, marginBottom: 16, borderWidth: 1 },
  good: { backgroundColor: '#103128', borderColor: '#2E8A72' },
  warning: { backgroundColor: '#39281A', borderColor: '#D39A42' },
  neutral: { backgroundColor: '#102839', borderColor: '#31576C' },
  heroEyebrow: { color: '#A7BAC7', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 7 },
  heroSubtext: { color: '#B8C7D0', fontSize: 14, marginTop: 8 },
  section: { backgroundColor: '#0D2231', borderRadius: 16, padding: 17, marginBottom: 14, borderWidth: 1, borderColor: '#183B4E' },
  sectionTitle: { color: '#F3F7F9', fontSize: 18, fontWeight: '800' },
  sectionSubtitle: { color: '#8FA5B3', fontSize: 12, marginTop: 4, lineHeight: 18 },
  sectionBody: { marginTop: 14 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#234252', paddingBottom: 8 },
  dataRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#173443', minHeight: 43, alignItems: 'center' },
  tableLabel: { flex: 1.4, color: '#9DB0BB', fontSize: 13 },
  tableValue: { flex: 1, color: '#F3F7F9', fontSize: 13, fontWeight: '700', textAlign: 'right' },
  compactGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginBottom: 8 },
  statusItem: { width: '50%', padding: 5 },
  statusItemValue: { color: '#F3F7F9', fontSize: 15, fontWeight: '800', marginTop: 4 },
  statusLine: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#173443' },
  statusLabel: { color: '#8FA5B3', fontSize: 12, flex: 1 },
  statusValue: { color: '#F3F7F9', fontSize: 13, fontWeight: '700', textAlign: 'right', flex: 1.2 },
  progressTrack: { height: 7, backgroundColor: '#173443', borderRadius: 4, overflow: 'hidden', marginVertical: 10 },
  progressFill: { height: '100%', backgroundColor: '#4DC8B8' },
  featureHeader: { flexDirection: 'row', paddingBottom: 8 },
  featureRow: { flexDirection: 'row', minHeight: 39, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#173443' },
  featureName: { flex: 1.8, color: '#B6C4CC', fontSize: 11 },
  featureValue: { flex: 0.55, color: '#F3F7F9', fontWeight: '800', fontSize: 12, textAlign: 'right' },
  featureEma: { flex: 0.9, color: '#7FCFC5', fontSize: 11, textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#315063', marginVertical: 10 },
  subheading: { color: '#4DC8B8', fontSize: 12, fontWeight: '800', marginTop: 15, marginBottom: 5, textTransform: 'uppercase' },
  gatePass: { color: '#61D38E', fontWeight: '900' },
  gateBlocked: { color: '#D39A42', fontWeight: '900' },
  demoNotice: { borderWidth: 1, borderColor: '#A97132', backgroundColor: '#302517', borderRadius: 14, padding: 15, marginBottom: 14 },
  demoTitle: { color: '#F1AF59', fontSize: 13, fontWeight: '900' },
  muted: { color: '#91A7B5', fontSize: 13, lineHeight: 19, marginTop: 5 },
  primaryButton: { minHeight: 52, backgroundColor: '#2E8A72', borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  destructiveButton: { backgroundColor: '#B95847' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  secondaryButton: { minHeight: 48, borderWidth: 1, borderColor: '#31576C', borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  secondaryButtonText: { color: '#B9CDD8', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72 },
  empty: { backgroundColor: '#0D2231', borderRadius: 16, padding: 22, borderWidth: 1, borderColor: '#183B4E' },
  emptyTitle: { color: '#F3F7F9', fontSize: 19, fontWeight: '800' },
  bottomNav: { flexDirection: 'row', backgroundColor: '#091A26', borderTopWidth: 1, borderTopColor: '#1F3C4C', paddingBottom: 20, paddingTop: 9 },
  navItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  navIcon: { color: '#6F8795', fontSize: 20, fontWeight: '900' },
  navLabel: { color: '#6F8795', fontSize: 10, fontWeight: '700', marginTop: 2 },
  navSelected: { color: '#51D2C3' },
});
