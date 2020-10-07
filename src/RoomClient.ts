import SuperlumeWebSocket from './ws';
import {
  WebSocketLikeConnection,
  DocumentCheckpoint,
  ObjectClient,
  AuthStrategy,
  Prop,
} from './types';
import { fetchSession, fetchDocument } from './remote';
import { ListClient } from './ListClient';
import { MapClient } from './MapClient';
import { PresenceClient } from './PresenceClient';
import invariant from 'tiny-invariant';
import { isOlderVS } from './versionstamp';
import { WebSocketServerMessage } from 'wsMessages';

const WEBSOCKET_TIMEOUT = 1000 * 2;

type Listener = {
  event: Prop<WebSocketServerMessage, 'type'>;
  fn: (args: any) => void;
};

type ListenerBundle = Array<Listener>;

export class RoomClient {
  private ws: SuperlumeWebSocket;
  private vs: string;
  private token: string;
  private roomID: string;
  private docID: string;
  private actor: string;
  private checkpoint: DocumentCheckpoint;
  private errorListener: any;

  private presenceClient?: PresenceClient;
  private listClients: { [key: string]: ListClient } = {};
  private mapClients: { [key: string]: MapClient } = {};

  constructor(params: {
    conn: WebSocketLikeConnection;
    actor: string;
    checkpoint: DocumentCheckpoint;
    token: string;
    roomID: string;
  }) {
    this.ws = new SuperlumeWebSocket(params.conn);
    this.token = params.token;
    this.roomID = params.roomID;
    this.docID = params.checkpoint.id;
    this.actor = params.actor;
    this.checkpoint = params.checkpoint;
    this.vs = this.checkpoint.vs;
    this.presenceClient = undefined;
  }

  private async once(msg: string) {
    let off: (args: any) => any;
    return Promise.race([
      new Promise((_, reject) =>
        setTimeout(() => reject('timeout'), WEBSOCKET_TIMEOUT)
      ),
      new Promise(resolve => {
        off = this.ws.bind(msg as any, body => {
          resolve(body);
        });
      }),
    ]).then(() => {
      if (off) this.ws.unbind(msg, off);
    });
  }

  /**
   * TODO: don't expose this function
   */
  async reconnect() {
    if (!this.errorListener) {
      this.errorListener = this.ws.bind('error', err => {
        console.error(
          'Room Service encountered a server-side error. If you see this, please let us know; this could be a bug.',
          err
        );
      });
    }

    const authenticated = this.once('guest:authenticated');
    this.ws.send('guest:authenticate', this.token);
    await authenticated;

    const joined = this.once('room:joined');
    this.ws.send('room:join', this.roomID);
    await joined;
  }

  get me() {
    return this.actor;
  }

  list(name: string): ListClient {
    if (this.listClients[name]) {
      return this.listClients[name];
    }

    // create a list if it doesn't exist
    if (!this.checkpoint.lists[name]) {
      this.ws.send('doc:cmd', {
        args: ['lcreate', this.docID, name],
        room: this.roomID,
      });

      // Assume success
      this.checkpoint.lists[name] = {
        afters: [],
        ids: [],
        values: [],
      };
    }

    const l = new ListClient(
      this.checkpoint,
      this.roomID,
      this.docID,
      name,
      this.ws,
      this.actor
    );
    this.listClients[name] = l;

    return l;
  }

  map(name: string): MapClient {
    if (this.mapClients[name]) {
      return this.mapClients[name];
    }

    // Create this map if it doesn't exist
    if (!this.checkpoint.maps[name]) {
      this.ws.send('doc:cmd', {
        args: ['mcreate', this.docID, name],
        room: this.roomID,
      });
    }

    const m = new MapClient(
      this.checkpoint.maps[name] || {},
      this.roomID,
      this.docID,
      name,
      this.ws
    );
    this.mapClients[name] = m;

    return m;
  }

  presence(): PresenceClient {
    if (this.presenceClient) {
      return this.presenceClient;
    }
    const p = new PresenceClient(this.roomID, this.ws, this.actor, this.token);
    try {
      this.presenceClient = p;
    } catch (err) {
      throw new Error(
        `Don't Freeze State. See more: https://err.sh/getroomservice/browser/dont-freeze`
      );
    }
    return this.presenceClient;
  }

  subscribe(
    list: ListClient,
    onChangeFn: (list: ListClient) => any
  ): ListenerBundle;
  subscribe(
    list: ListClient,
    onChangeFn: (list: ListClient, from: string) => any
  ): ListenerBundle;
  subscribe(map: MapClient, onChangeFn: (map: MapClient) => {}): ListenerBundle;
  subscribe(
    map: MapClient,
    onChangeFn: (map: MapClient, from: string) => any
  ): ListenerBundle;
  subscribe<T extends any>(
    presence: PresenceClient,
    key: string,
    onChangeFn: (obj: { [key: string]: T }, from: string) => any
  ): ListenerBundle;
  subscribe<T extends any>(
    obj: ObjectClient | PresenceClient,
    onChangeFnOrString: Function | string,
    onChangeFn?: (obj: { [key: string]: T }, from: string) => any
  ): ListenerBundle {
    // Presence handler
    if (typeof onChangeFnOrString === 'string') {
      invariant(
        obj,
        'subscribe() expects the first argument to not be undefined.'
      );
      const fwdListener = this.ws.bind('presence:fwd', body => {
        if (body.room !== this.roomID) return;
        if (body.key !== onChangeFnOrString) return;
        if (body.from === this.actor) return;
        const newObj = obj.dangerouslyUpdateClientDirectly(
          'presence:fwd',
          body
        );
        if (!newObj) return;
        invariant(onChangeFn);
        onChangeFn(newObj, body.from);
      });
      const leaveListener = this.ws.bind('room:rm_guest', body => {
        if (body.room !== this.roomID) return;
        const newObj = obj.dangerouslyUpdateClientDirectly(
          'room:rm_guest',
          body
        );
        if (!newObj) return;
        invariant(onChangeFn);
        onChangeFn(newObj, body.guest);
      });

      return [
        {
          event: 'presence:fwd',
          fn: fwdListener,
        },
        {
          event: 'room:rm_guest',
          fn: leaveListener,
        },
      ];
    }

    // Map and list handler
    const bound = this.ws.bind('doc:fwd', body => {
      if (body.room !== this.roomID) return;
      if (!body.args || body.args.length < 3) {
        // Potentially a network failure, we don't want to crash,
        // but do want to warn people
        console.error('Unexpected command: ', body.args);
        return;
      }
      // Ignore out of order version stamps
      if (isOlderVS(body.vs, this.vs)) return;

      // Ignore validated commands
      if (body.from === this.actor) return;

      const [docID, objID] = [body.args[1], body.args[2]];
      if (docID !== this.docID) return;
      if (objID !== (obj as ObjectClient).id) return;

      this.vs = body.vs;
      const newObj = (obj as ObjectClient).dangerouslyUpdateClientDirectly(
        body.args
      );
      onChangeFnOrString(newObj, body.from);
    });
    return [
      {
        event: 'doc:fwd',
        fn: bound,
      },
    ];
  }

  unsubscribe(listeners: ListenerBundle) {
    for (let l of listeners) {
      this.ws.unbind(l.event, l.fn);
    }
  }
}

export async function createRoom(
  conn: WebSocketLikeConnection,
  docsURL: string,
  authStrategy: AuthStrategy,
  room: string,
  document: string
): Promise<RoomClient> {
  const sess = await fetchSession(authStrategy, room, document);
  const { body } = await fetchDocument(docsURL, sess.token, sess.docID);
  const roomClient = new RoomClient({
    conn,
    actor: sess.guestReference,
    checkpoint: body,
    token: sess.token,
    roomID: sess.roomID,
  });
  await roomClient.reconnect();

  return roomClient;
}
