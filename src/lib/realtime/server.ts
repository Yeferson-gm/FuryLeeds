import type { Server as HttpServer } from 'node:http';
import { and, eq, sql } from 'drizzle-orm';
import { Server } from 'socket.io';
import { applicationUrl } from '@/lib/app-url';
import { auth } from '@/lib/auth/auth';
import { db, schema } from '@/lib/db';
import {
  accountRoom,
  type ClientToServerEvents,
  conversationRoom,
  type DatabaseRealtimeEvent,
  REALTIME_CHANNEL,
  type ServerToClientEvents,
  type SocketData,
  userRoom,
} from '@/lib/realtime/events';

interface RealtimeGateway {
  close: () => Promise<void>;
  io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >;
}

function isRealtimeEvent(value: unknown): value is DatabaseRealtimeEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (
    event.v !== 1 ||
    !['INSERT', 'UPDATE', 'DELETE'].includes(String(event.eventType)) ||
    typeof event.accountId !== 'string' ||
    typeof event.entityId !== 'string'
  ) {
    return false;
  }

  switch (event.kind) {
    case 'conversation':
    case 'thread':
      return typeof event.conversationId === 'string';
    case 'notification':
    case 'presence':
      return typeof event.targetUserId === 'string';
    case 'broadcast':
      return typeof event.broadcastId === 'string';
    default:
      return false;
  }
}

function parseRealtimeEvent(payload: string): DatabaseRealtimeEvent | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    return isRealtimeEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function createRealtimeGateway(
  httpServer: HttpServer
): Promise<RealtimeGateway> {
  const configuredOrigin = applicationUrl();
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    path: '/socket.io',
    transports: ['websocket'],
    serveClient: false,
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      if (!origin) {
        callback(null, true);
        return;
      }
      try {
        const originUrl = new URL(origin);
        const sameHost = originUrl.host === request.headers.host;
        callback(null, sameHost || originUrl.origin === configuredOrigin);
      } catch {
        callback(null, false);
      }
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60_000,
      skipMiddlewares: false,
    },
  });

  io.use(async (socket, next) => {
    try {
      const cookie = socket.request.headers.cookie;
      if (!cookie) return next(new Error('Sesión requerida'));

      const session = await auth.api.getSession({
        headers: new Headers({ cookie }),
      });
      if (!session?.user.id) return next(new Error('Sesión inválida'));

      const [profile] = await db
        .select({ accountId: schema.profiles.accountId })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, session.user.id))
        .limit(1);
      if (!profile?.accountId) return next(new Error('Cuenta no encontrada'));

      socket.data = {
        userId: session.user.id,
        accountId: profile.accountId,
      };
      return next();
    } catch (error) {
      console.error('[realtime] handshake rejected:', error);
      return next(new Error('No se pudo autenticar la conexión'));
    }
  });

  async function updatePresence(
    accountId: string,
    userId: string,
    status: 'online' | 'away'
  ) {
    await db
      .insert(schema.memberPresence)
      .values({
        accountId,
        userId,
        status,
        lastSeenAt: sql`CURRENT_TIMESTAMP`,
      })
      .onConflictDoUpdate({
        target: schema.memberPresence.userId,
        set: {
          accountId,
          status,
          lastSeenAt: sql`CURRENT_TIMESTAMP`,
        },
      });
  }

  io.on('connection', async (socket) => {
    const { accountId, userId } = socket.data;
    await Promise.all([
      socket.join(accountRoom(accountId)),
      socket.join(userRoom(accountId, userId)),
    ]);
    void updatePresence(accountId, userId, 'online').catch((error: unknown) => {
      console.error('[realtime] initial presence update failed:', error);
    });

    socket.on('presence:set', ({ status }) => {
      if (status !== 'online' && status !== 'away') return;
      void updatePresence(accountId, userId, status).catch((error: unknown) => {
        console.error('[realtime] presence update failed:', error);
      });
    });

    socket.on('disconnect', () => {
      void io
        .in(userRoom(accountId, userId))
        .fetchSockets()
        .then((sockets) => {
          if (sockets.length === 0) {
            return updatePresence(accountId, userId, 'away');
          }
        })
        .catch((error: unknown) => {
          console.error('[realtime] disconnect presence update failed:', error);
        });
    });

    socket.on('thread:join', async ({ conversationId }, acknowledge) => {
      if (!conversationId) {
        acknowledge?.(false);
        return;
      }
      try {
        const [conversation] = await db
          .select({ id: schema.conversations.id })
          .from(schema.conversations)
          .where(
            and(
              eq(schema.conversations.id, conversationId),
              eq(schema.conversations.accountId, accountId)
            )
          )
          .limit(1);
        if (!conversation) {
          acknowledge?.(false);
          return;
        }
        await socket.join(conversationRoom(accountId, conversationId));
        acknowledge?.(true);
      } catch (error) {
        console.error('[realtime] thread join failed:', error);
        acknowledge?.(false);
      }
    });

    socket.on('thread:leave', ({ conversationId }) => {
      if (!conversationId) return;
      void socket.leave(conversationRoom(accountId, conversationId));
    });
  });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    await io.close();
    throw new Error('DATABASE_URL no está configurada');
  }

  const listener = new Bun.SQL({
    url: connectionString,
    max: 1,
    idleTimeout: 0,
    connectionTimeout: 5,
  });

  await listener.listen(REALTIME_CHANNEL, (payload) => {
    const event = parseRealtimeEvent(payload);
    if (!event) {
      console.warn('[realtime] ignored malformed PostgreSQL event');
      return;
    }

    const account = accountRoom(event.accountId);
    switch (event.kind) {
      case 'conversation':
        io.to(account).emit('conversation:changed', {
          id: event.entityId,
          conversationId: event.conversationId,
          eventType: event.eventType,
        });
        io.to(account).emit('summary:changed');
        break;
      case 'thread':
        io.to(conversationRoom(event.accountId, event.conversationId)).emit(
          'thread:changed',
          { conversationId: event.conversationId }
        );
        if (event.browserMessage) {
          io.to(account).emit('browser-message:created', event.browserMessage);
        }
        break;
      case 'notification': {
        const room = userRoom(event.accountId, event.targetUserId);
        io.to(room).emit('notification:changed', {
          id: event.entityId,
          notificationId: event.entityId,
          eventType: event.eventType,
        });
        io.to(room).emit('summary:changed');
        break;
      }
      case 'presence':
        io.to(account).emit('presence:changed', {
          eventType: event.eventType === 'DELETE' ? 'DELETE' : 'UPSERT',
          userId: event.targetUserId,
          status: event.status,
          lastSeenAt: event.lastSeenAt,
        });
        break;
      case 'broadcast':
        io.to(account).emit('broadcast:changed', {
          id: event.entityId,
          broadcastId: event.broadcastId,
          eventType: event.eventType,
        });
        break;
    }
  });

  return {
    io,
    close: async () => {
      await io.close();
      await listener.close();
    },
  };
}
