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
  | 'bad_response';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status: number | null;

  constructor(code: ProviderErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
  }
}
