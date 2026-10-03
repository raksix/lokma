/**
 * REQ-188 — Design slash-command probe (pure logic, no DOM).
 *
 * The Design Studio brief now rides the SHARED `ComposerInput` primitive, so
 * its `/command` palette renders rows this module produces and every command
 * must perform a REAL edit of the brief form — a palette row that quietly does
 * nothing is the failure mode this probe pins.
 *
 * Run: `bun src/components/design/design-slash.test.ts` from
 * `packages/lokma-web/web`.
 */
import { DESIGN_SLASH_COMMANDS, applyDesignSlash } from './design-slash';
import { DESIGN_SAMPLES, DESIGN_SYSTEMS, DESIGN_TYPES, emptyGenerateForm, type GenerateForm } from './design';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

/** Apply one command and return the mutated form + the command's narration. */
function run(
  id: string,
  args: string,
  initial: GenerateForm = emptyGenerateForm,
): { form: GenerateForm; result: ReturnType<typeof applyDesignSlash> } {
  let form = initial;
  const result = applyDesignSlash(id, args, form, (updater) => {
    form = updater(form);
  });
  return { form, result };
}

// 1. Every palette row has a name, a hint and a usage string — the palette
//    renders `c.hint`, and a row with no hint would render an empty cell.
for (const row of DESIGN_SLASH_COMMANDS) {
  assert(row.name.startsWith('/'), `${row.id} shows a slash name`);
  assert(row.hint.length > 0, `${row.id} carries a readable hint`);
  assert(typeof row.usage === 'string' && row.usage.length > 0, `${row.id} carries a usage hint`);
}
assert(new Set(DESIGN_SLASH_COMMANDS.map((c) => c.id)).size === DESIGN_SLASH_COMMANDS.length, 'command ids are unique');

// 2. `/new` clears the draft but keeps the style axes (the user picked them).
{
  const start: GenerateForm = { type: 'deck', brief: 'old brief', system: 'omp-dark', model: 'm/x' };
  const { form } = run('new', '', start);
  assert(form.brief === '', '/new clears the brief');
  assert(form.type === 'deck' && form.system === 'omp-dark', '/new keeps type + system');
}

// 3. `/type` accepts a name AND a 1-based index; both write the real enum value.
{
  assert(run('type', 'deck').form.type === 'deck', '/type deck sets the type');
  assert(run('type', '3').form.type === DESIGN_TYPES[2], '/type 3 sets the indexed type');
}

// 4. `/system` mirrors that contract.
{
  assert(run('system', 'paper-ink').form.system === 'paper-ink', '/system sets the system');
  assert(run('system', '4').form.system === DESIGN_SYSTEMS[3], '/system 4 sets the indexed system');
}

// 5. An unknown value is an honest error, never a silent no-op that lies.
{
  const bad = run('type', 'nope');
  assert('error' in bad.result, 'an unknown type returns an error');
  assert(bad.form.type === emptyGenerateForm.type, 'an unknown type leaves the form untouched');
  assert('error' in run('system', 'zzz').result, 'an unknown system returns an error');
}

// 6. `/sample` fills a REAL sample brief (and its natural type).
{
  const { form, result } = run('sample', '');
  assert('message' in result, '/sample reports what it filled');
  assert(form.brief.length > 0, '/sample writes a brief');
  assert(DESIGN_SAMPLES.some((s) => s.brief === form.brief), '/sample brief comes from the sample set');
}

// 7. An unknown command id is refused — the palette never lists one, but a
//    stale draft could still hold it.
{
  assert('error' in run('teleport', '').result, 'an unknown command is refused');
}

console.log('design-slash.test.ts: all Design slash checks passed');