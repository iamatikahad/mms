import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Shared authenticated socket connection (cookie-based, same origin). */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}
