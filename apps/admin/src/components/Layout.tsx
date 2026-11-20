import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../lib/auth";

const groups: Array<{ label: string; links: Array<{ to: string; label: string }> }> = [
  {
    label: "Panel",
    links: [{ to: "/", label: "Métricas" }],
  },
  {
    label: "Contenido",
    links: [
      { to: "/posts", label: "Posts" },
      { to: "/projects", label: "Proyectos" },
      { to: "/tags", label: "Tags" },
      { to: "/media", label: "Media" },
      { to: "/documents", label: "Documentos" },
    ],
  },
  {
    label: "Sitio",
    links: [
      { to: "/landing", label: "Landing" },
      { to: "/settings", label: "Ajustes" },
      { to: "/redirects", label: "Redirects" },
    ],
  },
  {
    label: "Sistema",
    links: [{ to: "/webhooks", label: "Webhooks" }],
  },
];

const allLinks = groups.flatMap((group) => group.links);

function linkClass(active: boolean, mobile = false): string {
  if (mobile) {
    return `shrink-0 border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors ${
      active
        ? "border-red bg-red/10 text-red-bright"
        : "border-line text-muted hover:border-line-strong hover:text-bone"
    }`;
  }
  return `border-l-2 py-2 pl-3 text-sm transition-colors ${
    active
      ? "border-red text-bone"
      : "border-transparent text-muted hover:border-line-strong hover:text-bone"
  }`;
}

function Brand() {
  return (
    <div className="px-5 py-6">
      <p className="font-display text-3xl leading-none tracking-tight text-bone">
        Ryoko<span className="text-red">.</span>
      </p>
      <p className="label-mono mt-2 text-faint">CMS / Karasu</p>
    </div>
  );
}

export function Layout() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

  const onSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-ink">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
        <p className="font-display text-2xl text-bone">
          Ryoko<span className="text-red">.</span>
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="label-mono text-faint transition-colors hover:text-red-bright"
        >
          Salir
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
          <Brand />
          <nav aria-label="Navegación principal" className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="label-mono mb-2 px-3 text-faint">{group.label}</p>
                <div className="space-y-1">
                  {group.links.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      end={link.to === "/"}
                      className={({ isActive }) => `block ${linkClass(isActive)}`}
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-line px-5 py-4">
            <p className="text-sm text-bone">{session?.user.name ?? "Editor"}</p>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-faint">
              {session?.user.alias ?? "Ryoko"}
            </p>
            <button
              type="button"
              onClick={onSignOut}
              className="label-mono mt-3 text-faint transition-colors hover:text-red-bright"
            >
              Cerrar sesión
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          <nav
            aria-label="Navegación principal móvil"
            className="flex gap-2 overflow-x-auto border-b border-line px-4 py-3 lg:hidden"
          >
            {allLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) => linkClass(isActive, true)}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
