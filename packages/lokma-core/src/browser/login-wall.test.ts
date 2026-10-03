/**
 * Unit probe for the login-wall detector (REQ-193 slice 9).
 * Run: `bun src/browser/login-wall.test.ts` from `packages/lokma/core`.
 *
 * The false-positive direction is the one that matters: a page wrongly called a
 * login wall HIDES content the user could read and tells them to go log in for
 * no reason. So most of these asserts are the "this is a normal page" side, and
 * the false-positive guard itself is proven below by mutating the document to
 * look exactly like a wall.
 */
import { detectLoginWall, isLoginWallStatus, LOGIN_WALL_HEADER } from './login-wall';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

const LOGIN_FORM = [
  '<!doctype html><html><head><title>Sign in</title>',
  '<style>.a{color:red}</style>',
  '<script>var x = "<form>";</script>',
  '</head><body>',
  '<form action="/login" method="post">',
  '<input type="email" name="email">',
  '<input type="password" name="password">',
  '<button>Log in</button></form>',
  '</body></html>',
].join('');

const RICH_PAGE = [
  '<!doctype html><html><head><title>Docs</title>',
  '<style>body{font:16px}</style>',
  '<script>var tracking = "x".repeat(4000);</script>',
  '</head><body><nav><a href="/">Home</a></nav><main><article>',
  '<h1>Documentation</h1>',
  '<p>This page has plenty of readable prose, so even though it carries a',
  ' search box in the header, a detector that keyed on the mere PRESENCE of a',
  ' form would wrongly tell the reader this whole page needs a login. That is',
  ' the false positive this module is built to avoid, and it is why visible',
  ' text length and content markers are part of the decision at all.',
  '</p><p>More readable content here to push it well past the threshold.</p>',
  '</article></main>',
  '<form action="/search" method="get"><input name="q"></form>',
  '</body></html>',
].join('');

console.log('== status gates ==');
assert(LOGIN_WALL_HEADER === 'x-lokma-login-wall', 'wall header name is the documented one');
assert(isLoginWallStatus(401) && isLoginWallStatus(403), '401 and 403 are gates');
assert(!isLoginWallStatus(200) && !isLoginWallStatus(302) && !isLoginWallStatus(404), '200/302/404 are not gates');

console.log('== a real login wall is detected ==');
assert(
  detectLoginWall({ status: 200, finalUrl: 'https://app.example/login', html: LOGIN_FORM }).loginWall,
  'password form served at /login is a wall',
);
assert(
  detectLoginWall({ status: 200, finalUrl: 'https://app.example/sign-in/', html: LOGIN_FORM }).reason === 'login-form',
  'the reason names the signal that fired',
);
assert(
  detectLoginWall({ status: 401, finalUrl: 'https://app.example/private', html: null }).reason === 'status',
  '401 alone is a wall with no body to inspect',
);
assert(
  detectLoginWall({
    status: 200,
    // The realistic chain: /dashboard 302 → /login, so the FINAL url is the gate.
    finalUrl: 'https://app.example/login',
    redirects: 1,
    html: '<html><body>Sign in to continue</body></html>',
  }).reason === 'redirect-to-login',
  'a redirect chain landing on /login is the same gate one hop later',
);
assert(
  detectLoginWall({ status: 200, finalUrl: 'https://app.example/redirected', redirects: 1, html: '<html><body>hi</body></html>' })
    .loginWall === false,
  'a redirect that does NOT land on a login path is not a wall',
);

console.log('== normal pages are never walls (the false-positive guard) ==');
const rich = detectLoginWall({ status: 200, finalUrl: 'https://app.example/docs', html: RICH_PAGE });
assert(!rich.loginWall, 'a readable page with a search form is NOT a wall');
assert(rich.reason === null, 'a non-wall reports no reason');

assert(
  !detectLoginWall({ status: 200, finalUrl: 'https://app.example/docs', html: RICH_PAGE.replace('</main>', '') }).loginWall,
  'content markers are not the only guard: visible text alone decides too',
);
assert(
  !detectLoginWall({ status: 200, finalUrl: 'https://app.example/docs', html: '<html><body>' + 'text '.repeat(120) + '</body></html>' }).loginWall,
  'a form-less page is never a wall no matter how short',
);
assert(
  !detectLoginWall({
    status: 200,
    finalUrl: 'https://app.example/pricing',
    html: '<html><body><h1>Plans</h1><p>Free forever.</p><form action="/subscribe"><input name="email" type="email"></form></body></html>',
  }).loginWall,
  'a signup box with no password field is never a gate',
);

console.log('== a password field in a script must not be mistaken for a form ==');
assert(
  !detectLoginWall({
    status: 200,
    finalUrl: 'https://app.example/tool',
    html: '<html><body><main><p>' + 'readable '.repeat(80) + '</p></main><script>var t = \'<input type="password">\';</script></body></html>',
  }).loginWall,
  'a password input inside a script string is not a login form',
);

console.log('== the guard is load-bearing, not decorative ==');
// A/B pair differing ONLY in readable prose, on a path that is not a login
// endpoint, so the content markers and the length guard are the only things
// that can decide. If the guard never fired, both halves would be a wall and
// this pair would pass while the pane hid a perfectly readable page.
const BARE_WALL =
  '<html><body><form action="/subscribe" method="post">' +
  '<input type="password" name="password"><button>Continue</button></form></body></html>';
const SAME_PAGE_WITH_PROSE = BARE_WALL.replace(
  '</body></html>',
  '<p>' + 'Readable prose that makes this a page, not a gate. '.repeat(12) + '</p></body></html>',
);
assert(
  detectLoginWall({ status: 200, finalUrl: 'https://app.example/offer', html: BARE_WALL }).loginWall,
  'a bare password form on a non-login path IS a wall (nothing else to read)',
);
assert(
  !detectLoginWall({ status: 200, finalUrl: 'https://app.example/offer', html: SAME_PAGE_WITH_PROSE }).loginWall,
  'adding prose to that SAME page stops it being a wall (the length guard decides)',
);

console.log('== malformed input is never a crash ==');
assert(
  !detectLoginWall({ status: 200, finalUrl: 'not a url', html: null }).loginWall,
  'an unparseable final url does not throw and is not a wall',
);
assert(!detectLoginWall({ status: 200, finalUrl: 'https://a.example/x' }).loginWall, 'a missing body is not a wall');
assert(
  !detectLoginWall({ status: 200, finalUrl: 'https://a.example/x', html: null, redirects: 1 }).loginWall,
  'a redirect with an unparseable url is not a wall',
);

console.log('login-wall probe: ' + passed + ' passed');
