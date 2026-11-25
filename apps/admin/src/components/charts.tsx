import { formatDay, formatNumber, formatPercent } from "../lib/format";

export type ChartMode = "line" | "bars";

interface ViewsPoint {
  date: string;
  value: number;
}

export function ViewsChart({ points, mode }: { points: ViewsPoint[]; mode: ChartMode }) {
  const width = 720;
  const height = 220;
  const pad = 24;
  const max = Math.max(1, ...points.map((point) => point.value));
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const barStep = points.length > 0 ? (width - pad * 2) / points.length : 0;

  const coords = points.map((point, index) => {
    const x = pad + step * index;
    const y = height - pad - (point.value / max) * (height - pad * 2);
    return { x, y, ...point };
  });

  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area =
    first && last
      ? `M ${first.x},${height - pad} ${coords
          .map((point) => `L ${point.x},${point.y}`)
          .join(" ")} L ${last.x},${height - pad} Z`
      : "";

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-56 w-full"
        role="img"
        aria-labelledby="views-chart-title views-chart-desc"
      >
        <title id="views-chart-title">Páginas vistas por día</title>
        <desc id="views-chart-desc">
          Serie de {points.length} días. Máximo {formatNumber(max)} vistas.
        </desc>

        {[0, 1, 2, 3].map((lineIndex) => {
          const y = pad + ((height - pad * 2) / 3) * lineIndex;
          return (
            <line
              key={lineIndex}
              x1={pad}
              y1={y}
              x2={width - pad}
              y2={y}
              stroke="var(--color-line)"
              strokeWidth="1"
            />
          );
        })}

        <text x={pad} y={pad - 6} fill="var(--color-faint)" fontSize="10">
          {formatNumber(max)}
        </text>

        {mode === "line" ? (
          <>
            {area ? <path d={area} fill="var(--color-red)" opacity="0.08" /> : null}
            {coords.length > 1 ? (
              <polyline
                points={line}
                fill="none"
                stroke="var(--color-red)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            ) : null}
            {coords.map((point) => (
              <circle
                key={point.date}
                cx={point.x}
                cy={point.y}
                r="2.5"
                fill="var(--color-red-bright)"
              >
                <title>
                  {formatDay(point.date)}: {formatNumber(point.value)}
                </title>
              </circle>
            ))}
          </>
        ) : (
          points.map((point, index) => {
            const barHeight = (point.value / max) * (height - pad * 2);
            const barWidth = Math.max(1, barStep * 0.68);
            return (
              <rect
                key={point.date}
                x={pad + index * barStep + barStep * 0.16}
                y={height - pad - barHeight}
                width={barWidth}
                height={barHeight}
                fill="var(--color-red)"
                opacity={point.value === 0 ? 0.15 : 0.85}
              >
                <title>
                  {formatDay(point.date)}: {formatNumber(point.value)}
                </title>
              </rect>
            );
          })
        )}
      </svg>

      <div className="mt-1 flex justify-between font-mono text-[11px] uppercase tracking-[0.06em] text-faint">
        <span>{points[0] ? formatDay(points[0].date) : "—"}</span>
        <span>{points[points.length - 1] ? formatDay(points[points.length - 1]!.date) : "—"}</span>
      </div>

      <table className="sr-only">
        <caption>Páginas vistas por día</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Vistas</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <td>{point.date}</td>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const donutColors = [
  "var(--color-red)",
  "var(--color-red-bright)",
  "var(--color-warning)",
  "var(--color-success)",
  "var(--color-muted)",
  "var(--color-faint)",
];

function colorAt(index: number): string {
  return donutColors[index % donutColors.length] ?? donutColors[0] ?? "var(--color-red)";
}

export function DonutChart({
  items,
  maxSegments = 6,
}: {
  items: Array<{ label: string; value: number }>;
  maxSegments?: number;
}) {
  const sorted = [...items].sort((left, right) => right.value - left.value);
  const total = sorted.reduce((sum, item) => sum + item.value, 0);
  const shown =
    sorted.length > maxSegments
      ? [
          ...sorted.slice(0, maxSegments - 1),
          {
            label: "Otros",
            value: sorted.slice(maxSegments - 1).reduce((sum, item) => sum + item.value, 0),
          },
        ]
      : sorted;

  const size = 160;
  const center = size / 2;
  const radius = 56;
  const stroke = 18;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-40 w-40 shrink-0"
        role="img"
        aria-label="Distribución de vistas por post"
      >
        <title>Distribución de vistas por post</title>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <g transform={`rotate(-90 ${center} ${center})`}>
          {shown.map((item, index) => {
            const fraction = total > 0 ? item.value / total : 0;
            const dash = fraction * circumference;
            const segment = (
              <circle
                key={item.label}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={colorAt(index)}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return segment;
          })}
        </g>
        <text
          x={center}
          y={center - 2}
          textAnchor="middle"
          fill="var(--color-bone)"
          fontSize="22"
          fontFamily="var(--font-display)"
        >
          {formatNumber(total)}
        </text>
        <text
          x={center}
          y={center + 15}
          textAnchor="middle"
          fill="var(--color-faint)"
          fontSize="9"
          letterSpacing="1"
        >
          VIEWS
        </text>
      </svg>

      <ul className="w-full space-y-2">
        {shown.map((item, index) => (
          <li key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0"
                style={{ backgroundColor: colorAt(index) }}
                aria-hidden="true"
              />
              <span className="truncate text-muted">{item.label}</span>
            </span>
            <span className="shrink-0 font-mono text-xs text-bone">
              {formatNumber(item.value)}{" "}
              <span className="text-faint">
                ({formatPercent(total > 0 ? item.value / total : 0)})
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RankingBars({
  items,
  emptyLabel = "Sin datos para este periodo.",
}: {
  items: Array<{ label: string; value: number; hint?: string }>;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="px-5 py-8 text-sm text-muted">{emptyLabel}</p>;
  }

  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <ul className="space-y-3 px-5 py-4">
      {items.map((item) => (
        <li key={`${item.label}-${item.hint ?? ""}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-bone">{item.label}</span>
            <span className="shrink-0 font-mono text-xs text-red-bright">
              {formatNumber(item.value)}
            </span>
          </div>
          {item.hint ? <p className="truncate text-[11px] text-faint">{item.hint}</p> : null}
          <div className="mt-1 h-1.5 w-full bg-ink" aria-hidden="true">
            <div
              className="h-full bg-red"
              style={{
                width: item.value <= 0 ? "0%" : `${Math.max(1, (item.value / max) * 100)}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
