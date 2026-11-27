import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { DonutChart, RankingBars, ViewsChart, type ChartMode } from "../components/charts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  TCell,
  TH,
  THead,
  TRow,
} from "../components/ui";
import { graphql } from "../lib/api";
import { buildDashboardCsv } from "../lib/csv";
import { downloadTextFile } from "../lib/download";
import {
  daysAgoIsoDate,
  endOfUtcDay,
  errorMessage,
  formatDateTime,
  formatDay,
  formatNumber,
  formatPercent,
  startOfUtcDay,
  todayIsoDate,
} from "../lib/format";
import { buildProjectActivity } from "../lib/projects";
import { dashboardSchema } from "../lib/schemas";
import { useToast } from "../lib/toast";

const DASHBOARD_QUERY = `
  query Dashboard($range: DateRangeInput!) {
    pageViews(range: $range) { total points { date value } }
    topPosts(range: $range, limit: 20) { slug title views }
    projectViews(range: $range) { slug views }
    projectClicks(range: $range) { slug clicks }
    outboundClicks(range: $range, limit: 20) { url clicks }
    adMetrics(range: $range) { impressions clicks ctr }
    realtime(window_minutes: 5)
  }
`;

const ranges = [
  { label: "1 d", days: 1 },
  { label: "7 d", days: 7 },
  { label: "14 d", days: 14 },
  { label: "30 d", days: 30 },
  { label: "90 d", days: 90 },
  { label: "1 a", days: 365 },
] as const;

type RangeDays = (typeof ranges)[number]["days"];

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
  const { toast } = useToast();
  const [days, setDays] = useState<RangeDays>(30);
  const [chartMode, setChartMode] = useState<ChartMode>("line");
  const [postSearch, setPostSearch] = useState("");
  const [postLimit, setPostLimit] = useState(10);

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
  const rangeLabel = `${ranges.find((item) => item.days === days)?.label ?? `${days} d`} · ${formatDay(
    range.from.slice(0, 10),
  )} → ${formatDay(range.to.slice(0, 10))}`;

  const filteredPosts = useMemo(() => {
    const term = postSearch.trim().toLowerCase();
    const posts = (data?.topPosts ?? []).filter(
      (post) =>
        !term ||
        post.slug.toLowerCase().includes(term) ||
        (post.title ?? "").toLowerCase().includes(term),
    );
    return posts.slice(0, postLimit);
  }, [data, postSearch, postLimit]);

  const projectActivity = useMemo(() => (data ? buildProjectActivity(data) : []), [data]);

  const topPostsViews = (data?.topPosts ?? []).reduce((sum, post) => sum + post.views, 0);
  const hasTraffic = Boolean(
    data &&
    (data.pageViews.total > 0 ||
      data.realtime > 0 ||
      data.topPosts.length > 0 ||
      data.projectViews.length > 0 ||
      data.projectClicks.length > 0 ||
      data.outboundClicks.length > 0 ||
      data.adMetrics.impressions > 0 ||
      data.adMetrics.clicks > 0),
  );

  const onExport = () => {
    if (!data) return;
    downloadTextFile(
      `ryoko-metricas-${days}d.csv`,
      buildDashboardCsv(data, rangeLabel),
      "text/csv;charset=utf-8",
    );
    toast("CSV exportado.", "success");
  };

  return (
    <div>
      <PageHeader
        eyebrow="Panel"
        title="Métricas"
        description="Tráfico agregado del periodo seleccionado. Sin cookies, sin PII."
        actions={
          <div className="flex flex-wrap gap-1">
            {ranges.map((item) => (
              <Button
                key={item.days}
                size="sm"
                variant={item.days === days ? "primary" : "secondary"}
                onClick={() => setDays(item.days)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-faint">
          {data
            ? `Actualizado ${formatDateTime(new Date(query.dataUpdatedAt).toISOString())} · ${rangeLabel}`
            : rangeLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onExport} disabled={!data}>
            Exportar CSV
          </Button>
          <Button size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? "Actualizando…" : "Actualizar"}
          </Button>
        </div>
      </div>

      {query.isError ? (
        <ErrorBanner message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      {query.isLoading ? <Spinner label="Consultando métricas…" /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Páginas vistas"
              value={formatNumber(data.pageViews.total)}
              detail={ranges.find((item) => item.days === days)?.label ?? `${days} días`}
            />
            <StatCard
              label="Últimos 5 min"
              value={formatNumber(data.realtime)}
              detail="Eventos recibidos"
            />
            <StatCard
              label="Post líder"
              value={topPost ? formatNumber(topPost.views) : "0"}
              detail={topPost?.title ?? topPost?.slug ?? "Sin datos"}
            />
            <StatCard
              label="CTR anuncios"
              value={formatPercent(data.adMetrics.ctr)}
              detail={`${formatNumber(data.adMetrics.clicks)} clicks / ${formatNumber(
                data.adMetrics.impressions,
              )} impresiones`}
            />
          </div>

          {!hasTraffic ? (
            <Card className="mt-4 p-5">
              <EmptyState
                title="Todavía no hay eventos en este periodo"
                description="El dashboard se llena cuando el frontend envía eventos con METRICS_SITE_KEY. Verifica la configuración del sitio y espera el primer tráfico, o cambia a un periodo más amplio."
              />
            </Card>
          ) : (
            <>
              <Card className="mt-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl text-bone">Páginas vistas</h2>
                    <p className="text-xs text-muted">Serie diaria del periodo</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">{formatNumber(data.pageViews.total)} total</Badge>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={chartMode === "line" ? "primary" : "secondary"}
                        onClick={() => setChartMode("line")}
                      >
                        Línea
                      </Button>
                      <Button
                        size="sm"
                        variant={chartMode === "bars" ? "primary" : "secondary"}
                        onClick={() => setChartMode("bars")}
                      >
                        Barras
                      </Button>
                    </div>
                  </div>
                </div>
                <ViewsChart points={data.pageViews.points} mode={chartMode} />
              </Card>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card>
                  <div className="flex items-center justify-between border-b border-line px-5 py-4">
                    <h2 className="font-display text-2xl text-bone">Top posts</h2>
                    <span className="label-mono text-faint">Views</span>
                  </div>
                  <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-3">
                    <label className="min-w-40 flex-1">
                      <span className="sr-only">Buscar post</span>
                      <Input
                        value={postSearch}
                        onChange={(event) => setPostSearch(event.target.value)}
                        placeholder="Buscar por título o slug"
                        className="min-h-9"
                      />
                    </label>
                    <label>
                      <span className="sr-only">Límite de posts</span>
                      <Select
                        value={String(postLimit)}
                        onChange={(event) => setPostLimit(Number(event.target.value))}
                        className="min-h-9 w-28"
                      >
                        <option value="5">Top 5</option>
                        <option value="10">Top 10</option>
                        <option value="20">Top 20</option>
                      </Select>
                    </label>
                  </div>
                  {filteredPosts.length === 0 ? (
                    <EmptyState
                      title="Sin coincidencias"
                      description="Prueba con otro término o cambia el límite."
                    />
                  ) : (
                    <RankingBars
                      items={filteredPosts.map((post) => ({
                        label: post.title ?? post.slug,
                        value: post.views,
                        hint: post.slug,
                      }))}
                    />
                  )}
                </Card>

                <Card className="@container p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-display text-2xl text-bone">Distribución de views</h2>
                      <p className="text-xs text-muted">Top posts del periodo</p>
                    </div>
                    <Badge tone="accent">{formatNumber(topPostsViews)}</Badge>
                  </div>
                  {data.topPosts.length === 0 ? (
                    <EmptyState title="Sin visitas registradas" />
                  ) : (
                    <DonutChart
                      items={data.topPosts.map((post) => ({
                        label: post.title ?? post.slug,
                        value: post.views,
                      }))}
                    />
                  )}
                </Card>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
                    <div>
                      <h2 className="font-display text-2xl text-bone">Proyectos</h2>
                      <p className="text-xs text-muted">Vistas y salidas externas del periodo</p>
                    </div>
                    <span className="label-mono text-faint">Vistas / salidas</span>
                  </div>
                  {projectActivity.length === 0 ? (
                    <EmptyState title="Sin actividad en proyectos" />
                  ) : (
                    <Table
                      caption="Vistas y salidas externas por proyecto"
                      tableClassName="min-w-0"
                    >
                      <THead>
                        <TRow>
                          <TH>Slug</TH>
                          <TH className="whitespace-nowrap text-right">Vistas</TH>
                          <TH className="whitespace-nowrap text-right">Salidas</TH>
                        </TRow>
                      </THead>
                      <tbody>
                        {projectActivity.map((project) => (
                          <TRow key={project.slug}>
                            <TCell>
                              <span className="break-all font-mono text-xs text-bone">
                                {project.slug}
                              </span>
                            </TCell>
                            <TCell className="text-right font-mono text-xs text-muted">
                              {formatNumber(project.views)}
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

                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
                    <h2 className="font-display text-2xl text-bone">Salidas externas</h2>
                    <span className="label-mono text-faint">Top 20</span>
                  </div>
                  {data.outboundClicks.length === 0 ? (
                    <EmptyState title="Sin salidas registradas" />
                  ) : (
                    <Table caption="URLs externas más clickeadas" tableClassName="min-w-0">
                      <THead>
                        <TRow>
                          <TH>URL</TH>
                          <TH className="whitespace-nowrap text-right">Clicks</TH>
                        </TRow>
                      </THead>
                      <tbody>
                        {data.outboundClicks.map((item) => (
                          <TRow key={item.url}>
                            <TCell>
                              <span className="break-all font-mono text-xs text-muted">
                                {item.url}
                              </span>
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
              </div>

              <Card className="mt-4 p-5">
                <h2 className="font-display text-2xl text-bone">Anuncios</h2>
                <p className="mt-1 text-sm text-muted">
                  Métricas de impresiones y clicks del periodo seleccionado.
                </p>
                <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
