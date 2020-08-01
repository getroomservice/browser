import Sockets, { Events } from './socket';

interface Listener {
  event: Events;
  callback: (...args: any[]) => void;
}

// Tracks which listeners are added, and can remove them
export default class ListenerManager {
  private _listeners: Listener[] = [];

  on(
    socket: SocketIOClient.Socket,
    event: Events,
    callback: (...args: any[]) => void
  ) {
    this._listeners.push({ event, callback });
    Sockets.on(socket, event, callback);
  }

  removeAllListeners(socket: SocketIOClient.Socket) {
    this._listeners.forEach(listener => {
      Sockets.off(socket, listener.event, listener.callback);
    });
  }
}
