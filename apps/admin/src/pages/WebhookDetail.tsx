import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  PageHeader,
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
import { dataSchema, webhookEventDetailSchema } from "../lib/schemas";
import { useToast } from "../lib/toast";

const detailSchema = dataSchema(webhookEventDetailSchema);

export function WebhookDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["webhook", eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const body = await webhookApi.get<unknown>(`/v1/admin/events/${eventId}`);
      return detailSchema.parse(body).data;
    },
  });

  const retry = useMutation({
    mutationFn: async () => {
      await webhookApi.post(`/v1/admin/events/${eventId}/retry`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["webhook", eventId] });
      await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast("Reintento encolado.", "success");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  if (query.isLoading) {
    return <Spinner label="Cargando evento…" />;
  }

  if (query.isError) {
    return <ErrorBanner message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const event = query.data;
  if (!event) {
    return null;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Webhook"
        title={event.type}
        description={event.event_id}
        actions={
          <>
            <Badge tone={statusTone(event.status)}>{event.status}</Badge>
            <Button
              variant="primary"
              disabled={retry.isPending || event.status === "processing"}
              onClick={() => retry.mutate()}
            >
              Reintentar
            </Button>
            <Link to="/webhooks">
              <Button>Volver</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="label-mono text-faint">Intentos</p>
          <p className="mt-2 font-display text-3xl text-bone">{event.attempts}</p>
        </Card>
        <Card className="p-4">
          <p className="label-mono text-faint">Recibido</p>
          <p className="mt-2 text-sm text-bone">{formatDateTime(event.received_at)}</p>
        </Card>
        <Card className="p-4">
          <p className="label-mono text-faint">Procesado</p>
          <p className="mt-2 text-sm text-bone">{formatDateTime(event.processed_at)}</p>
        </Card>
        <Card className="p-4">
          <p className="label-mono text-faint">Último error</p>
          <p className="mt-2 break-words text-sm text-red-bright">
            {event.last_error ?? "—"}
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-2xl text-bone">Payload</h2>
        </div>
        <pre className="max-h-96 overflow-auto bg-ink p-5 font-mono text-xs leading-relaxed text-muted">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      </Card>

      <Card className="mt-4">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-2xl text-bone">Intentos de entrega</h2>
        </div>
        {event.attempts_log.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Sin intentos registrados.</p>
        ) : (
          <Table caption="Intentos de entrega">
            <THead>
              <TRow>
                <TH>#</TH>
                <TH>Status HTTP</TH>
                <TH>Error</TH>
                <TH>Duración</TH>
                <TH>Fecha</TH>
              </TRow>
            </THead>
            <tbody>
              {event.attempts_log.map((attempt) => (
                <TRow key={`${attempt.attempt}-${attempt.created_at}`}>
                  <TCell className="font-mono text-xs text-muted">{attempt.attempt}</TCell>
                  <TCell className="font-mono text-xs text-bone">
                    {attempt.status_code ?? "—"}
                  </TCell>
                  <TCell className="text-xs text-red-bright">{attempt.error ?? "—"}</TCell>
                  <TCell className="font-mono text-xs text-muted">{attempt.duration_ms} ms</TCell>
                  <TCell className="whitespace-nowrap text-xs text-muted">
                    {formatDateTime(attempt.created_at)}
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
