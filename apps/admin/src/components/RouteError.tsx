import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";

import { Button } from "./ui";

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Ocurrió un error inesperado.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-lg border border-line bg-surface p-8">
        <p className="label-mono text-red">Error</p>
        <h1 className="mt-3 font-display text-4xl text-bone">Algo se rompió en el camino.</h1>
        <p className="mt-3 break-words text-sm text-muted">{message}</p>
        <Link to="/" className="mt-6 inline-block">
          <Button variant="primary">Volver al panel</Button>
        </Link>
      </div>
    </div>
  );
}
