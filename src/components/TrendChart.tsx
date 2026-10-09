// Line chart of one marker over time with the printed reference range of the latest report drawn as
// a shaded band (react-native-gifted-charts). It plots recorded values only; points are not
// coloured or marked by where they fall against the range (CLAUDE.md guardrail 4). Results printed
// as words have no place on a number line; the marker screen lists them instead.
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { chartScale, groupByUnit, latestRange, shortDate } from '../dashboard/chartData';
import type { SeriesPoint } from '../db';
import { useDateOrder } from '../state/ActiveProfile';
import { formatDate } from '../utils/dates';

const HEIGHT = 180;
const Y_LABEL_WIDTH = 44;
const LINE = '#6A5FDB';
const BAND = 'rgba(106, 95, 219, 0.12)';
const BOUND = 'rgba(106, 95, 219, 0.55)';

export default function TrendChart({ points }: { points: SeriesPoint[] }) {
  const [width, setWidth] = useState(0);
  const order = useDateOrder();
  const { main, unit, other } = groupByUnit(points);
  const { low, high } = latestRange(main);
  const scale = chartScale([...main.map((p) => p.value), ...[low, high].filter((v): v is number => v != null)]);
  const span = scale.max - scale.min;
  const plotWidth = Math.max(0, width - Y_LABEL_WIDTH - 16);
  const spacing = main.length > 1 ? Math.max(36, (plotWidth - 24) / (main.length - 1)) : plotWidth / 2;

  const bound = (v: number | null) => ({
    show: v != null,
    position: v ?? 0,
    config: { color: BOUND, dashWidth: 4, dashGap: 4, thickness: 1, width: plotWidth, labelText: v != null ? String(v) : '', labelTextStyle: styles.boundLabel },
  });
  const lowLine = bound(low);
  const highLine = bound(high);
  const band = low != null && high != null && high > low;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel="Trend chart">
      {width > 0 && main.length > 0 && (
        <LineChart
          data={main.map((p) => ({ value: p.value, label: shortDate(p.date, order), dataPointText: String(p.value) }))}
          height={HEIGHT}
          width={plotWidth}
          spacing={spacing}
          initialSpacing={main.length > 1 ? 12 : plotWidth / 2}
          endSpacing={12}
          yAxisOffset={scale.min}
          maxValue={span}
          stepValue={scale.step}
          noOfSections={scale.sections}
          yAxisLabelWidth={Y_LABEL_WIDTH}
          yAxisTextStyle={styles.axis}
          xAxisLabelTextStyle={styles.axis}
          formatYLabel={(l) => String(Number(Number(l).toPrecision(6)))}
          color={LINE}
          thickness={3}
          curved
          curvature={0.15}
          dataPointsColor={LINE}
          dataPointsRadius={5}
          textColor="#25233A"
          textFontSize={11}
          textShiftY={-6}
          rulesColor="#EEEBFA"
          showReferenceLine1={lowLine.show}
          referenceLine1Position={lowLine.position}
          referenceLine1Config={lowLine.config}
          showReferenceLine2={highLine.show}
          referenceLine2Position={highLine.position}
          referenceLine2Config={highLine.config}
          // A solid "line" as tall as the range, drawn up from the low bound, shades the band.
          showReferenceLine3={band}
          referenceLine3Position={low ?? 0}
          referenceLine3Config={{
            color: BAND,
            type: 'solid',
            thickness: band ? ((high! - low!) * HEIGHT) / span : 0,
            width: plotWidth,
            zIndex: -1,
          }}
          disableScroll={main.length * 36 < plotWidth}
          isAnimated={false}
        />
      )}
      <Text style={styles.caption}>
        {unit ? `Unit: ${unit}. ` : ''}
        {low != null || high != null ? 'Shaded: range printed on the latest report.' : 'No range was printed on the latest report.'}
      </Text>
      {other.length > 0 && (
        <Text style={styles.caption}>
          Not plotted (different unit): {other.map((p) => `${p.value} ${p.unit ?? ''} on ${formatDate(p.date, order)}`.trim()).join('; ')}.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { fontSize: 10, color: '#8C89A6' },
  boundLabel: { fontSize: 9, color: BOUND, top: -12, left: 2 },
  caption: { fontSize: 12, color: '#5E5B78', marginTop: 6 },
});
