import { z } from "zod";
import type { Commerce } from "./commerce";
import type { Experience } from "./experience";
export const formats = [
  "Guide",
  "Mini course",
  "Template kit",
  "Challenge",
  "Playbook",
  "Custom product",
  "Coaching session",
  "Community",
] as const;
export const colors = ["orange", "violet", "blue", "green", "pink"] as const;
export const sectionSchema = z.object({
  title: z.string().min(1).max(150),
  body: z.string().max(18000),
  objective: z.string().max(1500).optional(),
  id: z.string().uuid().optional(),
  videoId: z.string().uuid().optional(),
});
export const fileSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}\.(txt|md|csv|html|json|js|css|py)$/,
    ),
  content: z.string().max(100000),
  description: z.string().max(300),
});
export const contentSchema = z.object({
  sections: z.array(sectionSchema).min(1).max(30).refine(sections=>{const ids=sections.map(s=>s.id).filter(Boolean);return new Set(ids).size===ids.length;},"Each lesson must have its own identity."),
  benefits: z.array(z.string().max(300)).max(8),
  launch: z.string().max(50000),
  files: z.array(fileSchema).max(20).refine(files=>new Set(files.map(f=>f.name.toLowerCase())).size===files.length,"Use a unique name for every file.").optional(),
  imagePrompt: z.string().max(4000).optional(),
  videoPrompt: z.string().max(4000).optional(),
  salesCopy: z.string().max(15000).optional(),
});
export const briefSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(12).max(12000),
  audience: z.string().trim().min(3).max(300),
  format: z.enum(formats),
  price: z.number().min(0).max(9999),
  color: z.enum(colors).default("orange"),
  instructions: z.string().max(12000).optional(),
  language: z.string().max(50).optional(),
  quality: z.enum(["balanced", "premium"]).optional(),
  angle: z.string().max(2000).optional(),
  duration: z.number().int().min(3).max(30).optional(),
});
export type Brief = z.infer<typeof briefSchema>;
export type ProductContent = z.infer<typeof contentSchema>;
export type Product = Brief & {
  id: string;
  slug: string;
  status: "draft" | "published";
  content: ProductContent;
  commerce?: Commerce;
  experience?: Experience;
  createdAt: number;
  updatedAt: number;
};
export type Order = {
  id: string;
  productId: string;
  email: string;
  amount: number;
  provider: string;
  platformFee?:number;
  createdAt: number;
  title?: string;
};
export function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "product"
  );
}
export function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
export function emptyContent(b: Brief): ProductContent {
  return { sections: [{ id:crypto.randomUUID(), title: b.title, body: "" }], benefits: [], launch: "", files: [] };
}
export function publishContentError(content: ProductContent): string | null {
  if (!content.sections.length || content.sections.some(section => !section.title.trim() || (!section.body.trim() && !section.videoId)))
    return "Add finished content to every section before publishing. Remove any unused sections.";
  if (content.files?.some(file => !file.content.trim()))
    return "Add content to every supporting file, or remove empty files before publishing.";
  return null;
}
export const templates: Brief[] = [
  {
    title: "The Creator Launch Kit",
    description:
      "Turn your expertise into your first digital product with a clear offer, a compelling sales page, and a practical 7-day launch plan.",
    audience: "First-time creators and independent experts",
    format: "Template kit",
    price: 49,
    color: "orange",
  },
  {
    title: "Build Your Personal Brand",
    description:
      "Find your positioning, develop content pillars, and create a sustainable weekly publishing routine.",
    audience: "Freelancers and solopreneurs",
    format: "Mini course",
    price: 79,
    color: "violet",
  },
  {
    title: "The Notion Productivity OS",
    description:
      "Organize your projects, plan your week, and keep your important work moving with a simple productivity system.",
    audience: "Busy professionals and remote teams",
    format: "Playbook",
    price: 29,
    color: "green",
  },
  {
    title: "30 Days of Better Content",
    description:
      "Build a daily writing habit with focused prompts, repeatable post structures, and a weekly reflection exercise.",
    audience: "Creators building an engaged audience",
    format: "Challenge",
    price: 39,
    color: "blue",
  },
  {
    title: "Employee Onboarding OS",
    description:
      "Create a consistent first 30 days for every new hire with manager checklists, training plans, and feedback checkpoints.",
    audience: "HR teams at small and growing companies",
    format: "Playbook",
    price: 199,
    color: "pink",
  },
  {
    title: "The Freelance Field Guide",
    description:
      "Define your service offer, scope projects, and build a repeatable client delivery process.",
    audience: "Independent designers and consultants",
    format: "Guide",
    price: 39,
    color: "violet",
  },
];
