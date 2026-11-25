import { lazy, type ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router-dom";

import { Layout } from "./components/Layout";
import { RouteError } from "./components/RouteError";
import { useAuth } from "./lib/auth";
import { LoginPage } from "./pages/Login";

const DashboardPage = lazy(() =>
  import("./pages/Dashboard").then((module) => ({ default: module.DashboardPage })),
);
const DocumentsPage = lazy(() =>
  import("./pages/Documents").then((module) => ({ default: module.DocumentsPage })),
);
const LandingPage = lazy(() =>
  import("./pages/Landing").then((module) => ({ default: module.LandingPage })),
);
const MediaPage = lazy(() =>
  import("./pages/Media").then((module) => ({ default: module.MediaPage })),
);
const PostEditorPage = lazy(() =>
  import("./pages/PostEditor").then((module) => ({ default: module.PostEditorPage })),
);
const PostsPage = lazy(() =>
  import("./pages/Posts").then((module) => ({ default: module.PostsPage })),
);
const ProjectEditorPage = lazy(() =>
  import("./pages/ProjectEditor").then((module) => ({ default: module.ProjectEditorPage })),
);
const ProjectsPage = lazy(() =>
  import("./pages/Projects").then((module) => ({ default: module.ProjectsPage })),
);
const RedirectsPage = lazy(() =>
  import("./pages/Redirects").then((module) => ({ default: module.RedirectsPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/Settings").then((module) => ({ default: module.SettingsPage })),
);
const TagsPage = lazy(() =>
  import("./pages/Tags").then((module) => ({ default: module.TagsPage })),
);
const WebhookDetailPage = lazy(() =>
  import("./pages/WebhookDetail").then((module) => ({ default: module.WebhookDetailPage })),
);
const WebhooksPage = lazy(() =>
  import("./pages/Webhooks").then((module) => ({ default: module.WebhooksPage })),
);

function Protected({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="label-mono text-red">404</p>
      <h1 className="mt-3 font-display text-5xl text-bone">
        Esta página se perdió entre los cuervos.
      </h1>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
    errorElement: <RouteError />,
  },
  {
    path: "/",
    element: (
      <Protected>
        <Layout />
      </Protected>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "posts", element: <PostsPage /> },
      { path: "posts/new", element: <PostEditorPage /> },
      { path: "posts/:id", element: <PostEditorPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "projects/new", element: <ProjectEditorPage /> },
      { path: "projects/:id", element: <ProjectEditorPage /> },
      { path: "tags", element: <TagsPage /> },
      { path: "media", element: <MediaPage /> },
      { path: "documents", element: <DocumentsPage /> },
      { path: "landing", element: <LandingPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "redirects", element: <RedirectsPage /> },
      { path: "webhooks", element: <WebhooksPage /> },
      { path: "webhooks/:eventId", element: <WebhookDetailPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
