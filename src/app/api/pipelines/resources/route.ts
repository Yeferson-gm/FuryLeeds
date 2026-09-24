import { and, asc, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { serverError } from '../_shared';

export async function GET(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole('viewer');
  } catch (error) {
    return toErrorResponse(error);
  }

  try {
    const contactId = new URL(request.url).searchParams.get('contact_id');
    if (contactId) {
      const [conversation] = await ctx.db
        .select()
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.contactId, contactId),
            eq(schema.conversations.accountId, ctx.accountId)
          )
        )
        .orderBy(desc(schema.conversations.lastMessageAt))
        .limit(1);
      return NextResponse.json({
        conversation: conversation
          ? {
              id: conversation.id,
              user_id: conversation.userId,
              contact_id: conversation.contactId,
              status: conversation.status,
              assigned_agent_id: conversation.assignedAgentId ?? undefined,
              last_message_text: conversation.lastMessageText ?? undefined,
              last_message_at: conversation.lastMessageAt ?? undefined,
              unread_count: conversation.unreadCount ?? 0,
              created_at: conversation.createdAt ?? '',
              updated_at: conversation.updatedAt ?? '',
            }
          : null,
      });
    }

    const [contacts, profiles] = await Promise.all([
      ctx.db
        .select()
        .from(schema.contacts)
        .where(eq(schema.contacts.accountId, ctx.accountId))
        .orderBy(asc(schema.contacts.name)),
      ctx.db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.accountId, ctx.accountId))
        .orderBy(asc(schema.profiles.fullName)),
    ]);

    return NextResponse.json({
      contacts: contacts.map((contact) => ({
        id: contact.id,
        user_id: contact.userId,
        account_id: contact.accountId,
        phone: contact.phone,
        name: contact.name ?? undefined,
        email: contact.email ?? undefined,
        company: contact.company ?? undefined,
        avatar_url: contact.avatarUrl ?? undefined,
        created_at: contact.createdAt ?? '',
        updated_at: contact.updatedAt ?? '',
      })),
      profiles: profiles.map((profile) => ({
        id: profile.id,
        user_id: profile.userId,
        full_name: profile.fullName,
        email: profile.email,
        avatar_url: profile.avatarUrl ?? undefined,
        account_id: profile.accountId,
        account_role: profile.accountRole,
        created_at: profile.createdAt ?? '',
      })),
    });
  } catch (error) {
    return serverError('resources/GET', error);
  }
}
