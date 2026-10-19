import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Exercise the real textGeneration transport. Only the runtime configuration,
// budget reservation and HTTP response are fixtures; no provider is contacted.
class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
let provider = 'openai', responseMode = 'success';
const requests = [], reservations = [], logs = [];
const fixtureKey = 'fixture-provider-key-not-a-real-credential';
const privatePrompt = 'Private creator brief: explain a distinctive illustration handoff.';
const system = 'Help the creator plan a useful product. Return JSON.';
const answer = {
  answer: 'Start with a concrete client handoff outcome and build a short practical outline.',
  questions: ['Which client handoff currently takes the most time?'],
  suggestion: {
    summary: 'A focused title and one practical section for your review.',
    title: 'The Illustrator Handoff Playbook',
    sections: [{ title: 'Agree the handoff', body: 'List the agreed outputs and the person responsible for approving each one.' }],
  },
};

const deps = {
  z, ApiError,
  binding: name => name === 'OPENAI_API_KEY' || name === 'ANTHROPIC_API_KEY' ? fixtureKey : '',
  database: () => ({ prepare: () => ({ bind: () => ({ first: async () => ({
    config: JSON.stringify({ textProvider: provider, textModel: provider === 'openai' ? 'gpt-4.1-mini' : 'claude-haiku-4-5' }),
  }) }) }) }),
  reserveAIBudget: async (amount, owner) => reservations.push({ amount, owner }),
  fetch: async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, options, body });
    assert.ok(options.signal instanceof AbortSignal, 'Provider calls retain a bounded timeout');
    if (responseMode === 'failure') return Response.json({ error: {
      code: 'rate_limit_exceeded', type: 'rate_limit_error',
      message: `Upstream diagnostic must stay private: ${privatePrompt}; ${fixtureKey}`,
    } }, { status: 429, headers: { 'x-request-id': 'request-fixture', 'request-id': 'request-fixture' } });
    const responseAnswer = responseMode === 'nullable' ? { ...answer, questions: null, suggestion: { ...answer.suggestion, description: null, audience: null } } : answer;
    const text = responseMode === 'invalid' ? 'not JSON' : responseMode === 'empty' ? '' :
      responseMode === 'fenced' ? '```json\n' + JSON.stringify(responseAnswer) + '\n```' : JSON.stringify(responseAnswer);
    return Response.json(provider === 'openai' ? {
      status: responseMode === 'truncated' ? 'incomplete' : 'completed',
      output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [
        { type: 'refusal', refusal: 'ignored non-text content' }, { type: 'output_text', text },
      ] }],
    } : {
      stop_reason: responseMode === 'truncated' ? 'max_tokens' : 'end_turn',
      content: [{ type: 'thinking', thinking: 'ignored non-text content' }, { type: 'text', text }],
    });
  },
  console: { error: (...args) => logs.push(args) },
};

async function load(path, bindings) {
  const key = 'aiSchemaQA' + randomUUID().replaceAll('-', '');
  globalThis[key] = bindings;
  try {
    const source = fs.readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
    const code = `const {${Object.keys(bindings).join(',')}}=globalThis.${key};\n` + ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  } finally { delete globalThis[key]; }
}

const { builderAgentResponseSchema, builderAgentResponseWireSchema, parseBuilderAgentResponse } = await load('lib/builder-assistant-contract.ts', { z });
const { textGeneration } = await load('lib/ai.ts', deps);
const schema = zodToJsonSchema(builderAgentResponseWireSchema);
const schemaText = JSON.stringify(schema);
const outputSchema = { name: 'fivegen_builder_assistant', schema };
const inputOf = request => provider === 'openai' ? request.body.input : request.body.messages[0].content;
const invoke = output => textGeneration('creator-fixture', system, privatePrompt, 3000, output);

for (provider of ['openai', 'anthropic']) {
  responseMode = 'success';
  const parsed = await invoke(outputSchema);
  assert.deepEqual(builderAgentResponseSchema.parse(parsed), answer, `${provider} returns the caller's actual response shape`);
  let request = requests.at(-1), input = inputOf(request);
  assert.equal(input.split(schemaText).length - 1, 1, `${provider} must receive the complete response schema exactly once`);
  assert.match(input, /Return only a valid JSON object/);
  assert.ok(input.includes(privatePrompt), 'The creator request is retained');
  const sentSchema = JSON.parse(input.slice(input.indexOf(schemaText), input.indexOf(schemaText) + schemaText.length));
  assert.equal(sentSchema.properties.answer.minLength, 3);
  assert.equal(sentSchema.properties.answer.maxLength, 2500);
  const questionSchema = sentSchema.properties.questions.anyOf.find(value => value.type === 'array');
  assert.equal(questionSchema.maxItems, 3, 'Question limits reach the provider');
  assert.ok(sentSchema.required.includes('answer'));
  const suggestionSchema = sentSchema.properties.suggestion.anyOf.find(value => value.type === 'object');
  const sectionSchema = suggestionSchema.properties.sections.anyOf.find(value => value.type === 'array');
  assert.equal(sectionSchema.maxItems, 24, 'Outline bounds reach the provider');
  assert.match(suggestionSchema.properties.sections.description, /1800 characters/, 'The combined body limit reaches the provider, including the refinement JSON Schema cannot express');
  const inputBytes = new TextEncoder().encode(system + input).length;
  const inputRate = provider === 'anthropic' ? 1 : 0.4, outputRate = provider === 'anthropic' ? 5 : 1.6;
  assert.deepEqual(reservations.at(-1), { amount: Math.ceil(inputBytes * inputRate + 3000 * outputRate), owner: 'creator-fixture' }, 'Budget includes the schema once');
  if (provider === 'openai') {
    assert.equal(request.url, 'https://api.openai.com/v1/responses');
    assert.equal(request.options.headers.Authorization, `Bearer ${fixtureKey}`);
    assert.equal(request.body.store, false, 'Product requests are not stored by OpenAI');
    assert.deepEqual(request.body.text, { format: { type: 'json_object' } }, 'Keep supported JSON-object mode instead of incompatible strict schema mode');
    assert.equal(request.body.instructions, system);
    assert.equal(request.body.max_output_tokens, 3000);
  } else {
    assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(request.options.headers['x-api-key'], fixtureKey);
    assert.equal(request.body.system, system);
    assert.equal(request.body.max_tokens, 3000);
  }

  responseMode = 'fenced';
  assert.deepEqual(await invoke(outputSchema), answer, 'Existing fenced-JSON compatibility is retained');
  responseMode = 'nullable';
  const nullableResponse = await invoke(outputSchema);
  assert.equal(builderAgentResponseWireSchema.safeParse(nullableResponse).success, true, 'A response following the advertised wire contract is valid');
  const normalizedResponse = parseBuilderAgentResponse(nullableResponse);
  assert.equal(normalizedResponse.success, true);
  assert.deepEqual(normalizedResponse.data, { ...answer, questions: [] }, 'The actual provider result normalizes unused nullable fields before domain validation');
  responseMode = 'success';
  assert.deepEqual(await invoke(), answer, 'Schema-free calls retain valid JSON handling');
  request = requests.at(-1); input = inputOf(request);
  assert.ok(!input.includes(schemaText), 'An absent schema is not replaced with stale request state');
  assert.ok(!input.includes('undefined'), 'An absent schema does not pollute the prompt');

  responseMode = 'truncated';
  await assert.rejects(invoke(outputSchema), error => error.status === 502 && /output limit/.test(error.message), 'A truncated response is rejected even if its text happens to be valid JSON');
  for (responseMode of ['invalid', 'empty']) {
    await assert.rejects(invoke(outputSchema), error => error.status === 502 && /invalid format/.test(error.message), 'Malformed provider responses cannot masquerade as successful suggestions');
  }
  responseMode = 'failure';
  await assert.rejects(invoke(outputSchema), error => error.status === 502 && !error.message.includes(privatePrompt) && !error.message.includes(fixtureKey));
  const log = logs.at(-1);
  assert.equal(log[0], 'AI provider request failed');
  assert.equal(log[1].provider, provider);
  assert.equal(log[1].status, 429);
  assert.equal(log[1].requestId, 'request-fixture');
}

assert.equal(logs.length, 2);
assert.ok(!JSON.stringify(logs).includes(privatePrompt), 'Provider error logging never includes the creator prompt');
assert.ok(!JSON.stringify(logs).includes(fixtureKey), 'Provider error logging never includes credentials');
responseMode = 'success';
const requestsBefore = requests.length, reservationsBefore = reservations.length;
await assert.rejects(textGeneration('creator-fixture', system, 'A'.repeat(64000), 3000, outputSchema), error => error.status === 400 && /too large/.test(error.message));
assert.equal(requests.length, requestsBefore, 'Oversized requests are rejected before any provider call');
assert.equal(reservations.length, reservationsBefore, 'Oversized requests do not reserve provider budget');
console.log('Passed: actual OpenAI/Anthropic transport includes the builder response schema exactly once, preserves caller constraints and JSON mode, accounts for input size, rejects incomplete/invalid responses, and keeps prompts/credentials out of errors and logs. HTTP and credentials are synthetic fixtures.');
