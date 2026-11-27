import { buildProjectActivity } from "./projects";
import type { DashboardData } from "./schemas";

export type CsvValue = string | number | null | undefined;

function escapeCsv(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
}

export function buildDashboardCsv(
  data: DashboardData,
  rangeLabel: string,
  generatedAt = new Date(),
): string {
  const sections: CsvValue[][][] = [
    [["Ryoko CMS — métricas"], ["Periodo", rangeLabel], ["Generado", generatedAt.toISOString()]],
    [
      ["Resumen"],
      ["Métrica", "Valor"],
      ["Páginas vistas", data.pageViews.total],
      ["Últimos 5 min", data.realtime],
      ["Impresiones de anuncios", data.adMetrics.impressions],
      ["Clicks de anuncios", data.adMetrics.clicks],
      ["CTR de anuncios", data.adMetrics.ctr],
    ],
    [
      ["Páginas vistas por día"],
      ["Fecha", "Vistas"],
      ...data.pageViews.points.map((point) => [point.date, point.value]),
    ],
    [
      ["Top posts"],
      ["Slug", "Título", "Vistas"],
      ...data.topPosts.map((post) => [post.slug, post.title ?? "", post.views]),
    ],
    [
      ["Proyectos"],
      ["Slug", "Vistas", "Salidas"],
      ...buildProjectActivity(data).map((project) => [
        project.slug,
        project.views,
        project.clicks,
      ]),
    ],
    [
      ["Salidas externas"],
      ["URL", "Clicks"],
      ...data.outboundClicks.map((item) => [item.url, item.clicks]),
    ],
  ];

  return `\uFEFF${sections.map(toCsv).join("\r\n\r\n")}\r\n`;
}
