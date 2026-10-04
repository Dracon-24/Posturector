import { ReactNode, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HistoricalSummary, HistoricalTrends } from '../services/apiService';
import { formatDuration, formatPercent } from '../ui/presentation';
import { groupHistoricalSessionsByDay, groupHistoricalSessionsByWeek, HistoricalGroup } from '../ui/historyGrouping';

interface Props {
  summary: HistoricalSummary | null; trends: HistoricalTrends | null; loading: boolean;
  error: string | null; adaptiveMode: 'PRODUCTION' | 'DEMO'; onRefresh: () => void;
  onOpenSession: (id: string) => void; sessionDetailLoading: boolean;
  sessionDetailError: string | null;
}
type SectionName = 'weekly' | 'daily' | 'sessions';

export function HistoricalAnalyticsDashboard({ summary, trends, loading, error, onRefresh,
  onOpenSession, sessionDetailLoading, sessionDetailError }: Props) {
  const [section, setSection] = useState<SectionName>('weekly');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const sessions = trends?.sessions ?? [];
  const weeks = useMemo(() => groupHistoricalSessionsByWeek(sessions), [sessions]);
  const days = useMemo(() => groupHistoricalSessionsByDay(sessions), [sessions]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const activeDate = days.find(day => day.key === selectedDate) ?? days[0] ?? null;

  return <View>
    <View style={styles.toolbar}><View style={styles.tabs}>{(['weekly', 'daily', 'sessions'] as SectionName[]).map(item => <Pressable key={item} onPress={() => setSection(item)} style={[styles.tab, section === item && styles.active]}><Text style={[styles.tabText, section === item && styles.activeText]}>{cap(item)}</Text></Pressable>)}</View><Pressable disabled={loading} onPress={onRefresh} style={styles.refresh}><Text style={styles.refreshText}>{loading ? '…' : '↻'}</Text></Pressable></View>
    {error && <Message title="History unavailable" body="Existing results remain visible. Real-time monitoring is unaffected." action="Retry" onAction={onRefresh} />}
    {sessionDetailError && <Message title="Unable to open session" body={sessionDetailError} />}
    {loading && summary === null && <Message title="Loading history" body="Requesting persisted session analytics…" />}
    {!loading && summary?.totalSessions === 0 && <Message title="No historical data yet" body="Completed sessions will append here after persistence." />}
    {summary && summary.totalSessions > 0 && summary.includedSessions === 0 && <Message title="No compatible analytics data" body={`${summary.excludedSessions} stored sessions do not contain the current analytics fields.`} />}

    {section === 'weekly' && weeks.length > 0 && <>
      <Panel title="All-time summary"><View style={styles.grid}><Metric label="Sessions" value={`${summary?.includedSessions ?? 0}`} /><Metric label="Monitoring" value={formatDuration(summary?.totalMonitoredDuration ?? 0)} /><Metric label="Consistency" value={nullablePercent(summary?.averageConsistency)} accent /><Metric label="Completion" value={formatPercent(summary?.overallCompletionRate ?? 0)} /><Metric label="Correction time" value={nullableSeconds(summary?.averageCorrectionTime)} /><Metric label="Sampling rate" value={summary?.averageSamplingRate === null || summary?.averageSamplingRate === undefined ? 'Unavailable' : `${summary.averageSamplingRate.toFixed(1)} Hz`} /></View></Panel>
      {weeks.map(week => <GroupPanel key={week.key} group={week} title={week.label} />)}
    </>}

    {section === 'daily' && days.map(day => { const expanded = expandedDay === day.key; return <Pressable key={day.key} onPress={() => setExpandedDay(expanded ? null : day.key)} style={styles.day}><View style={styles.dayHeader}><View style={styles.flex}><Text style={styles.dayTitle}>{day.label}</Text><Text style={styles.note}>{day.sessions.length} sessions · {formatDuration(day.monitoredDuration)} · {nullablePercent(day.consistency)} consistency</Text></View><Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text></View>{expanded && <View style={styles.daySessions}>{[...day.sessions].reverse().map(session => <SessionRow key={session.id} id={session.id} startTime={session.startTime} duration={session.monitoredDuration} consistency={session.consistency} loading={sessionDetailLoading} onOpen={onOpenSession} />)}</View>}</Pressable>; })}

    {section === 'sessions' && activeDate && <>
      <Panel title="Date"><View style={styles.dateSelector}>{days.map(day => <Pressable key={day.key} onPress={() => setSelectedDate(day.key)} style={[styles.dateOption, activeDate.key === day.key && styles.dateActive]}><Text style={[styles.dateText, activeDate.key === day.key && styles.activeText]}>{day.label}</Text></Pressable>)}</View></Panel>
      <Panel title={`${activeDate.label} sessions`}>{[...activeDate.sessions].reverse().map(session => <SessionRow key={session.id} id={session.id} startTime={session.startTime} duration={session.monitoredDuration} consistency={session.consistency} loading={sessionDetailLoading} onOpen={onOpenSession} />)}</Panel>
    </>}
  </View>;
}

function GroupPanel({ group, title }: { group: HistoricalGroup; title: string }) { return <Panel title={title}><View style={styles.grid}><Metric label="Sessions" value={`${group.sessions.length}`} /><Metric label="Monitoring" value={formatDuration(group.monitoredDuration)} /><Metric label="Consistency" value={nullablePercent(group.consistency)} accent /><Metric label="Completion" value={formatPercent(group.completionRate)} /><Metric label="Correction time" value={nullableSeconds(group.averageCorrectionTime)} /><Metric label="Completed" value={`${group.completedCorrections} / ${group.feedbackEvents}`} /></View><Text style={styles.subheading}>Direction trends</Text>{Object.entries(group.directionCounts).map(([direction, count]) => <Row key={direction} label={cap(direction)} value={`${count} feedback events`} />)}</Panel>; }
function SessionRow({ id, startTime, duration, consistency, loading, onOpen }: { id: string; startTime: number; duration: number; consistency: number; loading: boolean; onOpen: (id: string) => void }) { return <Pressable disabled={loading} onPress={() => onOpen(id)} style={styles.sessionRow}><View style={styles.flex}><Text style={styles.sessionTime}>{new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {formatDuration(duration)}</Text><Text style={styles.note}>{formatPercent(consistency)} consistency</Text></View><Text style={styles.open}>{loading ? '…' : 'Open ›'}</Text></Pressable>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <View style={styles.panel}><Text style={styles.title}>{title}</Text><View style={styles.body}>{children}</View></View>; }
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={[styles.metricValue, accent && styles.accent]}>{value}</Text></View>; }
function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>; }
function Message({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) { return <View style={styles.panel}><Text style={styles.title}>{title}</Text><Text style={styles.note}>{body}</Text>{action && onAction && <Pressable onPress={onAction} style={styles.action}><Text style={styles.actionText}>{action}</Text></Pressable>}</View>; }
function cap(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function nullablePercent(value: number | null | undefined) { return value === null || value === undefined ? 'Unavailable' : formatPercent(value); }
function nullableSeconds(value: number | null | undefined) { return value === null || value === undefined ? 'Unavailable' : `${value.toFixed(2)} s`; }

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', marginBottom: 14 }, tabs: { flex: 1, flexDirection: 'row', backgroundColor: '#0D2231', padding: 4, borderRadius: 12 }, tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, active: { backgroundColor: '#1D4C5A' }, tabText: { color: '#78909E', fontSize: 11, fontWeight: '700' }, activeText: { color: '#F3F7F9' }, refresh: { width: 48, marginLeft: 8, borderRadius: 12, backgroundColor: '#0D2231', alignItems: 'center', justifyContent: 'center' }, refreshText: { color: '#5CD1C2', fontSize: 22, fontWeight: '900' },
  panel: { backgroundColor: '#0D2231', borderRadius: 16, borderWidth: 1, borderColor: '#183B4E', padding: 17, marginBottom: 14 }, title: { color: '#F3F7F9', fontSize: 18, fontWeight: '800' }, body: { marginTop: 14 }, grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }, metric: { width: '50%', padding: 5, minHeight: 69 }, label: { color: '#8FA5B3', fontSize: 11, flex: 1 }, metricValue: { color: '#F3F7F9', fontSize: 17, fontWeight: '800', marginTop: 4 }, accent: { color: '#5CD1C2' }, note: { color: '#8FA5B3', fontSize: 12, marginTop: 4, lineHeight: 17 }, subheading: { color: '#5CD1C2', fontSize: 11, fontWeight: '900', marginTop: 12, marginBottom: 5, textTransform: 'uppercase' }, row: { minHeight: 38, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#173443' }, rowValue: { color: '#F3F7F9', fontWeight: '700', fontSize: 12 },
  day: { backgroundColor: '#0D2231', borderRadius: 14, borderWidth: 1, borderColor: '#183B4E', padding: 15, marginBottom: 10 }, dayHeader: { flexDirection: 'row', alignItems: 'center' }, dayTitle: { color: '#F3F7F9', fontSize: 16, fontWeight: '800' }, chevron: { color: '#5CD1C2', fontSize: 18, padding: 8 }, daySessions: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#234252' }, sessionRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#173443' }, sessionTime: { color: '#F3F7F9', fontWeight: '800' }, open: { color: '#5CD1C2', fontWeight: '800' },
  dateSelector: { gap: 8 }, dateOption: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: '#31576C', justifyContent: 'center', paddingHorizontal: 13 }, dateActive: { backgroundColor: '#1D4C5A', borderColor: '#4DC8B8' }, dateText: { color: '#91A7B5', fontWeight: '700' }, action: { minHeight: 44, backgroundColor: '#2E8A72', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, actionText: { color: '#FFFFFF', fontWeight: '900' }, flex: { flex: 1 },
});
