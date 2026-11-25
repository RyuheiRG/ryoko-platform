import { Badge } from "./ui";
import { absoluteSiteUrl, siteBaseUrl, useSiteSettings } from "../lib/site";

function displayDomain(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}

export function SeoPreview({
  title,
  description,
  path,
  canonical,
  ogImageUrl,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  canonical?: string;
  ogImageUrl?: string | null;
  noindex?: boolean;
}) {
  const settings = useSiteSettings();
  const site = settings.data;
  const url = canonical?.trim() || absoluteSiteUrl(path, site);
  const displayTitle = title.trim() || "Sin título";
  const displayDescription =
    description.trim() || site?.description || "Añade un excerpt o una SEO description.";
  const domain = displayDomain(url || siteBaseUrl(site));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="label-mono text-muted">Vista previa en Google</h3>
        <div className="flex items-center gap-2">
          {noindex ? <Badge tone="danger">noindex</Badge> : null}
          <span
            className={`font-mono text-[11px] ${
              displayTitle.length > 60 ? "text-warning" : "text-faint"
            }`}
          >
            Título {displayTitle.length}/60
          </span>
          <span
            className={`font-mono text-[11px] ${
              displayDescription.length > 160 ? "text-warning" : "text-faint"
            }`}
          >
            Descripción {displayDescription.length}/160
          </span>
        </div>
      </div>

      <div className="border border-line bg-ink p-4">
        <p className="truncate text-xs text-muted">{domain}</p>
        <p className="mt-1 line-clamp-2 text-lg leading-snug text-red-bright">{displayTitle}</p>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{displayDescription}</p>
        <p className="mt-1 truncate font-mono text-[11px] text-success/80">{url}</p>
      </div>

      <div>
        <h3 className="label-mono mb-2 text-muted">Tarjeta social</h3>
        <div className="max-w-md overflow-hidden border border-line bg-ink">
          {ogImageUrl ? (
            <img
              src={ogImageUrl}
              alt=""
              className="aspect-[1.91/1] w-full border-b border-line object-cover"
            />
          ) : (
            <div className="surface-grid flex aspect-[1.91/1] w-full items-center justify-center border-b border-line bg-crimson/25">
              <span className="font-display text-4xl text-bone/80">
                Ryoko<span className="text-red">.</span>
              </span>
            </div>
          )}
          <div className="p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">{domain}</p>
            <p className="mt-1 line-clamp-2 font-display text-xl leading-tight text-bone">
              {displayTitle}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
              {displayDescription}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
