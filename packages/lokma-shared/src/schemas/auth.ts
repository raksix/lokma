import { z } from 'zod';

/**
 * Auth + RBAC + project schemas (Docs/36-AUTH-and-PERMISSIONS).
 * Single source of truth: `lokma-core/src/auth/*` validates against
 * these, the Fastify routes return these shapes, the web AuthPane
 * consumes them via `lib/api.ts`. Never hand-duplicate these types.
 * No secrets ever cross the wire — only `hasPassword`-style booleans.
 */

/** Global role — admin > member > viewer (Docs/36 §2). */
export const RoleSchema = z.enum(['admin', 'member', 'viewer']);

export type Role = z.infer<typeof RoleSchema>;

/** Account lifecycle (Docs/36 §6.1): invited until the invite is accepted. */
export const UserStatusSchema = z.enum(['active', 'invited', 'disabled']);

export type UserStatus = z.infer<typeof UserStatusSchema>;

/**
 * Public user record — safe to send to any authenticated client.
 * `passwordHash` and invite tokens NEVER leave the server.
 */
export const UserSchema = z.object({
  id: z.string().min(1).max(64),
  email: z.string().email().max(160),
  name: z.string().min(1).max(40),
  role: RoleSchema,
  status: UserStatusSchema,
  /** Global permission overrides, e.g. ["project:create"] (Docs/36 §3.1). */
  permissions: z.array(z.string().min(1).max(80)).default([]),
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime().nullable(),
});

export type User = z.infer<typeof UserSchema>;

/** Project visibility — private is the safe default (Docs/36 §4.1). */
export const ProjectVisibilitySchema = z.enum(['private', 'public']);

export type ProjectVisibility = z.infer<typeof ProjectVisibilitySchema>;

export const ProjectSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  /** Server-side FS root for sessions/files scoping ("" = server default). */
  cwd: z.string().max(500).default(''),
  visibility: ProjectVisibilitySchema.default('private'),
  ownerId: z.string().min(1).max(64),
  createdAt: z.string().datetime(),
});

export type Project = z.infer<typeof ProjectSchema>;

/** Per-project membership — overrides the global role (Docs/36 §3.2). */
export const ProjectMemberSchema = z.object({
  projectId: z.string().min(1).max(64),
  userId: z.string().min(1).max(64),
  role: z.enum(['member', 'viewer']).default('member'),
  /** Per-project permission overrides for this user. */
  permissions: z.array(z.string().min(1).max(80)).default([]),
  addedAt: z.string().datetime(),
  addedBy: z.string().min(1).max(64),
});

export type ProjectMember = z.infer<typeof ProjectMemberSchema>;

/** Instance-wide auth policy (Docs/36 §4.2 + §6.3). */
export const AuthSettingsSchema = z.object({
  projectCreation: z.enum(['admin-only', 'members', 'open']).default('members'),
  projectVisibilityDefault: ProjectVisibilitySchema.default('private'),
  inviteExpiryDays: z.number().int().min(1).max(90).default(7),
  sessionRetentionDays: z.number().int().positive().max(3650).nullable().default(null),
});

export type AuthSettings = z.infer<typeof AuthSettingsSchema>;

/** Login/Register request bodies (Docs/36 §8). */
export const LoginBodySchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(200),
});

export type LoginBody = z.infer<typeof LoginBodySchema>;

export const RegisterBodySchema = z.object({
  email: z.string().email().max(160),
  name: z.string().min(1).max(40),
  password: z.string().min(8).max(200),
});

export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const AcceptInviteBodySchema = z.object({
  token: z.string().min(16).max(128),
  name: z.string().min(1).max(40),
  password: z.string().min(8).max(200),
});

export type AcceptInviteBody = z.infer<typeof AcceptInviteBodySchema>;
