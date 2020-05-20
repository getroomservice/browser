import Sockets from './socket';
import invariant from 'invariant';

export async function authorizeSocket(
  socket: SocketIOClient.Socket,
  token: string
): Promise<boolean> {
  return new Promise(resolve => {
    invariant(socket, 'Requires socket to be defined');

    const timeout = setTimeout(() => {
      resolve(false);
    }, 15000);

    Sockets.emit(socket, 'authenticate', {
      payload: token,
    });

    Sockets.on(socket, 'authenticated', () => {
      clearTimeout(timeout);
      Sockets.off(socket, 'authenticated');
      resolve(true);
    });
  });
}
