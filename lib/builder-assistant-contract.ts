import { z } from 'zod';

export const builderAgentSectionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().max(12000),
});

export const builderAgentContextSchema = z.object({
  type: z.string().trim().min(1).max(80),
  title: z.string().max(160).default(''),
  description: z.string().max(3000).default(''),
  audience: z.string().max(1000).default(''),
  language: z.string().max(80).default('English'),
  fields: z.record(z.string().max(3000)).refine(value => Object.keys(value).length <= 30, 'Too many context fields.').default({}),
  sections: z.array(builderAgentSectionSchema).max(40).default([]),
}).refine(value => JSON.stringify(value).length <= 24000, 'Share a shorter excerpt with the assistant.');

export const builderAgentSuggestionSchema = z.object({
  summary: z.string().trim().min(3).max(500),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(3000).optional(),
  audience: z.string().trim().min(1).max(1000).optional(),
  sections: z.array(builderAgentSectionSchema).min(1).max(24).optional(),
}).refine(value => Boolean(value.title || value.description || value.audience || value.sections?.length), 'A suggestion must include an editable change.')
  .refine(value => (value.sections || []).reduce((sum, section) => sum + section.body.length, 0) <= 1800, 'Use full product generation for complete chapters or lessons.');

export const builderAgentResponseSchema = z.object({
  answer: z.string().trim().min(3).max(2500),
  questions: z.array(z.string().trim().min(3).max(300)).max(3).default([]),
  suggestion: builderAgentSuggestionSchema.nullable().default(null),
});

// Providers commonly use null for a field they are not changing. Keep that
// representation in the wire contract, then validate the normalized result
// against the stricter domain contract before storing an applicable edit.
export const builderAgentResponseWireSchema = z.object({
  answer: z.string().trim().min(3).max(2500),
  questions: z.array(z.string().trim().min(3).max(300)).max(3).nullable().default([]),
  suggestion: z.object({
    summary: z.string().trim().min(3).max(500),
    title: z.string().trim().min(1).max(160).nullable().optional(),
    description: z.string().trim().min(1).max(3000).nullable().optional(),
    audience: z.string().trim().min(1).max(1000).nullable().optional(),
    sections: z.array(builderAgentSectionSchema).max(24).nullable().optional()
      .describe('An outline or small refinement. Combined section body text must not exceed 1800 characters.'),
  }).nullable().default(null),
});

export function parseBuilderAgentResponse(raw: unknown) {
  const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(raw)) return builderAgentResponseSchema.safeParse(raw);
  const normalized = { ...raw };
  if (normalized.questions === null) normalized.questions = [];
  if (isObject(normalized.suggestion)) {
    const suggestion = { ...normalized.suggestion };
    for (const field of ['title', 'description', 'audience']) {
      if (suggestion[field] === null || (typeof suggestion[field] === 'string' && !suggestion[field].trim())) delete suggestion[field];
    }
    if (suggestion.sections === null || (Array.isArray(suggestion.sections) && !suggestion.sections.length)) delete suggestion.sections;
    normalized.suggestion = ['title', 'description', 'audience', 'sections'].some(field => suggestion[field] !== undefined)
      ? suggestion : null;
  }
  return builderAgentResponseSchema.safeParse(normalized);
}

export type BuilderAgentContext = z.infer<typeof builderAgentContextSchema>;
export type BuilderAgentSuggestion = z.infer<typeof builderAgentSuggestionSchema>;
export type BuilderAgentMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  questions?: string[];
  suggestion?: BuilderAgentSuggestion | null;
};
export type BuilderAgentConversation = { id: string; messages: BuilderAgentMessage[]; updatedAt: number };
export type BuilderAgentState = {
  conversation: BuilderAgentConversation;
  remaining: number;
  cost: number;
  credits: number;
  unlimited: boolean;
  aiReady: boolean;
  spent?: number;
};
