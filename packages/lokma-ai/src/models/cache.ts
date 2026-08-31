/**
 * Model cache helper — disk cache at ~/.lokma/cache/models.json (Phase 1).
 * Phase 0: in-memory only (see catalog.ts). This file reserves the disk shape.
 */

export const CACHE_PATH = '~/.lokma/cache/models.json';
export const CACHE_TTL_MS = 5 * 60 * 1000;
