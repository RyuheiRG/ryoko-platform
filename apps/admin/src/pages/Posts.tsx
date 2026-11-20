import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
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
import { errorMessage, formatDate, formatDateTime } from "../lib/format";
import { type Post, pageSchema, postSchema } from "../lib/schemas";
import { useToast } from "../lib/toast";

const postsSchema = pageSchema(postSchema);

type PostAction = "publish" | "unpublish" | "duplicate" | "archive";

async function runAction(action: PostAction, post: Post): Promise<void> {
  switch (action) {
    case "publish":
      await api.post(`/v1/admin/posts/${post.id}/publish`);
      return;
    case "unpublish":
      await api.post(`/v1/admin/posts/${post.id}/unpublish`);
      return;
    case "duplicate":
      await api.post(`/v1/admin/posts/${post.id}/duplicate`);
      return;
    case "archive":
      await api.delete(`/v1/admin/posts/${post.id}`);
  }
}

export function PostsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["posts", page, status, q],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        sort: "-updated_at",
      });
      if (status) params.set("publish_status", status);
      if (q) params.set("q", q);
      const body = await api.get<unknown>(`/v1/admin/posts?${params.toString()}`);
      return postsSchema.parse(body);
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ action, post }: { action: PostAction; post: Post }) => {
      await runAction(action, post);
      return action;
    },
    onSuccess: async (action, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast(
        action === "archive"
          ? `Post «${variables.post.title}» archivado.`
          : `Acción «${action}» aplicada a «${variables.post.title}».`,
        "success",
      );
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  };

  const onPreview = async (post: Post) => {
    try {
      const body = await api.get<unknown>(`/v1/admin/posts/${post.id}/preview`);
      const parsed = body as { data?: { url?: unknown } };
      if (typeof parsed.data?.url === "string") {
        window.open(parsed.data.url, "_blank", "noopener,noreferrer");
      } else {
        toast("La API no devolvió una URL de preview.", "error");
      }
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  const onArchive = (post: Post) => {
    if (window.confirm(`¿Archivar «${post.title}»? Dejará de aparecer en el sitio.`)) {
      mutation.mutate({ action: "archive", post });
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Contenido"
        title="Posts"
        description="Todos los estados editoriales. Publicar o retirar dispara webhooks de rebuild."
        actions={
          <Link to="/posts/new">
            <Button variant="primary">Nuevo post</Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form onSubmit={onSearch} className="flex flex-1 flex-wrap items-end gap-2">
          <label className="min-w-56 flex-1">
            <span className="label-mono mb-2 block text-muted">Buscar</span>
            <Input
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
              placeholder="Título, slug o contenido"
            />
          </label>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        <label className="w-48">
          <span className="label-mono mb-2 block text-muted">Estado</span>
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
      </div>

      {query.isError ? (
        <ErrorBanner message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      {query.isLoading ? <Spinner label="Cargando posts…" /> : null}

      {query.data ? (
        query.data.data.length === 0 ? (
          <EmptyState
            title="Sin posts"
            description="Crea el primer post o ajusta los filtros."
            action={
              <Link to="/posts/new">
                <Button variant="primary">Nuevo post</Button>
              </Link>
            }
          />
        ) : (
          <>
            <Table caption="Listado de posts">
              <THead>
                <TRow>
                  <TH>Post</TH>
                  <TH>Estado</TH>
                  <TH>Tags</TH>
                  <TH>Actualizado</TH>
                  <TH>Publicado</TH>
                  <TH className="text-right">Acciones</TH>
                </TRow>
              </THead>
              <tbody>
                {query.data.data.map((post) => (
                  <TRow key={post.id}>
                    <TCell>
                      <Link to={`/posts/${post.id}`} className="block hover:text-red-bright">
                        <span className="font-medium text-bone">{post.title}</span>
                        <span className="mt-1 block font-mono text-[11px] text-faint">
                          /blog/{post.slug}
                        </span>
                      </Link>
                      {post.scheduled_at ? (
                        <span className="mt-2 inline-block">
                          <Badge tone="warning">
                            Programado {formatDateTime(post.scheduled_at)}
                          </Badge>
                        </span>
                      ) : null}
                    </TCell>
                    <TCell>
                      <Badge tone={statusTone(post.publish_status)}>{post.publish_status}</Badge>
                      {post.featured ? (
                        <span className="mt-2 block">
                          <Badge tone="accent">Featured</Badge>
                        </span>
                      ) : null}
                    </TCell>
                    <TCell>
                      <div className="flex max-w-48 flex-wrap gap-1">
                        {post.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-muted"
                          >
                            {tag.slug}
                          </span>
                        ))}
                      </div>
                    </TCell>
                    <TCell className="whitespace-nowrap text-xs text-muted">
                      {formatDate(post.updated_at)}
                    </TCell>
                    <TCell className="whitespace-nowrap text-xs text-muted">
                      {post.published_at ? formatDate(post.published_at) : "—"}
                    </TCell>
                    <TCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Link to={`/posts/${post.id}`}>
                          <Button size="sm">Editar</Button>
                        </Link>
                        {post.publish_status === "published" ? (
                          <Button
                            size="sm"
                            onClick={() => mutation.mutate({ action: "unpublish", post })}
                            disabled={mutation.isPending}
                          >
                            Despublicar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => mutation.mutate({ action: "publish", post })}
                            disabled={mutation.isPending || post.publish_status === "archived"}
                          >
                            Publicar
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => void onPreview(post)}>
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => mutation.mutate({ action: "duplicate", post })}
                          disabled={mutation.isPending}
                        >
                          Duplicar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => onArchive(post)}
                          disabled={mutation.isPending || post.publish_status === "archived"}
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
