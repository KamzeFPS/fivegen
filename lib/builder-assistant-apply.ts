import { builderDraftSchema, builderFamily, type BuilderDraft } from './builder-contract';
import {
  builderAgentFieldKeysForContext,
  builderAgentSuggestionSchema,
  type BuilderAgentSuggestion,
} from './builder-assistant-contract';

/** Apply only reviewed, editable text. The assistant cannot change delivery or sales settings. */
export function applyBuilderAgentSuggestion(
  draft: BuilderDraft,
  suggestion: BuilderAgentSuggestion,
  mode: 'append' | 'replace' = 'replace',
): BuilderDraft {
  builderDraftSchema.parse(draft);
  if (mode !== 'append' && mode !== 'replace') throw new Error('Choose whether to append or replace the outline.');

  const supported = new Set(['summary', 'title', 'description', 'audience', 'fields', 'sections']);
  if (Object.keys(suggestion).some(key => !supported.has(key))) {
    throw new Error('This suggestion contains unsupported changes. Ask the assistant for editable product text only.');
  }

  // Check the unparsed field names too: schema stripping must not hide an
  // attempted private URL, price, product-type or delivery-mode change.
  const editableFields = new Set<string>(builderAgentFieldKeysForContext({
    type: draft.type,
    builderType: draft.type,
    deliveryFamily: builderFamily(draft),
  }).filter(key => !['title', 'description', 'audience'].includes(key)));
  if (suggestion.fields && Object.keys(suggestion.fields).some(key => !editableFields.has(key))) {
    throw new Error('This suggestion includes fields that are not editable for this product type.');
  }

  const edit = builderAgentSuggestionSchema.parse(suggestion);
  if (edit.sections && mode === 'append' && draft.sections.length + edit.sections.length > 30) {
    throw new Error('Appending this outline would exceed the 30-section limit. Your existing content has been kept.');
  }

  const next: BuilderDraft = {
    ...draft,
    ...(edit.title !== undefined ? { title: edit.title } : {}),
    ...(edit.description !== undefined ? { description: edit.description } : {}),
    ...(edit.audience !== undefined ? { audience: edit.audience } : {}),
    fields: { ...draft.fields, ...edit.fields },
  };

  // A details-only proposal has no section edit. Do not rebuild or replace
  // manuscripts, lesson recordings, resources, or their durable identities.
  if (edit.sections !== undefined) {
    const parts = edit.sections.map(section => ({
      id: crypto.randomUUID(),
      title: section.title,
      body: section.body,
    }));
    next.sections = mode === 'append' ? [...draft.sections, ...parts] : parts;
  }

  // Reject invalid lengths or a capacity overflow; never truncate the user's
  // content to make an AI proposal fit.
  return builderDraftSchema.parse(next);
}
