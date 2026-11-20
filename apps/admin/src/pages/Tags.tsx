import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Table,
  TCell,
  Textarea,
  TH,
  THead,
  TRow,
} from "../components/ui";
import { api } from "../lib/api";
import { errorMessage } from "../lib/format";
import { type Tag, dataSchema, tagSchema } from "../lib/schemas";
import { useToast } from "../lib/toast";

const tagsSchema = dataSchema(tagSchema.array());

interface TagForm {
  name: string;
  slug: string;
  description: string;
}

const emptyForm: TagForm = { name: "", slug: "", description: "" };

export function TagsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [form, setForm] = useState<TagForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const body = await api.get<unknown>("/v1/admin/tags");
      return tagsSchema.parse(body).data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
      };
      if (editing) {
        await api.patch(`/v1/admin/tags/${editing.id}`, payload);
      } else {
        await api.post("/v1/admin/tags", payload);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast(editing ? "Tag actualizado." : "Tag creado.", "success");
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: async (tag: Tag) => {
      await api.delete(`/v1/admin/tags/${tag.id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast("Tag eliminado.", "success");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setOpen(true);
  };

  const startEdit = (tag: Tag) => {
    setEditing(tag);
    setForm({ name: tag.name, slug: tag.slug, description: tag.description ?? "" });
    setFormError(null);
    setOpen(true);
  };

  const submit = () => {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
      setFormError("El slug debe estar en kebab-case.");
      return;
    }
    mutation.mutate();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Taxonomía"
        title="Tags"
        description="Los tags con posts publicados aparecen en el sitio."
        actions={
          <Button variant="primary" onClick={startCreate}>
            Nuevo tag
          </Button>
        }
      />

      {query.isError ? (
        <ErrorBanner message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      {query.isLoading ? <Spinner label="Cargando tags…" /> : null}

      {query.data ? (
        query.data.length === 0 ? (
          <EmptyState title="Sin tags" description="Crea el primer tag del sitio." />
        ) : (
          <Table caption="Listado de tags">
            <THead>
              <TRow>
                <TH>Tag</TH>
                <TH>Slug</TH>
                <TH>Descripción</TH>
                <TH className="text-right">Posts</TH>
                <TH className="text-right">Acciones</TH>
              </TRow>
            </THead>
            <tbody>
              {query.data.map((tag) => (
                <TRow key={tag.id}>
                  <TCell>
                    <span className="font-medium text-bone">{tag.name}</span>
                  </TCell>
                  <TCell>
                    <span className="font-mono text-xs text-muted">{tag.slug}</span>
                  </TCell>
                  <TCell className="max-w-md text-xs text-muted">
                    {tag.description ?? "—"}
                  </TCell>
                  <TCell className="text-right">
                    <Badge tone={tag.post_count > 0 ? "accent" : "neutral"}>
                      {tag.post_count}
                    </Badge>
                  </TCell>
                  <TCell>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" onClick={() => startEdit(tag)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={tag.post_count > 0 || remove.isPending}
                        title={
                          tag.post_count > 0
                            ? "No se puede eliminar un tag con posts"
                            : "Eliminar tag"
                        }
                        onClick={() => {
                          if (window.confirm(`¿Eliminar el tag «${tag.name}»?`)) {
                            remove.mutate(tag);
                          }
                        }}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )
      ) : null}

      <Modal
        open={open}
        title={editing ? "Editar tag" : "Nuevo tag"}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre">
            <Input
              value={form.name}
              maxLength={80}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Slug" hint="Kebab-case, único.">
            <Input
              value={form.slug}
              maxLength={100}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
            />
          </Field>
          <Field label="Descripción">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          {formError ? (
            <p className="border border-red/50 bg-red/5 px-3 py-2 text-sm text-red-bright">
              {formError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
