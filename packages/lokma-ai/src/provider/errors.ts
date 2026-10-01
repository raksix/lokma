/**
 * Provider errors — stable `code` strings the server maps to WS frames.
 * Messages are human-readable on purpose: they surface in the chat
 * `error` frame (e.g. telling the user where to add a key).
 * See Docs/22-WEB-FEATURES §providers.
 */

export type ProviderErrorCode =
  | 'missing_api_key'
  | 'unknown_provider'
  | 'provider_not_wired'
  | 'http_error'
  | 'network_error'
  | 'bad_response'
  // REQ-118 FAZ B.2: honest Responses-path failures (never a harness bug).
  | 'region_blocked'
  | 'rate_limited'
  | 'insufficient_credits';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status: number | null;
  /**
   * The upstream JSON body's `code` field when one was present (e.g.
   * `unsupported_model`) — carried structurally so callers never parse the
   * message. Null when the body had none (or none was read).
   */
  readonly upstreamCode: string | null;

  constructor(
    code: ProviderErrorCode,
    message: string,
    status: number | null = null,
    upstreamCode: string | null = null,
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
    this.upstreamCode = upstreamCode;
  }
}

/**
 * REQ-183: upstream codes that say "this endpoint does not serve this
 * model" — a MODEL-availability refusal, never a tool-shape or credential
 * problem. Kept as one list so the classifier and its tests agree.
 */
export const MODEL_UNAVAILABLE_UPSTREAM_CODES = ['unsupported_model', 'model_not_found'];

/**
 * True when a provider error names the model itself as unavailable upstream.
 * The refusal is permanent — retrying cannot fix it — so the loop fails fast
 * and remembers the id; the catalog then badges the entry (REQ-183).
 */
export function isModelUnavailableError(err: unknown): boolean {
  if (!(err instanceof ProviderError) || err.upstreamCode === null) return false;
  return MODEL_UNAVAILABLE_UPSTREAM_CODES.indexOf(err.upstreamCode) >= 0;
}
