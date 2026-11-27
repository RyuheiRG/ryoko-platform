import { z } from "zod";

export const mediaVariantSchema = z.object({
  width: z.number(),
  url: z.string(),
});

export const mediaSchema = z.object({
  id: z.string(),
  url: z.string(),
  width: z.number(),
  height: z.number(),
  mime_type: z.string(),
  size_bytes: z.number(),
  alt: z.string(),
  blurhash: z.string().nullable(),
  variants: z.array(mediaVariantSchema),
  created_at: z.string(),
});

export type Media = z.infer<typeof mediaSchema>;

export const authorSchema = z.object({
  id: z.string(),
  name: z.string(),
  alias: z.string().nullable(),
  avatar: mediaSchema.nullable(),
  bio: z.string().nullable(),
  github_url: z.string().nullable(),
  linkedin_url: z.string().nullable(),
});

export type Author = z.infer<typeof authorSchema>;

export const authUserSchema = authorSchema;

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  refresh_token: z.string(),
  user: authUserSchema,
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const seoSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  og_image: z.string().nullable(),
  canonical_url: z.string().nullable(),
  noindex: z.boolean(),
});

export type Seo = z.infer<typeof seoSchema>;

export const tagSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  post_count: z.number(),
});

export type Tag = z.infer<typeof tagSchema>;

export const publishStatusSchema = z.enum(["draft", "published", "archived"]);
export const lifecycleStatusSchema = z.enum(["live", "wip", "archived"]);
export const postTypeSchema = z.enum(["article", "note"]);

export type PublishStatus = z.infer<typeof publishStatusSchema>;
export type LifecycleStatus = z.infer<typeof lifecycleStatusSchema>;
export type PostType = z.infer<typeof postTypeSchema>;

export const postSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  cover: mediaSchema.nullable(),
  tags: z.array(tagSchema),
  published_at: z.string().nullable(),
  updated_at: z.string(),
  reading_time_minutes: z.number(),
  featured: z.boolean(),
  publish_status: publishStatusSchema,
  type: postTypeSchema,
  seo: seoSchema,
});

export const postSchema = postSummarySchema.extend({
  content_md: z.string(),
  author: authorSchema,
  cover_media_id: z.string().nullable(),
  tag_ids: z.array(z.string()),
  og_image_id: z.string().nullable(),
  scheduled_at: z.string().nullable(),
  created_at: z.string(),
});

export type Post = z.infer<typeof postSchema>;

export const projectSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  cover: mediaSchema.nullable(),
  stack: z.array(z.string()),
  year: z.number(),
  updated_at: z.string(),
  publish_status: publishStatusSchema,
  lifecycle_status: lifecycleStatusSchema,
  featured: z.boolean(),
  repo_url: z.string().nullable(),
  demo_url: z.string().nullable(),
  sort_order: z.number(),
  seo: seoSchema,
});

export const githubSchema = z.object({
  stars: z.number(),
  forks: z.number(),
  open_issues: z.number(),
  language: z.string().nullable(),
  languages: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  last_commit_at: z.string(),
  license: z.string().nullable(),
  html_url: z.string(),
  homepage: z.string().nullable(),
});

export const projectSchema = projectSummarySchema.extend({
  case_study_md: z.string(),
  gallery: z.array(mediaSchema),
  github: githubSchema.nullable(),
  role: z.string().nullable(),
  team: z.array(z.string()),
  learnings: z.array(z.string()),
  cover_media_id: z.string().nullable(),
  og_image_id: z.string().nullable(),
  gallery_media_ids: z.array(z.string()),
  github_repo: z.string().nullable(),
  created_at: z.string(),
});

export type Project = z.infer<typeof projectSchema>;

const linkSchema = z.object({ label: z.string(), href: z.string() });
const contactLinkSchema = z.object({ label: z.string(), url: z.string(), icon: z.string() });
const ctaSchema = z.object({ label: z.string(), href: z.string() });

export const heroSchema = z.object({
  eyebrow: z.string(),
  title: z.string(),
  alias: z.string(),
  statement: z.string(),
  primary_cta: ctaSchema,
  secondary_cta: ctaSchema,
  portrait: mediaSchema.nullable(),
});

export const aboutSchema = z.object({
  title: z.string(),
  body_md: z.string(),
  photo: mediaSchema.nullable(),
  highlights: z.array(z.string()),
  facts: z.array(z.object({ label: z.string(), value: z.string() })),
  timeline: z.array(
    z.object({
      year: z.number(),
      title: z.string(),
      description: z.string().nullable(),
    }),
  ),
});

export const stackCategorySchema = z.object({
  category: z.string(),
  items: z.array(z.object({ name: z.string(), icon: z.string().nullable() })),
});

export const certificationSchema = z.object({
  title: z.string(),
  issuer: z.string(),
  date: z.string(),
  url: z.string().nullable(),
});

export const contactSchema = z.object({
  title: z.string(),
  body: z.string(),
  email: z.string(),
  links: z.array(contactLinkSchema),
});

export const landingSchema = z.object({
  hero: heroSchema,
  about: aboutSchema,
  stack: z.array(stackCategorySchema),
  certifications: z.array(certificationSchema),
  contact: contactSchema,
});

export type Landing = z.infer<typeof landingSchema>;
export type HeroSection = z.infer<typeof heroSchema>;
export type AboutSection = z.infer<typeof aboutSchema>;
export type StackCategory = z.infer<typeof stackCategorySchema>;
export type Certification = z.infer<typeof certificationSchema>;
export type ContactSection = z.infer<typeof contactSchema>;

export const siteSettingsSchema = z.object({
  site_name: z.string(),
  tagline: z.string(),
  description: z.string(),
  url: z.string(),
  locale: z.string(),
  author: authorSchema,
  socials: z.array(z.object({ label: z.string(), url: z.string(), icon: z.string() })),
  nav: z.array(linkSchema),
  footer: z.object({ note: z.string(), links: z.array(linkSchema) }),
  seo_defaults: seoSchema,
  features: z.object({ ads_enabled: z.boolean() }),
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["cv", "certificate", "other"]),
  url: z.string(),
  mime_type: z.string(),
  size_bytes: z.number(),
  created_at: z.string(),
});

export type Document = z.infer<typeof documentSchema>;

export const redirectSchema = z.object({
  id: z.string(),
  from_path: z.string(),
  to_path: z.string(),
  status: z.union([z.literal(301), z.literal(308)]),
  created_at: z.string(),
});

export type Redirect = z.infer<typeof redirectSchema>;

export const webhookAttemptSchema = z.object({
  attempt: z.number(),
  status_code: z.number().nullable(),
  error: z.string().nullable(),
  duration_ms: z.number(),
  created_at: z.string(),
});

export const webhookEventSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  type: z.string(),
  status: z.string(),
  attempts: z.number(),
  last_error: z.string().nullable(),
  received_at: z.string(),
  processed_at: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
});

export const webhookEventDetailSchema = webhookEventSchema.extend({
  attempts_log: z.array(webhookAttemptSchema),
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;
export type WebhookEventDetail = z.infer<typeof webhookEventDetailSchema>;

export const pageMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  total_pages: z.number(),
  has_next: z.boolean(),
  has_prev: z.boolean(),
});

export type PageMeta = z.infer<typeof pageMetaSchema>;

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: pageMetaSchema });
}

export function dataSchema<T extends z.ZodType>(item: T) {
  return z.object({ data: item });
}

export const dashboardSchema = z.object({
  pageViews: z.object({
    total: z.number(),
    points: z.array(z.object({ date: z.string(), value: z.number() })),
  }),
  topPosts: z.array(
    z.object({ slug: z.string(), title: z.string().nullable(), views: z.number() }),
  ),
  projectViews: z.array(z.object({ slug: z.string(), views: z.number() })),
  projectClicks: z.array(z.object({ slug: z.string(), clicks: z.number() })),
  outboundClicks: z.array(z.object({ url: z.string(), clicks: z.number() })),
  adMetrics: z.object({ impressions: z.number(), clicks: z.number(), ctr: z.number() }),
  realtime: z.number(),
});

export type DashboardData = z.infer<typeof dashboardSchema>;
