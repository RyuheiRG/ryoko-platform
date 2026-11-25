import { useQuery } from "@tanstack/react-query";

import { api } from "./api";
import { dataSchema, type SiteSettings, siteSettingsSchema } from "./schemas";

const settingsEnvelopeSchema = dataSchema(siteSettingsSchema);

export const FALLBACK_SITE_URL = "https://ryuheirg.dev";

export function useSiteSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const body = await api.get<unknown>("/v1/admin/settings");
      return settingsEnvelopeSchema.parse(body).data;
    },
    staleTime: 5 * 60_000,
  });
}

export function siteBaseUrl(settings?: SiteSettings | null): string {
  return (settings?.url || FALLBACK_SITE_URL).replace(/\/+$/, "");
}

export function absoluteSiteUrl(path: string, settings?: SiteSettings | null): string {
  const base = siteBaseUrl(settings);
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
