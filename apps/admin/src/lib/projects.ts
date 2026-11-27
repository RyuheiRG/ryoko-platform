import type { DashboardData } from "./schemas";

export type ProjectActivity = {
  slug: string;
  views: number;
  clicks: number;
};

export function buildProjectActivity(
  data: Pick<DashboardData, "projectViews" | "projectClicks">,
): ProjectActivity[] {
  const bySlug = new Map<string, ProjectActivity>();

  for (const project of data.projectViews) {
    bySlug.set(project.slug, { slug: project.slug, views: project.views, clicks: 0 });
  }

  for (const project of data.projectClicks) {
    const current = bySlug.get(project.slug);
    if (current) {
      current.clicks = project.clicks;
    } else {
      bySlug.set(project.slug, { slug: project.slug, views: 0, clicks: project.clicks });
    }
  }

  return [...bySlug.values()].sort(
    (left, right) =>
      right.views + right.clicks - (left.views + left.clicks) ||
      right.views - left.views ||
      left.slug.localeCompare(right.slug),
  );
}
