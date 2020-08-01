import Automerge, { Doc, load, merge, save } from 'automerge';
import { Map } from 'immutable';
import invariant from 'invariant';
import { debounce } from 'lodash';
import { Peer } from 'manymerge';
import { Message } from 'manymerge/dist/types';
import safeJsonStringify from 'safe-json-stringify';
import { ROOM_SERICE_CLIENT_URL } from './constants';
import Offline from './offline';
import Sockets from './socket';
import { Obj, Room, Session } from './types';
import { authorizeSocket } from './socketauth';
import ListenerManager from './ListenerManager';

const DOC_NAMESPACE = '/v1/doc';

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
  private _socket?: SocketIOClient.Socket;
  private _roomId?: string;
  private _doc?: Doc<T>;
  private _actorId?: string | null;
  private _defaultDoc?: T;
  private _authorized?: Promise<boolean | undefined>;
  private _listenerManager: ListenerManager;

  // We define this as a local variable to make testing easier
  _socketURL: string;

  private _onUpdateSocketCallback?: (data: string) => any;
  private _onConnectSocketCallback?: () => any;
  private _onDisconnectSocketCallback?: () => any;

  private _saveOffline: (docId: string, doc: Doc<T>) => void;

  constructor(parameters: { roomReference: string; defaultDoc?: T }) {
    this._roomReference = parameters.roomReference;
    this._defaultDoc = parameters.defaultDoc;
    this._peer = new Peer(this._sendMsgToSocket);
    this._socketURL = ROOM_SERICE_CLIENT_URL;
    this._listenerManager = new ListenerManager();

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

  private createDoc(actorId: string | null, state?: T) {
    if (this._doc) {
      return this._doc;
    }

    const params = actorId ? { actorId } : undefined;
    const defaultDoc = Automerge.from(state || ({} as T), params);

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
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      return {};
    }

    if (!this._doc) {
      await this.readActorIdThenCreateDoc(this._defaultDoc);
    }
    return this.syncOfflineCache();
  }

  /**
   * Attempts to go online.
   */
  async init({
    room,
    session,
  }: {
    room?: Room;
    session?: Session;
  }): Promise<{
    doc?: T;
  }> {
    if (typeof window === 'undefined') {
      return { doc: undefined };
    }

    if (!this._doc) {
      await this.readActorIdThenCreateDoc(this._defaultDoc);
    }

    // we're offline, so we should just continue with our fun little world
    if (!room || !session) {
      await this.syncOfflineCache();
      return {
        doc: this._doc! as T,
      };
    }

    this._roomId = room.id;
    this._socket = Sockets.newSocket(this._socketURL + DOC_NAMESPACE, {
      transports: ['websocket'],
    });

    this._listenerManager.on(this._socket, 'reconnect_attempt', () => {
      invariant(this._socket, 'socket should be defined');
      this._socket.io.opts.transports = ['websocket'];
    });

    /**
     * Errors
     */
    this._listenerManager.on(this._socket, 'error', (data: string) => {
      try {
        const { message } = JSON.parse(data);
        console.error(`Error from Socket: ${message}`);
      } catch (err) {
        console.error(`Unparsable error from socket: ${data}`);
      }
    });

    // Immediately attempt to authorize via traditional auth
    this._authorized = authorizeSocket(this._socket, session.token, room.id);

    // Required connect handler
    this._listenerManager.on(this._socket, 'connect', () => {
      this._peer.notify(this._doc!);
      this.syncOfflineCache();
    });

    // Required disconnect handler
    this._listenerManager.on(this._socket, 'disconnect', reason => {
      if (reason === 'io server disconnect') {
        console.warn(
          'The RoomService client was forcibly disconnected from the server, likely due to invalid auth.'
        );
      }
    });

    /**
     * We don't require these to be defined before hand since they're
     * optional
     */
    if (this._onUpdateSocketCallback) {
      this._listenerManager.on(
        this._socket,
        'sync_room_state',
        this._onUpdateSocketCallback
      );
    }
    if (this._onConnectSocketCallback) {
      this._listenerManager.on(
        this._socket,
        'connect',
        this._onConnectSocketCallback
      );
    }
    if (this._onDisconnectSocketCallback) {
      this._listenerManager.on(
        this._socket,
        'disconnect',
        this._onDisconnectSocketCallback
      );
    }

    // Load the document of the room.
    const result = await fetch(
      this._socketURL + `/client/v1/rooms/${room.id}/documents/default`,
      {
        headers: {
          authorization: 'Bearer ' + session.token,
        },
      }
    );
    if (result.status !== 200) {
      throw new Error(
        `Unexpectedly did not find document for room ${room.reference}`
      );
    }
    const roomStateStr = await result.text();

    // Merge RoomService's online cache with what we have locally
    let state;
    try {
      // NOTE: we purposefully don't define an actor id,
      // since it's not assumed this state is defined by our actor.
      state = Automerge.load(roomStateStr) as T;
      const local = await this.syncOfflineCache();

      state = merge(local, state as T);

      this._doc = state;
      this._peer.notify(this._doc);
    } catch (err) {
      console.error(err);
      state = {} as T;
    }

    return { doc: state };
  }

  /**
   * Manually go offline
   */
  disconnect() {
    if (typeof window === 'undefined') {
      console.warn(
        'Attempting to call disconnect on the server, this is a no-op.'
      );
      return;
    }

    if (this._socket) {
      Sockets.disconnect(this._socket);
      // Remove listeners after disconnect so that
      // disconnect listener gets called
      this._listenerManager.removeAllListeners(this._socket);
    }
    this._onUpdateSocketCallback = undefined;
    this._onConnectSocketCallback = undefined;
    this._onDisconnectSocketCallback = undefined;
    this._socket = undefined;
  }

  onSetDoc(callback: (state: Readonly<any>) => any) {
    if (typeof window === 'undefined') {
      console.warn(
        'Attempting to call onSetDoc on the server, this is a no-op.'
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
        await this.readActorIdThenCreateDoc(this._defaultDoc);
      }

      // convert the payload clock to a map
      payload.msg.clock = Map(payload.msg.clock);

      try {
        const newDoc = this._peer.applyMessage(payload.msg, this._doc!);

        // if we don't have any new changes, we don't need to do anything.
        if (!newDoc) {
          return;
        }

        this._doc = newDoc;
        this._saveOffline('default', this._doc);

        // From a user's perspective, the document should only update
        // if we've actually made changes (since only we care about the
        // clock position of everyone else).
        if (payload.msg.changes) {
          callback(this._doc);
        }
      } catch (err) {
        // Ignore Automerge double-apply errors
        if (
          (err as Error).message &&
          err.message.includes('Inconsistent reuse of sequence number')
        ) {
          return;
        }

        console.error(err);
      }
    };

    // If we're offline, just wait till we're back online to assign this callback
    if (!this._socket) {
      this._onUpdateSocketCallback = socketCallback;
      return;
    }

    this._listenerManager.on(this._socket, 'sync_room_state', socketCallback);
  }

  onConnect(callback: () => any) {
    if (typeof window === 'undefined') {
      console.warn(
        'Attempting to call onConnect on the server, this is a no-op.'
      );
      return;
    }

    // If we're offline, cue this up for later.
    if (!this._socket) {
      this._onConnectSocketCallback = callback;
      return;
    }

    this._listenerManager.on(this._socket, 'connect', callback);
  }

  onDisconnect(callback: () => any) {
    if (typeof window === 'undefined') {
      console.warn(
        'Attempting to call onDisconnect on the server, this is a no-op.'
      );
      return;
    }

    // If we're offline, cue this up for later.
    if (!this._socket) {
      this._onDisconnectSocketCallback = callback;
      return;
    }

    this._listenerManager.on(this._socket, 'disconnect', callback);
  }

  private async syncOfflineCache(): Promise<Doc<T>> {
    const data = await Offline.getDoc(this._roomReference, 'default');
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
      actorId,
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
  private _sendMsgToSocket = async (automergeMsg: Message) => {
    // we're offline, so don't do anything
    if (!this._socket) {
      return;
    }

    const isAuthorized = await this._authorized;

    // isAuthorized is undefined if the socket disconnects before we get an answer
    if (!this._socket || isAuthorized === undefined) {
      return;
    }

    if (isAuthorized === false) {
      console.error('Room Service is unable to authorize');
      return;
    }

    invariant(
      this._roomId,
      "Expected a _roomId to exist when publishing. This is a sign of a broken client, if you're seeing this, please contact us."
    );

    const room: RoomPacket = {
      meta: {
        roomId: this._roomId,
      },
      payload: {
        msg: automergeMsg,
      },
    };

    Sockets.emit(this._socket, 'sync_room_state', asRoomStr(room));
  };

  async setDoc<D>(callback: (state: D) => void): Promise<D> {
    if (typeof window === 'undefined') {
      console.warn('Attempting to call setDoc on the server, this is a no-op.');
      return {} as D;
    }

    if (!this._doc) {
      this._doc = await this.readActorIdThenCreateDoc(this._defaultDoc);
    }

    if (typeof callback !== 'function') {
      throw new Error(`room.publishDoc expects a function.`);
    }

    let newDoc = Automerge.change(this._doc, callback);

    if (!newDoc) {
      invariant(
        !!this._actorId,
        "The client is trying to regenerate a deleted document, but isn't able to access the cached actor id. This is probably a bug in the client, if you see this, we're incredibly sorry! Please let us know. In the meantime, you may be able work around this by ensuring 'await room.restore()' has finished before calling 'publishState'."
      );

      // this happens if someone deletes the doc, so we should just reinit it.
      newDoc = this.createDoc(this._actorId, this._defaultDoc);
    }

    this._doc = newDoc;
    this._saveOffline('default', newDoc);
    this._peer.notify(newDoc);

    return newDoc as D;
  }

  undo() {
    if (this._doc && Automerge.canUndo(this._doc)) {
      let newDoc = Automerge.undo(this._doc);

      this._doc = newDoc;
      this._saveOffline('default', newDoc);
      this._peer.notify(newDoc);

      return newDoc;
    } else {
      return this._doc;
    }
  }

  redo() {
    if (this._doc && Automerge.canRedo(this._doc)) {
      let newDoc = Automerge.redo(this._doc);

      this._doc = newDoc;
      this._saveOffline('default', newDoc);
      this._peer.notify(newDoc);

      return newDoc;
    } else {
      return this._doc;
    }
  }
}
