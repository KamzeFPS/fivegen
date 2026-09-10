import { z } from "zod";
import type { Commerce } from "./commerce";
export const formats = [
  "Guide",
  "Mini course",
  "Template kit",
  "Challenge",
  "Playbook",
  "Custom product",
] as const;
export const colors = ["orange", "violet", "blue", "green", "pink"] as const;
export const sectionSchema = z.object({
  title: z.string().min(1).max(150),
  body: z.string().min(1).max(18000),
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
  sections: z.array(sectionSchema).min(1).max(30),
  benefits: z.array(z.string().max(300)).min(1).max(8),
  launch: z.string().max(50000),
  files: z.array(fileSchema).max(20).optional(),
  imagePrompt: z.string().max(4000).optional(),
  videoPrompt: z.string().max(4000).optional(),
  salesCopy: z.string().max(15000).optional(),
});
export const briefSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(12).max(12000),
  audience: z.string().min(3).max(300),
  format: z.enum(formats),
  price: z.number().min(0).max(9999),
  color: z.enum(colors).default("orange"),
  instructions: z.string().max(12000).optional(),
  language: z.string().max(50).optional(),
  quality: z.enum(["balanced", "premium"]).optional(),
});
export type Brief = z.infer<typeof briefSchema>;
export type ProductContent = z.infer<typeof contentSchema>;
export type Product = Brief & {
  id: string;
  slug: string;
  status: "draft" | "published";
  content: ProductContent;
  whopUrl?: string | null;
  commerce?: Commerce;
  createdAt: number;
  updatedAt: number;
};
export type Order = {
  id: string;
  productId: string;
  email: string;
  amount: number;
  provider: string;
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
export function blueprint(b: Brief): ProductContent {
  const noun =
    b.format === "Mini course"
      ? "Lesson"
      : b.format === "Challenge"
        ? "Day"
        : "Chapter";
  return {
    benefits: [
      `A practical ${b.format.toLowerCase()} created for ${b.audience}`,
      "A clear plan you can adapt to your own work",
      "Exercises, checklists, and a repeatable review process",
    ],
    sections: [
      {
        title: `Welcome to ${b.title}`,
        body: `This ${b.format.toLowerCase()} is for ${b.audience}.\n\nThe goal\n${b.description}\n\nHow to use this resource\nRead one section at a time, complete its exercise, and record the result. Set aside 25 minutes for each session. Keep all your work in one document so you can see your progress.\n\nBefore you begin\nWrite down your starting point, the result you want, and one constraint you need to work around. Be specific enough that you will know when you have made progress.`,
      },
      {
        title: `${noun} 1 — Define your starting point`,
        body: `A useful plan starts with an honest picture of where you are today. For ${b.audience}, the first step is to narrow the scope of the problem.\n\nExercise: your baseline\n1. Describe the current situation in three sentences.\n2. List the tasks that take the most time or create the most frustration.\n3. Choose one problem you can influence this week.\n4. Write a measurable outcome and a target date.\n\nYour worksheet\nCurrent situation: ______\nThe problem I am solving: ______\nMy target outcome: ______\nWhat I will measure: ______\n\nCheckpoint\nCould someone else read your outcome and tell whether you achieved it? If not, make it more concrete.`,
      },
      {
        title: `${noun} 2 — Build a simple system`,
        body: `Turn the outcome into a process you can repeat. Start small enough to finish a first version without needing new tools.\n\nCreate your first workflow\n1. List the inputs you need.\n2. Break the work into three to five steps.\n3. Define what a successful output looks like.\n4. Identify the most likely bottleneck and a workaround.\n\nWorkflow template\nTrigger: What starts the process?\nInputs: What do you need before you start?\nSteps: What happens, and in what order?\nOutput: What should exist at the end?\nReview: How will you check the quality?\n\nApply it\nUse this workflow on one real example related to ${b.title}. Record how long it takes and which steps were unclear.`,
      },
      {
        title: `${noun} 3 — Put it into practice`,
        body: `Your first attempt is an experiment. Focus on completing the process and learning from what happens.\n\nA focused practice session\nPrepare your inputs for five minutes. Work through the process for fifteen minutes. Use the remaining five minutes to review the result.\n\nPractice log\nDate: ______\nWhat I tried: ______\nWhat happened: ______\nWhat worked: ______\nWhat I would change: ______\n\nRepeat the exercise three times. Change only one part of the process between attempts so you can understand what improves the result.`,
      },
      {
        title: `${noun} 4 — Review and improve`,
        body: `Compare your result with the baseline you recorded at the start. Look for evidence rather than impressions.\n\nReview questions\nDid I complete the process?\nDid the outcome improve?\nWhich step added the most value?\nWhich step could I simplify or remove?\nWhat should I try next?\n\nWeekly review template\nOne result I am proud of: ______\nOne thing I learned: ______\nOne change for next week: ______\nMy next milestone: ______\n\nKeep a record of your changes. A useful system becomes easier to follow over time.`,
      },
      {
        title: "Your action checklist",
        body: "□ Write a measurable outcome.\n□ Record your starting point.\n□ Gather the inputs you need.\n□ Create a short workflow.\n□ Complete your first practice session.\n□ Repeat the process with one improvement.\n□ Review the results against your baseline.\n□ Set your next milestone.\n\nCreator note: this is a structured starter. Add your expertise, real examples, and subject-specific instructions before publishing.",
      },
    ],
    launch: `7-day launch plan for ${b.title}\n\nDay 1 — Ask three people in your target audience about their biggest challenge.\nDay 2 — Add a worked example and refine the product based on feedback.\nDay 3 — Share one useful lesson from the product.\nDay 4 — Give a preview to two early readers and collect honest feedback.\nDay 5 — Publish your sales page and check the full delivery flow.\nDay 6 — Share your product link with a clear description of who it helps.\nDay 7 — Review visits, sales, and customer questions. Improve one thing.\n\nLaunch email\nSubject: A new resource for ${b.audience}\n\nI created ${b.title} to help with this: ${b.description}\nInside you will find a practical workflow, exercises, and an action checklist. Take a look and see if it is a good fit for you.\n[Add your published product link]`,
  };
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
