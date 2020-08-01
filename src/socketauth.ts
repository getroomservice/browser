import Sockets from './socket';
import invariant from 'invariant';
import ListenerManager from './ListenerManager';

export async function authorizeSocket(
  socket: SocketIOClient.Socket,
  token: string,
  roomId: string
): Promise<boolean | undefined> {
  return new Promise(resolve => {
    invariant(socket, 'Requires socket to be defined');

    const listenerManager = new ListenerManager();

    const timeout = setTimeout(() => {
      resolve(false);
      listenerManager.removeAllListeners(socket);
    }, 15000);

    Sockets.emit(socket, 'authenticate', {
      meta: {
        roomId,
      },
      payload: token,
    });

    listenerManager.on(socket, 'authenticated', () => {
      clearTimeout(timeout);
      resolve(true);
      listenerManager.removeAllListeners(socket);
    });

    listenerManager.on(socket, 'disconnect', () => {
      resolve();
      clearTimeout(timeout);
      listenerManager.removeAllListeners(socket);
    });
  });
}
