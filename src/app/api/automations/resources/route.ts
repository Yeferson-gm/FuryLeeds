import { and, asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { db, schema } from '@/lib/db';
import { toMessageTemplate } from '@/lib/whatsapp/db';

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const [tags, templateRows, customFields, pipelines, stages] =
      await Promise.all([
        db
          .select({
            id: schema.tags.id,
            user_id: schema.tags.userId,
            name: schema.tags.name,
            color: schema.tags.color,
            created_at: schema.tags.createdAt,
          })
          .from(schema.tags)
          .where(eq(schema.tags.accountId, ctx.accountId))
          .orderBy(asc(schema.tags.name)),
        db
          .select()
          .from(schema.messageTemplates)
          .where(
            and(
              eq(schema.messageTemplates.accountId, ctx.accountId),
              eq(schema.messageTemplates.status, 'APPROVED')
            )
          )
          .orderBy(asc(schema.messageTemplates.name)),
        db
          .select({
            id: schema.customFields.id,
            user_id: schema.customFields.userId,
            account_id: schema.customFields.accountId,
            field_name: schema.customFields.fieldName,
            field_type: schema.customFields.fieldType,
            field_options: schema.customFields.fieldOptions,
            created_at: schema.customFields.createdAt,
          })
          .from(schema.customFields)
          .where(eq(schema.customFields.accountId, ctx.accountId))
          .orderBy(asc(schema.customFields.fieldName)),
        db
          .select({ id: schema.pipelines.id, name: schema.pipelines.name })
          .from(schema.pipelines)
          .where(eq(schema.pipelines.accountId, ctx.accountId))
          .orderBy(asc(schema.pipelines.name)),
        db
          .select({
            id: schema.pipelineStages.id,
            name: schema.pipelineStages.name,
            pipeline_id: schema.pipelineStages.pipelineId,
            position: schema.pipelineStages.position,
          })
          .from(schema.pipelineStages)
          .innerJoin(
            schema.pipelines,
            and(
              eq(schema.pipelines.id, schema.pipelineStages.pipelineId),
              eq(schema.pipelines.accountId, ctx.accountId)
            )
          )
          .orderBy(asc(schema.pipelineStages.position)),
      ]);

    return NextResponse.json({
      tags: tags.map((tag) => ({ ...tag, created_at: tag.created_at ?? '' })),
      templates: templateRows.map(toMessageTemplate),
      customFields: customFields.map((field) => ({
        ...field,
        field_options: field.field_options ?? undefined,
        created_at: field.created_at ?? '',
      })),
      pipelines,
      stages,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
