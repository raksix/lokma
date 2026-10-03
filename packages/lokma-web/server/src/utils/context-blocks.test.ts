import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MAX_CONTEXT_BYTES, expandPromptMentions, parsePromptMentions, readContextBlocks } from './context-blocks';

/**
 * REQ-188 — the Design Studio brief shares the chat composer's `@path`
 * mention, so the SERVER must turn a mention into real file content instead
 * of shipping a bare filename to the model. These probes cover the extraction
 * that the WS path now shares (one jail, one cap, one block shape) plus the
 * prompt expansion the Design generate route depends on.
 */

let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'lokma-ctx-'));
  writeFileSync(join(root, 'brief.md'), 'REQ188-CONTENT-TOKEN');
  writeFileSync(join(root, 'big.md'), 'x'.repeat(MAX_CONTEXT_BYTES + 10));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('parsePromptMentions', () => {
  test('reads one path per path-shaped run after @', () => {
    const text = 'look at @Docs/34-DESIGN.md now';
    const [hit] = parsePromptMentions(text);
    expect(hit.path).toBe('Docs/34-DESIGN.md');
    // the offsets must slice back to the exact mention text
    expect(text.slice(hit.start, hit.end)).toBe('@Docs/34-DESIGN.md');
  });

  test('the pattern matches the client parser (one definition of the @path shape)', () => {
    // The client chip uses /@([A-Za-z0-9_][A-Za-z0-9_./-]*)/g; if either side
    // drifts, the chip and the block disagree — that is the bug this pins.
    const clientPattern = /@([A-Za-z0-9_][A-Za-z0-9_./-]*)/g;
    for (const probe of ['@Docs/34-DESIGN.md', 'a @b_c/d-e.txt end', 'mail @f@example.com', 'no mention']) {
      const mine = parsePromptMentions(probe).map((m) => m.path);
      clientPattern.lastIndex = 0;
      const theirs = (probe.match(clientPattern) || []).map((s) => s.slice(1));
      expect(mine).toEqual(theirs);
    }
  });

  test('an email yields two mentions — the @ path shape, same as the client', () => {
    // `@` is not in the path char class, so `f@example.com` parses as `f` +
    // `example.com`. That is the client's behaviour (pinned above), and the
    // useful consequence: neither part resolves to a file, so the brief still
    // reaches the model with its text intact.
    expect(parsePromptMentions('mail @f@example.com').map((m) => m.path)).toEqual(['f', 'example.com']);
  });

  test('no @ means no mentions', () => {
    expect(parsePromptMentions('plain brief')).toEqual([]);
  });
});

describe('readContextBlocks', () => {
  test('a real file becomes a labeled <context> block with its content', async () => {
    const blocks = await readContextBlocks(root, ['brief.md']);
    expect(blocks).toContain('<context path="brief.md">');
    expect(blocks).toContain('REQ188-CONTENT-TOKEN');
    expect(blocks.endsWith('\n')).toBe(true);
  });

  test('a leading @ is tolerated', async () => {
    expect(await readContextBlocks(root, ['@brief.md'])).toContain('REQ188-CONTENT-TOKEN');
  });

  test('a jail escape is SKIPPED, not an error (a typo must not fail the turn)', async () => {
    const blocks = await readContextBlocks(root, ['../../../../etc/passwd', 'brief.md']);
    expect(blocks).toContain('REQ188-CONTENT-TOKEN');
    expect(blocks).not.toContain('root:');
  });

  test('an oversized file is skipped (cap enforced)', async () => {
    expect(await readContextBlocks(root, ['big.md'])).toBe('');
  });

  test('a missing file is skipped silently', async () => {
    expect(await readContextBlocks(root, ['nope.md'])).toBe('');
  });

  test('no paths is the empty string, not a crash', async () => {
    expect(await readContextBlocks(root, undefined)).toBe('');
    expect(await readContextBlocks(root, [])).toBe('');
  });
});

describe('expandPromptMentions', () => {
  test('mention text is REPLACED by real content (never a bare filename)', async () => {
    const out = await expandPromptMentions(root, 'design it like @brief.md please');
    expect(out).toContain('REQ188-CONTENT-TOKEN');
    // the visible mention must not survive into the prompt the model reads
    expect(out).not.toContain('@brief.md');
    expect(out).toContain('design it like');
  });

  test('two mentions both resolve and dedupe to one block', async () => {
    const out = await expandPromptMentions(root, '@brief.md and again @brief.md');
    expect(out.match(/<context path="brief.md">/g)?.length).toBe(1);
    expect(out).not.toContain('@brief.md');
  });

  test('an unreadable mention leaves the text clean rather than mangled', async () => {
    const out = await expandPromptMentions(root, 'just @missing.md here');
    expect(out).toBe('just here');
  });

  test('a brief with no mentions passes through byte-identical', async () => {
    const brief = 'pricing page, 3 tiers, terracotta';
    expect(await expandPromptMentions(root, brief)).toBe(brief);
  });

  test('an empty brief stays empty', async () => {
    expect(await expandPromptMentions(root, '')).toBe('');
  });
});