interface DatabaseErrorFields {
  code?: unknown;
  constraint?: unknown;
  errno?: unknown;
}

function errorFields(error: unknown): DatabaseErrorFields {
  if (typeof error !== 'object' || error === null) return {};
  const outer = error as DatabaseErrorFields & { cause?: unknown };
  if (typeof outer.cause === 'object' && outer.cause !== null) {
    return outer.cause as DatabaseErrorFields;
  }
  return outer;
}

/**
 * Return only non-sensitive database diagnostics. Drizzle query errors can
 * include the full SQL parameter list, which may contain message text,
 * contact PII, document URLs, or provider identifiers.
 */
export function safeDatabaseError(error: unknown): {
  kind: 'database_error';
  code: string | null;
  constraint: string | null;
} {
  const fields = errorFields(error);
  const code =
    typeof fields.code === 'string'
      ? fields.code
      : typeof fields.errno === 'string'
        ? fields.errno
        : null;
  return {
    kind: 'database_error',
    code,
    constraint:
      typeof fields.constraint === 'string' ? fields.constraint : null,
  };
}
