/**
 * This is just a wrapper around Socket.io that's easier
 * to test.
 */
import IO from 'socket.io-client';
import invariant from 'invariant';

type Events =
  | 'connect'
  | 'disconnect'
  | 'error'
  | 'sync_room_state'
  | 'update_presence'
  | 'authenticated'
  | 'reconnect_attempt';

// Namespaced so we can mock stuff
const Sockets = {
  newSocket(url: string, opts?: SocketIOClient.ConnectOpts) {
    return IO(url, opts);
  },

  on(
    socket: SocketIOClient.Socket,
    event: Events,
    fn: (...args: any[]) => void
  ) {
    invariant(!!socket && !!event, 'Requires socket defined');
    socket.on(event, fn);
  },

  off(socket: SocketIOClient.Socket, event: Events) {
    socket.off(event);
  },

  emit(
    socket: SocketIOClient.Socket,
    event: 'sync_room_state' | 'update_presence' | 'authenticate',
    ...args: any[]
  ) {
    invariant(!!socket && !!event, 'Requires socket defined');
    socket.emit(event, ...args);
  },

  disconnect(socket: SocketIOClient.Socket) {
    socket.disconnect();
  },
};

export default Sockets;
