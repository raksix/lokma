import * as React from 'react';

/**
 * CodeEditor (REQ-100) — IDE-style editing with VS Code-flavored syntax
 * highlighting, zero dependencies.
 *
 * Technique: a transparent textarea layered over an aria-hidden pre painted
 * with token spans (matched font/padding/line-height, synced scroll). The
 * user types in the real textarea; the eye reads the colors.
 *
 * SAFETY: every source character passes through esc() — the only raw HTML
 * in the output is our own span wrappers with classes from the fixed TOK
 * map below. dangerouslySetInnerHTML never sees unescaped user content.
 *
 * TRANSPORT NOTE: this file uses no template literals and no backslash
 * escapes (patterns are single-quoted fragments + fromCharCode). Literal
 * backticks do not survive the authoring channel (they land as 0x27 and
 * break parsing far from the cause), so they are banned in this file.
 */

var NL = String.fromCharCode(10);
var SQ = String.fromCharCode(39);

var TOK_COM = 'text-[#008000] dark:text-[#6A9955]';
var TOK_STR = 'text-[#A31515] dark:text-[#CE9178]';
var TOK_KW = 'text-[#AF00DB] dark:text-[#C586C0]';
var TOK_NUM = 'text-[#098658] dark:text-[#B5CEA8]';
var TOK_FN = 'text-[#795E26] dark:text-[#DCDCAA]';
var TOK_TAG = 'text-[#800000] dark:text-[#569CD6]';
var TOK_ATT = 'text-[#FF0000] dark:text-[#9CDCFE]';

function esc(s: string): string {
  return s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
}

var JS_WORDS = [
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof',
  'instanceof', 'in', 'of', 'try', 'catch', 'finally', 'throw', 'class',
  'extends', 'super', 'this', 'import', 'export', 'from', 'default', 'async',
  'await', 'yield', 'null', 'undefined', 'true', 'false', 'void', 'enum',
  'interface', 'type', 'implements', 'as', 'satisfies', 'def', 'elif',
  'except', 'lambda', 'pass', 'raise', 'with', 'fi', 'then', 'done',
  'echo', 'local',
].join('|');

var NOT_WORD = '[^A-Za-z0-9_$]';
var NUM_PAT = '[0-9][0-9_]*(?:[.][0-9]+)?';
var FUNC_PAT = '[A-Za-z_$][A-Za-z0-9$]*(?=[ ]*[(])';
var DQ_STR = '"[^"' + NL + ']*"';
var SQ_STR = SQ + '[^' + SQ + NL + ']*' + SQ;
var JS_COM = '//[^' + NL + ']*|/[*][^]*?[*]/';
var HASH_COM = '#[^' + NL + ']*';
var HTML_COM = '<!--[^]*?-->';
var TAG_PAT = '<?/?[A-Za-z][A-Za-z0-9.:-]*|/?>';
var ATTR_PAT = '[A-Za-z-]+(?=[ ]*=[ ]*["' + SQ + '])';

type Spec = { src: string; cls: string };

function kwSpec(): Spec {
  return { src: '(?:^|' + NOT_WORD + ')((?:' + JS_WORDS + ')(?![A-Za-z0-9_$]))', cls: TOK_KW };
}

function specsFor(lang: string): Spec[] {
  var com = { src: '()(' + JS_COM + ')', cls: TOK_COM };
  var hcom = { src: '()(' + HASH_COM + ')', cls: TOK_COM };
  var mcom = { src: '()(' + HTML_COM + ')', cls: TOK_COM };
  var str = { src: '()(' + DQ_STR + '|' + SQ_STR + ')', cls: TOK_STR };
  var num = { src: '()(' + NUM_PAT + ')', cls: TOK_NUM };
  var fn = { src: '()(' + FUNC_PAT + ')', cls: TOK_FN };
  var tag = { src: '()(' + TAG_PAT + ')', cls: TOK_TAG };
  var attr = { src: '()(' + ATTR_PAT + ')', cls: TOK_ATT };
  if (lang === 'markup') return [mcom, str, tag, attr];
  if (lang === 'css') return [{ src: '()(/[*][^]*?[*]/)', cls: TOK_COM }, str, num];
  if (lang === 'javascript' || lang === 'typescript' || lang === 'json') {
    return [com, str, kwSpec(), num, fn];
  }
  if (lang === 'python' || lang === 'shell' || lang === 'config') {
    return [hcom, str, kwSpec(), num];
  }
  if (lang === 'markdown') {
    return [
      { src: '()(' + SQ + SQ + SQ + '[^]*?' + SQ + SQ + SQ + ')', cls: TOK_STR },
      { src: '()((?:^|[' + NL + '])(?:#{1,6} |>).*)', cls: TOK_KW },
    ];
  }
  return [];
}

/** Language id from a file path extension. Unknown maps to plain. */
export function languageForPath(path: string): string {
  var parts = path.split('.');
  var ext = (parts.length > 1 ? parts[parts.length - 1] : '').toLowerCase();
  if (ext === 'html' || ext === 'htm' || ext === 'xml' || ext === 'svg' || ext === 'vue' || ext === 'svelte' || ext === 'astro') return 'markup';
  if (ext === 'css' || ext === 'scss' || ext === 'less') return 'css';
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'javascript';
  if (ext === 'ts' || ext === 'tsx' || ext === 'mts' || ext === 'cts') return 'typescript';
  if (ext === 'json' || ext === 'jsonc') return 'json';
  if (ext === 'py') return 'python';
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh' || ext === 'fish') return 'shell';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'yaml' || ext === 'yml' || ext === 'toml' || ext === 'ini' || ext === 'cfg' || ext === 'env') return 'config';
  return 'plain';
}

/** Highlight source to an HTML string (all text escaped — see SAFETY above). */
export function highlightCode(code: string, lang: string): string {
  var specs = specsFor(lang);
  if (specs.length === 0) {
    var plain = esc(code);
    return code.slice(-1) === NL ? plain + ' ' : plain;
  }
  var parts: string[] = [];
  var classes: string[] = [];
  for (var i = 0; i < specs.length; i++) {
    parts.push('(' + specs[i].src + ')');
    classes.push(specs[i].cls);
  }
  var re = new RegExp(parts.join('|'), 'g');
  var out = '';
  var last = 0;
  var m: RegExpExecArray | null;
  for (;;) {
    m = re.exec(code);
    if (!m) break;
    if (m.index > last) out += esc(code.slice(last, m.index));
    if (m[0].length === 0) {
      last = m.index;
      re.lastIndex = m.index + 1;
      continue;
    }
    var hit = -1;
    for (var k = 0; k < specs.length; k++) {
      if (m[k * 3 + 1] !== undefined) {
        hit = k;
        break;
      }
    }
    if (hit < 0) {
      last = m.index + m[0].length;
      continue;
    }
    var pre = m[hit * 3 + 2] || '';
    var core = m[hit * 3 + 3] || '';
    out += esc(pre) + '<span class="' + classes[hit] + '">' + esc(core) + '</span>';
    last = m.index + m[0].length;
  }
  out += esc(code.slice(last));
  // A trailing newline would collapse in pre and desync the overlay height.
  return code.slice(-1) === NL ? out + ' ' : out;
}

var CODE_FONT = 'font-mono text-[11px] leading-relaxed';

/** Read-only highlighted source view. */
export function CodeView({ code, language }: { code: string; language: string }) {
  return (
    <pre className={'min-h-0 flex-1 overflow-auto p-2 ' + CODE_FONT}>
      <code dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }} />
    </pre>
  );
}

/** Editable overlay: transparent textarea over highlighted pre plus gutter. */
export function CodeEditor({
  value,
  onChange,
  language,
  onSave,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  language: string;
  onSave: () => void;
  label: string;
}) {
  var preRef = React.useRef<HTMLPreElement | null>(null);
  var gutRef = React.useRef<HTMLDivElement | null>(null);
  var taRef = React.useRef<HTMLTextAreaElement | null>(null);
  var lineCount = value.split(NL).length;

  var syncScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    var t = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = t.scrollTop;
      preRef.current.scrollLeft = t.scrollLeft;
    }
    if (gutRef.current) gutRef.current.scrollTop = t.scrollTop;
  };

  var onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      var ta = taRef.current;
      if (!ta) return;
      var s = ta.selectionStart || 0;
      var en = ta.selectionEnd || 0;
      onChange(value.slice(0, s) + '  ' + value.slice(en));
      var caret = s + 2;
      var el: HTMLTextAreaElement = ta;
      requestAnimationFrame(() => el.setSelectionRange(caret, caret));
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      onSave();
    }
  };

  var gutter = React.useMemo(() => {
    var rows: string[] = [];
    for (var i = 1; i <= lineCount; i++) rows.push(String(i));
    return rows.join(NL);
  }, [lineCount]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div
        ref={gutRef}
        aria-hidden
        className={'w-10 shrink-0 overflow-hidden border-r border-line bg-muted/40 p-2 pr-1 text-right text-zinc-400 select-none ' + CODE_FONT}
      >
        <pre className={CODE_FONT}>{gutter}</pre>
      </div>
      <div className="relative min-w-0 flex-1">
        <pre ref={preRef} aria-hidden className={'pointer-events-none absolute inset-0 overflow-hidden p-2 ' + CODE_FONT}>
          <code
            className="whitespace-pre"
            dangerouslySetInnerHTML={{ __html: highlightCode(value, language) }}
          />
        </pre>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={label}
          style={{ tabSize: 4 }}
          className={'absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-2 whitespace-pre text-transparent caret-[#262624] outline-none selection:bg-[#ADD6FF] dark:caret-[#FAF9F5] dark:selection:bg-[#264F78] ' + CODE_FONT}
        />
      </div>
    </div>
  );
}
