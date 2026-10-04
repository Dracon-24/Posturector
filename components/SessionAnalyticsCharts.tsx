import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChartPoint, ChartSeries } from '../ui/sessionAnalytics';
import { nearestPoint, preserveExtrema } from '../ui/sessionAnalytics';

const HEIGHT = 150;
export const CHART_COLORS = {
  pitch: '#50D4C5', roll: '#7FAAF1', canonical: '#D5B979', effective: '#B69CF0',
  feedback: '#F4A66A', correction: '#77D99C', state: '#50D4C5',
};

interface LineChartProps {
  title: string;
  xLabel: string;
  yLabel: string;
  series: ChartSeries[];
  xMax?: number;
  yMax?: number;
  formatX: (value: number) => string;
  formatY?: (value: number) => string;
  emptyText?: string;
  interpretation?: string;
  markers?: Array<{ x: number; label: string; color: string }>;
}

export const SessionLineChart = memo(function SessionLineChart({ title, xLabel, yLabel, series, xMax, yMax,
  formatX, formatY = value => value.toFixed(1), emptyText = 'No posture samples recorded.',
  interpretation, markers = [] }: LineChartProps) {
  const [width, setWidth] = useState(240);
  const [selectedX, setSelectedX] = useState<number | null>(null);
  const plotted = useMemo(() => series.map(item => ({ ...item, points: preserveExtrema(item.points) })), [series]);
  const bounds = useMemo(() => {
    let maxX = xMax ?? 0;
    let maxY = yMax ?? 0;
    let count = 0;
    for (const item of series) for (const point of item.points) {
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      count++;
    }
    return { x: maxX || 1, y: maxY || 1, count };
  }, [series, xMax, yMax]);
  const firstSeries = series.find(item => item.points.length > 0);
  const x = selectedX ?? firstSeries?.points.at(-1)?.x ?? 0;
  const selected = series.map(item => ({ item, point: nearestPoint(item.points, x) }));
  const toX = (value: number) => value / bounds.x * width;
  const toY = (value: number) => HEIGHT - value / bounds.y * HEIGHT;
  const reduced = series.some(item => item.points.length > 160);

  return <View style={styles.card}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.axis}>{yLabel}</Text>
    {bounds.count === 0 ? <Text style={styles.empty}>{emptyText}</Text> : <>
      <View style={styles.chartRow}>
        <View style={styles.yTicks}>{[bounds.y, bounds.y / 2, 0].map((value, index) =>
          <Text key={index} style={styles.tick}>{formatY(value)}</Text>)}</View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${title}. Touch to inspect a recorded point.`}
          onLayout={event => setWidth(Math.max(1, event.nativeEvent.layout.width))}
          onPress={event => setSelectedX(Math.max(0, Math.min(bounds.x, event.nativeEvent.locationX / width * bounds.x)))}
          style={styles.plot}>
          {[0, .5, 1].map(ratio => <View key={ratio} style={[styles.gridLine, { top: ratio * HEIGHT }]} />)}
          {markers.slice(0, 60).map((marker, index) => <View key={`marker-${index}`} style={[styles.marker, { left: toX(marker.x), borderColor: marker.color }]} />)}
          {plotted.map(item => <View key={item.name} pointerEvents="none" style={StyleSheet.absoluteFill}>
            {!item.scatter && item.points.slice(1).map((point, index) => {
              const previous = item.points[index];
              const x1 = toX(previous.x), y1 = toY(previous.y), x2 = toX(point.x), y2 = toY(point.y);
              return item.step
                ? <View key={index}><Segment x1={x1} y1={y1} x2={x2} y2={y1} color={item.color} /><Segment x1={x2} y1={y1} x2={x2} y2={y2} color={item.color} /></View>
                : <Segment key={index} x1={x1} y1={y1} x2={x2} y2={y2} color={item.color} />;
            })}
            {(item.scatter || item.points.length === 1) && item.points.map((point, index) =>
              <View key={index} style={[styles.dot, { left: toX(point.x) - 3, top: toY(point.y) - 3, backgroundColor: item.color }]} />)}
          </View>)}
          <View pointerEvents="none" style={[styles.cursor, { left: toX(x) }]} />
        </Pressable>
      </View>
      <View style={styles.xTicks}><Text style={styles.tick}>{formatX(0)}</Text><Text style={styles.tick}>{formatX(bounds.x / 2)}</Text><Text style={styles.tick}>{formatX(bounds.x)}</Text></View>
      <Text style={[styles.axis, styles.xAxis]}>{xLabel}</Text>
      <View style={styles.legend}>{series.map(item => <Text key={item.name} style={[styles.legendText, { color: item.color }]}>● {item.name}</Text>)}
        {markers.length > 0 && <><Text style={[styles.legendText, { color: CHART_COLORS.feedback }]}>│ Feedback</Text><Text style={[styles.legendText, { color: CHART_COLORS.correction }]}>│ Completed correction</Text></>}
      </View>
      <View style={styles.tooltip}><Text style={styles.tooltipTitle}>Recorded point · touch graph to inspect</Text>{selected.filter(value => value.point !== null).map(({ item, point }) => point &&
        <Text key={item.name} style={styles.tooltipText}>{item.name}: {formatY(point.y)} · {formatX(point.x)}{point.detail ? ` · ${point.detail}` : ''}</Text>)}</View>
      {firstSeries?.points.length === 1 && <Text style={styles.note}>One recorded point; no chronological trend can be established.</Text>}
      {reduced && <Text style={styles.note}>Extrema-preserving overview. Exact readings use original points; transitions between displayed points are summarized.</Text>}
      {markers.length > 60 && <Text style={styles.note}>First 60 event markers shown; the complete event list is available in Overview.</Text>}
    </>}
    {bounds.count === 0 && <Text style={[styles.axis, styles.xAxis]}>{xLabel}</Text>}
    {interpretation && <Text style={styles.note}>{interpretation}</Text>}
  </View>;
});

function Segment({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length === 0) return null;
  return <View style={{ position: 'absolute', left: (x1 + x2 - length) / 2, top: (y1 + y2) / 2 - .75,
    height: 1.5, width: length, backgroundColor: color,
    transform: [{ rotate: `${Math.atan2(y2 - y1, x2 - x1)}rad` }] }} />;
}

interface BarDatum { label: string; value: number | null; detail?: string }
export function SessionBarChart({ title, xLabel, yLabel, data, formatValue = value => `${value}`,
  emptyText, interpretation }: { title: string; xLabel: string; yLabel: string; data: BarDatum[];
  formatValue?: (value: number) => string; emptyText?: string; interpretation?: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const maximum = Math.ceil(Math.max(1, ...data.map(item => item.value ?? 0)) * 1.2);
  const available = data.some(item => item.value !== null);
  return <View style={styles.card}>
    <Text style={styles.title}>{title}</Text><Text style={styles.axis}>{yLabel}</Text>
    {!available && emptyText ? <Text style={styles.empty}>{emptyText}</Text> : <>
      <View style={styles.chartRow}><View style={styles.yTicks}>{[maximum, maximum / 2, 0].map((value, index) => <Text key={index} style={styles.tick}>{formatValue(value)}</Text>)}</View>
        <View style={styles.bars}>{data.map((item, index) => <Pressable key={item.label} accessibilityRole="button"
          accessibilityLabel={`${item.label}: ${item.value === null ? 'Unavailable' : formatValue(item.value)}`}
          onPress={() => setSelected(index)} style={styles.barColumn}>
          <Text style={styles.barValue}>{item.value === null ? 'N/A' : formatValue(item.value)}</Text>
          <View style={[styles.bar, { height: item.value === null ? 0 : item.value / maximum * HEIGHT, backgroundColor: selected === index ? '#7FAAF1' : '#50D4C5' }]} />
        </Pressable>)}</View>
      </View><View style={styles.categories}>{data.map(item => <Text key={item.label} style={styles.category}>{item.label}</Text>)}</View>
      <Text style={[styles.axis, styles.xAxis]}>{xLabel}</Text>
      {selected !== null && <Text style={styles.tooltipText}>{data[selected].label}: {data[selected].value === null ? 'Unavailable — no completed corrections' : formatValue(data[selected].value ?? 0)}{data[selected].detail ? ` · ${data[selected].detail}` : ''}</Text>}
    </>}
    {!available && emptyText && <Text style={[styles.axis, styles.xAxis]}>{xLabel}</Text>}
    {interpretation && <Text style={styles.note}>{interpretation}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#0D2231', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#183B4E', marginBottom: 14 },
  title: { color: '#F3F7F9', fontSize: 17, fontWeight: '800', marginBottom: 12 },
  axis: { color: '#B6C4CC', fontSize: 11, marginBottom: 10 }, xAxis: { textAlign: 'center', marginTop: 8 },
  chartRow: { flexDirection: 'row' }, yTicks: { width: 58, height: HEIGHT, justifyContent: 'space-between', paddingRight: 6 },
  tick: { color: '#8FA5B3', fontSize: 9 }, plot: { flex: 1, height: HEIGHT, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: '#456172' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#203C4D' },
  xTicks: { marginLeft: 58, marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  cursor: { position: 'absolute', top: 0, bottom: 0, borderLeftWidth: 1, borderLeftColor: '#CDDDE7', opacity: .5 },
  marker: { position: 'absolute', top: 0, bottom: 0, borderLeftWidth: 1, opacity: .25 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }, legendText: { color: '#A9BFCD', fontSize: 10 },
  tooltip: { backgroundColor: '#102B3C', padding: 10, borderRadius: 9, marginTop: 10 },
  tooltipTitle: { color: '#8FA5B3', fontSize: 10, marginBottom: 4 }, tooltipText: { color: '#D2E3EC', fontSize: 11, lineHeight: 17 },
  note: { color: '#8FA5B3', fontSize: 11, lineHeight: 17, marginTop: 10 }, empty: { color: '#A9BFCD', fontSize: 13, paddingVertical: 20, lineHeight: 20 },
  bars: { flex: 1, height: HEIGHT, flexDirection: 'row', borderBottomWidth: 1, borderColor: '#456172', alignItems: 'flex-end' },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 44 },
  bar: { width: '55%', borderTopLeftRadius: 4, borderTopRightRadius: 4 }, barValue: { color: '#D2E3EC', fontSize: 9, marginBottom: 5 },
  categories: { flexDirection: 'row', marginLeft: 58, marginTop: 8 },
  category: { flex: 1, color: '#8FA5B3', fontSize: 9, textAlign: 'center' },
});
