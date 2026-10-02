-- Normalize template JSON that Bun.SQL previously persisted as JSONB strings.
-- New writes use explicit ::jsonb binding in application code.
UPDATE "message_templates"
SET "buttons" = ("buttons" #>> '{}')::jsonb
WHERE "buttons" IS NOT NULL
  AND jsonb_typeof("buttons") = 'string';

UPDATE "message_templates"
SET "sample_values" = ("sample_values" #>> '{}')::jsonb
WHERE "sample_values" IS NOT NULL
  AND jsonb_typeof("sample_values") = 'string';
