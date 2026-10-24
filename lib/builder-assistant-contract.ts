import { z } from 'zod';
import type { BuilderType, BuilderFamily } from './builder-contract';

// Only editorial fields are writable. No delivery URLs, payment settings or limits.
export const builderAgentFieldLabels = {
  title: 'Product name', description: 'Product description', audience: 'Who is this for?',
  outcome: 'Product outcome', tone: 'Tone / writing style', subtitle: 'Subtitle', bookPremise: 'Book premise / central argument', readerLevel: 'Reader experience level',
  startingPoint: 'Reader’s starting point', runningExample: 'Worked example / scenario', trigger: 'When should someone use this process?', requiredInputs: 'Required inputs / tools', definitionOfDone: 'Definition of done',
  dailyTime: 'Daily time commitment', completionCriteria: 'Completion / reflection method', compatibleTools: 'Compatible tools / file requirements', usageInstructions: 'Usage instructions',
  serviceScope: 'Service scope and boundaries', preparation: 'Customer preparation', intakePrompt: 'Booking / intake question', welcome: 'Welcome message', rules: 'Community rules', memberPromise: 'Member promise',
} as const;
export type BuilderAgentFieldKey = keyof typeof builderAgentFieldLabels;
export type BuilderAgentTarget = 'details' | 'outline' | 'refine';
export type BuilderAgentDetailsGroup = 'essentials' | 'type-details';
export const builderAgentRefinementSchema=z.object({sectionId:z.string().uuid(),originalTitle:z.string().min(1).max(150),originalText:z.string().min(1).max(1800)}).strict();
export type BuilderAgentRefinement=z.infer<typeof builderAgentRefinementSchema>;
export const builderAgentEssentialFieldKeys: readonly BuilderAgentFieldKey[] = ['title', 'description', 'audience', 'outcome', 'tone'];
export const builderAgentTypeFieldKeys: Record<BuilderType, readonly BuilderAgentFieldKey[]> = {
  book: ['subtitle', 'bookPremise', 'readerLevel'], guide: ['startingPoint', 'runningExample'], playbook: ['trigger', 'requiredInputs', 'definitionOfDone'], 'mini-course': [], 'video-course': [],
  'template-kit': ['compatibleTools', 'usageInstructions'], challenge: ['dailyTime', 'completionCriteria'], consulting: ['serviceScope', 'preparation', 'intakePrompt'], coaching: ['serviceScope', 'preparation', 'intakePrompt'], community: ['memberPromise', 'welcome', 'rules'], custom: [],
};
const builderTypeKeys = Object.keys(builderAgentTypeFieldKeys) as [BuilderType, ...BuilderType[]];
const fieldKeys = Object.keys(builderAgentFieldLabels) as [BuilderAgentFieldKey, ...BuilderAgentFieldKey[]];
export const builderAgentFieldKeySchema = z.enum(fieldKeys);
type FieldContext = { type: string; builderType?: BuilderType; deliveryFamily?: BuilderFamily };
function contextType(context: FieldContext): BuilderType {
  if (context.builderType && Object.hasOwn(builderAgentTypeFieldKeys, context.builderType)) return context.builderType;
  const labels: Record<string, BuilderType> = { book: 'book', ebook: 'book', bookebook: 'book', guide: 'guide', playbook: 'playbook', minicourse: 'mini-course', videocourse: 'video-course', fullvideocourse: 'video-course', templatekit: 'template-kit', challenge: 'challenge', consulting: 'consulting', consultingmentorship: 'consulting', coachingsession: 'coaching', coaching: 'coaching', community: 'community', custom: 'custom', customproduct: 'custom' };
  return labels[context.type.toLowerCase().replace(/[^a-z]/g, '')] || 'custom';
}
export function builderAgentFieldKeysForContext(context: FieldContext, group?: BuilderAgentDetailsGroup): BuilderAgentFieldKey[] {
  const type = contextType(context);
  const specific = type === 'custom' && context.deliveryFamily === 'service' ? builderAgentTypeFieldKeys.consulting : type === 'custom' && context.deliveryFamily === 'community' ? builderAgentTypeFieldKeys.community : builderAgentTypeFieldKeys[type];
  return [...(group === 'type-details' ? [] : builderAgentEssentialFieldKeys), ...(group === 'essentials' ? [] : specific)];
}

export const builderAgentSectionSchema = z.object({ title: z.string().trim().min(1).max(150), body: z.string().max(12000) });
export const builderAgentContextSchema = z.object({
  type: z.string().trim().min(1).max(80), builderType: z.enum(builderTypeKeys).optional(), deliveryFamily: z.enum(['document', 'course', 'templates', 'challenge', 'service', 'community', 'custom']).optional(),
  title: z.string().max(160).default(''), description: z.string().max(3000).default(''), audience: z.string().max(1000).default(''), language: z.string().max(80).default('English'),
  fields: z.record(z.string().max(3000)).refine(value => Object.keys(value).length <= 30, 'Too many context fields.').default({}), sections: z.array(builderAgentSectionSchema.extend({ id:z.string().uuid().optional(),title: z.string().trim().min(1).max(160) })).max(40).default([]),
}).refine(value => JSON.stringify(value).length <= 24000, 'Share a shorter excerpt with the assistant.');
const editorialFieldSchema = z.string().trim().min(1).max(1500);
const editorialShape = Object.fromEntries(fieldKeys.filter(key => !['title', 'description', 'audience'].includes(key)).map(key => [key, editorialFieldSchema.optional()])) as Record<Exclude<BuilderAgentFieldKey, 'title' | 'description' | 'audience'>, z.ZodOptional<typeof editorialFieldSchema>>;
export const builderAgentSuggestionFieldsSchema = z.object(editorialShape).strict().refine(value => Object.values(value).reduce((sum, text) => sum + (text?.length || 0), 0) <= 4000, 'Keep field suggestions focused; use product generation for complete content.');
export const builderAgentSuggestionSchema = z.object({
  summary: z.string().trim().min(3).max(500), title: z.string().trim().min(1).max(100).optional(), description: z.string().trim().min(1).max(3000).optional(), audience: z.string().trim().min(1).max(300).optional(),
  fields: builderAgentSuggestionFieldsSchema.optional(), sections: z.array(builderAgentSectionSchema).min(1).max(24).optional(),
}).refine(value => Boolean(value.title || value.description || value.audience || Object.keys(value.fields || {}).length || value.sections?.length), 'A suggestion must include an editable change.')
  .refine(value => (value.sections || []).reduce((sum, section) => sum + section.body.length, 0) <= 1800, 'Use full product generation for complete chapters or lessons.');
export const builderAgentResponseSchema = z.object({ answer: z.string().trim().min(3).max(2500), questions: z.array(z.string().trim().min(3).max(300)).max(3).default([]), suggestion: builderAgentSuggestionSchema.nullable().default(null) });
export type BuilderAgentScope = { target: BuilderAgentTarget; detailsGroup?: BuilderAgentDetailsGroup; fieldKeys: BuilderAgentFieldKey[]; allowSections: boolean };
export const builderAgentRequestSchema = z.object({
  requestId: z.string().uuid(), message: z.string().trim().min(3).max(3000), expectedUpdatedAt: z.number().int().min(0), maxCredits: z.number().int().min(0).max(30), target: z.enum(['details', 'outline', 'refine']).default('details'),
  detailsGroup: z.enum(['essentials', 'type-details']).optional(), fieldKeys: z.array(builderAgentFieldKeySchema).min(1).max(fieldKeys.length).refine(keys => new Set(keys).size === keys.length, 'Choose each field once.').optional(), refinement:builderAgentRefinementSchema.optional(),context: builderAgentContextSchema,
});
const namedFieldPatterns: Partial<Record<BuilderAgentFieldKey, RegExp>> = {
  title: /\b(?:product (?:title|name)|(?:my|the|this) title)\b/i, description: /\b(?:(?:product|book|ebook|guide|playbook|course|challenge|workbook|template|service|community) description|(?:my|the|this) description)\b/i, audience: /\b(?:target|intended|my|the) audience\b|who (?:is|this is) (?:this )?for/i,
  outcome: /\b(?:product outcome|(?:my|the) outcome|clear(?:er)? promise)\b/i, tone: /\b(?:tone|writing style)\b/i, subtitle: /\bsubtitle\b/i, bookPremise: /\b(?:book premise|central argument)\b/i, readerLevel: /\breader (?:experience )?level\b/i,
  startingPoint: /\breader.?s? starting point\b/i, runningExample: /\b(?:worked example|running example)\b/i, trigger: /\b(?:process trigger|when (?:should|to) (?:someone )?use this process)\b/i, requiredInputs: /\brequired inputs\b/i, definitionOfDone: /\bdefinition of done\b/i,
  dailyTime: /\bdaily time commitment\b/i, completionCriteria: /\b(?:completion criteria|reflection method)\b/i, compatibleTools: /\b(?:compatible tools|file requirements)\b/i, usageInstructions: /\busage instructions\b/i,
  serviceScope: /\bservice scope\b/i, preparation: /\bcustomer preparation\b/i, intakePrompt: /\b(?:intake question|booking question)\b/i, welcome: /\bwelcome message\b/i, rules: /\bcommunity rules\b/i, memberPromise: /\bmember promise\b/i,
};
function requestsField(message: string, pattern: RegExp) {
  const match = [...message.matchAll(new RegExp(pattern.source, 'gi'))].at(-1);
  if (!match) return false;
    const before = message.slice(0, match.index).split(/[.;!?\n]/).at(-1) || '';
    const preservation = [...before.matchAll(/\b(?:preserve|keep|retain|leave|do not (?:change|edit|update)|don['’]?t (?:change|edit|update))\b/gi)].at(-1);
    // A preservation instruction also covers connected fields until a new edit
    // verb starts another request: "keep the title and improve the description".
    return !preservation || /\b(?:fill|enhance|improve|update|complete|rewrite|refine|write|change|edit|polish|sharpen)\b/i.test(before.slice((preservation.index || 0) + preservation[0].length));
}
export function resolveBuilderAgentScope(input: { message: string; context: FieldContext; target?: BuilderAgentTarget; detailsGroup?: BuilderAgentDetailsGroup; fieldKeys?: BuilderAgentFieldKey[] }): BuilderAgentScope {
  const allowed = builderAgentFieldKeysForContext(input.context), message = input.message;
  const essentials = /\bessentials\b/i.test(message), typeDetails = /\b(?:shape of (?:my|the|your|this) book|book shape|type[- ]specific (?:fields|details))\b/i.test(message);
  const fillFields = /\b(?:fill|enhance|improve|update|complete)\s+(?:(?:in|out)\s+)?(?:(?:all|the|these|my|those)\s+){0,3}(?:product\s+)?(?:fields|details)\b/i.test(message);
  const named = allowed.filter(key => namedFieldPatterns[key] && requestsField(message, namedFieldPatterns[key]!)), explicitlySections = /\b(?:outline|chapter|lesson|manuscript|section|curriculum)s?\b/i.test(message);
  const preserved = allowed.filter(key => namedFieldPatterns[key]?.test(message) && !requestsField(message, namedFieldPatterns[key]!));
  const explicitDetails = essentials || typeDetails || fillFields || (named.length > 0 && (!explicitlySections || named.includes('subtitle') || /\bproduct (?:description|name|title)\b/i.test(message)));
  const target = input.fieldKeys?.length || input.detailsGroup || explicitDetails ? 'details' : input.target || 'details';
  const detailsGroup = input.detailsGroup || (essentials && !typeDetails ? 'essentials' : typeDetails && !essentials ? 'type-details' : undefined);
  const requested = input.fieldKeys?.length ? input.fieldKeys.filter(key => allowed.includes(key)) : target === 'details' ? (!essentials && !typeDetails && named.length ? named : builderAgentFieldKeysForContext(input.context, detailsGroup)) : named;
  const allowSections=target !== 'details' && (!named.length || explicitlySections);
  return { target, ...(detailsGroup ? { detailsGroup } : {}), fieldKeys: target==='refine'&&allowSections?[]:requested.filter(key => !preserved.includes(key)), allowSections };
}
function wireSchema(scope?: BuilderAgentScope) {
  const allowed = scope?.fieldKeys || fieldKeys;
  const fields = z.object(Object.fromEntries(allowed.filter(key => !['title', 'description', 'audience'].includes(key)).map(key => [key, editorialFieldSchema.nullable().optional()]))).strict().nullable().optional();
  return z.object({ answer: z.string().trim().min(3).max(2500), questions: z.array(z.string().trim().min(3).max(300)).max(3).nullable().default([]), suggestion: z.object({
    summary: z.string().trim().min(3).max(500),
    ...(!scope || allowed.includes('title') ? { title: z.string().trim().min(1).max(100).nullable().optional() } : {}), ...(!scope || allowed.includes('description') ? { description: z.string().trim().min(1).max(3000).nullable().optional() } : {}), ...(!scope || allowed.includes('audience') ? { audience: z.string().trim().min(1).max(300).nullable().optional() } : {}),
    ...(allowed.some(key => !['title', 'description', 'audience'].includes(key)) ? { fields } : {}), ...(!scope || scope.allowSections ? { sections: z.array(builderAgentSectionSchema).max(scope?.target==='refine'?1:24).nullable().optional().describe(scope?.target==='refine'?'Exactly one replacement for the selected excerpt. Preserve the section title. Do not return an outline or the remainder of the section.':'An outline. Combined section body text must not exceed 1800 characters.') } : {}),
  }).nullable().default(null) });
}
export const builderAgentResponseWireSchema = wireSchema();
export const makeBuilderAgentResponseWireSchema = (scope: BuilderAgentScope) => wireSchema(scope);

// Normalize only absent edits, then validate the strict editorial contract.
export function parseBuilderAgentResponse(raw: unknown) {
  const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(raw)) return builderAgentResponseSchema.safeParse(raw);
  const normalized = { ...raw };
  if (normalized.questions === null) normalized.questions = [];
  if (isObject(normalized.suggestion)) {
    const suggestion = { ...normalized.suggestion };
    for (const field of ['title', 'description', 'audience']) if (suggestion[field] === null || (typeof suggestion[field] === 'string' && !suggestion[field].trim())) delete suggestion[field];
    if (isObject(suggestion.fields)) { suggestion.fields = Object.fromEntries(Object.entries(suggestion.fields).filter(([, value]) => value !== null && !(typeof value === 'string' && !value.trim()))); if (!Object.keys(suggestion.fields as object).length) delete suggestion.fields; } else if (suggestion.fields === null) delete suggestion.fields;
    if (suggestion.sections === null || (Array.isArray(suggestion.sections) && !suggestion.sections.length)) delete suggestion.sections;
    normalized.suggestion = ['title', 'description', 'audience', 'fields', 'sections'].some(field => suggestion[field] !== undefined) ? suggestion : null;
  }
  return builderAgentResponseSchema.safeParse(normalized);
}
export function scopeBuilderAgentResponse(response: z.infer<typeof builderAgentResponseSchema>, scope: BuilderAgentScope): z.infer<typeof builderAgentResponseSchema> | null {
  if (!response.suggestion) return { ...response, questions: scope.target === 'details' ? [] : response.questions };
  const original = response.suggestion, suggestion: BuilderAgentSuggestion = { summary: original.summary };
  for (const key of ['title', 'description', 'audience'] as const) if (scope.fieldKeys.includes(key) && original[key]) suggestion[key] = original[key];
  const fields = Object.fromEntries(Object.entries(original.fields || {}).filter(([key]) => scope.fieldKeys.includes(key as BuilderAgentFieldKey)));
  if (Object.keys(fields).length) suggestion.fields = fields;
  if (scope.allowSections && original.sections?.length) suggestion.sections = original.sections;
  if (!suggestion.title && !suggestion.description && !suggestion.audience && !suggestion.sections?.length && !Object.keys(fields).length) return null;
  return { ...response, questions: scope.target === 'details' ? [] : response.questions, ...(scope.target === 'details' && original.sections?.length ? { answer: 'Review the suggested product details below. Your existing content and files stay unchanged.' } : {}), suggestion };
}
export type BuilderAgentContext = z.infer<typeof builderAgentContextSchema>;
export type BuilderAgentSuggestion = z.infer<typeof builderAgentSuggestionSchema>;
export type BuilderAgentRequest = z.infer<typeof builderAgentRequestSchema>;
export type BuilderAgentMessage = { id: string; role: 'user' | 'assistant'; content: string; questions?: string[]; suggestion?: BuilderAgentSuggestion | null; target?: BuilderAgentTarget; detailsGroup?: BuilderAgentDetailsGroup; fieldKeys?: BuilderAgentFieldKey[];refinement?:BuilderAgentRefinement };
export type BuilderAgentConversation = { id: string; messages: BuilderAgentMessage[]; updatedAt: number };
export type BuilderAgentState = { conversation: BuilderAgentConversation; remaining: number; cost: number; credits: number; unlimited: boolean; aiReady: boolean; spent?: number };
