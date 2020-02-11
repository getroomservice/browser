import Sockets from "./socket";
import { ROOM_SERICE_SOCKET_URL } from "./constants";
import invariant from "invariant";

const PRESENCE_NAMESPACE = "/v1/presence";

interface PresencePacket<T> {
  meta: {
    roomId: string;
    guestId?: string;

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
  return typeof val === "object" && val !== null;
}

export default class PresenceClient {
  // We define this as a local variable to make testing easier
  _socketURL: string;
  _authorizationUrl: string;
  _roomReference: string;
  _roomId: string;
  private _socket?: SocketIOClient.Socket;

  constructor(parameters: { authUrl: string; roomReference: string }) {
    this._socketURL = ROOM_SERICE_SOCKET_URL;
    this._authorizationUrl = parameters.authUrl;
    this._roomReference = parameters.roomReference;
  }

  init({ room, session }) {
    this._roomId = room.id;
    this._socket = Sockets.newSocket(this._socketURL + PRESENCE_NAMESPACE, {
      transportOptions: {
        polling: {
          extraHeaders: {
            authorization: "Bearer " + session.token
          }
        }
      }
    });
  }

  setPresence<P>(key: string, value: P, options?: PresenceOptions) {
    // Offline do nothing
    if (!this._socket) {
      return;
    }
    invariant(
      this._roomId,
      "setPresence is missing a roomId, this is likely a bug with the client. If you're seeing this, please contact us."
    );

    const ttl = options?.ttl || 30;

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
        ttl
      },
      payload: value
    };

    Sockets.emit(this._socket, "update_presence", packet);
  }

  onSetPresence<P>(callback: (key: string, value: P) => void) {
    // Offline do nothing
    if (!this._socket) {
      return;
    }

    Sockets.on(this._socket, "update_presence", (data: string) => {
      const { meta, payload } = JSON.parse(data) as PresencePacket<any>;
      if (!this._roomId) {
        throw new Error(
          "Expected a _roomId to be defined before we invoked the the onSetPresence callback. This is a sign of a broken client, please contact us if you're seeing this."
        );
      }

      callback(meta.namespace, payload);
    });
  }
}
