import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { MediaPicker, useMediaOptions } from "../components/MediaPicker";
import {
  Button,
  Card,
  Checkbox,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Spinner,
  Textarea,
} from "../components/ui";
import { api } from "../lib/api";
import { errorMessage } from "../lib/format";
import {
  type Author,
  type Media,
  type SiteSettings,
  dataSchema,
  siteSettingsSchema,
} from "../lib/schemas";
import { useToast } from "../lib/toast";

const settingsEnvelopeSchema = dataSchema(siteSettingsSchema);

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<SiteSettings | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const body = await api.get<unknown>("/v1/admin/settings");
      return settingsEnvelopeSchema.parse(body).data;
    },
  });

  const mediaQuery = useMediaOptions();

  useEffect(() => {
    if (query.data && !initialized) {
      setDraft(structuredClone(query.data));
      setInitialized(true);
    }
  }, [query.data, initialized]);

  const mediaFromId = (id: string | null): Media | null => {
    if (!id) return null;
    return mediaQuery.data?.find((item) => item.id === id) ?? null;
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Los ajustes aún no se han cargado.");
      const parsed = siteSettingsSchema.safeParse(draft);
      if (!parsed.success) {
        throw new Error(
          `Datos inválidos en: ${parsed.error.issues
            .map((issue) => issue.path.join("."))
            .join(", ")}`,
        );
      }
      const body = await api.put<unknown>("/v1/admin/settings", parsed.data);
      return settingsEnvelopeSchema.parse(body).data;
    },
    onSuccess: (data) => {
      setDraft(structuredClone(data));
      queryClient.setQueryData(["settings"], data);
      toast("Ajustes guardados.", "success");
      setFormError(null);
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const update = (patch: Partial<SiteSettings>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const updateAuthor = (patch: Partial<Author>) => {
    setDraft((current) =>
      current ? { ...current, author: { ...current.author, ...patch } } : current,
    );
  };

  if (query.isLoading) {
    return <Spinner label="Cargando ajustes…" />;
  }

  if (query.isError) {
    return <ErrorBanner message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  if (!draft) {
    return null;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Sitio"
        title="Ajustes"
        description="Identidad, navegación, footer y defaults de SEO."
        actions={
          <>
            <Button onClick={() => void query.refetch()}>Recargar</Button>
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Guardando…" : "Guardar ajustes"}
            </Button>
          </>
        }
      />

      {formError ? (
        <div className="mb-6 border border-red/50 bg-red/5 px-4 py-3 text-sm text-red-bright">
          {formError}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-2xl text-bone">Identidad</h2>
          <div className="mt-4 space-y-4">
            <Field label="Site name">
              <Input
                value={draft.site_name}
                onChange={(event) => update({ site_name: event.target.value })}
              />
            </Field>
            <Field label="Tagline">
              <Input
                value={draft.tagline}
                onChange={(event) => update({ tagline: event.target.value })}
              />
            </Field>
            <Field label="Descripción" hint="Máximo 160 caracteres.">
              <Textarea
                rows={3}
                maxLength={160}
                value={draft.description}
                onChange={(event) => update({ description: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="URL">
                <Input
                  type="url"
                  value={draft.url}
                  onChange={(event) => update({ url: event.target.value })}
                />
              </Field>
              <Field label="Locale">
                <Input
                  value={draft.locale}
                  onChange={(event) => update({ locale: event.target.value })}
                />
              </Field>
            </div>
            <Checkbox
              label="Anuncios habilitados"
              checked={draft.features.ads_enabled}
              onChange={(event) =>
                update({ features: { ...draft.features, ads_enabled: event.target.checked } })
              }
            />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-2xl text-bone">Autor</h2>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <Input
                  value={draft.author.name}
                  onChange={(event) => updateAuthor({ name: event.target.value })}
                />
              </Field>
              <Field label="Alias">
                <Input
                  value={draft.author.alias ?? ""}
                  onChange={(event) => updateAuthor({ alias: event.target.value || null })}
                />
              </Field>
            </div>
            <Field label="Bio">
              <Textarea
                rows={4}
                value={draft.author.bio ?? ""}
                onChange={(event) => updateAuthor({ bio: event.target.value || null })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="GitHub URL">
                <Input
                  type="url"
                  value={draft.author.github_url ?? ""}
                  onChange={(event) =>
                    updateAuthor({ github_url: event.target.value || null })
                  }
                />
              </Field>
              <Field label="LinkedIn URL">
                <Input
                  type="url"
                  value={draft.author.linkedin_url ?? ""}
                  onChange={(event) =>
                    updateAuthor({ linkedin_url: event.target.value || null })
                  }
                />
              </Field>
            </div>
            <div className="max-w-sm">
              <MediaPicker
                label="Avatar"
                value={draft.author.avatar?.id ?? null}
                onChange={(id) => updateAuthor({ avatar: mediaFromId(id) })}
              />
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-bone">Navegación</h2>
          <Button
            size="sm"
            onClick={() => update({ nav: [...draft.nav, { label: "", href: "" }] })}
          >
            Agregar link
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {draft.nav.map((link, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1">
                <Field label="Label">
                  <Input
                    value={link.label}
                    onChange={(event) => {
                      const nav = draft.nav.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label: event.target.value } : item,
                      );
                      update({ nav });
                    }}
                  />
                </Field>
              </div>
              <div className="min-w-48 flex-[2]">
                <Field label="Href">
                  <Input
                    value={link.href}
                    onChange={(event) => {
                      const nav = draft.nav.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, href: event.target.value } : item,
                      );
                      update({ nav });
                    }}
                  />
                </Field>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => update({ nav: draft.nav.filter((_, itemIndex) => itemIndex !== index) })}
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-bone">Socials</h2>
          <Button
            size="sm"
            onClick={() =>
              update({ socials: [...draft.socials, { label: "", url: "", icon: "" }] })
            }
          >
            Agregar social
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {draft.socials.map((social, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <div className="min-w-32 flex-1">
                <Field label="Label">
                  <Input
                    value={social.label}
                    onChange={(event) => {
                      const socials = draft.socials.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label: event.target.value } : item,
                      );
                      update({ socials });
                    }}
                  />
                </Field>
              </div>
              <div className="min-w-48 flex-[2]">
                <Field label="URL">
                  <Input
                    type="url"
                    value={social.url}
                    onChange={(event) => {
                      const socials = draft.socials.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, url: event.target.value } : item,
                      );
                      update({ socials });
                    }}
                  />
                </Field>
              </div>
              <div className="w-28">
                <Field label="Icono">
                  <Input
                    value={social.icon}
                    onChange={(event) => {
                      const socials = draft.socials.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, icon: event.target.value } : item,
                      );
                      update({ socials });
                    }}
                  />
                </Field>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  update({
                    socials: draft.socials.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="font-display text-2xl text-bone">Footer</h2>
        <div className="mt-4 space-y-4">
          <Field label="Nota">
            <Input
              value={draft.footer.note}
              onChange={(event) =>
                update({ footer: { ...draft.footer, note: event.target.value } })
              }
            />
          </Field>
          <div className="flex items-center justify-between">
            <p className="label-mono text-muted">Links</p>
            <Button
              size="sm"
              onClick={() =>
                update({
                  footer: {
                    ...draft.footer,
                    links: [...draft.footer.links, { label: "", href: "" }],
                  },
                })
              }
            >
              Agregar link
            </Button>
          </div>
          {draft.footer.links.map((link, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1">
                <Field label="Label">
                  <Input
                    value={link.label}
                    onChange={(event) => {
                      const links = draft.footer.links.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label: event.target.value } : item,
                      );
                      update({ footer: { ...draft.footer, links } });
                    }}
                  />
                </Field>
              </div>
              <div className="min-w-48 flex-[2]">
                <Field label="Href">
                  <Input
                    value={link.href}
                    onChange={(event) => {
                      const links = draft.footer.links.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, href: event.target.value } : item,
                      );
                      update({ footer: { ...draft.footer, links } });
                    }}
                  />
                </Field>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  update({
                    footer: {
                      ...draft.footer,
                      links: draft.footer.links.filter((_, itemIndex) => itemIndex !== index),
                    },
                  })
                }
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="font-display text-2xl text-bone">SEO defaults</h2>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título" hint="Máximo 70 caracteres.">
              <Input
                maxLength={70}
                value={draft.seo_defaults.title ?? ""}
                onChange={(event) =>
                  update({
                    seo_defaults: {
                      ...draft.seo_defaults,
                      title: event.target.value || null,
                    },
                  })
                }
              />
            </Field>
            <Field label="Canonical URL">
              <Input
                type="url"
                value={draft.seo_defaults.canonical_url ?? ""}
                onChange={(event) =>
                  update({
                    seo_defaults: {
                      ...draft.seo_defaults,
                      canonical_url: event.target.value || null,
                    },
                  })
                }
              />
            </Field>
          </div>
          <Field label="Descripción" hint="Máximo 160 caracteres.">
            <Textarea
              rows={3}
              maxLength={160}
              value={draft.seo_defaults.description ?? ""}
              onChange={(event) =>
                update({
                  seo_defaults: {
                    ...draft.seo_defaults,
                    description: event.target.value || null,
                  },
                })
              }
            />
          </Field>
          <Field label="OG image URL">
            <Input
              type="url"
              value={draft.seo_defaults.og_image ?? ""}
              onChange={(event) =>
                update({
                  seo_defaults: {
                    ...draft.seo_defaults,
                    og_image: event.target.value || null,
                  },
                })
              }
            />
          </Field>
          <Checkbox
            label="Noindex por defecto"
            checked={draft.seo_defaults.noindex}
            onChange={(event) =>
              update({
                seo_defaults: { ...draft.seo_defaults, noindex: event.target.checked },
              })
            }
          />
        </div>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Guardando…" : "Guardar ajustes"}
        </Button>
      </div>
    </div>
  );
}
