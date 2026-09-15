/**
 * Chat-attachment unit probe (REQ-155) — `send_file` + `deliverAttachment`
 * against a REAL temp workspace and a REAL session store.
 * Run: `bun src/tools/attachments.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts (same precedent as tools.test.ts).
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildAttachmentTools,
  CHAT_ATTACHMENT_MAX_BYTES,
  isInlinePreviewable,
  mimeForFile,
} from './attachments';
import { SessionStore } from '../session/store';

let passed = 0;
function check(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

type Result = Record<string, unknown> & { ok: boolean; code?: string };

const ws = await mkdtemp(join(tmpdir(), 'lokma-attach-test-'));
const SESSION = 'sess_attach_test';

await writeFile(join(ws, 'notes.txt'), 'hello attachment\n', 'utf-8');
await writeFile(join(ws, 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]));

// 1) MIME map + inline decision
check(mimeForFile('a.png') === 'image/png', 'png → image/png');
check(mimeForFile('A.JPEG') === 'image/jpeg', 'uppercase ext → image/jpeg');
check(mimeForFile('x.bin') === 'application/octet-stream', 'unknown ext → octet-stream');
check(isInlinePreviewable('image/webp') && !isInlinePreviewable('text/plain'), 'inline only for images');

const tool = buildAttachmentTools(ws, { sessionId: SESSION }).find((t) => t.name === 'send_file');
if (!tool) throw new Error('FAIL: send_file missing');
check(tool.readOnly !== true, 'send_file is gated like writes');

// 2) Happy path — the row lands with the attachment
const okRes = (await tool.handler({ path: 'notes.txt', caption: 'Al bakalım' }, undefined)) as Result;
check(okRes.ok === true && okRes.delivered === true, 'send_file delivers');
check(okRes.mime === 'text/plain' && okRes.name === 'notes.txt', 'mime + name reported');
const rows = await new SessionStore(ws).read(SESSION);
const last = rows[rows.length - 1] as (typeof rows)[number] | undefined;
check(last?.role === 'assistant' && last?.content === 'Al bakalım', 'caption is the row content');
check(Array.isArray(last?.attachments) && last?.attachments?.[0]?.path === 'notes.txt', 'attachment row persisted');
check(typeof last?.attachments?.[0]?.size === 'number' && (last?.attachments?.[0]?.size ?? 0) > 0, 'size measured');

// 3) Default caption + image mime
const ok2 = (await tool.handler({ path: 'shot.png' }, undefined)) as Result;
check(ok2.ok === true && ok2.mime === 'image/png', 'image delivers');
const rows2 = await new SessionStore(ws).read(SESSION);
check(rows2[rows2.length - 1]?.content === 'Attached: shot.png', 'default caption uses the file name');
check(rows2.length === 2, 'two rows appended');

// 4) Jail — path escapes are refused with the file-error code
const jailed = (await tool.handler({ path: '../escape.txt' }, undefined)) as Result;
check(jailed.ok === false && typeof jailed.code === 'string' && jailed.code.length > 0, 'path escape refused with a code');

// 5) Missing file refused honestly
const missing = (await tool.handler({ path: 'nope.txt' }, undefined)) as Result;
check(missing.ok === false, 'missing file refused');

// 6) Cap constant sane
check(CHAT_ATTACHMENT_MAX_BYTES === 25 * 1024 * 1024, 'cap constant sane');
check(SessionStore !== undefined, 'session store import intact');

await rm(ws, { recursive: true, force: true });
console.log(`\nchat-attachments: ${passed} checks passed.`);
