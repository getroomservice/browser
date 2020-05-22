import Sockets from './socket';
import { ROOM_SERICE_CLIENT_URL } from './constants';
import invariant from 'invariant';
import { Room, Session } from './types';
import { throttle } from 'lodash';
import { authorizeSocket } from './socketauth';

const PRESENCE_NAMESPACE = '/v1/presence';

export interface PresenceMeta {
  roomId: string;
  guest?: {
    reference: string;
  };
  connectionId?: string;

  // The "key". ex: "cursors", "keyboard", "location"
  namespace: string;

  // Time to live, measured in seconds. 0 means don't store
  ttl: number;

  // new Date().getTime(); measured in seconds.
  createdAt: number;
}

interface PresencePacket<T> {
  meta: {
    roomId: string;
    guestId?: string;
    connectionId?: string;

    // The "key". ex: "cursors", "keyboard", "location"
    namespace: string;

    // Time to live, measured in seconds. 0 means don't store
    ttl: number;

    // new Date().getTime(); measured in seconds.
    createdAt: number;
  };
  payload: T;
}

interface PresenceOptions {
  // Time to live in seconds. -1 means forever. Default is 30.
  ttl?: number;
}

function isParsable(val: any) {
  return typeof val === 'object' && val !== null;
}

const rateLimittedEmit = throttle(
  (
    socket: SocketIOClient.Socket,
    event: 'sync_room_state' | 'update_presence',
    ...args: any[]
  ) => Sockets.emit(socket, event, ...args),
  40,
  { leading: true }
);

export default class PresenceClient {
  // We define this as a local variable to make testing easier
  _socketURL: string;
  _authorizationUrl: string;
  _roomReference: string;
  _roomId?: string;
  private _socket?: SocketIOClient.Socket;
  private _authorized?: Promise<boolean>;

  constructor(parameters: { authUrl: string; roomReference: string }) {
    this._socketURL = ROOM_SERICE_CLIENT_URL;
    this._authorizationUrl = parameters.authUrl;
    this._roomReference = parameters.roomReference;
  }

  init({ room, session }: { room?: Room; session?: Session }) {
    if (!room || !session) {
      console.warn('Room Service is offline.');
      return;
    }

    this._roomId = room.id;
    this._socket = Sockets.newSocket(this._socketURL + PRESENCE_NAMESPACE, {
      transports: ['websocket'],
    });

    Sockets.on(this._socket, 'reconnect_attempt', () => {
      invariant(this._socket);
      this._socket.io.opts.transports = ['websocket'];
    });

    // Immediately attempt to authorize via traditional auth
    this._authorized = authorizeSocket(this._socket, session.token, room.id);
  }

  async setPresence<P>(key: string, value: P, options?: PresenceOptions) {
    // Offline do nothing
    if (!this._socket) {
      return;
    }
    invariant(
      this._roomId,
      "setPresence is missing a roomId, this is likely a bug with the client. If you're seeing this, please contact us."
    );

    // Ensure we're authorized before doing anything
    if (this._authorized) {
      await this._authorized;
    }

    const ttl = options?.ttl || 1000 * 2;

    if (!value) {
      console.error(
        `The function call 'setPresence("${key}", value)' passed in an undefined, null, or falsey 'value'.`
      );
      return;
    }

    if (!isParsable(value)) {
      console.error(
        `Expected the function call 'setPresence("${key}", value)' to use a stringifiable object for variable 'value', instead got '${value}'.`
      );
      return;
    }

    const packet: PresencePacket<P> = {
      meta: {
        roomId: this._roomId,
        createdAt: new Date().getTime(),
        namespace: key,
        ttl,
      },
      payload: value,
    };

    rateLimittedEmit(this._socket, 'update_presence', packet);
  }

  onSetPresence<P>(callback: (meta: PresenceMeta, value: P) => void) {
    // Offline do nothing
    if (!this._socket) {
      console.warn('offline');
      return;
    }

    Sockets.on(this._socket, 'update_presence', async (data: string) => {
      const { meta, payload } = JSON.parse(data) as PresencePacket<any>;
      if (!this._roomId) {
        throw new Error(
          "Expected a _roomId to be defined before we invoked the the onSetPresence callback. This is a sign of a broken client, please contact us if you're seeing this."
        );
      }
      if (!meta.connectionId) {
        console.error(
          "Unexpectedly got a packet without a connection id. We're skipping this for now, but this could be a sign of a service outage or a broken client."
        );
      }

      // Don't include self
      if (meta.connectionId === this._socket!.id) {
        return;
      }

      // This socket event will fire for ALL rooms that we belong
      // to,
      if (meta.roomId !== this._roomId) {
        return;
      }

      callback(meta, payload);
    });
  }
}
