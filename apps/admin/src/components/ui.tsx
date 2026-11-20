import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
} from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border-red bg-red text-ink hover:border-red-bright hover:bg-red-bright",
  secondary: "border-line bg-transparent text-bone hover:border-red hover:text-red-bright",
  ghost: "border-transparent bg-transparent text-muted hover:text-bone",
  danger: "border-red/50 bg-transparent text-red-bright hover:border-red hover:bg-red/10",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1 text-xs",
  md: "min-h-11 px-4 py-2 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-11 w-full border border-line bg-ink px-3 py-2 text-sm text-bone placeholder:text-faint focus:border-red focus:outline-none disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = "",
  rows = 5,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={`w-full border border-line bg-ink px-3 py-2 text-sm text-bone placeholder:text-faint focus:border-red focus:outline-none disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`min-h-11 w-full border border-line bg-ink px-3 py-2 text-sm text-bone focus:border-red focus:outline-none disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label-mono mb-2 block text-muted">{label}</span>
      {children}
      {hint && !error ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-red-bright">{error}</span> : null}
    </label>
  );
}

export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-bone">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--color-red)]"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "accent";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-line text-muted",
  success: "border-success/40 text-success",
  warning: "border-warning/50 text-warning",
  danger: "border-red/60 text-red-bright",
  accent: "border-red/60 bg-red/10 text-red-bright",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "published":
    case "live":
    case "delivered":
      return "success";
    case "wip":
    case "queued":
    case "processing":
      return "warning";
    case "dead_letter":
    case "failed":
    case "error":
      return "danger";
    default:
      return "neutral";
  }
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`border border-line bg-surface ${className}`}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="label-mono mb-2 text-red">{eyebrow}</p> : null}
        <h1 className="font-display text-4xl leading-tight tracking-tight text-bone">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Table({
  children,
  caption,
}: {
  children: ReactNode;
  caption?: string;
}) {
  return (
    <div className="overflow-x-auto border border-line bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-line bg-surface-2 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
      {children}
    </thead>
  );
}

export function TRow({ children }: { children: ReactNode }) {
  return <tr className="border-b border-line last:border-b-0 hover:bg-surface-2">{children}</tr>;
}

export function TCell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}

export function TH({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th scope="col" className={`px-4 py-3 font-medium ${className}`}>
      {children}
    </th>
  );
}

export function Pagination({
  meta,
  onPageChange,
}: {
  meta: { page: number; total_pages: number; total: number; limit: number };
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
      <span className="font-mono uppercase tracking-[0.06em]">
        Página {meta.page} de {Math.max(meta.total_pages, 1)} · {meta.total} elementos
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          Anterior
        </Button>
        <Button
          size="sm"
          disabled={meta.page >= meta.total_pages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

export function Spinner({ label = "Cargando" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-red" />
      {label}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-red/50 bg-red/5 px-4 py-3 text-sm text-red-bright">
      <span>{message}</span>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-line bg-surface px-6 py-12 text-center">
      <p className="font-display text-2xl text-bone">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mt-12 w-full max-w-2xl border border-line bg-surface shadow-2xl shadow-black/60"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-2xl text-bone">{title}</h2>
          <button
            type="button"
            aria-label="Cerrar"
            className="text-xl text-faint transition-colors hover:text-bone"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function FormActions({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-12 animate-pulse border border-line bg-surface" />
      ))}
    </div>
  );
}
