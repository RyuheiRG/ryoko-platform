import { describe, expect, it } from "vitest";

import { buildProjectActivity } from "./projects";

describe("buildProjectActivity", () => {
  it("une vistas y salidas por slug y ordena por actividad", () => {
    const activity = buildProjectActivity({
      projectViews: [
        { slug: "secureup", views: 3 },
        { slug: "vaca-cubica", views: 7 },
      ],
      projectClicks: [
        { slug: "secureup", clicks: 2 },
        { slug: "frame-data-bayes", clicks: 4 },
      ],
    });

    expect(activity).toEqual([
      { slug: "vaca-cubica", views: 7, clicks: 0 },
      { slug: "secureup", views: 3, clicks: 2 },
      { slug: "frame-data-bayes", views: 0, clicks: 4 },
    ]);
  });
});
