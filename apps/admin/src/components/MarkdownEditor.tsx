import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  applyMarkdownAction,
  countWords,
  extractHeadings,
  type MarkdownAction,
  readingMinutes,
} from "../lib/markdown";
import { Spinner } from "./ui";

const MarkdownPreview = lazy(() => import("./MarkdownPreview"));

type EditorMode = "write" | "split" | "preview";

const toolbarGroups: Array<Array<{ action: MarkdownAction; label: string; title: string }>> = [
  [
    { action: "h2", label: "H2", title: "Encabezado nivel 2" },
    { action: "h3", label: "H3", title: "Encabezado nivel 3" },
  ],
  [
    { action: "bold", label: "B", title: "Negrita (Ctrl/Cmd+B)" },
    { action: "italic", label: "I", title: "Cursiva (Ctrl/Cmd+I)" },
    { action: "code", label: "`", title: "Código inline" },
    { action: "link", label: "Link", title: "Enlace (Ctrl/Cmd+K)" },
  ],
  [
    { action: "ul", label: "• Lista", title: "Lista sin orden" },
    { action: "ol", label: "1. Lista", title: "Lista ordenada" },
    { action: "quote", label: "❝", title: "Cita" },
    { action: "codeblock", label: "```", title: "Bloque de código" },
    { action: "hr", label: "—", title: "Separador" },
  ],
];

const modeLabels: Array<{ mode: EditorMode; label: string }> = [
  { mode: "write", label: "Escribir" },
  { mode: "split", label: "Dividir" },
  { mode: "preview", label: "Preview" },
];

export function MarkdownEditor({
  value,
  onChange,
  label = "Contenido Markdown",
  hint = "CommonMark + GFM. El título va arriba, no dentro del contenido.",
  rows = 24,
  disabled = false,
  actions,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  rows?: number;
  disabled?: boolean;
  actions?: ReactNode;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<EditorMode>("write");
  const [tocOpen, setTocOpen] = useState(false);
  const [pendingHeading, setPendingHeading] = useState<string | null>(null);

  const headings = useMemo(() => extractHeadings(value), [value]);
  const words = useMemo(() => countWords(value), [value]);
  const minutes = readingMinutes(words);

  useEffect(() => {
    if (!pendingHeading || mode === "write") return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const container = previewRef.current;
      const target = container?.querySelector<HTMLElement>(`#${CSS.escape(pendingHeading)}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        setPendingHeading(null);
        window.clearInterval(timer);
        return;
      }
      if (attempts > 20) {
        setPendingHeading(null);
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [pendingHeading, mode]);

  const applyAction = (action: MarkdownAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = applyMarkdownAction(
      value,
      textarea.selectionStart,
      textarea.selectionEnd,
      action,
    );
    onChange(result.value);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      applyAction("bold");
    } else if (key === "i") {
      event.preventDefault();
      applyAction("italic");
    } else if (key === "k") {
      event.preventDefault();
      applyAction("link");
    }
  };

  const jumpToHeading = (headingId: string) => {
    setPendingHeading(headingId);
    setMode((current) => (current === "write" ? "preview" : current));
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <label htmlFor={id} className="label-mono block text-muted">
            {label}
          </label>
          {hint ? (
            <p id={`${id}-hint`} className="mt-1 text-xs text-faint">
              {hint}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      <div className="border border-line bg-ink focus-within:border-line-strong">
        <div className="flex flex-wrap items-center gap-1 border-b border-line bg-surface-2 px-2 py-2">
          {toolbarGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="flex items-center gap-0.5">
              {groupIndex > 0 ? (
                <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
              ) : null}
              {group.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  title={item.title}
                  aria-label={item.title}
                  disabled={disabled}
                  onClick={() => applyAction(item.action)}
                  className="inline-flex h-8 min-w-8 items-center justify-center border border-transparent px-2 font-mono text-[11px] uppercase tracking-[0.04em] text-muted transition-colors hover:border-line-strong hover:text-bone disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}

          <div className="ml-auto flex items-center gap-1">
            {modeLabels.map((item) => (
              <button
                key={item.mode}
                type="button"
                aria-pressed={mode === item.mode}
                onClick={() => setMode(item.mode)}
                className={`h-8 border px-2 font-mono text-[11px] uppercase tracking-[0.04em] transition-colors ${
                  mode === item.mode
                    ? "border-red bg-red/10 text-red-bright"
                    : "border-line text-muted hover:border-line-strong hover:text-bone"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {tocOpen ? (
          <nav aria-label="Índice del documento" className="border-b border-line bg-ink px-3 py-3">
            {headings.length === 0 ? (
              <p className="text-xs text-faint">
                Añade encabezados con <code className="font-mono text-muted">##</code> o{" "}
                <code className="font-mono text-muted">###</code> para generar el índice.
              </p>
            ) : (
              <ol className="max-h-44 space-y-1 overflow-y-auto">
                {headings.map((heading) => (
                  <li
                    key={heading.id}
                    style={{ paddingLeft: `${Math.max(0, heading.level - 1) * 12}px` }}
                  >
                    <button
                      type="button"
                      onClick={() => jumpToHeading(heading.id)}
                      className="text-left text-xs text-muted transition-colors hover:text-red-bright"
                    >
                      {heading.text}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </nav>
        ) : null}

        <div className={mode === "split" ? "grid xl:grid-cols-2" : ""}>
          {mode !== "preview" ? (
            <div
              className={`min-w-0 ${
                mode === "split" ? "border-b border-line xl:border-b-0 xl:border-r" : ""
              }`}
            >
              <textarea
                ref={textareaRef}
                id={id}
                rows={rows}
                value={value}
                disabled={disabled}
                spellCheck
                aria-describedby={hint ? `${id}-hint` : undefined}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="# Escribe el contenido…"
                className="min-h-[420px] w-full resize-y bg-ink p-4 font-mono text-xs leading-relaxed text-bone placeholder:text-faint focus:outline-none disabled:opacity-50 xl:min-h-[560px]"
              />
            </div>
          ) : null}

          {mode !== "write" ? (
            <div
              ref={previewRef}
              className="markdown-body min-h-[420px] max-h-[75vh] min-w-0 overflow-y-auto p-5 xl:min-h-[560px]"
            >
              <Suspense fallback={<Spinner label="Cargando preview…" />}>
                <MarkdownPreview markdown={value} />
              </Suspense>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-[11px] text-faint">
          <span className="font-mono uppercase tracking-[0.06em]">
            {words} palabras · {minutes} min de lectura · {value.length} caracteres
          </span>
          <button
            type="button"
            aria-expanded={tocOpen}
            onClick={() => setTocOpen((current) => !current)}
            className="font-mono uppercase tracking-[0.06em] text-muted transition-colors hover:text-bone"
          >
            Índice ({headings.length})
          </button>
        </div>
      </div>
    </div>
  );
}
