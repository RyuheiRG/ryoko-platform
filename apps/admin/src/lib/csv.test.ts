import { describe, expect, it } from "vitest";

import { buildDashboardCsv, toCsv } from "./csv";
import type { DashboardData } from "./schemas";

const data: DashboardData = {
  pageViews: {
    total: 42,
    points: [
      { date: "2026-11-22", value: 20 },
      { date: "2026-11-23", value: 22 },
    ],
  },
  topPosts: [{ slug: "hola-mundo", title: "Hola, mundo", views: 22 }],
  projectViews: [{ slug: "ryoko", views: 5 }],
  projectClicks: [{ slug: "ryoko", clicks: 3 }],
  outboundClicks: [{ url: "https://example.com?a=1&b=2", clicks: 1 }],
  adMetrics: { impressions: 100, clicks: 4, ctr: 0.04 },
  realtime: 2,
};

describe("toCsv", () => {
  it("escapa comas, comillas y saltos de línea", () => {
    const csv = toCsv([
      ["simple", 1],
      ["con, coma", 'con "comillas"'],
      ["multilínea\nok", null],
    ]);

    expect(csv).toBe(
      ["simple,1", '"con, coma","con ""comillas"""', '"multilínea\nok",'].join("\r\n"),
    );
  });
});

describe("buildDashboardCsv", () => {
  it("incluye BOM, resumen y todas las secciones", () => {
    const csv = buildDashboardCsv(data, "30 d", new Date("2026-11-23T12:00:00Z"));

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Resumen");
    expect(csv).toContain("Páginas vistas,42");
    expect(csv).toContain("2026-11-22,20");
    expect(csv).toContain('hola-mundo,"Hola, mundo",22');
    expect(csv).toContain("ryoko,5,3");
    expect(csv).toContain("https://example.com?a=1&b=2,1");
    expect(csv).toContain("CTR de anuncios,0.04");
  });
});
