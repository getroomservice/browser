import Automerge, { Doc, load, save } from "automerge";
import invariant from "invariant";
import { debounce } from "lodash";
import safeJsonStringify from "safe-json-stringify";
import authorize from "./authorize";
import { ROOM_SERICE_SOCKET_URL } from "./constants";
import Offline from "./offline";
import Sockets from "./socket";
import { KeyValueObject } from "./types";

interface RoomPacket {
  meta: {
    roomId: string;
  };
  payload: {
    msg: Automerge.Message;
  };
}

function asRoomStr(room: RoomPacket) {
  return safeJsonStringify(room);
}

class RoomClient<T extends KeyValueObject> {
  private _automergeConn: Automerge.Connection<T>;
  private _docs: Automerge.DocSet<T>;
  private _socket?: SocketIOClient.Socket;
  private _roomId?: string;
  private readonly _reference: string;
  private readonly _authorizationUrl: string;

  // We define this as a local variable to make testing easier
  private _socketURL: string = ROOM_SERICE_SOCKET_URL;

  private _onUpdateCallback?: (data: string) => any;
  private _onConnectCallback?: () => any;
  private _onDisconnectCallback?: () => any;

  private _saveOffline: (docId: string, doc: Doc<T>) => void;

  constructor(authorizationUrl: string, reference: string, state?: T) {
    this._reference = reference;
    this._authorizationUrl = authorizationUrl;

    // Automerge technically supports sending multiple docs
    // over the wire at the same time, but for simplicity's sake
    // we just use one doc at for the moment.
    //
    // In the future, we may support multiple documents per room.
    const defaultDoc = Automerge.from(state || ({} as T));
    this._docs = new Automerge.DocSet();
    this._docs.setDoc("default", defaultDoc);

    this._automergeConn = new Automerge.Connection(
      this._docs,
      this._sendMsgToSocket
    );

    // We define this here so we can debounce the save function
    // Otherwise we'll get quite the performance hit
    let saveOffline = (docId: string, doc: Doc<T>) => {
      Offline.set(this._reference, docId, save(doc));
    };
    this._saveOffline = debounce(saveOffline, 120);
  }

  async connect() {
    await this.syncOfflineCache();

    const { room, session } = await authorize(
      this._authorizationUrl,
      this._reference
    );

    this._roomId = room.id;
    this._socket = Sockets.newSocket(this._socketURL, {
      transportOptions: {
        polling: {
          extraHeaders: {
            authorization: "Bearer " + session.token
          }
        }
      }
    });
    this._automergeConn.open();

    /**
     * Errors
     */
    Sockets.on(this._socket, "error", (data: string) => {
      const { message } = JSON.parse(data);
      console.error(`Error from Socket: ${message}`);
    });

    /**
     * It's possible someone has created their callbacks BEFORE
     * we've actually connected. In this case, we'll just
     * attach them now.
     */
    if (this._onUpdateCallback) {
      Sockets.on(this._socket, "sync_room_state", this._onUpdateCallback);
    }
    if (this._onConnectCallback) {
      Sockets.on(this._socket, "connect", this._onConnectCallback);
    }
    if (this._onDisconnectCallback) {
      Sockets.on(this._socket, "disconnect", this._onDisconnectCallback);
    }

    /**
     * It's also possible someone's been working offline before we've
     * actually connected to the client. So we should push up their
     * changes.
     */
    this.syncOfflineCache();

    let state;
    try {
      state = Automerge.load(room.state) as T;
    } catch (err) {
      console.error(err);
      state = {} as T;
    }

    return {
      state,
      reference: room.reference
    };
  }

  disconnect() {
    if (this._socket) {
      Sockets.disconnect(this._socket);
    }
  }

  onUpdate(callback: (state: Readonly<T>) => any) {
    invariant(
      !this._onUpdateCallback,
      "It looks like you've called onUpdate multiple times. Since this can cause quite severe performance issues if used incorrectly, we're not currently supporting this behavior. If you've got a use-case we haven't thought of, file a github issue and we may change this."
    );

    const socketCallback = (data: string) => {
      const { meta, payload } = JSON.parse(data) as RoomPacket;

      if (!this._roomId) {
        throw new Error(
          "Expected a _roomId to be defined before we invoked the the onUpdate callback. This is a sign of a broken client, please contact us if you're seeing this."
        );
      }

      // This socket event will fire for ALL rooms, so we need to check
      // if this callback refers to this particular room.
      if (meta.roomId !== this._roomId) {
        return;
      }

      if (!payload.msg) {
        throw new Error(
          "The room's state object does not include an 'msg' attribute, which could signal a corrupted room. If you're seeing this in production, that's quite bad and represents a fixable bug within the SDK itself. Please let us know and we'll fix it immediately!"
        );
      }

      const newDoc = this._automergeConn.receiveMsg(payload.msg);
      this._saveOffline("default", newDoc);

      callback(newDoc as Readonly<T>);
    };

    // If we're offline, just wait till we're back online to assign this callback
    if (!this._socket) {
      this._onUpdateCallback = socketCallback;
      return;
    }

    Sockets.on(this._socket, "sync_room_state", socketCallback);
  }

  onConnect(callback: () => any) {
    // If we're offline, cue this up for later.
    if (!this._socket) {
      this._onConnectCallback = callback;
      return;
    }

    this._socket.on("connect", callback);
  }

  onDisconnect(callback: () => any) {
    // If we're offline, cue this up for later.
    if (!this._socket) {
      this._onDisconnectCallback = callback;
      return;
    }

    this._socket.on("disconnect", callback);
  }

  private async syncOfflineCache() {
    const data = await Offline.get(this._reference, "default");
    if (data) {
      const roomDoc = load<T>(data);
      this._docs.setDoc("default", roomDoc);
    }
  }

  // The automerge client will call this function when
  // it picks up changes from the docset.
  //
  // WARNING: This function is an arrow function specifically because
  // it needs to access this._socket. If you use a regular function,
  // it won't work.
  private _sendMsgToSocket = (automergeMsg: Automerge.Message) => {
    // Note that this._automergeConn.open() must be called after the socket
    // definition
    invariant(
      !!this._socket,
      "Expected this._socket to be defined. This is a sign of a broken client, if you're seeing this, please contact us."
    );

    invariant(
      this._roomId,
      "Expected a _roomId to exist when publishing. This is a sign of a broken client, if you're seeing this, please contact us."
    );

    const room: RoomPacket = {
      meta: {
        roomId: this._roomId as string
      },
      payload: {
        msg: automergeMsg
      }
    };

    Sockets.emit(this._socket!, "sync_room_state", asRoomStr(room));
  };

  publishState(callback: (state: T) => void): T {
    const newDoc = Automerge.change(this._docs.getDoc("default"), callback);

    // Through a series of Automerge magic watchers, this call
    // publishes the document to socket.io if we're connected.
    //
    // setDoc
    //   => Automerge.DocSet fires handler set in...
    //   => Automerge.Connection fires handler set in...
    //   => this._sendMsgToSocket()
    this._docs.setDoc("default", newDoc);
    this._saveOffline("default", newDoc);

    return newDoc;
  }
}

export default class RoomServiceClient {
  private readonly _authorizationUrl: string;

  constructor(authorizationUrl: string) {
    this._authorizationUrl = authorizationUrl;
  }

  room<T extends KeyValueObject>(roomReference: string) {
    return new RoomClient<T>(this._authorizationUrl, roomReference);
  }
}
