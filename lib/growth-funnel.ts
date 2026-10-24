import { z } from "zod";

export const landingSnapshotSchema = z.object({
  headline: z.string().trim().min(1).max(250),
  subheadline: z.string().max(700),
  body: z.string().trim().min(1).max(12000),
  benefits: z.array(z.string().trim().max(500)).max(8).transform(items => items.filter(Boolean)),
  ctaLabel: z.string().trim().min(1).max(100),
  thankYou: z.string().trim().min(1).max(2000),
});
export type LandingSnapshot = z.infer<typeof landingSnapshotSchema>;
export const leadStatuses = ["new", "contacted", "qualified", "won", "lost"] as const;
export type LeadStatus = typeof leadStatuses[number];
export const marketingConsentText = "I agree to receive marketing emails from this creator. I can unsubscribe at any time.";
export const leadInputSchema = z.object({
  slug: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  marketing: z.boolean().default(false),
  website: z.string().max(500).default(""),
});
export type GrowthLead = {
  id: string; productId: string; productTitle: string; name: string; email: string;
  marketing: boolean; consentText: string; consentAt: number | null;
  source: string; lastSource: string; status: LeadStatus; notes: string;
  createdAt: number; lastSeenAt: number; updatedAt: number;
};
export type PublishedFunnel = {
  slug: string; title: string; landing: LandingSnapshot;
  creatorVslUploadId: string | null; publishedAt: number | null; updatedAt: number;
};
export type FunnelVideoDraft={creatorVslUploadId:string|null;updatedAt:number};
export function csvCell(value: unknown) {
  let cell = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(cell) || /^[\t\r\n]/.test(cell)) cell = "'" + cell;
  return `"${cell.replace(/"/g, '""')}"`;
}
export function leadsCsv(leads: GrowthLead[]) {
  const rows: unknown[][] = [["Name", "Email", "Product", "Status", "Marketing consent", "Consent date", "Consent wording", "First source", "Last source", "Created", "Last signup", "Notes"]];
  for (const lead of leads) rows.push([lead.name, lead.email, lead.productTitle, lead.status, lead.marketing ? "Yes" : "No", lead.consentAt ? new Date(lead.consentAt).toISOString() : "", lead.consentText, lead.source, lead.lastSource, new Date(lead.createdAt).toISOString(), new Date(lead.lastSeenAt).toISOString(), lead.notes]);
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}
