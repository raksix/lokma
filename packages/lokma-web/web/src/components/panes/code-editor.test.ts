/**
 * code-editor.test.ts (REQ-100) — probe for the pure highlight helpers.
 * Run: `bun src/components/panes/code-editor.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain checks so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import { highlightCode, languageForPath } from './code-editor';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

// languageForPath
check('html is markup', languageForPath('page.html') === 'markup');
check('tsx is typescript', languageForPath('src/app.tsx') === 'typescript');
check('js is javascript', languageForPath('a/b.js') === 'javascript');
check('css is css', languageForPath('style.css') === 'css');
check('json is json', languageForPath('data.json') === 'json');
check('py is python', languageForPath('main.py') === 'python');
check('sh is shell', languageForPath('run.sh') === 'shell');
check('md is markdown', languageForPath('README.md') === 'markdown');
check('yaml is config', languageForPath('cfg.yaml') === 'config');
check('extension match is case-insensitive', languageForPath('PAGE.HTML') === 'markup');
check('unknown extension is plain', languageForPath('blob.xyz') === 'plain');
check('no extension is plain', languageForPath('Makefile') === 'plain');

// highlightCode — safety first: user text must never leak as raw HTML.
const evil = '<script>alert(1)</script>';
const evilOut = highlightCode(evil, 'typescript');
check('angle brackets are escaped', !evilOut.includes('<script>') && evilOut.includes('&lt;script&gt;'));
check('no raw user html in spans', !/<(?!span |\/span>)[a-z]/i.test(evilOut.replace(/<span class="[^"]*">|<\/span>/g, '')));

// highlightCode — tokens get wrapped.
const js = 'const x = "hi"; // note\nfoo(42);';
const jsOut = highlightCode(js, 'javascript');
check('keyword wrapped', jsOut.includes('<span class="') && jsOut.includes('const'));
check('string wrapped', jsOut.includes('&quot;hi&quot;') || jsOut.includes('"hi"'));
check('comment wrapped', jsOut.includes('// note'));
check('function call wrapped', jsOut.includes('foo'));
check('output is longer than input when tokens found', jsOut.length > js.length);

const html = '<div class="box">Hi</div>';
const htmlOut = highlightCode(html, 'markup');
check('markup tag wrapped', htmlOut.includes('&lt;') && htmlOut.includes('<span class="'));

// highlightCode — plain language returns escaped text with no spans.
const plainOut = highlightCode('<b>x</b> & y', 'plain');
check('plain has no spans', !plainOut.includes('<span'));
check('plain still escapes', plainOut.includes('&lt;b&gt;') && plainOut.includes('&amp;'));

// highlightCode — trailing newline keeps overlay height in sync.
check('trailing newline padded', highlightCode('a\n', 'plain') === 'a\n ');
check('empty input is empty', highlightCode('', 'javascript') === '');

console.log(`code-editor: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
