/**
 * Provider form validation — mirrors the server rules in
 * `packages/lokma-web/server/src/routes/providers.ts` for instant UX feedback.
 * The server always re-validates; this only avoids a round-trip for typos.
 */

export type ProviderFormValues = {
  id: string;
  name: string;
  baseUrl: string;
};

export type ProviderFormErrors = Partial<Record<'id' | 'name' | 'baseUrl', string>>;

const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

/** Slug check (kept in sync with the server `isValidProviderId`). */
export function isValidProviderId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

/** http(s) URL check (kept in sync with the server `isValidBaseUrl`). */
export function isValidBaseUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || url.length > 500) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate the add/edit form. In edit mode the id is locked (server-side
 * identity), so it is not validated. Returns an empty object when valid.
 */
export function validateProviderForm(values: ProviderFormValues, isEdit: boolean): ProviderFormErrors {
  const errors: ProviderFormErrors = {};
  if (!isEdit && !isValidProviderId(values.id.trim())) {
    errors.id = 'Lowercase slug, 2-41 chars (letters, digits, dashes)';
  }
  const name = values.name.trim();
  if (name.length === 0 || name.length > 80) {
    errors.name = 'Name is required (1-80 chars)';
  }
  if (!isValidBaseUrl(values.baseUrl.trim())) {
    errors.baseUrl = 'Must be an http(s) URL';
  }
  return errors;
}

/** Pure helper: how many catalog models belong to one provider. */
export function countModelsByProvider(models: { provider: string }[], providerId: string): number {
  return models.filter((m) => m.provider === providerId).length;
}
