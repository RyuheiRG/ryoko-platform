import { type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { Layout } from "./components/Layout";
import { useAuth } from "./lib/auth";
import { DashboardPage } from "./pages/Dashboard";
import { DocumentsPage } from "./pages/Documents";
import { LandingPage } from "./pages/Landing";
import { LoginPage } from "./pages/Login";
import { MediaPage } from "./pages/Media";
import { PostEditorPage } from "./pages/PostEditor";
import { PostsPage } from "./pages/Posts";
import { ProjectEditorPage } from "./pages/ProjectEditor";
import { ProjectsPage } from "./pages/Projects";
import { RedirectsPage } from "./pages/Redirects";
import { SettingsPage } from "./pages/Settings";
import { TagsPage } from "./pages/Tags";
import { WebhookDetailPage } from "./pages/WebhookDetail";
import { WebhooksPage } from "./pages/Webhooks";

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
      <h1 className="mt-3 font-display text-5xl text-bone">Esta página se perdió entre los cuervos.</h1>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="posts" element={<PostsPage />} />
        <Route path="posts/new" element={<PostEditorPage />} />
        <Route path="posts/:id" element={<PostEditorPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/new" element={<ProjectEditorPage />} />
        <Route path="projects/:id" element={<ProjectEditorPage />} />
        <Route path="tags" element={<TagsPage />} />
        <Route path="media" element={<MediaPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="landing" element={<LandingPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="redirects" element={<RedirectsPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="webhooks/:eventId" element={<WebhookDetailPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
