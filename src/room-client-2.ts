import Automerge, { Doc, load, merge, save } from "automerge";
import invariant from "invariant";
import { debounce } from "lodash";
import { Peer } from "manymerge";
import { Message } from "manymerge/dist/types";
import safeJsonStringify from "safe-json-stringify";
import Offline from "./offline";
import { KeyValueObject } from "./types";
import Sockets from "./socket";
import authorize from "./authorize";
import { ROOM_SERICE_SOCKET_URL } from "./constants";

interface RoomPacket {
  meta: {
    roomId: string;
  };
  payload: {
    msg: Message;
  };
}

function asRoomStr(room: RoomPacket) {
  return safeJsonStringify(room);
}

const saveOffline = debounce(
  (roomReference: string, docId: string, doc: Doc<any>) => {
    Offline.setDoc(roomReference, docId, save(doc));
  },
  120
);

function changeDoc<T>(
  oldDoc: T,
  actorId: string,
  callback: (state: T) => void
): T {
  if (typeof callback !== "function") {
    throw new Error(`room.publishDoc expects a function.`);
  }

  let newDoc = Automerge.change(oldDoc, callback);
  if (!newDoc) {
    invariant(
      !!actorId,
      "The client is trying to regenerate a deleted document, but isn't able to access the cached actor id. This is probably a bug in the client, if you see this, we're incredibly sorry! Please let us know. In the meantime, you may be able work around this by ensuring 'await room.restore()' has finished before calling 'publishState'."
    );

    // this happens if someone deletes the doc, so we should just reinit it.
    newDoc = Automerge.from({} as T, { actorId }) as T;
  }

  return newDoc;
}

function sendMsgToSocket(
  socket: SocketIOClient.Socket,
  roomId: string,
  automergeMsg: Message
) {
  // We're offline, don't do anything
  if (!socket) return;

  // Require roomId
  invariant(
    roomId,
    "Expected a room id when publishing, this is a sign of a broken client, if you're seeing this, please contact us."
  );

  const automergePacket: RoomPacket = {
    meta: {
      roomId
    },
    payload: {
      msg: automergeMsg
    }
  };

  Sockets.emit(socket, "sync_room_state", asRoomStr(automergePacket));
}

interface Session {
  token: string;
}
interface Room {
  reference: string;
}

class DocumentManagerClient<T extends KeyValueObject> {
  private readonly _peer: Peer;
  private readonly _authUrl: string;
  private readonly _roomReference: string;
  private _socket: SocketIOClient.Socket;
  private _socketURL: string = ROOM_SERICE_SOCKET_URL;

  constructor(parameters: { authUrl: string; reference: string; state?: T }) {
    this._authUrl = parameters.authUrl;
    this._roomReference = parameters.reference;
  }

  async init() {
    // Try to go online
    let room: Room;
    let session: Session;
    try {
      const params = await authorize(this._authorizationUrl, this._reference);
      room = params.room;
      session = params.session;
    } catch (err) {
      console.warn(err);
      await this.syncOfflineCache();
      return {
        doc: this._doc!
      };
    }

    // Connect to socket
    this._socket = Sockets.newSocket(this._authUrl, {
      transportOptions: {
        polling: {
          extraHeaders: {
            authorization: "Bearer " + session.token
          }
        }
      }
    });

    /**
     * Errors
     */
    Sockets.on(this._socket, "error", (data: string) => {
      const { message } = JSON.parse(data);
      console.error(`Error from Socket: ${message}`);
    });

    // Required connect handler
    Sockets.on(this._socket, "connect", () => {
      this._peer.notify(this._doc!);
      this.syncOfflineCache();
    });

    // Required disconnect handler
    Sockets.on(this._socket, "disconnect", reason => {
      if (reason === "io server disconnect") {
        console.error(
          "The RoomService client was forcibly disconnected from the server, likely due to invalid auth."
        );
      }
    });

    /**
     * We don't require these to be defined before hand since they're
     * optional
     */
    if (this._onUpdateSocketCallback) {
      Sockets.on(this._socket, "sync_room_state", this._onUpdateSocketCallback);
    }
    if (this._onConnectSocketCallback) {
      Sockets.on(this._socket, "connect", this._onConnectSocketCallback);
    }
    if (this._onDisconnectSocketCallback) {
      Sockets.on(this._socket, "disconnect", this._onDisconnectSocketCallback);
    }
  }

  publishDoc(callback: (state: T) => void): T {
    const doc = changeDoc(oldDoc, actorId, callback);
    this._peer.notify(doc);
    return doc;
  }
}
