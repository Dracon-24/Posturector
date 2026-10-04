import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HistoryDatum } from '../ui/historyGrouping';

const HEIGHT = 140;
export const HISTORY_COLORS = { primary: '#50D4C5', correction: '#7FAAF1', poor: '#F4A66A' };
interface Props {
  title: string;
  xLabel: string;
  yLabel: string;
  data: HistoryDatum[];
  series: Array<{ name: string; color: string }>;
  kind?: 'bar' | 'line' | 'stacked';
  formatAxis?: (value: number) => string;
  formatValue?: (value: number) => string;
  note?: string;
}
const numeric = (value: number) => Number.isInteger(value) ? `${value}` : value.toFixed(1);

export const HistoryAnalyticsChart = memo(function HistoryAnalyticsChart({ title, xLabel, yLabel,
  data, series, kind = 'bar', formatAxis = numeric, formatValue = numeric, note }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [width, setWidth] = useState(240);
  const selected = data.find(item => item.key === selectedKey);
  const known = data.some(item => item.values.some(value => value !== null));
  const maximum = Math.max(1, ...data.map(item => kind === 'stacked'
    ? item.values.reduce<number>((total, value) => total + (value ?? 0), 0)
    : Math.max(0, ...item.values.map(value => value ?? 0)))) * 1.2;
  const columnWidth = width / Math.max(1, data.length);
  const lineValue = (item: HistoryDatum) => item.values[0];

  return <View style={styles.card}>
    <Text style={styles.title}>{title}</Text><Text style={styles.axis}>{yLabel}</Text>
    {known ? <>
      <View style={styles.row}>
        <View style={styles.yTicks}>{[maximum, maximum / 2, 0].map((value, index) => <Text key={index} style={styles.tick}>{formatAxis(value)}</Text>)}</View>
        <View onLayout={event => setWidth(Math.max(1, event.nativeEvent.layout.width))} style={styles.plot}>
          {[0, .5, 1].map(ratio => <View key={ratio} style={[styles.grid, { top: HEIGHT * ratio }]} />)}
          {kind === 'line' && data.slice(1).map((item, index) => {
            const previous = data[index];
            const a = lineValue(previous), b = lineValue(item);
            if (a === null || b === null) return null;
            const x1 = (index + .5) * columnWidth, x2 = (index + 1.5) * columnWidth;
            const y1 = HEIGHT - a / maximum * HEIGHT, y2 = HEIGHT - b / maximum * HEIGHT;
            const length = Math.hypot(x2 - x1, y2 - y1);
            return <View key={item.key} pointerEvents="none" style={{ position: 'absolute',
              left: (x1 + x2 - length) / 2, top: (y1 + y2) / 2 - .75, width: length, height: 1.5,
              backgroundColor: series[0].color, transform: [{ rotate: `${Math.atan2(y2 - y1, x2 - x1)}rad` }] }} />;
          })}
          <View style={styles.columns}>{data.map(item => {
            const total = item.values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
            const hasValue = item.values.some(value => value !== null);
            const height = total / maximum * HEIGHT;
            return <Pressable key={item.key} accessibilityRole="button"
              accessibilityLabel={`${item.label}: ${item.values.map((value, index) => `${series[index]?.name}: ${value === null ? 'Unavailable' : formatValue(value)}`).join(', ')}`}
              accessibilityState={{ selected: selectedKey === item.key }}
              onPress={() => setSelectedKey(item.key)} style={styles.column}>
              {kind === 'line' ? <>
                {item.values[0] !== null && <View style={[styles.dot, { bottom: item.values[0] / maximum * HEIGHT - 3, backgroundColor: series[0].color }]} />}
                <Text style={[styles.value, { bottom: item.values[0] === null ? 8 : item.values[0] / maximum * HEIGHT + 5 }]}>{item.values[0] === null ? 'N/A' : formatAxis(item.values[0])}</Text>
              </> : <>
                <Text style={[styles.value, { bottom: height + 5 }]}>{hasValue ? formatAxis(total) : 'N/A'}</Text>
                {item.values.map((value, index) => value !== null && <View key={index} style={[styles.bar,
                  { height: value / maximum * HEIGHT, backgroundColor: series[index]?.color ?? HISTORY_COLORS.primary }]} />).reverse()}
              </>}
              {selectedKey === item.key && <View pointerEvents="none" style={styles.selection} />}
            </Pressable>;
          })}</View>
        </View>
      </View>
      <View style={styles.categories}>{data.map(item => <Text key={item.key} style={styles.category}>{item.label}</Text>)}</View>
    </> : <Text style={styles.empty}>No recorded values for the selected period.</Text>}
    <Text style={[styles.axis, styles.xAxis]}>{xLabel}</Text>
    <View style={styles.legend}>{series.map(item => <Text key={item.name} style={[styles.legendText, { color: item.color }]}>● {item.name}</Text>)}</View>
    {selected ? <View style={styles.tooltip}><Text style={styles.tooltipTitle}>{selected.label}{selected.detail ? ` · ${selected.detail}` : ''}</Text>
      {selected.values.map((value, index) => <Text key={index} style={styles.tooltipText}>{series[index]?.name}: {value === null ? 'Unavailable' : formatValue(value)}</Text>)}
    </View> : <Text style={styles.note}>Tap a day or session to inspect exact values. N/A means unavailable, not zero.</Text>}
    {note && <Text style={styles.note}>{note}</Text>}
  </View>;
});

const styles = StyleSheet.create({
  card: { backgroundColor: '#0D2231', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#183B4E', marginBottom: 14 },
  title: { color: '#F3F7F9', fontSize: 17, fontWeight: '800', marginBottom: 12 }, axis: { color: '#B6C4CC', fontSize: 11, marginBottom: 10 }, xAxis: { textAlign: 'center', marginTop: 8 },
  row: { flexDirection: 'row' }, yTicks: { width: 42, height: HEIGHT, justifyContent: 'space-between', paddingRight: 5 }, tick: { color: '#8FA5B3', fontSize: 9 },
  plot: { flex: 1, height: HEIGHT, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: '#456172' }, grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#203C4D' },
  columns: { flex: 1, flexDirection: 'row', alignItems: 'flex-end' }, column: { flex: 1, height: HEIGHT, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '58%' }, value: { position: 'absolute', textAlign: 'center', color: '#D2E3EC', fontSize: 8 }, dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  categories: { flexDirection: 'row', marginLeft: 42, marginTop: 7 }, category: { flex: 1, color: '#8FA5B3', fontSize: 9, textAlign: 'center', textTransform: 'capitalize' },
  selection: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', opacity: .06 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }, legendText: { fontSize: 10 }, tooltip: { backgroundColor: '#102B3C', padding: 10, borderRadius: 9, marginTop: 10 },
  tooltipTitle: { color: '#D2E3EC', fontWeight: '700', fontSize: 11, marginBottom: 4 }, tooltipText: { color: '#D2E3EC', fontSize: 11, lineHeight: 17 }, note: { color: '#8FA5B3', fontSize: 11, lineHeight: 17, marginTop: 10 },
  empty: { color: '#A9BFCD', fontSize: 13, paddingVertical: 20 },
});
