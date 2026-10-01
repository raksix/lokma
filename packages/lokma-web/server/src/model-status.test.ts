/**
 * REQ-183: remembered upstream model-availability refusals annotate the
 * merged catalog with `unsupported: true` (the pickers' "not on server").
 * Run: `bun src/model-status.test.ts` from `packages/lokma-web/server`.
 * No test framework — plain asserts so the package stays dependency-free.
 */
import { annotateModelSupport, markModelUnsupported, unsupportedModelIds } from './model-status';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

type Row = { id: string; label: string; provider: string; enabled: boolean };
function rowOf(id: string): Row {
  const slash = id.indexOf('/');
  return { id, label: id.slice(id.lastIndexOf('/') + 1), provider: id.slice(0, slash), enabled: true };
}

// 1. Empty registry: annotate is an identity pass (the catalog base is a
//    shared, cached array — no churn when nothing was refused).
{
  const rows = [rowOf('commandcode/stealth/space-bunny-alpha')];
  const out = annotateModelSupport(rows);
  assert(out === rows, 'no remembered ids → the same array passes through');
}

// 2. A marked id gets the flag; siblings stay clean; the input is not mutated.
{
  markModelUnsupported('commandcode/stealth/space-bunny-alpha');
  const rows = [
    rowOf('commandcode/stealth/space-bunny-alpha'),
    rowOf('commandcode/deepseek/deepseek-v4.1-flash'),
    rowOf('other-provider/stealth/space-bunny-alpha'),
  ];
  const out = annotateModelSupport(rows);
  const hit = out.find((m) => m.id === 'commandcode/stealth/space-bunny-alpha');
  const sibling = out.find((m) => m.id === 'commandcode/deepseek/deepseek-v4.1-flash');
  const tail = out.find((m) => m.id === 'other-provider/stealth/space-bunny-alpha');
  assert(hit?.unsupported === true, 'the refused id carries unsupported: true');
  assert(sibling?.unsupported === undefined, 'a working sibling keeps no flag');
  assert(tail?.unsupported === undefined, 'the same tail under another provider is NOT flagged (full-id keying)');
  assert(!('unsupported' in rows[0]), 'input rows are never mutated in place');
  assert(out.length === rows.length, 'no rows are dropped — badge, never clip');
}

// 3. The registry keys on the full catalog id the loop reports (viewId'd).
{
  const ids = unsupportedModelIds();
  assert(
    ids.length === 1 && ids[0] === 'commandcode/stealth/space-bunny-alpha',
    'registry holds exactly the full catalog id',
  );
}

// 4. Idempotent; empty ids are ignored.
{
  markModelUnsupported('commandcode/stealth/space-bunny-alpha');
  markModelUnsupported('');
  assert(unsupportedModelIds().length === 1, 're-marking and empty ids never grow the registry');
}

console.log(`REQ-183 model-status: ${passed} passed`);
