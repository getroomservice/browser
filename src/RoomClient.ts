import SuperlumeWebSocket from './ws';
import {
  WebSocketLikeConnection,
  DocumentCheckpoint,
  ObjectClient,
  AuthStrategy,
  Prop,
} from './types';
import { fetchSession, fetchDocument } from './remote';
import { InnerListClient } from './ListClient';
import { InnerMapClient } from './MapClient';
import { InnerPresenceClient } from './PresenceClient';
import invariant from 'tiny-invariant';
import { isOlderVS } from './versionstamp';
import { WebSocketServerMessage } from 'wsMessages';

const WEBSOCKET_TIMEOUT = 1000 * 2;

type Listener = {
  event: Prop<WebSocketServerMessage, 'type'>;
  fn: (args: any) => void;
};

type ListenerBundle = Array<Listener>;

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type MapClient<T> = Omit<
  InnerMapClient<T>,
  'dangerouslyUpdateClientDirectly' | 'id'
>;
export type ListClient<T> = Omit<
  InnerListClient<T>,
  'dangerouslyUpdateClientDirectly' | 'id'
>;
export type PresenceClient = Omit<
  InnerPresenceClient,
  'dangerouslyUpdateClientDirectly'
>;

export class RoomClient {
  private ws: SuperlumeWebSocket;
  private vs: string;
  private token: string;
  private roomID: string;
  private docID: string;
  private actor: string;
  private checkpoint: DocumentCheckpoint;
  private errorListener: any;

  private InnerPresenceClient?: InnerPresenceClient;
  private listClients: { [key: string]: InnerListClient<any> } = {};
  private mapClients: { [key: string]: InnerMapClient<any> } = {};

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
    this.InnerPresenceClient = undefined;
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

  list<T extends any>(name: string): ListClient<T> {
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

    const l = new InnerListClient<T>(
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

  map<T extends any>(name: string): MapClient<T> {
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

    const m = new InnerMapClient<T>(
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
    if (this.InnerPresenceClient) {
      return this.InnerPresenceClient;
    }
    const p = new InnerPresenceClient(
      this.roomID,
      this.ws,
      this.actor,
      this.token
    );
    try {
      this.InnerPresenceClient = p;
    } catch (err) {
      throw new Error(
        `Don't Freeze State. See more: https://err.sh/getroomservice/browser/dont-freeze`
      );
    }
    return this.InnerPresenceClient;
  }

  subscribe<T>(
    list: ListClient<T>,
    onChangeFn: (list: ListClient<T>) => any
  ): ListenerBundle;
  subscribe<T>(
    list: ListClient<T>,
    onChangeFn: (list: ListClient<T>, from: string) => any
  ): ListenerBundle;
  subscribe<T>(
    map: MapClient<T>,
    onChangeFn: (map: MapClient<T>) => {}
  ): ListenerBundle;
  subscribe<T>(
    map: MapClient<T>,
    onChangeFn: (map: MapClient<T>, from: string) => any
  ): ListenerBundle;
  subscribe<T extends any>(
    presence: PresenceClient,
    key: string,
    onChangeFn: (obj: { [key: string]: T }, from: string) => any
  ): ListenerBundle;
  subscribe<T extends any>(
    obj: any,
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

        const newObj = (obj as InnerPresenceClient).dangerouslyUpdateClientDirectly(
          'presence:fwd',
          body
        );
        if (!newObj) return;
        invariant(onChangeFn);
        onChangeFn(newObj, body.from);
      });
      const leaveListener = this.ws.bind('room:rm_guest', body => {
        if (body.room !== this.roomID) return;
        const newObj = (obj as InnerPresenceClient).dangerouslyUpdateClientDirectly(
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
