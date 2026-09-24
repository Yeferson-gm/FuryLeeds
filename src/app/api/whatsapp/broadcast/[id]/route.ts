import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import type { Broadcast, BroadcastRecipient, RecipientStatus } from '@/types';

function toBroadcast(row: typeof schema.broadcasts.$inferSelect): Broadcast {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    template_name: row.templateName,
    template_language: row.templateLanguage,
    template_variables: row.templateVariables as
      | Record<string, unknown>
      | undefined,
    audience_filter: row.audienceFilter as Record<string, unknown> | undefined,
    scheduled_at: row.scheduledAt ?? undefined,
    status: row.status as Broadcast['status'],
    total_recipients: row.totalRecipients ?? 0,
    sent_count: row.sentCount ?? 0,
    delivered_count: row.deliveredCount ?? 0,
    read_count: row.readCount ?? 0,
    replied_count: row.repliedCount ?? 0,
    failed_count: row.failedCount ?? 0,
    delivery_locked_at: row.deliveryLockedAt,
    created_at: row.createdAt ?? '',
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('viewer');
    const { id } = await params;
    const [broadcast] = await ctx.db
      .select()
      .from(schema.broadcasts)
      .where(
        and(
          eq(schema.broadcasts.id, id),
          eq(schema.broadcasts.accountId, ctx.accountId)
        )
      )
      .limit(1);
    if (!broadcast) {
      return NextResponse.json(
        { error: 'Difusión no encontrada' },
        { status: 404 }
      );
    }

    const rows = await ctx.db
      .select({
        recipient: schema.broadcastRecipients,
        contact: schema.contacts,
      })
      .from(schema.broadcastRecipients)
      .leftJoin(
        schema.contacts,
        and(
          eq(schema.contacts.id, schema.broadcastRecipients.contactId),
          eq(schema.contacts.accountId, ctx.accountId)
        )
      )
      .where(eq(schema.broadcastRecipients.broadcastId, id))
      .orderBy(desc(schema.broadcastRecipients.createdAt));

    const recipients: BroadcastRecipient[] = rows.map(
      ({ recipient, contact }) => ({
        id: recipient.id,
        broadcast_id: recipient.broadcastId,
        contact_id: recipient.contactId,
        status: recipient.status as RecipientStatus,
        sent_at: recipient.sentAt ?? undefined,
        delivered_at: recipient.deliveredAt ?? undefined,
        read_at: recipient.readAt ?? undefined,
        replied_at: recipient.repliedAt ?? undefined,
        error_message: recipient.errorMessage ?? undefined,
        whatsapp_message_id: recipient.whatsappMessageId ?? undefined,
        template_params: Array.isArray(recipient.templateParams)
          ? (recipient.templateParams as string[])
          : undefined,
        created_at: recipient.createdAt ?? '',
        contact: contact
          ? {
              id: contact.id,
              user_id: contact.userId,
              account_id: contact.accountId,
              phone: contact.phone,
              name: contact.name ?? undefined,
              email: contact.email ?? undefined,
              company: contact.company ?? undefined,
              created_at: contact.createdAt ?? '',
              updated_at: contact.updatedAt ?? '',
            }
          : undefined,
      })
    );

    return NextResponse.json({ broadcast: toBroadcast(broadcast), recipients });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await params;
    const [existing] = await ctx.db
      .select({ status: schema.broadcasts.status })
      .from(schema.broadcasts)
      .where(
        and(
          eq(schema.broadcasts.id, id),
          eq(schema.broadcasts.accountId, ctx.accountId)
        )
      )
      .limit(1);
    if (!existing) {
      return NextResponse.json(
        { error: 'Difusión no encontrada' },
        { status: 404 }
      );
    }
    if (existing.status === 'sending') {
      return NextResponse.json(
        { error: 'No se puede eliminar una difusión en curso' },
        { status: 409 }
      );
    }

    const removed = await ctx.db
      .delete(schema.broadcasts)
      .where(
        and(
          eq(schema.broadcasts.id, id),
          eq(schema.broadcasts.accountId, ctx.accountId)
        )
      )
      .returning({ id: schema.broadcasts.id });
    if (removed.length === 0) {
      return NextResponse.json(
        { error: 'Difusión no encontrada' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
