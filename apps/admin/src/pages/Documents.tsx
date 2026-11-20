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
import { errorMessage, formatBytes, formatDate } from "../lib/format";
import { type Document, dataSchema, documentSchema } from "../lib/schemas";
import { useToast } from "../lib/toast";

const documentsSchema = dataSchema(documentSchema.array());

const kindLabels: Record<Document["kind"], string> = {
  cv: "CV",
  certificate: "Certificado",
  other: "Otro",
};

export function DocumentsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Document["kind"]>("other");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const body = await api.get<unknown>("/v1/admin/documents");
      return documentsSchema.parse(body).data;
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecciona un PDF.");
      const form = new FormData();
      form.append("file", file);
      form.append("title", title.trim());
      form.append("kind", kind);
      await api.upload("/v1/admin/documents", form);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast("Documento subido.", "success");
      setOpen(false);
      setFile(null);
      setTitle("");
      setKind("other");
      setUploadError(null);
    },
    onError: (error) => setUploadError(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: async (document: Document) => {
      await api.delete(`/v1/admin/documents/${document.id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast("Documento eliminado.", "success");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Contenido"
        title="Documentos"
        description="PDFs públicos: CV, certificados y otros. Máximo 20 MB."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setUploadError(null);
              setOpen(true);
            }}
          >
            Subir PDF
          </Button>
        }
      />

      {query.isError ? (
        <ErrorBanner message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      {query.isLoading ? <Spinner label="Cargando documentos…" /> : null}

      {query.data ? (
        query.data.length === 0 ? (
          <EmptyState
            title="Sin documentos"
            description="Sube el primer PDF para enlazarlo desde la landing."
          />
        ) : (
          <Table caption="Listado de documentos">
            <THead>
              <TRow>
                <TH>Título</TH>
                <TH>Tipo</TH>
                <TH>Archivo</TH>
                <TH>Tamaño</TH>
                <TH>Creado</TH>
                <TH className="text-right">Acciones</TH>
              </TRow>
            </THead>
            <tbody>
              {query.data.map((document) => (
                <TRow key={document.id}>
                  <TCell>
                    <span className="font-medium text-bone">{document.title}</span>
                  </TCell>
                  <TCell>
                    <Badge tone="neutral">{kindLabels[document.kind]}</Badge>
                  </TCell>
                  <TCell>
                    <a
                      href={document.url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all font-mono text-xs text-red-bright hover:underline"
                    >
                      {document.url.split("/").pop() ?? document.url}
                    </a>
                  </TCell>
                  <TCell className="font-mono text-xs text-muted">
                    {formatBytes(document.size_bytes)}
                  </TCell>
                  <TCell className="whitespace-nowrap text-xs text-muted">
                    {formatDate(document.created_at)}
                  </TCell>
                  <TCell>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`¿Eliminar «${document.title}»?`)) {
                            remove.mutate(document);
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
        title="Subir documento"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={upload.isPending || !file || !title.trim()}
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? "Subiendo…" : "Subir"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Archivo PDF" hint="Máximo 20 MB.">
            <input
              type="file"
              accept="application/pdf"
              className="block w-full border border-line bg-ink p-2 text-sm text-muted file:mr-3 file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-xs file:text-bone"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="Título">
            <Input
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="Tipo">
            <Select
              value={kind}
              onChange={(event) => setKind(event.target.value as Document["kind"])}
            >
              <option value="cv">CV</option>
              <option value="certificate">Certificado</option>
              <option value="other">Otro</option>
            </Select>
          </Field>
          {uploadError ? (
            <p className="border border-red/50 bg-red/5 px-3 py-2 text-sm text-red-bright">
              {uploadError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
