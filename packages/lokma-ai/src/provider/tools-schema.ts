/**
 * Minimal structural Zod (v3) → JSON Schema converter for tool schemas.
 * REQ-118 FAZ A: the agent loop feeds registry tool schemas to spark over
 * the Responses API as native `tools[]`. No zod import — the walk is purely
 * structural over `_def`, so it survives minor zod upgrades. Unknown nodes
 * degrade to `{}` (fail-open: the tool still ships with name+description).
 * `strict` is never sent — the gateway is intolerant of it.
 */

function isOptionalNode(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const def = (node as { _def?: { typeName?: unknown } })._def;
  const t = def?.typeName;
  return t === 'ZodOptional' || t === 'ZodDefault';
}

function convertNode(node: unknown): unknown {
  if (!node || typeof node !== 'object') return {};
  const def = (node as { _def?: Record<string, unknown> })._def;
  if (!def || typeof def !== 'object') return {};
  const typeName = def.typeName as string | undefined;
  switch (typeName) {
    case 'ZodObject': {
      const raw = def.shape as unknown;
      const shape =
        typeof raw === 'function'
          ? (raw as () => Record<string, unknown>)()
          : (raw as Record<string, unknown> | undefined);
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, sub] of Object.entries(shape ?? {})) {
        properties[key] = convertNode(sub);
        if (!isOptionalNode(sub)) required.push(key);
      }
      const out: Record<string, unknown> = { type: 'object', properties };
      if (required.length > 0) out.required = required;
      return out;
    }
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber': {
      const checks = def.checks as { kind?: string }[] | undefined;
      if (Array.isArray(checks) && checks.some((c) => c?.kind === 'int')) return { type: 'integer' };
      return { type: 'number' };
    }
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray': {
      const items = convertNode(def.type);
      return { type: 'array', items };
    }
    case 'ZodOptional':
    case 'ZodDefault':
      return convertNode(def.innerType);
    case 'ZodEffects':
      // .regex()/.refine() wrap the base schema — unwrap one level.
      return convertNode(def.schema);
    case 'ZodEnum':
      return { type: 'string', enum: def.values };
    case 'ZodNativeEnum': {
      const values = def.values as Record<string, unknown> | undefined;
      return { enum: values ? Object.values(values) : [] };
    }
    case 'ZodLiteral':
      return { enum: [def.value] };
    case 'ZodUnion': {
      const options = def.options as unknown[] | undefined;
      if (Array.isArray(options)) return { anyOf: options.map(convertNode) };
      return {};
    }
    default:
      return {};
  }
}

/**
 * Convert a zod input schema to a JSON Schema object for Responses `tools[]`.
 * Always returns an object schema (top-level guarantee for the wire).
 */
export function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  const converted = convertNode(schema);
  if (converted && typeof converted === 'object' && !Array.isArray(converted)) {
    return converted as Record<string, unknown>;
  }
  return { type: 'object', properties: {} };
}
