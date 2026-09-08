/**
 * LokmaMessage probe for W1-2.
 * Run: `bun src/components/chat/lokma-message.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import { applyServerFrame, dropRequest, initialWsUiState, permissionAnswer, questionAnswer } from '@/lib/ws';
import { parseMarkdownBlocks, sanitizeMdUrl, splitCodeFences, summarizeInput } from './lokma-message';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

// 1. Fence parsing splits real code out of assistant text.
const segs = splitCodeFences('Intro line\n```ts\nconst a = 1;\n```\nOutro');
assert(segs.length === 3, 'text/code/text split');
assert(segs[0].kind === 'text' && (segs[0] as { body: string }).body === 'Intro line', 'leading text exact');
assert(segs[1].kind === 'code', 'middle segment is code');
assert((segs[1] as { lang: string }).lang === 'ts', 'code lang parsed');
assert((segs[1] as { body: string }).body === 'const a = 1;', 'code body exact');
assert(splitCodeFences('plain only').length === 1, 'plain text is one segment');
assert(splitCodeFences('```py\nopen(\n').length === 1, 'unclosed fence is code');

// 2. Input summaries stay one line and bounded.
assert(summarizeInput({ cmd: 'npm test', cwd: '/x' }).includes('npm test'), 'object input summarized');
assert(summarizeInput('a\nb').includes(' ') || summarizeInput('a\nb') === 'a b', 'multiline flattened');
assert(summarizeInput('z'.repeat(500)).length <= 120, 'long input truncated');

// 3. Thought trace folds from real tool_start / tool_result frames.
let ui = initialWsUiState();
ui = applyServerFrame(ui, { type: 'tool_start', tool: 'bash', input: { cmd: 'ls' }, callId: 'c1', sessionId: 's' });
assert(ui.toolCalls['c1']?.tool === 'bash', 'tool_start registers call');
assert(ui.toolCalls['c1']?.result === undefined, 'running call has no result yet');
ui = applyServerFrame(ui, { type: 'tool_result', callId: 'c1', result: 'ok', isError: false, sessionId: 's' });
assert(ui.toolCalls['c1']?.result === 'ok', 'tool_result attaches output');

// 4. Permission + question queues fill from real server frames.
ui = applyServerFrame(ui, {
  type: 'permission_request',
  requestId: 'p1',
  tool: 'bash',
  description: 'run npm test',
  sessionId: 's',
});
assert(ui.permissions.length === 1 && ui.permissions[0].tool === 'bash', 'permission_request queued');
ui = applyServerFrame(ui, {
  type: 'ask_user_question',
  requestId: 'q1',
  question: 'Which model?',
  choices: ['a', 'b'],
  sessionId: 's',
});
assert(ui.questions.length === 1 && (ui.questions[0].choices ?? []).length === 2, 'question queued with choices');

// 5. Answer builders produce schema-valid client frames (server decodes them).
const perm = JSON.parse(permissionAnswer('p1', 'always')) as Record<string, unknown>;
assert(perm.type === 'permission_response' && perm.decision === 'always', 'permission answer frame valid');
const ques = JSON.parse(questionAnswer('q1', 'a')) as Record<string, unknown>;
assert(ques.type === 'ask_response' && ques.answer === 'a', 'question answer frame valid');

// 6. Answering drops the card from its queue (hook mirrors this via dropRequest).
assert(dropRequest(ui.permissions, 'p1').length === 0, 'answered permission leaves queue');
assert(dropRequest(ui.questions, 'q1').length === 0, 'answered question leaves queue');

// 7. REQ-069: markdown block parser (headers/lists/quotes/rules/paragraphs).
const md = parseMarkdownBlocks('## Title\n\n- a\n- b\n\n1. x\n2. y\n\n> note\n\n---\n\nplain');
assert(md.length === 6, `six blocks parsed, got ${md.length}`);
assert(md[0].kind === 'h' && (md[0] as { level: number }).level === 2, 'h2 level parsed');
assert(md[1].kind === 'ul' && (md[1] as { items: string[] }).items.length === 2, 'ul items grouped');
assert(md[2].kind === 'ol' && (md[2] as { items: string[] }).items.length === 2, 'ol items grouped');
assert(md[3].kind === 'quote', 'quote parsed');
assert(md[4].kind === 'hr', 'rule parsed');
assert(md[5].kind === 'p', 'trailing paragraph parsed');
assert(parseMarkdownBlocks('just text').length === 1, 'plain text is one paragraph');
assert(parseMarkdownBlocks('**bold** and more')[0].kind === 'p', 'inline markup stays in paragraph');
assert(sanitizeMdUrl('https://example.com/a') === 'https://example.com/a', 'https link allowed');
assert(sanitizeMdUrl('/docs/x') === '/docs/x', 'relative link allowed');
assert(sanitizeMdUrl('javascript:alert(1)') === null, 'javascript: url rejected');
assert(sanitizeMdUrl('data:text/html,<b>x</b>') === null, 'data: url rejected');

console.log('lokma-message.test.ts: all W1-2 checks passed');
