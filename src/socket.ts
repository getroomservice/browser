/**
 * This is just a wrapper around Socket.io that's easier
 * to test.
 */
import IO from 'socket.io-client';

// Namespaced so we can mock stuff
const Sockets = {
  newSocket(url: string, opts?: SocketIOClient.ConnectOpts) {
    return IO(url, opts);
  },

  on(
    socket: SocketIOClient.Socket,
    event:
      | 'connect'
      | 'disconnect'
      | 'error'
      | 'sync_room_state'
      | 'update_presence',
    fn: (...args: any[]) => void
  ) {
    socket.on(event, fn);
  },

  emit(
    socket: SocketIOClient.Socket,
    event: 'sync_room_state' | 'update_presence' | 'authorization',
    ...args: any[]
  ) {
    socket.emit(event, ...args);
  },

  disconnect(socket: SocketIOClient.Socket) {
    socket.disconnect();
  },
};

export default Sockets;
