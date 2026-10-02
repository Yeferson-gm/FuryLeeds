import { type SQL, sql } from 'drizzle-orm';

/**
 * Bind an application value as parsed JSONB instead of relying on the
 * Bun.SQL driver's JSON inference, which can store JSON text as a JSONB
 * string after Drizzle has already serialized the value.
 */
export function jsonbValue(value: unknown): SQL<unknown> | null {
  if (value === null || value === undefined) return null;
  return sql`${JSON.stringify(value)}::jsonb`;
}

/** Normalize legacy JSONB strings written before explicit JSONB binding. */
export function decodeJsonbValue<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
