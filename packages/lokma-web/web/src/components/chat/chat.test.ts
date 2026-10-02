/**
 * Chat probe for W1-1 (`./chat.test.ts` + composer pure helpers).
 * Run: `bun src/components/chat/chat.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import {
  MAX_IMAGE_EDGE,
  STARTER_PROMPTS,
  downscaleDims,
  formatImageMarker,
  hasOsFiles,
  isImageAttachment,
  isSlashPrefix,
  parseMentions,
  parseSlashCommand,
  removeMention,
  timeGreeting,
} from './composer-utils';
import { promptMessage } from '@/lib/ws';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

// 1. @mention extraction feeds the server `contextPaths` frame field.
const mentions = parseMentions('explain @src/app.ts and @docs/notes.md please');
assert(mentions.length === 2, 'two mentions parsed');
assert(mentions[0].path === 'src/app.ts', 'first mention path exact');
assert(mentions[1].path === 'docs/notes.md', 'second mention path exact');
assert(parseMentions('no mentions here').length === 0, 'plain text has no mentions');

// 2. Chip dismiss removes exactly one occurrence.
const removed = removeMention('a @x.ts b @x.ts', 'x.ts');
assert(removed === 'a b @x.ts', 'dismiss removes first occurrence only');
assert(removeMention('plain', 'x.ts') === 'plain', 'dismiss of absent path is a no-op');

// 3. Slash parsing matches the GET /api/commands registry ids.
assert(parseSlashCommand('/fork')?.id === 'fork', '/fork parses');
assert(parseSlashCommand('/MODEL anthropic/x')?.id === 'model', 'slash id lowercased');
assert(parseSlashCommand('/model anthropic/x')?.args === 'anthropic/x', 'slash args kept');
assert(parseSlashCommand('hello') === null, 'plain text is not a slash command');
assert(isSlashPrefix('/mo') === true, 'typing prefix shows palette');
assert(isSlashPrefix('/model x') === false, 'completed command hides palette');

// 4. Prompt frame carries model + contextPaths (server reads them for real).
const frame = JSON.parse(promptMessage('hi @a.ts', 'sess_1', { model: 'm', contextPaths: ['a.ts'] })) as Record<
  string,
  unknown
>;
assert(frame.type === 'prompt', 'prompt frame type');
assert(frame.model === 'm', 'prompt frame carries model');
assert(
  Array.isArray(frame.contextPaths) && (frame.contextPaths as string[])[0] === 'a.ts',
  'prompt frame carries contextPaths',
);

// 4b. REQ-186: attached images ride the prompt frame as real bytes; a send
// without images leaves the field off the wire entirely (no empty arrays).
const imgFrame = JSON.parse(
  promptMessage('look', 'sess_1', {
    images: [{ name: 'shot.png', mime: 'image/jpeg', dataBase64: 'aGVsbG8=' }],
  }),
) as Record<string, unknown>;
assert(Array.isArray(imgFrame.images) && (imgFrame.images as unknown[]).length === 1, 'prompt frame carries images');
assert(!('images' in (JSON.parse(promptMessage('plain', 'sess_1')) as Record<string, unknown>)), 'no images key without attachments');

// 5. Hero content is real (each card maps to a session-creating prompt).
assert(STARTER_PROMPTS.length === 3, 'three starter cards');
assert(STARTER_PROMPTS.every((s) => s.prompt.length > 10), 'starter prompts are sendable');
assert(typeof timeGreeting(new Date('2026-01-01T09:00:00')) === 'string', 'greeting renders');

// 6. W1-4 hero acceptance: greeting follows the clock (no hardcoded persona),
// cards are unique, and every prompt is non-trivial (real session starter).
assert(timeGreeting(new Date('2026-01-01T02:30:00')) === 'Up late', 'night greeting');
assert(timeGreeting(new Date('2026-01-01T09:00:00')) === 'Good morning', 'morning greeting');
assert(timeGreeting(new Date('2026-01-01T14:00:00')) === 'Good afternoon', 'afternoon greeting');
assert(timeGreeting(new Date('2026-01-01T21:00:00')) === 'Good evening', 'evening greeting');
const heroTitles = STARTER_PROMPTS.map((s) => s.title);
assert(new Set(heroTitles).size === heroTitles.length, 'starter card titles unique');
assert(
  STARTER_PROMPTS.every((s) => s.title.trim().length > 0 && s.desc.trim().length > 0),
  'starter cards have title + description',
);
assert(
  STARTER_PROMPTS.every((s) => !/aylin/i.test(`${s.title} ${s.desc} ${s.prompt}`)),
  'hero carries no hardcoded persona name',
);

console.log('chat.test.ts: all W1-1 chat checks passed');

// 7. REQ-097 paste/drop routing: images by mime or extension, OS files by
// `Files` type (explorer @path drags carry no `Files` and stay untouched).
assert(isImageAttachment('shot.png', 'image/png') === true, 'png mime is image');
assert(isImageAttachment('photo.JPG', '') === true, 'jpg extension is image without mime');
assert(isImageAttachment('notes.md', 'text/markdown') === false, 'markdown is text');
assert(isImageAttachment('data.bin', 'application/octet-stream') === false, 'unknown binary is not image');
assert(hasOsFiles(['Files']) === true, 'OS file drag detected');
assert(hasOsFiles(['application/x-lokma-file', 'text/plain']) === false, 'explorer drag is not OS files');
assert(hasOsFiles(['text/plain']) === false, 'plain text drag is not OS files');
assert(
  formatImageMarker('shot.png', '800x600', 120) === '[image attached: shot.png (800x600, 120 KB)]',
  'image marker format exact',
);
assert(
  formatImageMarker('shot.png', '1568x882', 245, '3840x2160') ===
    '[image attached: shot.png (1568x882, 245 KB) — downscaled from 3840x2160]',
  'downscaled marker names the source size',
);

// 8. REQ-186 downscale sizing: 4K screenshots step down to MAX_IMAGE_EDGE,
// small images ride untouched, degenerate dims never divide by zero.
const big = downscaleDims(3840, 2160);
assert(big.width === MAX_IMAGE_EDGE && big.height === 882 && big.scaled, '4K downscales to the edge cap');
const tall = downscaleDims(1080, 2400);
assert(tall.height === MAX_IMAGE_EDGE && tall.width === 706 && tall.scaled, 'portrait downscales on its long edge');
const small = downscaleDims(800, 600);
assert(small.width === 800 && small.height === 600 && !small.scaled, 'small images are untouched');
const degenerate = downscaleDims(0, 0);
assert(degenerate.width === 0 && degenerate.height === 0 && !degenerate.scaled, 'degenerate dims pass through');

console.log('chat.test.ts: REQ-097 paste/drop checks passed');
