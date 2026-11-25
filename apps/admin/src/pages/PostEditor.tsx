import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ArticlePreview } from "../components/ArticlePreview";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { MediaPicker, useMediaOptions } from "../components/MediaPicker";
import { SeoPreview } from "../components/SeoPreview";
import { TagPicker, useTags } from "../components/TagPicker";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  FormActions,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  statusTone,
} from "../components/ui";
import { api } from "../lib/api";
import { copyText, downloadTextFile, safeFilename } from "../lib/download";
import { errorMessage, formatDateTime } from "../lib/format";
import { useLocalDraft } from "../lib/localDraft";
import { type Post, type PostType, dataSchema, postSchema } from "../lib/schemas";
import { useToast } from "../lib/toast";
import { ConfirmLeaveModal, useUnsavedChanges } from "../lib/unsaved";

const postEnvelopeSchema = dataSchema(postSchema);

interface PostForm {
  title: string;
  slug: string;
  excerpt: string;
  content_md: string;
  cover_media_id: string | null;
  tag_ids: string[];
  type: PostType;
  featured: boolean;
  seo_title: string;
  seo_description: string;
  og_image_id: string | null;
  seo_canonical: string;
  seo_noindex: boolean;
  scheduled_at: string;
}

const emptyForm: PostForm = {
  title: "",
  slug: "",
  excerpt: "",
  content_md: "",
  cover_media_id: null,
  tag_ids: [],
  type: "article",
  featured: false,
  seo_title: "",
  seo_description: "",
  og_image_id: null,
  seo_canonical: "",
  seo_noindex: false,
  scheduled_at: "",
};

function isoToLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function formFromPost(post: Post): PostForm {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content_md: post.content_md,
    cover_media_id: post.cover_media_id,
    tag_ids: post.tag_ids,
    type: post.type,
    featured: post.featured,
    seo_title: post.seo.title ?? "",
    seo_description: post.seo.description ?? "",
    og_image_id: post.og_image_id,
    seo_canonical: post.seo.canonical_url ?? "",
    seo_noindex: post.seo.noindex,
    scheduled_at: isoToLocalInput(post.scheduled_at),
  };
}

function buildPayload(form: PostForm) {
  return {
    title: form.title.trim(),
    ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
    excerpt: form.excerpt,
    content_md: form.content_md,
    cover_media_id: form.cover_media_id,
    tag_ids: form.tag_ids,
    type: form.type,
    featured: form.featured,
    seo: {
      title: form.seo_title.trim() || null,
      description: form.seo_description.trim() || null,
      og_image_id: form.og_image_id,
      canonical_url: form.seo_canonical.trim() || null,
      noindex: form.seo_noindex,
    },
  };
}

function snapshot(form: PostForm): string {
  return JSON.stringify({ ...buildPayload(form), scheduled_at: form.scheduled_at });
}

export function PostEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState<PostForm>(emptyForm);
  const [initialized, setInitialized] = useState(isNew);
  const [baseline, setBaseline] = useState(() => snapshot(emptyForm));
  const [draftBanner, setDraftBanner] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["post", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const body = await api.get<unknown>(`/v1/admin/posts/${id}`);
      return postEnvelopeSchema.parse(body).data;
    },
  });

  const mediaQuery = useMediaOptions();
  const tagsQuery = useTags();

  useEffect(() => {
    if (query.data && !initialized) {
      const next = formFromPost(query.data);
      setForm(next);
      setBaseline(snapshot(next));
      setInitialized(true);
    }
  }, [query.data, initialized]);

  const set = <K extends keyof PostForm>(key: K, value: PostForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const isDirty = initialized && snapshot(form) !== baseline;
  const { blocker, allowNextNavigation } = useUnsavedChanges(isDirty);
  const draftKey = `post.${id ?? "new"}`;
  const {
    draft,
    clear: clearDraft,
    restore,
  } = useLocalDraft(draftKey, form, initialized && isDirty);

  const saveMutation = useMutation({
    mutationFn: async (publishAfter: boolean) => {
      const payload = buildPayload(form);
      const savedSnapshot = snapshot(form);
      let postId = id ?? "";
      if (!postId) {
        const created = await api.post<unknown>("/v1/admin/posts", payload);
        postId = postEnvelopeSchema.parse(created).data.id;
      } else {
        await api.patch(`/v1/admin/posts/${postId}`, payload);
      }
      if (publishAfter) {
        await api.post(`/v1/admin/posts/${postId}/publish`);
      }
      return { postId, publishAfter, savedSnapshot };
    },
    onSuccess: async ({ postId, publishAfter, savedSnapshot }) => {
      setBaseline(savedSnapshot);
      clearDraft();
      setDraftBanner(false);
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      await queryClient.invalidateQueries({ queryKey: ["post", postId] });
      toast(publishAfter ? "Post publicado." : "Post guardado.", "success");
      if (!id) {
        allowNextNavigation();
        navigate(`/posts/${postId}`, { replace: true });
        setInitialized(true);
      }
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const actionMutation = useMutation({
    mutationFn: async (action: "unpublish" | "archive" | "duplicate") => {
      if (!id) return;
      if (action === "unpublish") await api.post(`/v1/admin/posts/${id}/unpublish`);
      if (action === "archive") await api.delete(`/v1/admin/posts/${id}`);
      if (action === "duplicate") {
        const body = await api.post<unknown>(`/v1/admin/posts/${id}/duplicate`);
        return postEnvelopeSchema.parse(body).data.id;
      }
      return undefined;
    },
    onSuccess: async (duplicatedId, action) => {
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      await queryClient.invalidateQueries({ queryKey: ["post", id] });
      if (action === "duplicate" && duplicatedId) {
        toast("Copia creada como draft.", "success");
        allowNextNavigation();
        navigate(`/posts/${duplicatedId}`);
        return;
      }
      if (action === "archive") {
        clearDraft();
        toast("Post archivado.", "success");
        allowNextNavigation();
        navigate("/posts");
        return;
      }
      toast("Post despublicado.", "success");
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const scheduleMutation = useMutation({
    mutationFn: async (scheduledAt: string) => {
      if (!id) throw new Error("Guarda el post antes de programarlo.");
      await api.post(`/v1/admin/posts/${id}/schedule`, { scheduled_at: scheduledAt });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["post", id] });
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast("Publicación programada.", "success");
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const cancelSchedule = async () => {
    if (!id) return;
    try {
      await api.delete(`/v1/admin/posts/${id}/schedule`);
      set("scheduled_at", "");
      await queryClient.invalidateQueries({ queryKey: ["post", id] });
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast("Programación cancelada.", "success");
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  const onPreview = async () => {
    if (!id) return;
    try {
      const body = (await api.get<unknown>(`/v1/admin/posts/${id}/preview`)) as {
        data?: { url?: unknown };
      };
      if (typeof body.data?.url === "string") {
        window.open(body.data.url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  const onRestoreDraft = () => {
    const restored = restore();
    if (!restored) {
      toast("No se pudo leer el borrador local.", "error");
      return;
    }
    setForm({ ...emptyForm, ...restored });
    setDraftBanner(false);
    toast("Borrador local restaurado.", "success");
  };

  const onDiscardDraft = () => {
    clearDraft();
    setDraftBanner(false);
    toast("Borrador local descartado.");
  };

  const onCopyMarkdown = async () => {
    try {
      await copyText(form.content_md);
      toast("Markdown copiado.", "success");
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  const onDownloadMarkdown = () => {
    downloadTextFile(
      `${safeFilename(form.slug || form.title, "post")}.md`,
      form.content_md,
      "text/markdown;charset=utf-8",
    );
    toast("Markdown descargado.", "success");
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (!form.title.trim()) {
      setFormError("El título es obligatorio.");
      return;
    }
    if (form.slug.trim() && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
      setFormError("El slug debe estar en kebab-case (minúsculas, números y guiones).");
      return;
    }
    saveMutation.mutate(false);
  };

  const onFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  if (query.isLoading) {
    return <Spinner label="Cargando post…" />;
  }

  const post = query.data;
  const busy = saveMutation.isPending || actionMutation.isPending || scheduleMutation.isPending;
  const cover = mediaQuery.data?.find((item) => item.id === form.cover_media_id);
  const ogImage = mediaQuery.data?.find((item) => item.id === form.og_image_id);
  const coverUrl = form.cover_media_id ? (cover?.url ?? post?.cover?.url ?? null) : null;
  const ogImageUrl = ogImage?.url ?? coverUrl;
  const tagNames = (tagsQuery.data ?? [])
    .filter((tag) => form.tag_ids.includes(tag.id))
    .map((tag) => tag.name);
  const editorActions = (
    <>
      <Button size="sm" onClick={() => setPreviewOpen(true)}>
        Vista previa
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!form.content_md}
        onClick={() => void onCopyMarkdown()}
      >
        Copiar MD
      </Button>
      <Button size="sm" variant="ghost" disabled={!form.content_md} onClick={onDownloadMarkdown}>
        Descargar .md
      </Button>
    </>
  );

  return (
    <div>
      <PageHeader
        eyebrow={isNew ? "Nuevo post" : "Editar post"}
        title={form.title || "Post sin título"}
        description={
          post
            ? `Estado ${post.publish_status} · lectura ${post.reading_time_minutes} min · actualizado ${formatDateTime(
                post.updated_at,
              )}`
            : "El post se crea como draft. Publica cuando el contenido esté listo."
        }
        actions={
          <>
            {post ? (
              <Badge tone={statusTone(post.publish_status)}>{post.publish_status}</Badge>
            ) : null}
            {post?.scheduled_at ? (
              <Badge tone="warning">Programado {formatDateTime(post.scheduled_at)}</Badge>
            ) : null}
            <Link to="/posts">
              <Button>Volver</Button>
            </Link>
          </>
        }
      />

      {draft && draftBanner && initialized ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 border border-warning/50 bg-warning/5 px-4 py-3 text-sm text-warning">
          <span>Hay un borrador local del {formatDateTime(draft.savedAt)}.</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onRestoreDraft}>
              Restaurar
            </Button>
            <Button size="sm" variant="ghost" onClick={onDiscardDraft}>
              Descartar
            </Button>
          </div>
        </div>
      ) : null}

      {formError ? (
        <div className="mb-6 border border-red/50 bg-red/5 px-4 py-3 text-sm text-red-bright">
          {formError}
        </div>
      ) : null}

      <form
        ref={formRef}
        onSubmit={onSubmit}
        onKeyDown={onFormKeyDown}
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"
      >
        <Card className="p-5 xl:col-span-2">
          <div className="space-y-4">
            <Field label="Título">
              <Input
                value={form.title}
                maxLength={120}
                required
                onChange={(event) => set("title", event.target.value)}
              />
            </Field>
            <Field label="Slug" hint="Kebab-case. Si se deja vacío, la API lo genera.">
              <Input
                value={form.slug}
                maxLength={200}
                placeholder="como-construi-ryoko"
                onChange={(event) => set("slug", event.target.value)}
              />
            </Field>
            <Field label="Excerpt" hint="Resumen corto usado en listados y SEO.">
              <Textarea
                rows={3}
                maxLength={240}
                value={form.excerpt}
                onChange={(event) => set("excerpt", event.target.value)}
              />
            </Field>
            <MarkdownEditor
              value={form.content_md}
              onChange={(value) => set("content_md", value)}
              actions={editorActions}
            />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-display text-2xl text-bone">SEO</h2>
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SEO title" hint="Máximo 70 caracteres.">
                  <Input
                    value={form.seo_title}
                    maxLength={70}
                    onChange={(event) => set("seo_title", event.target.value)}
                  />
                </Field>
                <Field label="Canonical URL">
                  <Input
                    type="url"
                    value={form.seo_canonical}
                    placeholder="https://ryuheirg.dev/blog/..."
                    onChange={(event) => set("seo_canonical", event.target.value)}
                  />
                </Field>
              </div>
              <Field label="SEO description" hint="Máximo 160 caracteres.">
                <Textarea
                  rows={3}
                  maxLength={160}
                  value={form.seo_description}
                  onChange={(event) => set("seo_description", event.target.value)}
                />
              </Field>
              <MediaPicker
                label="OG image"
                value={form.og_image_id}
                onChange={(value) => set("og_image_id", value)}
              />
              <Checkbox
                label="Marcar como noindex"
                checked={form.seo_noindex}
                onChange={(event) => set("seo_noindex", event.target.checked)}
              />
              <div className="border-t border-line pt-4">
                <SeoPreview
                  title={form.seo_title || form.title}
                  description={form.seo_description || form.excerpt}
                  path={`/blog/${form.slug || post?.slug || "sin-slug"}`}
                  canonical={form.seo_canonical}
                  ogImageUrl={ogImageUrl}
                  noindex={form.seo_noindex}
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-display text-2xl text-bone">Publicación</h2>
            <div className="mt-4 space-y-4">
              <Field label="Tipo">
                <Select
                  value={form.type}
                  onChange={(event) => set("type", event.target.value as PostType)}
                >
                  <option value="article">Article</option>
                  <option value="note">Note</option>
                </Select>
              </Field>
              <Checkbox
                label="Destacar en el sitio"
                checked={form.featured}
                onChange={(event) => set("featured", event.target.checked)}
              />
              <div className="space-y-2 border-t border-line pt-4">
                <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                  {saveMutation.isPending ? "Guardando…" : "Guardar"}
                </Button>
                <Button
                  type="button"
                  className="w-full"
                  disabled={busy}
                  onClick={() => saveMutation.mutate(true)}
                >
                  Guardar y publicar
                </Button>
                {post?.publish_status === "published" ? (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy}
                    onClick={() => actionMutation.mutate("unpublish")}
                  >
                    Volver a draft
                  </Button>
                ) : null}
                {post ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      disabled={busy}
                      onClick={() => void onPreview()}
                    >
                      Abrir preview guardado
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      disabled={busy}
                      onClick={() => actionMutation.mutate("duplicate")}
                    >
                      Duplicar como draft
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      className="w-full"
                      disabled={busy || post.publish_status === "archived"}
                      onClick={() => {
                        if (window.confirm("¿Archivar este post?")) {
                          actionMutation.mutate("archive");
                        }
                      }}
                    >
                      Archivar
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-2xl text-bone">Programación</h2>
            <div className="mt-4 space-y-3">
              <Field label="Publicar el" hint="Hora local. La API la convierte a UTC.">
                <Input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(event) => set("scheduled_at", event.target.value)}
                />
              </Field>
              <Button
                type="button"
                className="w-full"
                disabled={busy || !form.scheduled_at}
                onClick={() => {
                  const date = new Date(form.scheduled_at);
                  if (Number.isNaN(date.getTime())) {
                    setFormError("Fecha de programación inválida.");
                    return;
                  }
                  scheduleMutation.mutate(date.toISOString());
                }}
              >
                Programar
              </Button>
              {post?.scheduled_at ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void cancelSchedule()}
                >
                  Cancelar programación
                </Button>
              ) : null}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-2xl text-bone">Portada</h2>
            <div className="mt-4">
              <MediaPicker
                value={form.cover_media_id}
                onChange={(value) => set("cover_media_id", value)}
                hint="Opcional. Sin portada, el frontend genera una tipográfica."
              />
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={cover?.alt ?? post?.cover?.alt ?? form.title}
                  className="mt-3 aspect-[16/10] w-full border border-line object-cover"
                />
              ) : null}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-2xl text-bone">Tags</h2>
            <div className="mt-4">
              <TagPicker selected={form.tag_ids} onChange={(ids) => set("tag_ids", ids)} />
            </div>
          </Card>
        </div>

        <FormActions className="xl:col-span-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {saveMutation.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
          <span className="text-xs text-faint">
            {post ? `ID ${post.id}` : "Los cambios se guardan en la Content API."} · Ctrl/Cmd+S
            guarda.
          </span>
        </FormActions>
      </form>

      <Modal
        open={previewOpen}
        title="Vista previa del artículo"
        onClose={() => setPreviewOpen(false)}
        size="xl"
        footer={<Button onClick={() => setPreviewOpen(false)}>Cerrar</Button>}
      >
        <ArticlePreview
          title={form.title}
          excerpt={form.excerpt}
          markdown={form.content_md}
          coverUrl={coverUrl}
          coverAlt={cover?.alt ?? post?.cover?.alt ?? null}
          authorName={post?.author.name}
          publishedAt={post?.published_at}
          tags={tagNames}
        />
      </Modal>

      <ConfirmLeaveModal blocker={blocker} />
    </div>
  );
}
