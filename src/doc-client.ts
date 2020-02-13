import Automerge, { Doc, load, merge, save } from "automerge";
import { Map } from "immutable";
import invariant from "invariant";
import { debounce } from "lodash";
import { Peer } from "manymerge";
import { Message } from "manymerge/dist/types";
import safeJsonStringify from "safe-json-stringify";
import { ROOM_SERICE_SOCKET_URL } from "./constants";
import Offline from "./offline";
import Sockets from "./socket";
import { Obj, Room, Session } from "./types";

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

export default class DocClient<T extends Obj> {
  private readonly _peer: Peer;
  private readonly _roomReference: string;
  private readonly _authorizationUrl: string;
  private _socket?: SocketIOClient.Socket;
  private _roomId?: string;
  private _doc?: Doc<T>;
  private _actorId?: string;

  // We define this as a local variable to make testing easier
  _socketURL: string;

  private _onUpdateSocketCallback?: (data: string) => any;
  private _onConnectSocketCallback?: () => any;
  private _onDisconnectSocketCallback?: () => any;

  private _saveOffline: (docId: string, doc: Doc<T>) => void;

  constructor(parameters: {
    authUrl: string;
    roomReference: string;
    defaultDoc?: T;
  }) {
    this._roomReference = parameters.roomReference;
    this._authorizationUrl = parameters.authUrl;
    this._peer = new Peer(this._sendMsgToSocket);
    this._socketURL = ROOM_SERICE_SOCKET_URL;

    // We define this here so we can debounce the save function
    // Otherwise we'll get quite the performance hit
    let saveOffline = (docId: string, doc: Doc<T>) => {
      Offline.setDoc(this._roomReference, docId, save(doc));
    };
    this._saveOffline = debounce(saveOffline, 120);
  }

  private async readActorIdThenCreateDoc(state?: T) {
    const actorId = await Offline.getOrCreateActor();
    this._actorId = actorId;

    return this.createDoc(actorId, state);
  }

  private createDoc(actorId: string, state?: T) {
    if (this._doc) {
      return this._doc;
    }

    const defaultDoc = Automerge.from(state || ({} as T), { actorId });

    // Automerge technically supports sending multiple docs
    // over the wire at the same time, but for simplicity's sake
    // we just use one doc at for the moment.
    //
    // In the future, we may support multiple documents per room.
    this._doc = defaultDoc;
    this._peer.notify(this._doc);

    return this._doc;
  }

  /**
   * Manually attempt to restore the state from offline storage.
   */
  async restore(): Promise<any> {
    // We can't restore on the server, or in environments
    // where indexedb is not defined
    if (typeof window === "undefined" || typeof indexedDB === "undefined") {
      return {};
    }

    if (!this._doc) {
      await this.readActorIdThenCreateDoc();
    }
    return this.syncOfflineCache();
  }

  /**
   * Attempts to go online.
   */
  async init({
    room,
    session
  }: {
    room?: Room;
    session?: Session;
  }): Promise<{
    doc: T;
  }> {
    // If we're server side, we skip everything else
    // and just return the most recent state of the doc.
    if (typeof window === "undefined") {
      return { doc: room?.state };
    }

    if (!this._doc) {
      await this.readActorIdThenCreateDoc();
    }

    // we're offline, so we should just continue with our fun little world
    if (!room || !session) {
      await this.syncOfflineCache();
      return {
        doc: this._doc! as T
      };
    }

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

    /**
     * Errors
     */
    Sockets.on(this._socket, "error", (data: string) => {
      try {
        const { message } = JSON.parse(data);
        console.error(`Error from Socket: ${message}`);
      } catch (err) {
        console.error(`Unparsable error from socket: ${data}`);
      }
    });

    // Required connect handler
    Sockets.on(this._socket, "connect", () => {
      this._peer.notify(this._doc!);
      this.syncOfflineCache();
    });

    // Required disconnect handler
    Sockets.on(this._socket, "disconnect", reason => {
      if (reason === "io server disconnect") {
        console.warn(
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

    // Merge RoomService's online cache with what we have locally
    let state;
    try {
      // NOTE: we purposefully don't define an actor id,
      // since it's not assumed this state is defined by our actor.
      state = Automerge.load(room.state) as T;
      const local = await this.syncOfflineCache();
      state = merge(local, state as T);

      // @ts-ignore no trust me I swear
      this._doc = state;
      this._peer.notify(this._doc);
    } catch (err) {
      console.error(err);
      state = {} as T;
    }

    return { doc: state };
  }

  /**
   * Manually goes offline
   */
  disconnect() {
    if (typeof window === "undefined") {
      console.warn(
        "Attempting to call disconnect on the server, this is a no-op."
      );
      return;
    }

    if (this._socket) {
      Sockets.disconnect(this._socket);
    }
    this._socket = undefined;
  }

  onSetDoc(callback: (state: Readonly<any>) => any) {
    if (typeof window === "undefined") {
      console.warn(
        "Attempting to call onSetDoc on the server, this is a no-op."
      );
      return;
    }

    invariant(
      !this._onUpdateSocketCallback,
      "It looks like you've called onSetDoc multiple times. Since this can cause quite severe performance issues if used incorrectly, we're not currently supporting this behavior. If you've got a use-case we haven't thought of, file a github issue and we may change this."
    );

    const socketCallback = async (data: string) => {
      const { meta, payload } = JSON.parse(data) as RoomPacket;

      if (!this._roomId) {
        throw new Error(
          "Expected a _roomId to be defined before we invoked the the onSetDoc callback. This is a sign of a broken client, please contact us if you're seeing this."
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

      // This is effectively impossible tbh, but we like to be cautious
      if (!this._doc) {
        await this.readActorIdThenCreateDoc();
      }

      // convert the payload clock to a map
      payload.msg.clock = Map(payload.msg.clock);

      const newDoc = this._peer.applyMessage(payload.msg, this._doc!);

      // Automerge will just return undefined
      // if a message is corrupted in some way that it doesn't like.
      // In these cases, we shouldn't actually save it offline otherwise
      // we'd create a hard-to-fix corruption.
      if (!newDoc) {
        throw new Error(
          `Response from RoomService API seems corrupted, aborting. Response: ${data}`
        );
      }
      this._doc = newDoc;
      this._saveOffline("default", this._doc);
      callback(this._doc);
    };

    // If we're offline, just wait till we're back online to assign this callback
    if (!this._socket) {
      this._onUpdateSocketCallback = socketCallback;
      return;
    }

    Sockets.on(this._socket, "sync_room_state", socketCallback);
  }

  onConnect(callback: () => any) {
    if (typeof window === "undefined") {
      console.warn(
        "Attempting to call onConnect on the server, this is a no-op."
      );
      return;
    }

    // If we're offline, cue this up for later.
    if (!this._socket) {
      this._onConnectSocketCallback = callback;
      return;
    }

    this._socket.on("connect", callback);
  }

  onDisconnect(callback: () => any) {
    if (typeof window === "undefined") {
      console.warn(
        "Attempting to call onDisconnect on the server, this is a no-op."
      );
      return;
    }

    // If we're offline, cue this up for later.
    if (!this._socket) {
      this._onDisconnectSocketCallback = callback;
      return;
    }

    this._socket.on("disconnect", callback);
  }

  private async syncOfflineCache(): Promise<Doc<T>> {
    const data = await Offline.getDoc(this._roomReference, "default");
    if (!data) {
      return this._doc!;
    }

    const actorId = await Offline.getOrCreateActor();
    if (!actorId) {
      console.error(
        "Unexpectedly didn't find offline support in an environment like a browser where we should have offline support."
      );
    }

    // We explictly do not add
    const offlineDoc = load<T>(data, {
      actorId
    });

    this._doc = offlineDoc;
    this._peer.notify(this._doc);
    return offlineDoc;
  }

  // The manymerge client will call this function when it picks up changes.
  //
  // WARNING: This function is an arrow function specifically because
  // it needs to access this._socket. If you use a regular function,
  // it won't work.
  private _sendMsgToSocket = (automergeMsg: Message) => {
    // we're offline, so don't do anything
    if (!this._socket) {
      return;
    }

    invariant(
      this._roomId,
      "Expected a _roomId to exist when publishing. This is a sign of a broken client, if you're seeing this, please contact us."
    );

    const room: RoomPacket = {
      meta: {
        roomId: this._roomId
      },
      payload: {
        msg: automergeMsg
      }
    };

    Sockets.emit(this._socket, "sync_room_state", asRoomStr(room));
  };

  setDoc<D>(callback: (state: D) => void): any {
    if (typeof window === "undefined") {
      console.warn("Attempting to call setDoc on the server, this is a no-op.");
      return {} as D;
    }

    if (!this._doc) {
      console.error("Attempting to call publishDoc .init() has finished.");
      return {} as D;
    }

    if (typeof callback !== "function") {
      throw new Error(`room.publishDoc expects a function.`);
    }

    let newDoc = Automerge.change(this._doc, callback);

    if (!newDoc) {
      invariant(
        !!this._actorId,
        "The client is trying to regenerate a deleted document, but isn't able to access the cached actor id. This is probably a bug in the client, if you see this, we're incredibly sorry! Please let us know. In the meantime, you may be able work around this by ensuring 'await room.restore()' has finished before calling 'publishState'."
      );

      // this happens if someone deletes the doc, so we should just reinit it.
      newDoc = this.createDoc(this._actorId);
    }

    this._doc = newDoc;
    this._saveOffline("default", newDoc);
    this._peer.notify(newDoc);

    return newDoc;
  }
}
