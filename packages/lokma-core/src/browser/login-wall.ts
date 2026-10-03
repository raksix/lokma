/**
 * Login-wall detection for the browser proxy (REQ-193, slice 9).
 *
 * Kapsam 7 says a login-gated page must NOT render an empty form: the pane has
 * to say plainly that the page needs a real login and offer the external tab.
 * This module is the ONE place that decides whether a fetched document is such
 * a page, because the answer is needed on both sides and the two must not drift:
 *
 * - the SERVER sends it as structured data (`x-lokma-login-wall` response
 *   header), so the pane never has to parse English out of a sentence — the
 *   exact prose-as-data defect slices 7 and 8 just closed for the tunnel;
 * - the CLIENT re-derives it from the same exported function as a fallback, so
 *   a cached/older document is still classified the same way.
 *
 * Why detection is needed at all, stated as the mechanism rather than the
 * symptom: the proxy has its own origin and deliberately forwards no cookies,
 * so a site gated behind an `httponly` session cookie can only ever render its
 * LOGIN form here. The user sees a real form, typed into, and nothing happens —
 * worse than a blank frame, because it looks like a broken product.
 *
 * Deliberately CONSERVATIVE. A false positive tells a user that a perfectly
 * readable page needs a login (and hides content they could have read), so
 * every signal below is narrow and the conjunction is required:
 *   - the status is a redirect-to-login or 401/403 (the caller decides; see
 *     `isLoginWallStatus`), OR
 *   - the document is a form POST to a path that looks like a login endpoint
 *     AND the body carries no real content markers.
 * A page with substantial text and links is not a wall even if it has a search
 * box in the header, which is why body markers alone never decide it.
 */

/** Response statuses that mean "you are looking at a gate", not the page. */
const LOGIN_WALL_STATUSES = new Set([401, 403]);

export function isLoginWallStatus(status: number): boolean {
  return LOGIN_WALL_STATUSES.has(status);
}

/**
 * Header the server sets when the document it just served is a login wall.
 * Lower-case on purpose: HTTP header names are case-insensitive and the client
 * reads `res.headers.get(...)`, which is also case-insensitive.
 */
export const LOGIN_WALL_HEADER = 'x-lokma-login-wall';

/**
 * Path fragments that identify a sign-in endpoint. Matched against the
 * lower-cased path only — a query string is attacker/page controlled and
 * matching on it produced false positives on ordinary URLs.
 */
const LOGIN_PATH_HINTS = [
  '/login',
  '/signin',
  '/sign-in',
  '/log-in',
  '/auth',
  '/session',
  '/giris',
  '/uye-giris',
  '/oturum',
];

/** Input types that mean "this document is a form the user could type into". */
const PASSWORD_INPUT_RE = /<input\b[^>]*\btype\s*=\s*["']?password["']?/i;
const FORM_RE = /<form\b/i;

/**
 * Body markers that mean "there is real content here". Any one of these makes
 * the document readable, so it is never reported as a wall on form signals
 * alone — this is what keeps a normal page with a header search box readable.
 */
const CONTENT_MARKERS = [
  /<article\b/i,
  /<main\b/i,
  /role\s*=\s*["']main["']/i,
  /<nav\b/i,
  /itemprop\s*=/i,
];

/** A page with fewer than this many visible-ish characters is treated as empty. */
const MIN_CONTENT_CHARS = 400;

/** Login form endpoints get special treatment so `/author/login` still counts. */
function looksLikeLoginPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return LOGIN_PATH_HINTS.some((hint) => path === hint || path.includes(hint));
}

/**
 * Strip markup and count what a reader would actually see.
 *
 * A raw `html.length` threshold would call a page "empty" because of a large
 * inline script, which is the whole point of the false-positive guard — so the
 * count is taken over visible text with `<script>`/`<style>` removed.
 */
function visibleTextLength(html: string): number {
  const withoutCode = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return withoutCode.replace(/\s+/g, ' ').trim().length;
}

export type LoginWallVerdict = {
  /** True when the document should be reported as a login gate. */
  loginWall: boolean;
  /** Which signal fired — for logs and probes, never shown as a sentence. */
  reason: 'status' | 'redirect-to-login' | 'login-form' | null;
};

export type LoginWallInput = {
  /** Final upstream status. */
  status: number;
  /** Absolute url actually fetched (after redirects). */
  finalUrl: string;
  /** How many redirect hops were followed. */
  redirects?: number;
  /** Document body — only needed for an HTML response. */
  html?: string | null;
};

/**
 * Decide whether the served document is a login wall.
 *
 * Pure + sync so both the server route and the client helper call the SAME
 * implementation; a second heuristic in the pane is how the tunnel panel came
 * to answer a request for a command with a status sentence.
 */
export function detectLoginWall(input: LoginWallInput): LoginWallVerdict {
  const none: LoginWallVerdict = { loginWall: false, reason: null };

  if (isLoginWallStatus(input.status)) return { loginWall: true, reason: 'status' };

  // A redirect chain that LANDED on a login endpoint is the same gate seen one
  // hop later. Gated on `redirects > 0` so an ordinary page that happens to be
  // served at /login directly (with no chain) is judged on its body instead.
  if ((input.redirects ?? 0) > 0) {
    try {
      if (looksLikeLoginPath(new URL(input.finalUrl).pathname)) {
        return { loginWall: true, reason: 'redirect-to-login' };
      }
    } catch {
      /* finalUrl is validated upstream; an unparseable one is not a wall */
    }
  }

  const html = input.html;
  if (!html) return none;
  // Only a document with a password field can be a login form; a plain search
  // box or a newsletter signup is not a gate.
  if (!PASSWORD_INPUT_RE.test(html) || !FORM_RE.test(html)) return none;
  if (looksLikeLoginPath(safePathname(input.finalUrl))) {
    return { loginWall: true, reason: 'login-form' };
  }
  // A password form on an unrelated path (a modal on the pricing page) only
  // counts when the page has nothing else to read.
  if (CONTENT_MARKERS.some((re) => re.test(html))) return none;
  if (visibleTextLength(html) >= MIN_CONTENT_CHARS) return none;
  return { loginWall: true, reason: 'login-form' };
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}
