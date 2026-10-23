interface SparklineProps {
  series: number[];
  color: string;
}

const W = 100;
const H = 36;
const PAD = 3;

/** Decorative line + 10% area; stretches to the cell width (preserveAspectRatio none) with a constant 1.75px stroke. */
export function Sparkline({ series, color }: SparklineProps) {
  const points = series.length > 1 ? series : [series[0] ?? 0, series[0] ?? 0];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const coords = points.map((value, index) => {
    const x = (index / (points.length - 1)) * W;
    const y = span === 0 ? H / 2 : H - PAD - ((value - min) / span) * (H - PAD * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg className="kpi-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <polygon points={`0,${H} ${coords.join(" ")} ${W},${H}`} fill={color} fillOpacity={0.1} />
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
