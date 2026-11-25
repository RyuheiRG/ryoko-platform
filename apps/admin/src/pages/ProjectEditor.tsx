import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ArticlePreview } from "../components/ArticlePreview";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { MediaPicker, useMediaOptions } from "../components/MediaPicker";
import { SeoPreview } from "../components/SeoPreview";
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
import { type LifecycleStatus, type Project, dataSchema, projectSchema } from "../lib/schemas";
import { useToast } from "../lib/toast";
import { ConfirmLeaveModal, useUnsavedChanges } from "../lib/unsaved";

const projectEnvelopeSchema = dataSchema(projectSchema);

interface ProjectForm {
  title: string;
  slug: string;
  summary: string;
  case_study_md: string;
  cover_media_id: string | null;
  gallery_media_ids: string[];
  stack: string;
  year: number;
  lifecycle_status: LifecycleStatus;
  featured: boolean;
  repo_url: string;
  demo_url: string;
  github_repo: string;
  sort_order: number;
  role: string;
  team: string;
  learnings: string;
  seo_title: string;
  seo_description: string;
  og_image_id: string | null;
  seo_canonical: string;
  seo_noindex: boolean;
}

const emptyForm: ProjectForm = {
  title: "",
  slug: "",
  summary: "",
  case_study_md: "",
  cover_media_id: null,
  gallery_media_ids: [],
  stack: "",
  year: new Date().getUTCFullYear(),
  lifecycle_status: "wip",
  featured: false,
  repo_url: "",
  demo_url: "",
  github_repo: "",
  sort_order: 0,
  role: "",
  team: "",
  learnings: "",
  seo_title: "",
  seo_description: "",
  og_image_id: null,
  seo_canonical: "",
  seo_noindex: false,
};

function formFromProject(project: Project): ProjectForm {
  return {
    title: project.title,
    slug: project.slug,
    summary: project.summary,
    case_study_md: project.case_study_md,
    cover_media_id: project.cover_media_id,
    gallery_media_ids: project.gallery_media_ids,
    stack: project.stack.join(", "),
    year: project.year,
    lifecycle_status: project.lifecycle_status,
    featured: project.featured,
    repo_url: project.repo_url ?? "",
    demo_url: project.demo_url ?? "",
    github_repo: project.github_repo ?? "",
    sort_order: project.sort_order,
    role: project.role ?? "",
    team: project.team.join(", "),
    learnings: project.learnings.join("\n"),
    seo_title: project.seo.title ?? "",
    seo_description: project.seo.description ?? "",
    og_image_id: project.og_image_id,
    seo_canonical: project.seo.canonical_url ?? "",
    seo_noindex: project.seo.noindex,
  };
}

function splitComma(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPayload(form: ProjectForm) {
  return {
    title: form.title.trim(),
    ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
    summary: form.summary,
    case_study_md: form.case_study_md,
    cover_media_id: form.cover_media_id,
    stack: splitComma(form.stack),
    year: form.year,
    lifecycle_status: form.lifecycle_status,
    featured: form.featured,
    repo_url: form.repo_url.trim() || null,
    demo_url: form.demo_url.trim() || null,
    github_repo: form.github_repo.trim() || null,
    sort_order: form.sort_order,
    role: form.role.trim() || null,
    team: splitComma(form.team),
    learnings: splitLines(form.learnings),
    seo: {
      title: form.seo_title.trim() || null,
      description: form.seo_description.trim() || null,
      og_image_id: form.og_image_id,
      canonical_url: form.seo_canonical.trim() || null,
      noindex: form.seo_noindex,
    },
  };
}

function snapshot(form: ProjectForm): string {
  return JSON.stringify({
    ...buildPayload(form),
    gallery_media_ids: form.gallery_media_ids,
  });
}

function GalleryPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const query = useMediaOptions();
  if (query.isLoading) return <p className="text-sm text-muted">Cargando media…</p>;
  const items = query.data ?? [];

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };

  return (
    <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto border border-line bg-ink p-2 sm:grid-cols-3">
      {items.map((item) => (
        <label
          key={item.id}
          className={`cursor-pointer border p-1 transition-colors ${
            selected.includes(item.id) ? "border-red" : "border-line hover:border-line-strong"
          }`}
        >
          <img src={item.url} alt={item.alt} className="h-20 w-full object-cover" />
          <span className="mt-1 flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={() => toggle(item.id)}
              className="h-3 w-3 accent-[var(--color-red)]"
            />
            <span className="truncate">{item.alt || item.id.slice(0, 8)}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export function ProjectEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [initialized, setInitialized] = useState(isNew);
  const [baseline, setBaseline] = useState(() => snapshot(emptyForm));
  const [draftBanner, setDraftBanner] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["project", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const body = await api.get<unknown>(`/v1/admin/projects/${id}`);
      return projectEnvelopeSchema.parse(body).data;
    },
  });

  const mediaQuery = useMediaOptions();

  useEffect(() => {
    if (query.data && !initialized) {
      const next = formFromProject(query.data);
      setForm(next);
      setBaseline(snapshot(next));
      setInitialized(true);
    }
  }, [query.data, initialized]);

  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const isDirty = initialized && snapshot(form) !== baseline;
  const { blocker, allowNextNavigation } = useUnsavedChanges(isDirty);
  const draftKey = `project.${id ?? "new"}`;
  const {
    draft,
    clear: clearDraft,
    restore,
  } = useLocalDraft(draftKey, form, initialized && isDirty);

  const saveMutation = useMutation({
    mutationFn: async (publishAfter: boolean) => {
      const payload = buildPayload(form);
      const savedSnapshot = snapshot(form);
      let projectId = id ?? "";
      if (!projectId) {
        const created = await api.post<unknown>("/v1/admin/projects", {
          ...payload,
          gallery_media_ids: form.gallery_media_ids,
        });
        projectId = projectEnvelopeSchema.parse(created).data.id;
      } else {
        await api.patch(`/v1/admin/projects/${projectId}`, payload);
        await api.put(`/v1/admin/projects/${projectId}/gallery`, {
          media_ids: form.gallery_media_ids,
        });
      }
      if (publishAfter) {
        await api.post(`/v1/admin/projects/${projectId}/publish`);
      }
      return { projectId, publishAfter, savedSnapshot };
    },
    onSuccess: async ({ projectId, publishAfter, savedSnapshot }) => {
      setBaseline(savedSnapshot);
      clearDraft();
      setDraftBanner(false);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast(publishAfter ? "Proyecto publicado." : "Proyecto guardado.", "success");
      if (!id) {
        allowNextNavigation();
        navigate(`/projects/${projectId}`, { replace: true });
        setInitialized(true);
      }
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const actionMutation = useMutation({
    mutationFn: async (action: "unpublish" | "archive") => {
      if (!id) return;
      if (action === "unpublish") await api.post(`/v1/admin/projects/${id}/unpublish`);
      if (action === "archive") await api.delete(`/v1/admin/projects/${id}`);
    },
    onSuccess: async (_data, action) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
      if (action === "archive") {
        clearDraft();
        toast("Proyecto archivado.", "success");
        allowNextNavigation();
        navigate("/projects");
        return;
      }
      toast("Proyecto despublicado.", "success");
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

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
      await copyText(form.case_study_md);
      toast("Markdown copiado.", "success");
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  const onDownloadMarkdown = () => {
    downloadTextFile(
      `${safeFilename(form.slug || form.title, "proyecto")}.md`,
      form.case_study_md,
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
      setFormError("El slug debe estar en kebab-case.");
      return;
    }
    if (form.year < 2000 || form.year > 2100) {
      setFormError("El año debe estar entre 2000 y 2100.");
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
    return <Spinner label="Cargando proyecto…" />;
  }

  const project = query.data;
  const busy = saveMutation.isPending || actionMutation.isPending;
  const cover = mediaQuery.data?.find((item) => item.id === form.cover_media_id);
  const ogImage = mediaQuery.data?.find((item) => item.id === form.og_image_id);
  const coverUrl = form.cover_media_id ? (cover?.url ?? project?.cover?.url ?? null) : null;
  const ogImageUrl = ogImage?.url ?? coverUrl;
  const stack = splitComma(form.stack);
  const editorActions = (
    <>
      <Button size="sm" onClick={() => setPreviewOpen(true)}>
        Vista previa
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!form.case_study_md}
        onClick={() => void onCopyMarkdown()}
      >
        Copiar MD
      </Button>
      <Button size="sm" variant="ghost" disabled={!form.case_study_md} onClick={onDownloadMarkdown}>
        Descargar .md
      </Button>
    </>
  );

  return (
    <div>
      <PageHeader
        eyebrow={isNew ? "Nuevo proyecto" : "Editar proyecto"}
        title={form.title || "Proyecto sin título"}
        description={
          project
            ? `Estado ${project.publish_status} · vida ${project.lifecycle_status} · actualizado ${formatDateTime(
                project.updated_at,
              )}`
            : "Se crea como draft con ciclo de vida WIP."
        }
        actions={
          <>
            {project ? (
              <Badge tone={statusTone(project.publish_status)}>{project.publish_status}</Badge>
            ) : null}
            {project ? (
              <Badge tone={statusTone(project.lifecycle_status)}>{project.lifecycle_status}</Badge>
            ) : null}
            <Link to="/projects">
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
                onChange={(event) => set("slug", event.target.value)}
              />
            </Field>
            <Field label="Summary">
              <Textarea
                rows={3}
                maxLength={240}
                value={form.summary}
                onChange={(event) => set("summary", event.target.value)}
              />
            </Field>
            <MarkdownEditor
              label="Case study Markdown"
              hint="Problema, restricciones, decisiones, arquitectura y resultados."
              rows={22}
              value={form.case_study_md}
              onChange={(value) => set("case_study_md", value)}
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
                  description={form.seo_description || form.summary}
                  path={`/projects/${form.slug || project?.slug || "sin-slug"}`}
                  canonical={form.seo_canonical}
                  ogImageUrl={ogImageUrl}
                  noindex={form.seo_noindex}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-2xl text-bone">Case study metadata</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Rol">
                <Input value={form.role} onChange={(event) => set("role", event.target.value)} />
              </Field>
              <Field label="Equipo" hint="Separado por comas.">
                <Input value={form.team} onChange={(event) => set("team", event.target.value)} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Aprendizajes" hint="Uno por línea.">
                <Textarea
                  rows={5}
                  value={form.learnings}
                  onChange={(event) => set("learnings", event.target.value)}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-display text-2xl text-bone">Publicación</h2>
            <div className="mt-4 space-y-4">
              <Field label="Ciclo de vida">
                <Select
                  value={form.lifecycle_status}
                  onChange={(event) =>
                    set("lifecycle_status", event.target.value as LifecycleStatus)
                  }
                >
                  <option value="live">Live</option>
                  <option value="wip">WIP</option>
                  <option value="archived">Archived</option>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Año">
                  <Input
                    type="number"
                    min={2000}
                    max={2100}
                    value={form.year}
                    onChange={(event) => set("year", Number(event.target.value))}
                  />
                </Field>
                <Field label="Orden">
                  <Input
                    type="number"
                    value={form.sort_order}
                    onChange={(event) => set("sort_order", Number(event.target.value))}
                  />
                </Field>
              </div>
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
                {project?.publish_status === "published" ? (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy}
                    onClick={() => actionMutation.mutate("unpublish")}
                  >
                    Volver a draft
                  </Button>
                ) : null}
                {project ? (
                  <Button
                    type="button"
                    variant="danger"
                    className="w-full"
                    disabled={busy || project.publish_status === "archived"}
                    onClick={() => {
                      if (window.confirm("¿Archivar este proyecto?")) {
                        actionMutation.mutate("archive");
                      }
                    }}
                  >
                    Archivar
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-2xl text-bone">Portada</h2>
            <div className="mt-4">
              <MediaPicker
                value={form.cover_media_id}
                onChange={(value) => set("cover_media_id", value)}
              />
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={cover?.alt ?? project?.cover?.alt ?? form.title}
                  className="mt-3 aspect-[16/10] w-full border border-line object-cover"
                />
              ) : null}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-2xl text-bone">Stack</h2>
            <div className="mt-4">
              <Field label="Tecnologías" hint="Separadas por comas.">
                <Textarea
                  rows={3}
                  value={form.stack}
                  onChange={(event) => set("stack", event.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-2xl text-bone">Enlaces</h2>
            <div className="mt-4 space-y-4">
              <Field label="Repo URL">
                <Input
                  type="url"
                  value={form.repo_url}
                  onChange={(event) => set("repo_url", event.target.value)}
                />
              </Field>
              <Field label="Demo URL">
                <Input
                  type="url"
                  value={form.demo_url}
                  onChange={(event) => set("demo_url", event.target.value)}
                />
              </Field>
              <Field label="GitHub repo" hint="Solo administración: owner/repo.">
                <Input
                  value={form.github_repo}
                  placeholder="RyuheiRG/SecureUP"
                  onChange={(event) => set("github_repo", event.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-2xl text-bone">Galería</h2>
            <div className="mt-4">
              <GalleryPicker
                selected={form.gallery_media_ids}
                onChange={(ids) => set("gallery_media_ids", ids)}
              />
            </div>
          </Card>
        </div>

        <FormActions className="xl:col-span-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {saveMutation.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
          <span className="text-xs text-faint">
            {project ? `ID ${project.id}` : "Los cambios se guardan en la Content API."} ·
            Ctrl/Cmd+S guarda.
          </span>
        </FormActions>
      </form>

      <Modal
        open={previewOpen}
        title="Vista previa del caso de estudio"
        onClose={() => setPreviewOpen(false)}
        size="xl"
        footer={<Button onClick={() => setPreviewOpen(false)}>Cerrar</Button>}
      >
        <ArticlePreview
          title={form.title}
          excerpt={form.summary}
          markdown={form.case_study_md}
          coverUrl={coverUrl}
          coverAlt={cover?.alt ?? project?.cover?.alt ?? null}
          tags={stack}
          kind="project"
          meta={[String(form.year), form.role].filter(Boolean)}
        />
      </Modal>

      <ConfirmLeaveModal blocker={blocker} />
    </div>
  );
}
