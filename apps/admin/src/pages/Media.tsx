import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
} from "../components/ui";
import { api } from "../lib/api";
import { errorMessage, formatBytes, formatDate } from "../lib/format";
import { type Media, mediaSchema, pageSchema } from "../lib/schemas";
import { useToast } from "../lib/toast";

const mediaPageSchema = pageSchema(mediaSchema);

export function MediaPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [editing, setEditing] = useState<Media | null>(null);
  const [editAlt, setEditAlt] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["media", page, q],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "24" });
      if (q) params.set("q", q);
      const body = await api.get<unknown>(`/v1/admin/media?${params.toString()}`);
      return mediaPageSchema.parse(body);
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecciona un archivo.");
      const form = new FormData();
      form.append("file", file);
      form.append("alt", alt.trim());
      await api.upload("/v1/admin/media", form);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["media"] });
      toast("Archivo subido.", "success");
      setUploadOpen(false);
      setFile(null);
      setAlt("");
      setUploadError(null);
    },
    onError: (error) => setUploadError(errorMessage(error)),
  });

  const updateAlt = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await api.patch(`/v1/admin/media/${editing.id}`, { alt: editAlt.trim() });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["media"] });
      toast("Texto alternativo actualizado.", "success");
      setEditing(null);
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const remove = useMutation({
    mutationFn: async (media: Media) => {
      await api.delete(`/v1/admin/media/${media.id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["media"] });
      toast("Media eliminada.", "success");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  };

  return (
    <div>
      <PageHeader
        eyebrow="Contenido"
        title="Media"
        description="AVIF, WebP, JPEG y PNG hasta 10 MB. Se generan variantes 1200w, 800w y 400w."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setUploadError(null);
              setUploadOpen(true);
            }}
          >
            Subir archivo
          </Button>
        }
      />

      <form onSubmit={onSearch} className="mb-4 flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1">
          <span className="label-mono mb-2 block text-muted">Buscar</span>
          <Input
            value={qInput}
            placeholder="Alt o nombre del archivo"
            onChange={(event) => setQInput(event.target.value)}
          />
        </label>
        <Button type="submit">Buscar</Button>
      </form>

      {query.isError ? (
        <ErrorBanner message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      {query.isLoading ? <Spinner label="Cargando media…" /> : null}

      {query.data ? (
        query.data.data.length === 0 ? (
          <EmptyState
            title="Sin archivos"
            description="Sube la primera imagen para usarla en posts y proyectos."
            action={
              <Button variant="primary" onClick={() => setUploadOpen(true)}>
                Subir archivo
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {query.data.data.map((media) => (
                <figure key={media.id} className="border border-line bg-surface">
                  <a href={media.url} target="_blank" rel="noreferrer">
                    <img
                      src={media.url}
                      alt={media.alt}
                      className="aspect-[4/3] w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                  <figcaption className="space-y-2 p-3">
                    <p className="truncate text-sm text-bone" title={media.alt}>
                      {media.alt || "Sin alt"}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-faint">
                      {media.width}×{media.height} · {formatBytes(media.size_bytes)} ·{" "}
                      {formatDate(media.created_at)}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditing(media);
                          setEditAlt(media.alt);
                        }}
                      >
                        Alt
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              "¿Eliminar esta imagen? La API rechazará la operación si está en uso.",
                            )
                          ) {
                            remove.mutate(media);
                          }
                        }}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
            <Pagination meta={query.data.meta} onPageChange={setPage} />
          </>
        )
      ) : null}

      <Modal
        open={uploadOpen}
        title="Subir media"
        onClose={() => setUploadOpen(false)}
        footer={
          <>
            <Button onClick={() => setUploadOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={upload.isPending || !file}
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? "Subiendo…" : "Subir"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Archivo" hint="Máximo 10 MB. MIME real validado en el servidor.">
            <input
              type="file"
              accept="image/avif,image/webp,image/jpeg,image/png"
              className="block w-full border border-line bg-ink p-2 text-sm text-muted file:mr-3 file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-xs file:text-bone"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="Texto alternativo">
            <Input value={alt} maxLength={200} onChange={(event) => setAlt(event.target.value)} />
          </Field>
          {uploadError ? (
            <p className="border border-red/50 bg-red/5 px-3 py-2 text-sm text-red-bright">
              {uploadError}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        title="Editar texto alternativo"
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={updateAlt.isPending || !editAlt.trim()}
              onClick={() => updateAlt.mutate()}
            >
              Guardar
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <img
              src={editing.url}
              alt={editing.alt}
              className="max-h-52 border border-line object-contain"
            />
            <Field label="Alt">
              <Input
                value={editAlt}
                maxLength={200}
                onChange={(event) => setEditAlt(event.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
