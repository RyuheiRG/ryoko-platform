import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { MediaPicker, useMediaOptions } from "../components/MediaPicker";
import {
  Badge,
  Button,
  Card,
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
  type AboutSection,
  type Certification,
  type ContactSection,
  type HeroSection,
  type Landing,
  type Media,
  type StackCategory,
  dataSchema,
  landingSchema,
} from "../lib/schemas";
import { useToast } from "../lib/toast";

const landingEnvelopeSchema = dataSchema(landingSchema);

const tabs = ["hero", "about", "stack", "certifications", "contact"] as const;
type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
  hero: "Hero",
  about: "Sobre mí",
  stack: "Stack",
  certifications: "Certificaciones",
  contact: "Contacto",
};

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseStackItems(value: string): StackCategory["items"] {
  return splitLines(value).map((line) => {
    const [name, icon] = line.split(":").map((part) => part.trim());
    return { name: name ?? line, icon: icon && icon.length > 0 ? icon : null };
  });
}

export function LandingPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("hero");
  const [draft, setDraft] = useState<Landing | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["landing"],
    queryFn: async () => {
      const body = await api.get<unknown>("/v1/admin/landing");
      return landingEnvelopeSchema.parse(body).data;
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
      if (!draft) throw new Error("La landing aún no se ha cargado.");
      const parsed = landingSchema.safeParse(draft);
      if (!parsed.success) {
        throw new Error(
          `Datos inválidos en: ${parsed.error.issues
            .map((issue) => issue.path.join("."))
            .join(", ")}`,
        );
      }
      const body = await api.put<unknown>("/v1/admin/landing", parsed.data);
      return landingEnvelopeSchema.parse(body).data;
    },
    onSuccess: (data) => {
      setDraft(structuredClone(data));
      queryClient.setQueryData(["landing"], data);
      toast("Landing actualizada.", "success");
      setFormError(null);
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const updateHero = (patch: Partial<HeroSection>) => {
    setDraft((current) => (current ? { ...current, hero: { ...current.hero, ...patch } } : current));
  };

  const updateAbout = (patch: Partial<AboutSection>) => {
    setDraft((current) =>
      current ? { ...current, about: { ...current.about, ...patch } } : current,
    );
  };

  const updateContact = (patch: Partial<ContactSection>) => {
    setDraft((current) =>
      current ? { ...current, contact: { ...current.contact, ...patch } } : current,
    );
  };

  const updateStack = (index: number, patch: Partial<StackCategory>) => {
    setDraft((current) => {
      if (!current) return current;
      const stack = current.stack.map((category, itemIndex) =>
        itemIndex === index ? { ...category, ...patch } : category,
      );
      return { ...current, stack };
    });
  };

  const updateCertification = (index: number, patch: Partial<Certification>) => {
    setDraft((current) => {
      if (!current) return current;
      const certifications = current.certifications.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      );
      return { ...current, certifications };
    });
  };

  if (query.isLoading) {
    return <Spinner label="Cargando landing…" />;
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
        title="Landing"
        description="El documento completo reemplaza la landing pública. Cada sección se guarda en conjunto."
        actions={
          <>
            <Badge tone="neutral">5 secciones</Badge>
            <Button onClick={() => void query.refetch()}>Recargar</Button>
            <Button
              variant="primary"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Guardando…" : "Guardar landing"}
            </Button>
          </>
        }
      />

      {formError ? (
        <div className="mb-6 border border-red/50 bg-red/5 px-4 py-3 text-sm text-red-bright">
          {formError}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1">
        {tabs.map((item) => (
          <Button
            key={item}
            size="sm"
            variant={tab === item ? "primary" : "secondary"}
            onClick={() => setTab(item)}
          >
            {tabLabels[item]}
          </Button>
        ))}
      </div>

      {tab === "hero" ? (
        <Card className="p-5">
          <h2 className="font-display text-2xl text-bone">Hero</h2>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Eyebrow">
                <Input
                  value={draft.hero.eyebrow}
                  onChange={(event) => updateHero({ eyebrow: event.target.value })}
                />
              </Field>
              <Field label="Alias">
                <Input
                  value={draft.hero.alias}
                  onChange={(event) => updateHero({ alias: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Título">
              <Input
                value={draft.hero.title}
                onChange={(event) => updateHero({ title: event.target.value })}
              />
            </Field>
            <Field label="Statement">
              <Textarea
                rows={3}
                value={draft.hero.statement}
                onChange={(event) => updateHero({ statement: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 border border-line p-4">
                <p className="label-mono text-faint">CTA primario</p>
                <Field label="Label">
                  <Input
                    value={draft.hero.primary_cta.label}
                    onChange={(event) =>
                      updateHero({
                        primary_cta: { ...draft.hero.primary_cta, label: event.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Href">
                  <Input
                    value={draft.hero.primary_cta.href}
                    onChange={(event) =>
                      updateHero({
                        primary_cta: { ...draft.hero.primary_cta, href: event.target.value },
                      })
                    }
                  />
                </Field>
              </div>
              <div className="space-y-2 border border-line p-4">
                <p className="label-mono text-faint">CTA secundario</p>
                <Field label="Label">
                  <Input
                    value={draft.hero.secondary_cta.label}
                    onChange={(event) =>
                      updateHero({
                        secondary_cta: { ...draft.hero.secondary_cta, label: event.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Href">
                  <Input
                    value={draft.hero.secondary_cta.href}
                    onChange={(event) =>
                      updateHero({
                        secondary_cta: { ...draft.hero.secondary_cta, href: event.target.value },
                      })
                    }
                  />
                </Field>
              </div>
            </div>
            <div className="max-w-sm">
              <MediaPicker
                label="Retrato"
                value={draft.hero.portrait?.id ?? null}
                onChange={(id) => updateHero({ portrait: mediaFromId(id) })}
              />
              {draft.hero.portrait ? (
                <img
                  src={draft.hero.portrait.url}
                  alt={draft.hero.portrait.alt}
                  className="mt-3 h-40 w-32 border border-line object-cover"
                />
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "about" ? (
        <Card className="p-5">
          <h2 className="font-display text-2xl text-bone">Sobre mí</h2>
          <div className="mt-4 space-y-4">
            <Field label="Título">
              <Input
                value={draft.about.title}
                onChange={(event) => updateAbout({ title: event.target.value })}
              />
            </Field>
            <Field label="Body Markdown">
              <Textarea
                rows={10}
                className="font-mono text-xs"
                value={draft.about.body_md}
                onChange={(event) => updateAbout({ body_md: event.target.value })}
              />
            </Field>
            <div className="max-w-sm">
              <MediaPicker
                label="Foto"
                value={draft.about.photo?.id ?? null}
                onChange={(id) => updateAbout({ photo: mediaFromId(id) })}
              />
            </div>
            <Field label="Highlights" hint="Uno por línea.">
              <Textarea
                rows={4}
                value={draft.about.highlights.join("\n")}
                onChange={(event) =>
                  updateAbout({ highlights: splitLines(event.target.value) })
                }
              />
            </Field>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="label-mono text-muted">Facts</p>
                <Button
                  size="sm"
                  onClick={() =>
                    updateAbout({ facts: [...draft.about.facts, { label: "", value: "" }] })
                  }
                >
                  Agregar fact
                </Button>
              </div>
              <div className="space-y-2">
                {draft.about.facts.map((fact, index) => (
                  <div key={index} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-40 flex-1">
                      <Field label="Label">
                        <Input
                          value={fact.label}
                          onChange={(event) => {
                            const facts = draft.about.facts.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, label: event.target.value } : item,
                            );
                            updateAbout({ facts });
                          }}
                        />
                      </Field>
                    </div>
                    <div className="min-w-40 flex-1">
                      <Field label="Valor">
                        <Input
                          value={fact.value}
                          onChange={(event) => {
                            const facts = draft.about.facts.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, value: event.target.value } : item,
                            );
                            updateAbout({ facts });
                          }}
                        />
                      </Field>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        updateAbout({
                          facts: draft.about.facts.filter((_, itemIndex) => itemIndex !== index),
                        })
                      }
                    >
                      Quitar
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="label-mono text-muted">Timeline</p>
                <Button
                  size="sm"
                  onClick={() =>
                    updateAbout({
                      timeline: [
                        ...draft.about.timeline,
                        { year: new Date().getUTCFullYear(), title: "", description: null },
                      ],
                    })
                  }
                >
                  Agregar entrada
                </Button>
              </div>
              <div className="space-y-2">
                {draft.about.timeline.map((entry, index) => (
                  <div key={index} className="flex flex-wrap items-end gap-2">
                    <div className="w-24">
                      <Field label="Año">
                        <Input
                          type="number"
                          value={entry.year}
                          onChange={(event) => {
                            const timeline = draft.about.timeline.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, year: Number(event.target.value) }
                                : item,
                            );
                            updateAbout({ timeline });
                          }}
                        />
                      </Field>
                    </div>
                    <div className="min-w-40 flex-1">
                      <Field label="Título">
                        <Input
                          value={entry.title}
                          onChange={(event) => {
                            const timeline = draft.about.timeline.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, title: event.target.value }
                                : item,
                            );
                            updateAbout({ timeline });
                          }}
                        />
                      </Field>
                    </div>
                    <div className="min-w-40 flex-1">
                      <Field label="Descripción">
                        <Input
                          value={entry.description ?? ""}
                          onChange={(event) => {
                            const timeline = draft.about.timeline.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, description: event.target.value || null }
                                : item,
                            );
                            updateAbout({ timeline });
                          }}
                        />
                      </Field>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        updateAbout({
                          timeline: draft.about.timeline.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                      }
                    >
                      Quitar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "stack" ? (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-bone">Stack</h2>
            <Button
              size="sm"
              onClick={() =>
                setDraft({
                  ...draft,
                  stack: [...draft.stack, { category: "", items: [] }],
                })
              }
            >
              Agregar categoría
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {draft.stack.map((category, index) => (
              <div key={index} className="space-y-3 border border-line p-4">
                <Field label="Categoría">
                  <Input
                    value={category.category}
                    onChange={(event) => updateStack(index, { category: event.target.value })}
                  />
                </Field>
                <Field label="Items" hint="name:icon por línea, por ejemplo TypeScript:typescript.">
                  <Textarea
                    rows={4}
                    className="font-mono text-xs"
                    value={category.items
                      .map((item) => (item.icon ? `${item.name}:${item.icon}` : item.name))
                      .join("\n")}
                    onChange={(event) =>
                      updateStack(index, { items: parseStackItems(event.target.value) })
                    }
                  />
                </Field>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      stack: draft.stack.filter((_, itemIndex) => itemIndex !== index),
                    })
                  }
                >
                  Quitar categoría
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "certifications" ? (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-bone">Certificaciones</h2>
            <Button
              size="sm"
              onClick={() =>
                setDraft({
                  ...draft,
                  certifications: [
                    ...draft.certifications,
                    { title: "", issuer: "", date: "", url: null },
                  ],
                })
              }
            >
              Agregar certificación
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {draft.certifications.map((certification, index) => (
              <div key={index} className="space-y-3 border border-line p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Título">
                    <Input
                      value={certification.title}
                      onChange={(event) =>
                        updateCertification(index, { title: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Emisor">
                    <Input
                      value={certification.issuer}
                      onChange={(event) =>
                        updateCertification(index, { issuer: event.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Fecha" hint="YYYY-MM-DD">
                    <Input
                      value={certification.date}
                      placeholder="2025-11-21"
                      onChange={(event) =>
                        updateCertification(index, { date: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="URL">
                    <Input
                      type="url"
                      value={certification.url ?? ""}
                      onChange={(event) =>
                        updateCertification(index, { url: event.target.value || null })
                      }
                    />
                  </Field>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      certifications: draft.certifications.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    })
                  }
                >
                  Quitar
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "contact" ? (
        <Card className="p-5">
          <h2 className="font-display text-2xl text-bone">Contacto</h2>
          <div className="mt-4 space-y-4">
            <Field label="Título">
              <Input
                value={draft.contact.title}
                onChange={(event) => updateContact({ title: event.target.value })}
              />
            </Field>
            <Field label="Body">
              <Textarea
                rows={3}
                value={draft.contact.body}
                onChange={(event) => updateContact({ body: event.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={draft.contact.email}
                onChange={(event) => updateContact({ email: event.target.value })}
              />
            </Field>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="label-mono text-muted">Links</p>
                <Button
                  size="sm"
                  onClick={() =>
                    updateContact({
                      links: [...draft.contact.links, { label: "", url: "", icon: "" }],
                    })
                  }
                >
                  Agregar link
                </Button>
              </div>
              <div className="space-y-2">
                {draft.contact.links.map((link, index) => (
                  <div key={index} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-32 flex-1">
                      <Field label="Label">
                        <Input
                          value={link.label}
                          onChange={(event) => {
                            const links = draft.contact.links.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, label: event.target.value } : item,
                            );
                            updateContact({ links });
                          }}
                        />
                      </Field>
                    </div>
                    <div className="min-w-48 flex-[2]">
                      <Field label="URL">
                        <Input
                          type="url"
                          value={link.url}
                          onChange={(event) => {
                            const links = draft.contact.links.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, url: event.target.value } : item,
                            );
                            updateContact({ links });
                          }}
                        />
                      </Field>
                    </div>
                    <div className="w-28">
                      <Field label="Icono">
                        <Input
                          value={link.icon}
                          onChange={(event) => {
                            const links = draft.contact.links.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, icon: event.target.value } : item,
                            );
                            updateContact({ links });
                          }}
                        />
                      </Field>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        updateContact({
                          links: draft.contact.links.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                      }
                    >
                      Quitar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="mt-6 flex justify-end">
        <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Guardando…" : "Guardar landing"}
        </Button>
      </div>
    </div>
  );
}
