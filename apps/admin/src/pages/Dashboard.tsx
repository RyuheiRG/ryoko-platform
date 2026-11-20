import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
  Table,
  TCell,
  TH,
  THead,
  TRow,
} from "../components/ui";
import { graphql } from "../lib/api";
import {
  daysAgoIsoDate,
  endOfUtcDay,
  errorMessage,
  formatDay,
  formatNumber,
  formatPercent,
  startOfUtcDay,
  todayIsoDate,
} from "../lib/format";
import { type DashboardData, dashboardSchema } from "../lib/schemas";

const DASHBOARD_QUERY = `
  query Dashboard($range: DateRangeInput!) {
    pageViews(range: $range) { total points { date value } }
    topPosts(range: $range, limit: 8) { slug title views }
    projectClicks(range: $range) { slug clicks }
    outboundClicks(range: $range, limit: 8) { url clicks }
    adMetrics(range: $range) { impressions clicks ctr }
    realtime(window_minutes: 5)
  }
`;

const ranges = [7, 30, 90] as const;

function ViewsChart({ points }: { points: DashboardData["pageViews"]["points"] }) {
  const width = 720;
  const height = 220;
  const pad = 24;
  const max = Math.max(1, ...points.map((point) => point.value));
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;

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
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-56 w-full"
        role="img"
        aria-label="Serie de páginas vistas por día"
      >
        <title>Páginas vistas por día</title>
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
          <circle key={point.date} cx={point.x} cy={point.y} r="2.5" fill="var(--color-red-bright)">
            <title>
              {formatDay(point.date)}: {formatNumber(point.value)}
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[11px] uppercase tracking-[0.06em] text-faint">
        <span>{points[0] ? formatDay(points[0].date) : "—"}</span>
        <span>{points[points.length - 1] ? formatDay(points[points.length - 1]!.date) : "—"}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card className="p-5">
      <p className="label-mono text-faint">{label}</p>
      <p className="mt-3 font-display text-4xl leading-none text-bone">{value}</p>
      {detail ? <p className="mt-2 text-xs text-muted">{detail}</p> : null}
    </Card>
  );
}

export function DashboardPage() {
  const [days, setDays] = useState<(typeof ranges)[number]>(30);
  const range = useMemo(
    () => ({
      from: startOfUtcDay(daysAgoIsoDate(days - 1)),
      to: endOfUtcDay(todayIsoDate()),
    }),
    [days],
  );

  const query = useQuery({
    queryKey: ["dashboard", range.from, range.to],
    queryFn: async () => {
      const data = await graphql<unknown>(DASHBOARD_QUERY, { range });
      return dashboardSchema.parse(data);
    },
  });

  const data = query.data;
  const topPost = data?.topPosts[0];

  return (
    <div>
      <PageHeader
        eyebrow="Panel"
        title="Métricas"
        description="Tráfico agregado de los últimos días. Sin cookies, sin PII."
        actions={
          <div className="flex gap-1">
            {ranges.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={value === days ? "primary" : "secondary"}
                onClick={() => setDays(value)}
              >
                {value} d
              </Button>
            ))}
          </div>
        }
      />

      {query.isError ? (
        <ErrorBanner message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      {query.isLoading ? <Spinner label="Consultando métricas…" /> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Páginas vistas"
              value={formatNumber(data.pageViews.total)}
              detail={`${days} días`}
            />
            <StatCard
              label="Últimos 5 min"
              value={formatNumber(data.realtime)}
              detail="Eventos recibidos"
            />
            <StatCard
              label="Post líder"
              value={topPost ? formatNumber(topPost.views) : "0"}
              detail={topPost?.slug ?? "Sin datos"}
            />
            <StatCard
              label="CTR anuncios"
              value={formatPercent(data.adMetrics.ctr)}
              detail={`${formatNumber(data.adMetrics.clicks)} clicks / ${formatNumber(
                data.adMetrics.impressions,
              )} impresiones`}
            />
          </div>

          <Card className="mt-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-2xl text-bone">Páginas vistas</h2>
              <Badge tone="accent">{formatNumber(data.pageViews.total)} total</Badge>
            </div>
            <ViewsChart points={data.pageViews.points} />
          </Card>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="font-display text-2xl text-bone">Top posts</h2>
                <span className="label-mono text-faint">Views</span>
              </div>
              {data.topPosts.length === 0 ? (
                <EmptyState title="Sin visitas registradas" />
              ) : (
                <Table caption="Posts con más visitas">
                  <THead>
                    <TRow>
                      <TH>Slug</TH>
                      <TH className="text-right">Views</TH>
                    </TRow>
                  </THead>
                  <tbody>
                    {data.topPosts.map((post) => (
                      <TRow key={post.slug}>
                        <TCell>
                          <span className="font-mono text-xs text-bone">{post.slug}</span>
                        </TCell>
                        <TCell className="text-right font-mono text-xs text-red-bright">
                          {formatNumber(post.views)}
                        </TCell>
                      </TRow>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="font-display text-2xl text-bone">Clicks por proyecto</h2>
                <span className="label-mono text-faint">Salidas</span>
              </div>
              {data.projectClicks.length === 0 ? (
                <EmptyState title="Sin clicks salientes" />
              ) : (
                <Table caption="Clicks salientes por proyecto">
                  <THead>
                    <TRow>
                      <TH>Proyecto</TH>
                      <TH className="text-right">Clicks</TH>
                    </TRow>
                  </THead>
                  <tbody>
                    {data.projectClicks.map((project) => (
                      <TRow key={project.slug}>
                        <TCell>
                          <span className="font-mono text-xs text-bone">{project.slug}</span>
                        </TCell>
                        <TCell className="text-right font-mono text-xs text-red-bright">
                          {formatNumber(project.clicks)}
                        </TCell>
                      </TRow>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="font-display text-2xl text-bone">Salidas externas</h2>
                <span className="label-mono text-faint">Top 8</span>
              </div>
              {data.outboundClicks.length === 0 ? (
                <EmptyState title="Sin salidas registradas" />
              ) : (
                <Table caption="URLs externas más clickeadas">
                  <THead>
                    <TRow>
                      <TH>URL</TH>
                      <TH className="text-right">Clicks</TH>
                    </TRow>
                  </THead>
                  <tbody>
                    {data.outboundClicks.map((item) => (
                      <TRow key={item.url}>
                        <TCell>
                          <span className="break-all font-mono text-xs text-muted">{item.url}</span>
                        </TCell>
                        <TCell className="text-right font-mono text-xs text-red-bright">
                          {formatNumber(item.clicks)}
                        </TCell>
                      </TRow>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="font-display text-2xl text-bone">Anuncios</h2>
              <p className="mt-1 text-sm text-muted">
                Métricas de impresiones y clicks del periodo seleccionado.
              </p>
              <dl className="mt-6 grid grid-cols-3 gap-3">
                <div className="border border-line bg-ink p-4">
                  <dt className="label-mono text-faint">Impr.</dt>
                  <dd className="mt-2 font-display text-3xl text-bone">
                    {formatNumber(data.adMetrics.impressions)}
                  </dd>
                </div>
                <div className="border border-line bg-ink p-4">
                  <dt className="label-mono text-faint">Clicks</dt>
                  <dd className="mt-2 font-display text-3xl text-bone">
                    {formatNumber(data.adMetrics.clicks)}
                  </dd>
                </div>
                <div className="border border-line bg-ink p-4">
                  <dt className="label-mono text-faint">CTR</dt>
                  <dd className="mt-2 font-display text-3xl text-red-bright">
                    {formatPercent(data.adMetrics.ctr)}
                  </dd>
                </div>
              </dl>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

