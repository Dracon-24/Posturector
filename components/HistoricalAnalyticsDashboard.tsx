import { ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { HistoricalSessionTrend, HistoricalSummary, HistoricalTrends } from '../services/apiService';
import { formatDuration, formatPercent } from '../ui/presentation';
import { dateLabel, groupHistoricalSessionsByDay, HISTORY_POOR_TIME_UNAVAILABLE,
  HistoricalGroup, HistoryDatum, localDateKey, selectedDayAnalytics, selectedWeekAnalytics,
  shiftDateKey, weekKey } from '../ui/historyGrouping';
import { HistoryAnalyticsChart, HISTORY_COLORS } from './HistoryAnalyticsChart';

interface Props {
  summary: HistoricalSummary | null; trends: HistoricalTrends | null; loading: boolean;
  error: string | null; adaptiveMode: 'PRODUCTION' | 'DEMO'; onRefresh: () => void;
  onOpenSession: (id: string) => void; sessionDetailLoading: boolean; sessionDetailError: string | null;
}
type SectionName = 'weekly' | 'daily' | 'sessions';
const EMPTY_SESSIONS: HistoricalSessionTrend[] = [];
const PAGE_SIZE = 6;
const primary = [{ name: 'Recorded', color: HISTORY_COLORS.primary }];
const correction = [{ name: 'Completed responses', color: HISTORY_COLORS.correction }];
const minutes = (value: number) => (value / 60000).toFixed(1);
const nullablePercent = (value: number | null | undefined) => value == null ? 'Unavailable' : formatPercent(value);
const nullableSeconds = (value: number | null | undefined) => value == null ? 'Unavailable' : `${value.toFixed(2)} s`;

export function HistoricalAnalyticsDashboard({ summary, trends, loading, error, onRefresh,
  onOpenSession, sessionDetailLoading, sessionDetailError }: Props) {
  const [section, setSection] = useState<SectionName>('weekly');
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [datesExpanded, setDatesExpanded] = useState(false);
  const [datePage, setDatePage] = useState(0);
  const [coverageExpanded, setCoverageExpanded] = useState(false);
  const sessions = trends?.sessions ?? EMPTY_SESSIONS;
  const days = useMemo(() => groupHistoricalSessionsByDay(sessions), [sessions]);
  const undated = useMemo(() => sessions.filter(item => !Number.isFinite(item.startTime) || item.startTime <= 0), [sessions]);
  const latest = days[0]?.key ?? localDateKey(Date.now());
  const dayKey = selectedDate ?? latest;
  const monday = selectedWeek ?? weekKey(new Date(`${latest}T00:00:00`).getTime());
  const weekly = useMemo(() => selectedWeekAnalytics(days, monday), [days, monday]);
  const daily = useMemo(() => selectedDayAnalytics(days, dayKey), [days, dayKey]);
  const safeDatePage = Math.min(datePage, Math.max(0, Math.ceil(days.length / PAGE_SIZE) - 1));

  return <View>
    <View style={styles.toolbar}><View style={styles.tabs}>{(['weekly', 'daily', 'sessions'] as SectionName[]).map(item =>
      <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: section === item }} onPress={() => setSection(item)} style={[styles.tab, section === item && styles.active]}><Text style={[styles.tabText, section === item && styles.activeText]}>{cap(item)}</Text></Pressable>)}</View>
      <Pressable accessibilityLabel="Refresh history" disabled={loading} onPress={onRefresh} style={styles.refresh}><Text style={styles.refreshText}>{loading ? '…' : '↻'}</Text></Pressable></View>
    {error && <Message title="History unavailable" body="Existing results remain visible. Real-time monitoring is unaffected." action="Retry" onAction={onRefresh} />}
    {sessionDetailError && <Message title="Unable to open session" body={sessionDetailError} />}
    {loading && <Message title="Loading history" body={trends ? 'Refreshing persisted analytics; existing results remain visible.' : 'Requesting persisted session analytics…'} />}
    {!loading && summary?.totalSessions === 0 && <Message title="No historical data yet" body="Completed sessions appear here after persistence." />}
    {summary && summary.totalSessions > 0 && summary.includedSessions === 0 && <Message title="No compatible analytics data" body={`${summary.excludedSessions} stored sessions lack the current analytics fields.`} />}

    {section === 'weekly' ? <>
      <Calendar title="Complete selected week" label={`${dateLabel(monday)} – ${dateLabel(weekly.endKey)}`} unit="Week"
        onPrevious={() => setSelectedWeek(shiftDateKey(monday, -7))} onNext={() => setSelectedWeek(shiftDateKey(monday, 7))} />
      <Text style={styles.context}>Weekly · all sessions starting Monday–Sunday · chart points are days</Text>
      {weekly.aggregate.sessions.length ? <>
        <GroupKpis group={weekly.aggregate} dailyAverage={weekly.averageDailyMonitoringTime} />
        <Panel title="Weekly key insights"><Insights insights={weekly.insights} /></Panel>
      </> : <Message title="No sessions in this week" body="No recorded sessions match the selected calendar week. Missing days are unavailable, not measured zero." />}
      <PeriodCharts charts={weekly.charts} unit="Day" prefix="Daily" />
      <HistoryAnalyticsChart title="Daily good / poor posture time" xLabel="Day" yLabel="Posture time (min)" data={weekly.charts.postureTime}
        kind="stacked" series={[{ name: 'Good posture', color: HISTORY_COLORS.primary }, { name: 'Poor posture · unavailable', color: HISTORY_COLORS.poor }]}
        formatAxis={minutes} formatValue={formatDuration} note={HISTORY_POOR_TIME_UNAVAILABLE} />
      <DirectionChart data={weekly.charts.direction} title="Weekly feedback direction distribution" />
    </> : <>
      <Calendar title={section === 'daily' ? 'Complete selected day' : 'Individual session exploration'} label={dateLabel(dayKey)} unit="Day"
        onPrevious={() => setSelectedDate(shiftDateKey(dayKey, -1))} onNext={() => setSelectedDate(shiftDateKey(dayKey, 1))} />
      <Control label={datesExpanded ? 'Hide recorded dates' : 'Choose recorded date'} onPress={() => setDatesExpanded(!datesExpanded)} />
      {datesExpanded && <Panel title="Recorded dates">{days.slice(safeDatePage * PAGE_SIZE, (safeDatePage + 1) * PAGE_SIZE).map(day =>
        <Control key={day.key} label={`${day.label} · ${day.sessions.length} sessions`} selected={day.key === dayKey} onPress={() => { setSelectedDate(day.key); setDatesExpanded(false); }} />)}
        {!days.length && <Text style={styles.note}>No dated sessions available.</Text>}
        <Pager page={safeDatePage} total={days.length} onChange={setDatePage} noun="dates" /></Panel>}
      {section === 'daily' ? <DailyReport key={dayKey} daily={daily} /> : <>
        <Text style={styles.context}>Sessions · select one session to open its existing full analytics</Text>
        <SessionList key={dayKey} title={`${dateLabel(dayKey)} sessions`} sessions={daily.aggregate.sessions} loading={sessionDetailLoading} onOpen={onOpenSession} />
        {undated.length > 0 && <SessionList title="Undated sessions · no first sensor sample" sessions={undated} loading={sessionDetailLoading} onOpen={onOpenSession} />}
      </>}
    </>}
    <Control label={coverageExpanded ? 'Hide data coverage & definitions' : 'Data coverage & definitions'} onPress={() => setCoverageExpanded(!coverageExpanded)} />
    {coverageExpanded && <Panel title="Historical data coverage">
      {summary && <><Row label="Stored / included / excluded sessions" value={`${summary.totalSessions} / ${summary.includedSessions} / ${summary.excludedSessions}`} />
        <Row label="All-time monitored duration" value={formatDuration(summary.totalMonitoredDuration)} />
        <Row label="All-time consistency" value={nullablePercent(summary.averageConsistency)} />
        <Row label="All-time completion rate" value={formatPercent(summary.overallCompletionRate)} />
        <Row label="All-time correction time" value={nullableSeconds(summary.averageCorrectionTime)} />
        <Row label="All-time sampling rate" value={summary.averageSamplingRate == null ? 'Unavailable' : `${summary.averageSamplingRate.toFixed(1)} Hz`} /></>}
      <Text style={styles.note}>Device-local calendar; weeks start Monday. Entire sessions belong to their start date, even if they cross midnight. {undated.length} undated sessions are excluded from calendar reports and remain accessible in Sessions.</Text>
      <Text style={styles.note}>Consistency = summed good time / monitored time. Correction time is weighted by completed responses; missing responses are not zero. Completion = completed responses / feedback events, not a clinical success score. Longest good period is within one session, never across gaps. Sampling = samples / monitored seconds.</Text>
      <Text style={styles.note}>{HISTORY_POOR_TIME_UNAVAILABLE} Historical adaptive evidence, threshold changes and physiological fatigue are unavailable; none are reconstructed.</Text>
    </Panel>}
  </View>;
}

function DailyReport({ daily }: { daily: ReturnType<typeof selectedDayAnalytics> }) {
  const [page, setPage] = useState(0);
  const [comparisonExpanded, setComparisonExpanded] = useState(false);
  const items = daily.aggregate.sessions;
  const safePage = Math.min(page, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1));
  const start = safePage * PAGE_SIZE, end = start + PAGE_SIZE;
  const charts = { ...daily.charts, consistency: daily.charts.consistency.slice(start, end), duration: daily.charts.duration.slice(start, end),
    feedback: daily.charts.feedback.slice(start, end), corrections: daily.charts.corrections.slice(start, end), correctionTime: daily.charts.correctionTime.slice(start, end) };
  return <View>
    <Text style={styles.context}>Daily · {items.length} sessions aggregated · chart points are sessions</Text>
    {items.length ? <><GroupKpis group={daily.aggregate} /><Panel title="Daily key insights"><Insights insights={daily.insights} /></Panel></>
      : <Message title="No sessions on this day" body="Choose another date. No measurements are inferred for empty days." />}
    {items.length > PAGE_SIZE && <Panel title="Session chart window"><Text style={styles.note}>Showing sessions {start + 1}–{Math.min(end, items.length)} of {items.length}. Daily KPIs, insights, directions and usage include every session.</Text><Pager page={safePage} total={items.length} onChange={setPage} noun="sessions" /></Panel>}
    <PeriodCharts charts={charts} unit="Session" prefix="Session" />
    <DirectionChart data={daily.charts.direction} title="Daily feedback direction distribution" />
    <HistoryAnalyticsChart title="Time-of-day monitoring usage" xLabel="Local time of day (hours)" yLabel="Monitoring duration (min)" data={daily.usage.series}
      series={primary} formatAxis={minutes} formatValue={formatDuration}
      note={`Only actual finalized intervals from sessions starting this day, clipped at local midnight; gaps are never filled. ${daily.usage.invalidIntervals} invalid intervals excluded. ${formatDuration(daily.usage.outsideDayDuration)} belongs outside this calendar day. Buckets without recorded intervals are unavailable.`} />
    <Control label={comparisonExpanded ? 'Hide session comparison' : 'Compare sessions'} onPress={() => setComparisonExpanded(!comparisonExpanded)} />
    {comparisonExpanded && <Panel title="Daily session comparison"><Text style={styles.note}>Same chart window; use session paging above for additional rows. Full details are in Sessions.</Text>
      <ScrollView horizontal><View><View style={styles.tableRow}>{['Session', 'Duration', 'Consistency', 'Feedback', 'Corrections', 'Completion', 'Avg response (s)'].map(label => <Text key={label} style={styles.cell}>{label}</Text>)}</View>
        {items.slice(start, end).map((item, index) => <View key={item.id} style={styles.tableRow}>{[`S${start + index + 1}`, formatDuration(item.monitoredDuration), item.monitoredDuration > 0 ? formatPercent(item.consistency) : 'Unavailable', `${item.feedbackEvents}`, `${item.completedCorrections}`, item.feedbackEvents > 0 ? formatPercent(item.completionRate) : 'Unavailable', nullableSeconds(item.averageCorrectionTime)].map((value, i) => <Text key={i} style={styles.cell}>{value}</Text>)}</View>)}</View></ScrollView>
      {!items.length && <Text style={styles.note}>No sessions to compare.</Text>}</Panel>}
  </View>;
}

function GroupKpis({ group, dailyAverage }: { group: HistoricalGroup; dailyAverage?: number | null }) {
  return <Panel title="Period summary"><Text style={styles.subheading}>Usage</Text><View style={styles.grid}>
    <Metric label="Total monitoring" value={formatDuration(group.monitoredDuration)} /><Metric label="Sessions" value={`${group.sessions.length}`} />
    <Metric label="Average session duration" value={group.averageSessionDuration == null ? 'Unavailable' : formatDuration(group.averageSessionDuration)} />
    {dailyAverage !== undefined && <Metric label="Average daily monitoring" value={dailyAverage == null ? 'Unavailable' : formatDuration(dailyAverage)} />}</View>
    {dailyAverage !== undefined && <Text style={styles.note}>Calendar-week average = total monitoring / 7 days. Missing chart days remain unavailable.</Text>}
    <Text style={styles.subheading}>Posture</Text><View style={styles.grid}><Metric label="Weighted consistency" value={nullablePercent(group.consistency)} accent />
      <Metric label="Good-posture time" value={formatDuration(group.goodPostureTime)} /><Metric label="Poor-posture time" value="Unavailable" />
      <Metric label="Longest good period · one session" value={formatDuration(group.longestGoodPosture)} /></View><Text style={styles.note}>{HISTORY_POOR_TIME_UNAVAILABLE}</Text>
    <Text style={styles.subheading}>Feedback / corrections</Text><View style={styles.grid}><Metric label="Feedback events" value={`${group.feedbackEvents}`} />
      <Metric label="Completed corrections" value={`${group.completedCorrections}`} /><Metric label="Completion rate" value={nullablePercent(group.completionRate)} />
      <Metric label="Average response time" value={nullableSeconds(group.averageCorrectionTime)} /></View>
    <Text style={styles.subheading}>Sensor / system</Text><Metric label="Actual sampling rate" value={group.averageSamplingRate == null ? 'Unavailable' : `${group.averageSamplingRate.toFixed(1)} Hz`} />
  </Panel>;
}
function PeriodCharts({ charts, unit, prefix }: { charts: { consistency: HistoryDatum[]; duration: HistoryDatum[]; feedback: HistoryDatum[]; corrections: HistoryDatum[]; correctionTime: HistoryDatum[] }; unit: string; prefix: string }) {
  return <><HistoryAnalyticsChart title={`${prefix} posture consistency`} xLabel={unit} yLabel="Posture consistency (%)" data={charts.consistency} series={primary} formatValue={formatPercent} />
    <HistoryAnalyticsChart title={`${prefix} monitoring duration`} xLabel={unit} yLabel="Monitoring duration (min)" data={charts.duration} series={primary} formatAxis={minutes} formatValue={formatDuration} />
    <HistoryAnalyticsChart title={`${prefix} feedback events`} xLabel={unit} yLabel="Feedback events (count)" data={charts.feedback} series={primary} />
    <HistoryAnalyticsChart title={`${prefix} completed corrections`} xLabel={unit} yLabel="Completed corrections (count)" data={charts.corrections} series={correction} />
    <HistoryAnalyticsChart title={`${prefix} average correction time`} xLabel={unit} yLabel="Average correction time (s)" data={charts.correctionTime} series={correction} kind="line" formatValue={value => `${value.toFixed(2)} s`} note="Completed correction responses only. No response is unavailable, never zero." /></>;
}
function DirectionChart({ data, title }: { data: HistoryDatum[]; title: string }) { return <HistoryAnalyticsChart title={title} xLabel="Feedback direction" yLabel="Feedback events (count)" data={data} series={primary} />; }
function Insights({ insights }: { insights: { bestConsistency: { label: string; value: number } | null; fastestCorrection: { label: string; value: number } | null; dominantDirection: string | null; mostMonitored?: { label: string; value: number } | null; longestSession?: { label: string; value: number } | null } }) {
  const longest = insights.mostMonitored ?? insights.longestSession;
  return <>{insights.bestConsistency && <Row label="Best consistency" value={`${insights.bestConsistency.label} · ${formatPercent(insights.bestConsistency.value)}`} />}
    {longest && <Row label={insights.mostMonitored ? 'Most monitored day' : 'Longest session'} value={`${longest.label} · ${formatDuration(longest.value)}`} />}
    {insights.fastestCorrection && <Row label="Fastest correction" value={`${insights.fastestCorrection.label} · ${nullableSeconds(insights.fastestCorrection.value)}`} />}
    {insights.dominantDirection && <Row label="Most frequent feedback direction" value={insights.dominantDirection} />}</>;
}
function SessionList({ title, sessions, loading, onOpen }: { title: string; sessions: HistoricalSessionTrend[]; loading: boolean; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, Math.max(0, Math.ceil(sessions.length / PAGE_SIZE) - 1));
  return <Panel title={title}>{sessions.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map(item => <Pressable key={item.id} disabled={loading} onPress={() => onOpen(item.id)} style={styles.sessionRow}>
    <View style={styles.flex}><Text style={styles.sessionTime}>{item.startTime > 0 ? new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Undated'} · {formatDuration(item.monitoredDuration)}</Text>
      <Text style={styles.note}>{item.monitoredDuration > 0 ? formatPercent(item.consistency) : 'Unavailable'} consistency</Text></View><Text style={styles.open}>{loading ? '…' : 'Open ›'}</Text></Pressable>)}
    {!sessions.length && <Text style={styles.note}>No sessions on this date.</Text>}<Pager page={safePage} total={sessions.length} onChange={setPage} noun="sessions" /></Panel>;
}
function Calendar({ title, label, unit, onPrevious, onNext }: { title: string; label: string; unit: string; onPrevious: () => void; onNext: () => void }) {
  return <Panel title={title}><Text style={styles.date}>{label}</Text><View style={styles.toolbar}><Control label={`← Previous ${unit}`} onPress={onPrevious} /><Control label={`Next ${unit} →`} onPress={onNext} /></View></Panel>;
}
function Pager({ page, total, onChange, noun }: { page: number; total: number; onChange: (page: number) => void; noun: string }) {
  if (total <= PAGE_SIZE) return null;
  return <View style={styles.toolbar}><Control label={`Previous ${noun}`} disabled={page === 0} onPress={() => onChange(page - 1)} /><Control label={`Next ${noun}`} disabled={(page + 1) * PAGE_SIZE >= total} onPress={() => onChange(page + 1)} /></View>;
}
function Control({ label, onPress, disabled = false, selected = false }: { label: string; onPress: () => void; disabled?: boolean; selected?: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={[styles.action, selected && styles.active, disabled && styles.disabled]}><Text style={styles.actionText}>{label}</Text></Pressable>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <View style={styles.panel}><Text style={styles.title}>{title}</Text><View style={styles.body}>{children}</View></View>; }
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={[styles.metricValue, accent && styles.accent]}>{value}</Text></View>; }
function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>; }
function Message({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) { return <Panel title={title}><Text style={styles.note}>{body}</Text>{action && onAction && <Control label={action} onPress={onAction} />}</Panel>; }
function cap(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 14, marginTop: 8, flexWrap: 'wrap' }, tabs: { flex: 1, flexDirection: 'row', backgroundColor: '#0D2231', padding: 4, borderRadius: 12 }, tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, active: { backgroundColor: '#1D4C5A' }, tabText: { color: '#78909E', fontSize: 11, fontWeight: '700' }, activeText: { color: '#F3F7F9' }, refresh: { width: 48, borderRadius: 12, backgroundColor: '#0D2231', alignItems: 'center', justifyContent: 'center' }, refreshText: { color: '#5CD1C2', fontSize: 22, fontWeight: '900' },
  panel: { backgroundColor: '#0D2231', borderRadius: 16, borderWidth: 1, borderColor: '#183B4E', padding: 17, marginBottom: 14 }, title: { color: '#F3F7F9', fontSize: 18, fontWeight: '800' }, body: { marginTop: 14 }, grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }, metric: { width: '50%', padding: 5, minHeight: 69 }, label: { color: '#8FA5B3', fontSize: 11, flex: 1 }, metricValue: { color: '#F3F7F9', fontSize: 17, fontWeight: '800', marginTop: 4 }, accent: { color: '#5CD1C2' }, note: { color: '#8FA5B3', fontSize: 12, marginTop: 4, lineHeight: 17 }, subheading: { color: '#5CD1C2', fontSize: 11, fontWeight: '900', marginTop: 12, marginBottom: 5, textTransform: 'uppercase' }, row: { minHeight: 44, flexDirection: 'row', gap: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#173443' }, rowValue: { flex: 1, color: '#F3F7F9', fontWeight: '700', fontSize: 12 },
  context: { color: '#90B9C5', fontSize: 12, lineHeight: 18, marginBottom: 14 }, date: { color: '#F3F7F9', fontWeight: '800', fontSize: 15, marginBottom: 8 }, sessionRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#173443' }, sessionTime: { color: '#F3F7F9', fontWeight: '800' }, open: { color: '#5CD1C2', fontWeight: '800' }, action: { minHeight: 44, borderWidth: 1, borderColor: '#31576C', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginBottom: 8 }, actionText: { color: '#A4D6DD', fontWeight: '700', fontSize: 12 }, disabled: { opacity: .4 }, flex: { flex: 1 }, tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#234252', minHeight: 44, alignItems: 'center' }, cell: { width: 100, padding: 8, color: '#D2E3EC', fontSize: 11 },
});
