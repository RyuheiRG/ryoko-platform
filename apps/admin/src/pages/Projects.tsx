import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  TCell,
  TH,
  THead,
  TRow,
  statusTone,
} from "../components/ui";
import { api } from "../lib/api";
import { errorMessage, formatDate } from "../lib/format";
import { type Project, pageSchema, projectSchema } from "../lib/schemas";
import { useToast } from "../lib/toast";

const projectsSchema = pageSchema(projectSchema);

type ProjectAction = "publish" | "unpublish" | "archive";

async function runAction(action: ProjectAction, project: Project): Promise<void> {
  if (action === "publish") {
    await api.post(`/v1/admin/projects/${project.id}/publish`);
    return;
  }
  if (action === "unpublish") {
    await api.post(`/v1/admin/projects/${project.id}/unpublish`);
    return;
  }
  await api.delete(`/v1/admin/projects/${project.id}`);
}

export function ProjectsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["projects", page, status, lifecycle],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        sort: "sort_order",
      });
      if (status) params.set("publish_status", status);
      if (lifecycle) params.set("lifecycle_status", lifecycle);
      const body = await api.get<unknown>(`/v1/admin/projects?${params.toString()}`);
      return projectsSchema.parse(body);
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ action, project }: { action: ProjectAction; project: Project }) => {
      await runAction(action, project);
      return action;
    },
    onSuccess: async (action, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast(`Proyecto «${variables.project.title}»: ${action}.`, "success");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Contenido"
        title="Proyectos"
        description="Publicación y ciclo de vida son estados independientes."
        actions={
          <Link to="/projects/new">
            <Button variant="primary">Nuevo proyecto</Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="w-48">
          <span className="label-mono mb-2 block text-muted">Publicación</span>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </label>
        <label className="w-48">
          <span className="label-mono mb-2 block text-muted">Ciclo de vida</span>
          <Select
            value={lifecycle}
            onChange={(event) => {
              setLifecycle(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="live">Live</option>
            <option value="wip">WIP</option>
            <option value="archived">Archived</option>
          </Select>
        </label>
      </div>

      {query.isError ? (
        <ErrorBanner message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      {query.isLoading ? <Spinner label="Cargando proyectos…" /> : null}

      {query.data ? (
        query.data.data.length === 0 ? (
          <EmptyState
            title="Sin proyectos"
            description="Crea el primer proyecto o ajusta los filtros."
            action={
              <Link to="/projects/new">
                <Button variant="primary">Nuevo proyecto</Button>
              </Link>
            }
          />
        ) : (
          <>
            <Table caption="Listado de proyectos">
              <THead>
                <TRow>
                  <TH>Proyecto</TH>
                  <TH>Estado</TH>
                  <TH>Ciclo</TH>
                  <TH>Stack</TH>
                  <TH>Año</TH>
                  <TH>Actualizado</TH>
                  <TH className="text-right">Acciones</TH>
                </TRow>
              </THead>
              <tbody>
                {query.data.data.map((project) => (
                  <TRow key={project.id}>
                    <TCell>
                      <Link
                        to={`/projects/${project.id}`}
                        className="block hover:text-red-bright"
                      >
                        <span className="font-medium text-bone">{project.title}</span>
                        <span className="mt-1 block font-mono text-[11px] text-faint">
                          /proyectos/{project.slug}
                        </span>
                      </Link>
                      {project.featured ? (
                        <span className="mt-2 inline-block">
                          <Badge tone="accent">Featured</Badge>
                        </span>
                      ) : null}
                    </TCell>
                    <TCell>
                      <Badge tone={statusTone(project.publish_status)}>
                        {project.publish_status}
                      </Badge>
                    </TCell>
                    <TCell>
                      <Badge tone={statusTone(project.lifecycle_status)}>
                        {project.lifecycle_status}
                      </Badge>
                    </TCell>
                    <TCell>
                      <span className="block max-w-52 text-xs text-muted">
                        {project.stack.join(" · ") || "—"}
                      </span>
                    </TCell>
                    <TCell className="font-mono text-xs text-muted">{project.year}</TCell>
                    <TCell className="whitespace-nowrap text-xs text-muted">
                      {formatDate(project.updated_at)}
                    </TCell>
                    <TCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Link to={`/projects/${project.id}`}>
                          <Button size="sm">Editar</Button>
                        </Link>
                        {project.publish_status === "published" ? (
                          <Button
                            size="sm"
                            disabled={mutation.isPending}
                            onClick={() => mutation.mutate({ action: "unpublish", project })}
                          >
                            Despublicar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={mutation.isPending || project.publish_status === "archived"}
                            onClick={() => mutation.mutate({ action: "publish", project })}
                          >
                            Publicar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={mutation.isPending || project.publish_status === "archived"}
                          onClick={() => {
                            if (window.confirm(`¿Archivar «${project.title}»?`)) {
                              mutation.mutate({ action: "archive", project });
                            }
                          }}
                        >
                          Archivar
                        </Button>
                      </div>
                    </TCell>
                  </TRow>
                ))}
              </tbody>
            </Table>
            <Pagination meta={query.data.meta} onPageChange={setPage} />
          </>
        )
      ) : null}
    </div>
  );
}
