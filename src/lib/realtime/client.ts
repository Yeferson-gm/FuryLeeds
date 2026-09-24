'use client';

import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/lib/realtime/events';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: RealtimeSocket | null = null;

export function getRealtimeSocket(): RealtimeSocket {
  if (typeof window === 'undefined') {
    throw new Error('Socket.IO solo está disponible en el navegador');
  }
  if (!socket) {
    socket = io({
      path: '/socket.io',
      autoConnect: false,
      transports: ['websocket'],
      upgrade: false,
      withCredentials: true,
      reconnection: true,
    });
  }
  if (!socket.connected && !socket.active) socket.connect();
  return socket;
}
