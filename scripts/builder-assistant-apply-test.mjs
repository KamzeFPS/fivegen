import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { z } from 'zod';

// Execute the shipped merge function and domain schemas. Provider output is
// synthetic; no account, database, generation credit or provider is touched.
const dependencies = { z };
async function load(path) {
  const key = `builderApplyQa${randomUUID().replaceAll('-', '')}`;
  globalThis[key] = { ...dependencies };
  const source = readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = `const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  try {
    return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  } finally { delete globalThis[key]; }
}
for (const path of ['lib/commerce.ts', 'lib/experience.ts', 'lib/product.ts', 'lib/commerce-v2.ts', 'lib/builder-contract.ts', 'lib/builder-assistant-contract.ts', 'lib/builder-assistant-apply.ts']) {
  Object.assign(dependencies, await load(path));
}
const { applyBuilderAgentSuggestion: apply, defaultBuilderDraft, builderTypes, builderDraftSchema } = dependencies;
const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
const section = index => ({ id: randomUUID(), title: `Original unit ${index}`, body: `Original private manuscript ${index}.`, category: 'Original grouping', objective: 'Original learning objective', videoId: randomUUID() });
function draftFor(type) {
  const draft = defaultBuilderDraft(type, 'upload');
  return builderDraftSchema.parse({
    ...draft, title: `Original ${type}`, description: 'Original description with the creator’s promise.', audience: 'Original intended readers',
    fields: { ...draft.fields, subtitle: 'Original supporting promise', instructions: 'Keep my private content intact.', customSetting: 'Creator-owned value', meetingUrl: 'https://private.example.test/meeting', communityUrl: 'https://private.example.test/invite' },
    sections: [section(1), section(2)],
    files: [{ name: 'original-workbook.md', description: 'Original editable resource', content: 'Original resource contents.' }],
    uploadIds: [randomUUID(), randomUUID()], coverUploadId: randomUUID(), priceCents: 4900, currency: 'eur',
  });
}
function unchangedDelivery(before, after) {
  for (const key of ['type', 'source', 'language', 'files', 'uploadIds', 'coverUploadId', 'priceCents', 'currency']) {
    assert.deepEqual(after[key], before[key], `${before.type}: ${key} is creator-controlled`);
  }
  for (const key of ['meetingUrl', 'communityUrl', 'customDelivery', 'instructions', 'customSetting', 'unitCount']) {
    assert.equal(after.fields[key], before.fields[key], `${before.type}: existing ${key} is preserved`);
  }
}
function rejectsWithoutMutation(draft, suggestion, mode = 'replace', message) {
  const original = structuredClone(draft);
  assert.throws(() => apply(draft, suggestion, mode), message);
  assert.deepEqual(draft, original, 'A rejected proposal leaves every original field untouched');
}

assert.equal(builderTypes.length, 11);
for (const type of builderTypes) {
  const original = freeze(draftFor(type)), snapshot = structuredClone(original);
  const edit = freeze({ summary: 'Clarify the product essentials only.', title: `Clear promise for ${type}`, description: 'A concrete, accurate description of what the customer receives.', audience: 'Adults who want one practical next step', fields: { outcome: 'Complete one practical outcome.', tone: 'Warm, direct and specific' } });
  const result = apply(original, edit);
  assert.equal(result.title, edit.title); assert.equal(result.description, edit.description); assert.equal(result.audience, edit.audience);
  assert.equal(result.fields.outcome, edit.fields.outcome); assert.equal(result.fields.tone, edit.fields.tone);
  assert.deepEqual(result.sections, original.sections, `${type}: essentials do not replace chapters, recordings, or resource identities`);
  unchangedDelivery(original, result);
  assert.deepEqual(original, snapshot, `${type}: the input draft is immutable`);
  assert.deepEqual(edit.fields, { outcome: 'Complete one practical outcome.', tone: 'Warm, direct and specific' }, 'The proposal is immutable too');

  const fieldOnly = apply(original, { summary: 'Improve only the outcome field.', fields: { outcome: 'A more focused and achievable outcome.' } }, 'append');
  for (const key of ['title', 'description', 'audience', 'sections']) assert.deepEqual(fieldOnly[key], original[key], `${type}: absent ${key} remains unchanged`);
  unchangedDelivery(original, fieldOnly);
}

// Exact reproduction: a book details request must fill subtitle/premise/reader
// level without creating a six-day outline or replacing the original PDF.
const book = freeze(draftFor('book'));
const shaped = apply(book, {
  summary: 'Fill the book positioning fields without changing its manuscript.',
  fields: {
    subtitle: 'Fourteen small steps to rebuild your routines after a breakup',
    bookPremise: 'A self-paced workbook pairing reflection with practical boundaries and everyday routines.',
    readerLevel: 'Beginner-friendly; no journaling experience is required.',
  },
});
assert.equal(shaped.fields.subtitle, 'Fourteen small steps to rebuild your routines after a breakup');
assert.equal(shaped.fields.bookPremise, 'A self-paced workbook pairing reflection with practical boundaries and everyday routines.');
assert.equal(shaped.fields.readerLevel, 'Beginner-friendly; no journaling experience is required.');
assert.deepEqual(shaped.sections, book.sections); unchangedDelivery(book, shaped);

const specificFields = {
  guide: { startingPoint: 'The reader has an idea but needs a first action.', runningExample: 'One realistic example used from start to finish.' },
  playbook: { trigger: 'Begin after a client approves the brief.', requiredInputs: 'An approved brief and a named owner.', definitionOfDone: 'The handoff checklist is signed off.' },
  challenge: { dailyTime: '15 minutes', completionCriteria: 'One reflection and one checked-off action per day.' },
  'template-kit': { compatibleTools: 'Google Sheets and CSV-compatible spreadsheet apps', usageInstructions: 'Make a copy, replace the sample values, then follow the notes.' },
  consulting: { serviceScope: 'A focused review of one client problem.', preparation: 'Bring one example and one question.', intakePrompt: 'What would make this session useful?' },
  coaching: { serviceScope: 'A focused review of one client problem.', preparation: 'Bring one example and one question.', intakePrompt: 'What would make this session useful?' },
  community: { memberPromise: 'Practice one skill together each week.', welcome: 'Welcome. Start by introducing your current goal.', rules: 'Respect privacy and give constructive feedback.' },
};
for (const [type, fields] of Object.entries(specificFields)) {
  const original = freeze(draftFor(type));
  const result = apply(original, { summary: 'Fill the relevant product-specific details.', fields });
  for (const [key, value] of Object.entries(fields)) assert.equal(result.fields[key], value, `${type}: ${key} is editable`);
  assert.deepEqual(result.sections, original.sections); unchangedDelivery(original, result);
}
for (const [delivery, fields] of Object.entries({ downloads: { outcome: 'Complete the supplied workbook.' }, course: { outcome: 'Practice the supplied lessons.' }, service: specificFields.coaching, community: specificFields.community })) {
  const original = draftFor('custom'); original.fields.customDelivery = delivery; freeze(original);
  const result = apply(original, { summary: 'Improve text for the selected delivery family.', fields });
  for (const [key, value] of Object.entries(fields)) assert.equal(result.fields[key], value, `custom/${delivery}: ${key} is editable`);
  assert.equal(result.fields.customDelivery, delivery); unchangedDelivery(original, result);
}

for (const [type, fields] of [
  ['guide', { subtitle: 'Wrong product type' }],
  ['book', { serviceScope: 'Wrong delivery family' }],
  ['coaching', { meetingUrl: 'https://attacker.example.test/meeting' }],
  ['community', { communityUrl: 'https://attacker.example.test/invite' }],
  ['consulting', { durationMinutes: '120' }],
  ['consulting', { timezone: 'UTC' }],
  ['custom', { customDelivery: 'service' }],
  ['book', { instructions: 'Run an automatic generation.' }],
  ['book', { unitCount: '30' }],
  ['book', { priceCents: '1' }],
  ['book', { title: 'Nested title bypass' }],
  ['book', { unknownField: 'Unsupported value' }],
  ['book', JSON.parse('{"__proto__":"Unsafe own field"}')],
]) rejectsWithoutMutation(freeze(draftFor(type)), { summary: 'Attempt a disallowed field change.', fields }, 'replace', `${type}: unsafe fields must fail, not be silently stripped`);
for (const extra of [{ priceCents: 1 }, { uploadIds: [] }, { type: 'guide' }, { language: 'French' }, { files: [] }]) {
  rejectsWithoutMutation(book, { summary: 'Change safe text.', title: 'A permitted title', ...extra });
}

// Explicit outline application remains available and makes the append/replace
// decision visible. Neither path edits uploaded originals or sale settings.
const outline = freeze({ summary: 'Propose two outline units.', sections: [{ title: 'Recognize what you feel', body: 'A brief reflection prompt.' }, { title: 'Choose a useful boundary', body: 'One small practical activity.' }] });
const appended = apply(book, outline, 'append');
assert.deepEqual(appended.sections.slice(0, 2), book.sections);
assert.deepEqual(appended.sections.slice(2).map(({ title, body }) => ({ title, body })), outline.sections);
assert.ok(appended.sections.slice(2).every(item => z.string().uuid().safeParse(item.id).success));
assert.equal(new Set(appended.sections.map(item => item.id)).size, 4);
unchangedDelivery(book, appended);
const replaced = apply(book, outline, 'replace');
assert.equal(replaced.sections.length, 2);
assert.deepEqual(replaced.sections.map(({ title, body }) => ({ title, body })), outline.sections);
assert.ok(replaced.sections.every(item => !book.sections.some(old => old.id === item.id)), 'New outline units receive new identities');
assert.ok(replaced.sections.every(item => !item.videoId && !item.category && !item.objective), 'AI outline objects cannot smuggle recording or resource metadata');
unchangedDelivery(book, replaced);

const full = draftFor('book'); full.sections = Array.from({ length: 30 }, (_, index) => section(index)); freeze(full);
rejectsWithoutMutation(full, { summary: 'Add one more outline unit.', sections: [{ title: 'Extra unit', body: 'One short outline.' }] }, 'append', /30-section/);
const almostFull = draftFor('book'); almostFull.sections = full.sections.slice(0, 29); freeze(almostFull);
const exactCapacity = apply(almostFull, { summary: 'Fill the final outline position.', sections: [{ title: 'Final unit', body: 'One short outline.' }] }, 'append');
assert.equal(exactCapacity.sections.length, 30); assert.deepEqual(exactCapacity.sections.slice(0, 29), almostFull.sections);
assert.equal(apply(full, { summary: 'Edit essentials at full manuscript capacity.', fields: { outcome: 'Keep every original chapter.' } }).sections.length, 30);
for (const edit of [
  { title: 'T'.repeat(101) },
  { audience: 'A'.repeat(301) },
  { sections: [{ title: 'T'.repeat(151), body: 'A short outline.' }] },
  { fields: { subtitle: 'S'.repeat(1501) } },
  { fields: { subtitle: '' } },
  { sections: [] },
]) rejectsWithoutMutation(book, { summary: 'Reject an invalid edit without trimming content.', ...edit });
rejectsWithoutMutation(book, outline, 'truncate');
const atLimit = apply(book, { summary: 'Use the exact supported title length.', title: 'T'.repeat(100) });
assert.equal(atLimit.title.length, 100);
const fullFields = draftFor('book');
fullFields.fields = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`custom${index}`, `Original setting ${index}`]));
freeze(fullFields);
rejectsWithoutMutation(fullFields, { summary: 'An additional field cannot evict original settings.', fields: { subtitle: 'A new supporting promise' } });
const longExistingDescription = draftFor('book');
longExistingDescription.description = 'D'.repeat(12000); freeze(longExistingDescription);
assert.equal(apply(longExistingDescription, { summary: 'Change only the supporting subtitle.', fields: { subtitle: 'A focused supporting promise' } }).description, longExistingDescription.description, 'Existing full-length creator descriptions are not reduced to the smaller AI proposal limit');

const refineDraft=draftFor('book'),refineSource=refineDraft.sections[0];refineSource.body='Keep the introduction. This exact original passage needs clearer wording. Keep the conclusion.';
const refinement={sectionId:refineSource.id,originalTitle:refineSource.title,originalText:'This exact original passage needs clearer wording.'};
const refinedEdit={summary:'Clarify one selected passage.',sections:[{title:refineSource.title,body:'This passage now gives one clear action.'}]};
const refined=dependencies.applyBuilderAgentRefinement(refineDraft,refinedEdit,refinement);
assert.equal(refined.sections[0].body,'Keep the introduction. This passage now gives one clear action. Keep the conclusion.');assert.equal(refined.sections[0].id,refineSource.id);assert.equal(refined.sections[0].videoId,refineSource.videoId);assert.deepEqual(refined.sections.slice(1),refineDraft.sections.slice(1));assert.deepEqual(refined.files,refineDraft.files);
for(const invalid of [{...refinement,sectionId:randomUUID()},{...refinement,originalText:'This original text has changed.'},{...refinement,originalTitle:'A different chapter'}])assert.throws(()=>dependencies.applyBuilderAgentRefinement(refineDraft,refinedEdit,invalid),'Stale or wrong-section refinements cannot apply');
const repeated=structuredClone(refineDraft);repeated.sections[0].body+=' '+refinement.originalText;assert.throws(()=>dependencies.applyBuilderAgentRefinement(repeated,refinedEdit,refinement),'Ambiguous repeated excerpts are not replaced');
assert.throws(()=>dependencies.applyBuilderAgentRefinement(refineDraft,{...refinedEdit,title:'Unexpected metadata'},refinement));assert.throws(()=>dependencies.applyBuilderAgentRefinement(refineDraft,{...refinedEdit,sections:[...refinedEdit.sections,...refinedEdit.sections]},refinement),'An excerpt cannot replace multiple chapters');
const editedOutside=structuredClone(refineDraft);editedOutside.sections[0].body='New creator introduction. '+refinement.originalText+' New creator conclusion.';const merged=dependencies.applyBuilderAgentRefinement(editedOutside,refinedEdit,refinement);assert.equal(merged.sections[0].body,'New creator introduction. This passage now gives one clear action. New creator conclusion.','Concurrent edits outside the unchanged unique passage survive');
console.log('Passed: all 11 builder types, scoped fields, immutable originals and manuscript identities, private/payment protection, explicit outlines, unique excerpt-only refinement, stale/ambiguous edit rejection and overflow protection.');
