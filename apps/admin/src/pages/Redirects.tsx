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
  Select,
  Spinner,
  Table,
  TCell,
  TH,
  THead,
  TRow,
} from "../components/ui";
import { api } from "../lib/api";
import { errorMessage, formatDate } from "../lib/format";
import { type Redirect, dataSchema, redirectSchema } from "../lib/schemas";
import { useToast } from "../lib/toast";

const redirectsSchema = dataSchema(redirectSchema.array());

export function RedirectsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [fromPath, setFromPath] = useState("");
  const [toPath, setToPath] = useState("");
  const [status, setStatus] = useState<301 | 308>(301);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["redirects"],
    queryFn: async () => {
      const body = await api.get<unknown>("/v1/admin/redirects");
      return redirectsSchema.parse(body).data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      await api.post("/v1/admin/redirects", {
        from_path: fromPath.trim(),
        to_path: toPath.trim(),
        status,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["redirects"] });
      toast("Redirect creado.", "success");
      setOpen(false);
      setFromPath("");
      setToPath("");
      setStatus(301);
      setFormError(null);
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: async (redirect: Redirect) => {
      await api.delete(`/v1/admin/redirects/${redirect.id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["redirects"] });
      toast("Redirect eliminado.", "success");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const submit = () => {
    setFormError(null);
    if (!fromPath.trim().startsWith("/") || !toPath.trim().startsWith("/")) {
      setFormError("Ambas rutas deben iniciar con /.");
      return;
    }
    create.mutate();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Sitio"
        title="Redirects"
        description="Rutas antiguas que apuntan a nuevas. Los cambios de slug publicados se agregan aquí automáticamente."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setFormError(null);
              setOpen(true);
            }}
          >
            Nuevo redirect
          </Button>
        }
      />

      {query.isError ? (
        <ErrorBanner message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      {query.isLoading ? <Spinner label="Cargando redirects…" /> : null}

      {query.data ? (
        query.data.length === 0 ? (
          <EmptyState
            title="Sin redirects"
            description="Aún no hay rutas antiguas registradas."
          />
        ) : (
          <Table caption="Listado de redirects">
            <THead>
              <TRow>
                <TH>Desde</TH>
                <TH>Hacia</TH>
                <TH>Status</TH>
                <TH>Creado</TH>
                <TH className="text-right">Acciones</TH>
              </TRow>
            </THead>
            <tbody>
              {query.data.map((redirect) => (
                <TRow key={redirect.id}>
                  <TCell>
                    <span className="font-mono text-xs text-bone">{redirect.from_path}</span>
                  </TCell>
                  <TCell>
                    <span className="font-mono text-xs text-muted">{redirect.to_path}</span>
                  </TCell>
                  <TCell>
                    <Badge tone="neutral">{redirect.status}</Badge>
                  </TCell>
                  <TCell className="whitespace-nowrap text-xs text-muted">
                    {formatDate(redirect.created_at)}
                  </TCell>
                  <TCell>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`¿Eliminar el redirect ${redirect.from_path}?`)) {
                            remove.mutate(redirect);
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
        title="Nuevo redirect"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" disabled={create.isPending} onClick={submit}>
              {create.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Desde" hint="Ruta antigua, por ejemplo /blog/viejo-slug.">
            <Input
              value={fromPath}
              placeholder="/blog/viejo-slug"
              onChange={(event) => setFromPath(event.target.value)}
            />
          </Field>
          <Field label="Hacia" hint="Ruta nueva, por ejemplo /blog/nuevo-slug.">
            <Input
              value={toPath}
              placeholder="/blog/nuevo-slug"
              onChange={(event) => setToPath(event.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select
              value={String(status)}
              onChange={(event) => setStatus(event.target.value === "308" ? 308 : 301)}
            >
              <option value="301">301</option>
              <option value="308">308</option>
            </Select>
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
