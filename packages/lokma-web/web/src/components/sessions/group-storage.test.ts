/**
 * REQ-141 — group folding must survive a reload, and a missing record must not
 * be confused with "the user folded everything".
 */
import {
  GROUP_MODE_KEY,
  GROUP_STORAGE_KEY,
  parseGroupKeys,
  readExpandedGroups,
  readGroupBy,
  serializeGroupKeys,
  writeExpandedGroups,
  writeGroupBy,
} from './group-storage';

const assert = (cond: boolean, label: string) => {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
};

/** Minimal in-memory Storage stand-in (node has no localStorage). */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  } as unknown as Storage & { map: Map<string, string> };
}

// 1. A missing record is "no opinion" — not "everything folded".
assert(parseGroupKeys(null) === null, 'no stored record parses to null');

// 2. An empty list is a real choice and survives the round trip.
assert(JSON.stringify(parseGroupKeys('[]')) === '[]', 'an empty layout is kept as empty');

// 3. Round trip.
assert(
  JSON.stringify(parseGroupKeys(serializeGroupKeys(['home', 'entity:p1']))) ===
    JSON.stringify(['entity:p1', 'home']),
  'keys round trip (sorted, so equal layouts serialise equally)',
);

// 4. Corrupt / hand-edited / other-tab garbage never breaks boot.
assert(parseGroupKeys('{oops') === null, 'corrupt JSON falls back to the default');
assert(parseGroupKeys('{"home":true}') === null, 'a non-array record is ignored');
assert(
  JSON.stringify(parseGroupKeys('["home",7,null,"", "entity:p2"]')) === '["home","entity:p2"]',
  'non-string and empty entries are dropped',
);

// 5. Read: stored layout wins; otherwise the caller's fallback.
const store = fakeStorage({ [GROUP_STORAGE_KEY]: '["entity:p1"]' });
assert(
  JSON.stringify([...readExpandedGroups(store, ['home'])]) === '["entity:p1"]',
  'a stored layout is restored',
);
assert(
  JSON.stringify([...readExpandedGroups(fakeStorage(), ['home'])]) === '["home"]',
  'an empty storage falls back to the default (Home open)',
);
assert(
  readExpandedGroups(fakeStorage({ [GROUP_STORAGE_KEY]: '[]' }), ['home']).size === 0,
  'folding everything stays folded after a reload',
);

// 6. Write then read is the F5 path.
const persist = fakeStorage();
writeExpandedGroups(['home', 'entity:p1'], persist);
assert(
  JSON.stringify([...readExpandedGroups(persist, [])]) === '["entity:p1","home"]',
  'write then read returns the same layout (F5 keeps the fold)',
);
writeExpandedGroups([], persist);
assert(readExpandedGroups(persist, ['home']).size === 0, 'folding Home writes an empty layout');

// 7. Storage that throws (private mode) degrades to "no persistence", never a crash.
const hostile = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('quota');
  },
} as unknown as Storage;
assert(readExpandedGroups(hostile, ['home']).size === 1, 'a throwing read falls back');
writeExpandedGroups(['home'], hostile);
assert(true, 'a throwing write is swallowed');

// 8. REQ-142 — the grouping mode persists too (default: the normal day list).
assert(readGroupBy(fakeStorage()) === 'time', 'no stored mode means the day list');
assert(readGroupBy(fakeStorage({ [GROUP_MODE_KEY]: 'nonsense' })) === 'time', 'an unknown mode falls back to the day list');
const modeStore = fakeStorage();
writeGroupBy('project', modeStore);
assert(readGroupBy(modeStore) === 'project', 'switching to the project view is remembered');
writeGroupBy('time', modeStore);
assert(readGroupBy(modeStore) === 'time', 'switching back is remembered too');
assert(readGroupBy(hostile) === 'time', 'a throwing mode read falls back');
writeGroupBy('project', hostile);
assert(true, 'a throwing mode write is swallowed');

console.log('group-storage.test.ts: all REQ-141/142 checks passed');
