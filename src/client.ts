import Automerge from "automerge";
import invariant from "invariant";
import safeJsonStringify from "safe-json-stringify";
import authorize from "./authorize";
import { ROOM_SERICE_SOCKET_URL } from "./constants";
import Sockets from "./socket";
import { KeyValueObject } from "./types";

interface RoomValue {
  // Note this MUST be the id, not the reference.
  id: string;
  state: {
    automergeMsg: Automerge.Message;
  };
}

function asRoomStr(room: RoomValue) {
  return safeJsonStringify(room);
}

class RoomClient<T extends KeyValueObject> {
  private _automergeConn: Automerge.Connection<T>;
  private _docs: Automerge.DocSet<T>;
  private _socket?: SocketIOClient.Socket;
  private _roomId?: string;
  private readonly _reference: string;
  private readonly _authorizationUrl: string;

  private _onUpdateCallback?: (data: string) => any;
  private _onConnectCallback?: () => any;
  private _onDisconnectCallback?: () => any;

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
  }

  async connect() {
    const { room, session } = await authorize(
      this._authorizationUrl,
      this._reference
    );

    this._roomId = room.id;
    this._socket = Sockets.newSocket(ROOM_SERICE_SOCKET_URL, {
      transportOptions: {
        polling: {
          extraHeaders: {
            authorization: "Bearer " + session.token
          }
        }
      }
    });

    /**
     * It's possible someone has created their callbacks BEFORE
     * we've actually connected. In this case, we'll just
     * attach them now.
     */
    if (this._onUpdateCallback) {
      Sockets.on(this._socket, "update_room_state", this._onUpdateCallback);
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

    // TODO Offline
    // const data = await Offline.get(this._reference);
    // if (data) {
    //   const room: RoomValue = fromRoomStr(data as string);
    //   Sockets.emit(this._socket, "update_room", asRoomStr(room));
    // }
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
      const { id, state } = JSON.parse(data) as RoomValue;

      if (!this._roomId) {
        throw new Error(
          "Expected a _roomId to be defined before we invoked the the onUpdate callback. This is a sign of a broken client, please contact us if you're seeing this."
        );
      }

      // This socket event will fire for ALL rooms, so we need to check
      // if this callback refers to this particular room.
      if (id !== this._roomId) {
        return;
      }

      if (!state.automergeMsg) {
        throw new Error(
          "The room's state object does not include an 'automergeMsg' attribute, which could signal a corrupted room. If you're seeing this in production, that's quite bad and represents a fixable bug within the SDK itself. Please let us know and we'll fix it immediately!"
        );
      }

      const newDoc = this._automergeConn.receiveMsg(state.automergeMsg);
      callback(newDoc as Readonly<T>);
    };

    // If we're offline, just wait till we're back online to assign this callback
    if (!this._socket) {
      this._onUpdateCallback = socketCallback;
      return;
    }

    Sockets.on(this._socket, "update_room_state", socketCallback);
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

  // The automerge client will call this function when
  // It picks up changes
  private _sendMsgToSocket(automergeMsg: Automerge.Message) {
    // We're not connected to the internet, so we don't do anything
    if (!this._socket) {
      return;
    }

    invariant(
      this._roomId,
      "Expected a _roomId to exist when publishing. This is a sign of a broken client, if you're seeing this, please contact us."
    );

    const room: RoomValue = {
      id: this._roomId as string,
      state: {
        automergeMsg
      }
    };

    Sockets.emit(this._socket, "update_room_state", asRoomStr(room));
  }

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

    // TODO OFFLINE HERE
    // Offline.set(room.reference, asStr);

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
