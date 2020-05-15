import Sockets from './socket';
import invariant from 'invariant';

export async function authorizeSocket(
  socket: SocketIOClient.Socket,
  token: string
): Promise<boolean> {
  return new Promise(resolve => {
    invariant(socket, 'Requires socket to be defined');
    Sockets.emit(socket, 'authenticate', {
      payload: token,
    });

    Sockets.on(socket, 'authenticated', () => {
      resolve(true);
    });

    setTimeout(() => {
      resolve(false);
    }, 10000);
  });
}
