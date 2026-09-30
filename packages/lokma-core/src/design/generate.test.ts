/**
 * Unit probe for the REQ-177 generation helpers — PURE functions only:
 * no network, no model call, no disk. Run from `packages/lokma-core`:
 *   bun src/design/generate.test.ts
 * No test framework — plain asserts so the package stays dependency-free.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { ProviderError } from '@lokma/ai';
import { DEFAULT_DESIGN_MODEL, OFFLINE_TEMPLATE_MODEL, buildDesignPrompt, designErrorFromUpstream, extractHtmlDocument, pickDesignModel, DESIGN_MODEL_SYSTEM_PROMPT } from './generate.js';
import { DESIGN_HTML_CAP, DesignError } from './types.js';

let passed = 0;
function check(label: string, cond: boolean): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

function expectsDesign(label: string, fn: () => unknown, code: string, status: number): void {
  try {
    fn();
  } catch (e) {
    if (e instanceof DesignError && e.code === code && e.status === status) {
      passed += 1;
      console.log(`PASS: ${label}`);
      return;
    }
    throw new Error(`FAIL: ${label} (got ${e instanceof Error ? `${e.name}:${e.message}` : String(e)})`);
  }
  throw new Error(`FAIL: ${label} (no error thrown)`);
}

// ── Prompt builder (pure) ─────────────────────────────────────────────────────

const p1 = buildDesignPrompt({ type: 'prototype', brief: 'a pricing page for a coffee subscription', system: 'stripe-linear' });
check('prompt carries the brief', p1.includes('a pricing page for a coffee subscription'));
check('prompt carries the exact token set', p1.includes('#FAF9F5') && p1.includes('#C96442') && p1.includes('#E8E4DE'));
check('prompt names the artifact type', p1.includes('prototype'));
const p2 = buildDesignPrompt({ type: 'prototype', brief: 'a pricing page for a coffee subscription', system: 'omp-dark' });
check('system change rewrites the tokens', p2.includes('#6366F1') && !p2.includes('#C96442'));
const p3 = buildDesignPrompt({ type: 'deck', brief: 'quarterly review', system: 'stripe-linear' });
check('type change rewrites the directive', p3.includes('Slide deck') && !p1.includes('Slide deck'));
check(
  'system prompt forbids placeholders and fences',
  DESIGN_MODEL_SYSTEM_PROMPT.includes('NO lorem ipsum') && DESIGN_MODEL_SYSTEM_PROMPT.includes('markdown code fences'),
);

// ── HTML extraction (pure) ────────────────────────────────────────────────────

const DOC = '<!doctype html><html lang="en"><head><title>t</title></head><body><h1>Hi</h1></body></html>';
check('plain document passes through', extractHtmlDocument(DOC) === DOC);
check('fenced + prose wrapped → bare document', extractHtmlDocument(`Sure! Here is the page:\n\`\`\`html\n${DOC}\n\`\`\`\nEnjoy.`) === DOC);
check(
  'fence selection beats prose that mentions <html>',
  extractHtmlDocument(`Emitting <html> now:\n\`\`\`html\n${DOC}\n\`\`\``) === DOC,
);
check('trailing commentary is dropped', extractHtmlDocument(`${DOC}\n\nLet me know if you want changes!`) === DOC);
check('missing closing tag still returns a document', extractHtmlDocument('<!doctype html><html><body><p>partial').startsWith('<!doctype html'));
expectsDesign('no <html> → bad_model_output 422', () => extractHtmlDocument('{"error":"nope"}'), 'bad_model_output', 422);
expectsDesign('empty → design_empty_output 502', () => extractHtmlDocument('   '), 'design_empty_output', 502);
expectsDesign(
  'over cap → too_large 422',
  () => extractHtmlDocument(`<html><body>${'x'.repeat(DESIGN_HTML_CAP)}</body></html>`),
  'too_large',
  422,
);

// ── Model chain (pure) ────────────────────────────────────────────────────────

check('explicit model wins', pickDesignModel('commandcode/deepseek/deepseek-v4.1-flash', null) === 'commandcode/deepseek/deepseek-v4.1-flash');
check(':: ids canonicalize to /', pickDesignModel('anthropic::claude-sonnet-4-5', null) === 'anthropic/claude-sonnet-4-5');
check(
  'config default used when the request omits a model',
  pickDesignModel(undefined, { defaultModel: 'commandcode/deepseek/deepseek-v4.1-flash', models: {} }) ===
    'commandcode/deepseek/deepseek-v4.1-flash',
);
check(
  'disabled config default falls back to the built-in',
  pickDesignModel('', { defaultModel: 'x/y', models: { 'x/y': { enabled: false } } }) === DEFAULT_DESIGN_MODEL,
);
check('no config → built-in', pickDesignModel(undefined, null) === DEFAULT_DESIGN_MODEL);
check('offline template passes through as an explicit choice', pickDesignModel(OFFLINE_TEMPLATE_MODEL, { defaultModel: 'a/b', models: {} }) === OFFLINE_TEMPLATE_MODEL);

// ── Honest error mapping (pure) ───────────────────────────────────────────────

const missingKey = designErrorFromUpstream(new ProviderError('missing_api_key', 'No API key configured'), 'm');
check('missing key → design_no_api_key 400 + no template promise', missingKey.code === 'design_no_api_key' && missingKey.status === 400 && missingKey.message.includes('NOT replaced by a template'));
const upstream = designErrorFromUpstream(new ProviderError('http_error', 'boom', 500), 'm');
check('upstream failure → design_upstream_error 502', upstream.code === 'design_upstream_error' && upstream.status === 502);
const timeoutErr = new Error('timed out');
timeoutErr.name = 'TimeoutError';
check('timeout → design_timeout 504', designErrorFromUpstream(timeoutErr, 'm').code === 'design_timeout');
const passthrough = new DesignError('bad_model_output', 'x', 422);
check('DesignError passes through unchanged', designErrorFromUpstream(passthrough, 'm') === passthrough);

console.log(`\n${passed} passed`);
