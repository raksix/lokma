/**
 * providers.test.ts — probe for the pure Providers-tab helpers.
 * Run: `bun src/components/providers/providers.test.ts` (no DOM, no server).
 */
import { countModelsByProvider, isValidBaseUrl, isValidProviderId, validateProviderForm } from './validation';

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

// isValidProviderId (mirrors the server slug rule)
check('accepts simple slug', isValidProviderId('my-bridge'));
check('accepts digits and dashes', isValidProviderId('o1-mini-2'));
check('rejects uppercase', !isValidProviderId('My-Bridge'));
check('rejects spaces', !isValidProviderId('my bridge'));
check('rejects single char', !isValidProviderId('a'));
check('rejects leading dash', !isValidProviderId('-bridge'));
check('rejects empty', !isValidProviderId(''));
check('rejects non-string', !isValidProviderId(42));

// isValidBaseUrl (mirrors the server http(s) rule)
check('accepts https', isValidBaseUrl('https://api.openai.com/v1'));
check('accepts http localhost', isValidBaseUrl('http://localhost:11434/v1'));
check('rejects ftp', !isValidBaseUrl('ftp://files.example.com'));
check('rejects bare host', !isValidBaseUrl('api.example.com/v1'));
check('rejects empty', !isValidBaseUrl(''));
check('rejects non-string', !isValidBaseUrl(null));

// validateProviderForm
check(
  'valid create form has no errors',
  Object.keys(validateProviderForm({ id: 'my-bridge', name: 'My Bridge', baseUrl: 'https://x.example/v1' }, false)).length === 0,
);
const badCreate = validateProviderForm({ id: 'BAD', name: '', baseUrl: 'ftp://x' }, false);
check('bad create flags id', typeof badCreate.id === 'string');
check('bad create flags name', typeof badCreate.name === 'string');
check('bad create flags baseUrl', typeof badCreate.baseUrl === 'string');
const editSkipsId = validateProviderForm({ id: 'whatever !!', name: 'N', baseUrl: 'https://x.example' }, true);
check('edit mode skips id check', editSkipsId.id === undefined);
check('long name rejected', validateProviderForm({ id: 'ok-id', name: 'n'.repeat(81), baseUrl: 'https://x.example' }, false).name !== undefined);
check('trims whitespace before validating', validateProviderForm({ id: '  my-bridge  ', name: '  N  ', baseUrl: '  https://x.example  ' }, false).id === undefined);

// countModelsByProvider
const models = [
  { provider: 'anthropic' },
  { provider: 'anthropic' },
  { provider: 'openai' },
];
check('counts anthropic models', countModelsByProvider(models, 'anthropic') === 2);
check('counts openai models', countModelsByProvider(models, 'openai') === 1);
check('unknown provider is zero', countModelsByProvider(models, 'ollama') === 0);
check('empty catalog is zero', countModelsByProvider([], 'anthropic') === 0);

console.log(`providers.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
