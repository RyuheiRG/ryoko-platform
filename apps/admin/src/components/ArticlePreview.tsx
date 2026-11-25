import { lazy, Suspense, useMemo } from "react";

import { formatDate } from "../lib/format";
import { countWords, readingMinutes } from "../lib/markdown";
import { Badge, Spinner } from "./ui";

const MarkdownPreview = lazy(() => import("./MarkdownPreview"));

export function ArticlePreview({
  title,
  excerpt,
  markdown,
  coverUrl,
  coverAlt,
  authorName,
  publishedAt,
  tags = [],
  kind = "post",
  meta = [],
}: {
  title: string;
  excerpt?: string;
  markdown: string;
  coverUrl?: string | null;
  coverAlt?: string | null;
  authorName?: string;
  publishedAt?: string | null;
  tags?: string[];
  kind?: "post" | "project";
  meta?: string[];
}) {
  const words = useMemo(() => countWords(markdown), [markdown]);
  const minutes = readingMinutes(words);

  return (
    <article className="mx-auto max-w-3xl">
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={coverAlt ?? title}
          className="aspect-[16/9] w-full border border-line object-cover"
        />
      ) : (
        <div className="surface-grid flex aspect-[16/9] w-full items-center justify-center border border-line bg-crimson/30">
          <span className="font-display text-6xl text-bone/80">
            Ryoko<span className="text-red">.</span>
          </span>
        </div>
      )}

      <header className="mt-6">
        <p className="label-mono text-red">{kind === "project" ? "Caso de estudio" : "Artículo"}</p>
        <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight text-bone sm:text-5xl">
          {title || "Sin título"}
        </h1>
        {excerpt ? <p className="mt-3 text-base leading-relaxed text-muted">{excerpt}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-faint">
          {authorName ? <span>{authorName}</span> : null}
          {publishedAt ? <span>{formatDate(publishedAt)}</span> : null}
          <span>{minutes} min de lectura</span>
          {meta.map((item, index) => (
            <span key={`${item}-${index}`} className="font-mono uppercase tracking-[0.06em]">
              {item}
            </span>
          ))}
        </div>

        {tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag, index) => (
              <Badge key={`${tag}-${index}`}>{tag}</Badge>
            ))}
          </div>
        ) : null}
      </header>

      <div className="markdown-body mt-8 border-t border-line pt-8">
        <Suspense fallback={<Spinner label="Cargando preview…" />}>
          <MarkdownPreview markdown={markdown} />
        </Suspense>
      </div>
    </article>
  );
}
