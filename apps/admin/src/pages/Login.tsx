import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { Button, Field, Input } from "../components/ui";
import { useAuth } from "../lib/auth";
import { errorMessage } from "../lib/format";

export function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("hola@ryuheirg.dev");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) {
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="surface-grid relative hidden overflow-hidden bg-crimson p-10 lg:flex lg:flex-col lg:justify-between">
        <p className="label-mono text-ink/70">Ryoko / Karasu</p>
        <div>
          <h1 className="font-display text-[clamp(4rem,8vw,8rem)] leading-[0.9] tracking-tight text-bone">
            Control
            <br />
            editorial.
          </h1>
          <p className="mt-6 max-w-md text-base text-bone/80">
            Publica, programa y audita el contenido del sitio. Un solo lugar para posts,
            proyectos, media y métricas.
          </p>
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink/60">
          Don&apos;t trust, verify.
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <p className="label-mono text-red">Acceso restringido</p>
          <h2 className="mt-3 font-display text-5xl leading-none tracking-tight text-bone">
            Ryoko<span className="text-red">.</span>
          </h2>
          <p className="mt-3 text-sm text-muted">
            Inicia sesión con tu cuenta de administrador o editor.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Field label="Correo">
              <Input
                type="email"
                name="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Contraseña">
              <Input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {error ? (
              <p className="border border-red/50 bg-red/5 px-3 py-2 text-sm text-red-bright">
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <p className="mt-8 border-t border-line pt-4 text-xs text-faint">
            Sesión protegida con JWT + refresh token rotativo.
          </p>
        </div>
      </section>
    </div>
  );
}
