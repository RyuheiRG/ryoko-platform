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
import { webhookApi } from "../lib/api";
import { errorMessage, formatDateTime } from "../lib/format";
import { type WebhookEvent, pageSchema, webhookEventSchema } from "../lib/schemas";
import { useToast } from "../lib/toast";

const eventsSchema = pageSchema(webhookEventSchema);

const eventTypes = [
  "post.published",
  "post.updated",
  "post.unpublished",
  "project.published",
  "project.updated",
  "project.unpublished",
];

export function WebhooksPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["webhooks", page, status, type],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (status) params.set("status", status);
      if (type) params.set("type", type);
      const body = await webhookApi.get<unknown>(`/v1/admin/events?${params.toString()}`);
      return eventsSchema.parse(body);
    },
  });

  const retry = useMutation({
    mutationFn: async (event: WebhookEvent) => {
      await webhookApi.post(`/v1/admin/events/${event.event_id}/retry`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast("Reintento encolado.", "success");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Sistema"
        title="Webhooks"
        description="Eventos recibidos de la Content API, con intentos, errores y reintentos manuales."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
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
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="delivered">Delivered</option>
            <option value="dead_letter">Dead letter</option>
          </Select>
        </label>
        <label className="w-56">
          <span className="label-mono mb-2 block text-muted">Tipo</span>
          <Select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {eventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ))}
          </Select>
        </label>
        <Button variant="ghost" onClick={() => void query.refetch()}>
          Actualizar
        </Button>
      </div>

      {query.isError ? (
        <ErrorBanner message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      {query.isLoading ? <Spinner label="Cargando eventos…" /> : null}

      {query.data ? (
        query.data.data.length === 0 ? (
          <EmptyState
            title="Sin eventos"
            description="Los webhooks aparecerán cuando se publique o actualice contenido."
          />
        ) : (
          <>
            <Table caption="Bandeja de webhooks">
              <THead>
                <TRow>
                  <TH>Evento</TH>
                  <TH>Tipo</TH>
                  <TH>Estado</TH>
                  <TH>Intentos</TH>
                  <TH>Recibido</TH>
                  <TH>Procesado</TH>
                  <TH className="text-right">Acciones</TH>
                </TRow>
              </THead>
              <tbody>
                {query.data.data.map((event) => (
                  <TRow key={event.id}>
                    <TCell>
                      <Link
                        to={`/webhooks/${event.event_id}`}
                        className="font-mono text-[11px] text-bone hover:text-red-bright"
                      >
                        {event.event_id}
                      </Link>
                      {event.last_error ? (
                        <span className="mt-1 block max-w-xs truncate text-[11px] text-red-bright">
                          {event.last_error}
                        </span>
                      ) : null}
                    </TCell>
                    <TCell>
                      <span className="font-mono text-xs text-muted">{event.type}</span>
                    </TCell>
                    <TCell>
                      <Badge tone={statusTone(event.status)}>{event.status}</Badge>
                    </TCell>
                    <TCell className="font-mono text-xs text-muted">{event.attempts}</TCell>
                    <TCell className="whitespace-nowrap text-xs text-muted">
                      {formatDateTime(event.received_at)}
                    </TCell>
                    <TCell className="whitespace-nowrap text-xs text-muted">
                      {event.processed_at ? formatDateTime(event.processed_at) : "—"}
                    </TCell>
                    <TCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Link to={`/webhooks/${event.event_id}`}>
                          <Button size="sm">Detalle</Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={retry.isPending || event.status === "processing"}
                          title={
                            event.status === "processing"
                              ? "El evento se está procesando"
                              : "Reintentar entrega"
                          }
                          onClick={() => retry.mutate(event)}
                        >
                          Reintentar
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
