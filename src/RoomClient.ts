import SuperlumeWebSocket from './ws';
import {
  WebSocketLikeConnection,
  DocumentCheckpoint,
  AuthStrategy,
  Prop,
} from './types';
import { fetchSession, fetchDocument } from './remote';
import { InnerListClient, ListObject } from './ListClient';
import { InnerMapClient, MapObject } from './MapClient';
import { InnerPresenceClient } from './PresenceClient';
import invariant from 'tiny-invariant';
import { vsReader } from '@roomservice/core';
import {
  WebSocketPresenceFwdMessage,
  WebSocketServerMessage,
} from './wsMessages';
import { LocalBus } from './localbus';

const WEBSOCKET_TIMEOUT = 1000 * 2;

type Listener = {
  event?: Prop<WebSocketServerMessage, 'type'>;
  objID?: string;
  fn: (args: any) => void;
};

const MAP_CMDS = ['mcreate', 'mput', 'mputref', 'mdel'];
const LIST_CMDS = ['lcreate', 'lins', 'linsref', 'lput', 'lputref', 'ldel'];

type ListenerBundle = Array<Listener>;

type InternalFunctions = 'dangerouslyUpdateClientDirectly';
type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type MapClient<T extends MapObject> = Omit<
  InnerMapClient<T>,
  InternalFunctions | 'id'
>;
export type ListClient<T extends ListObject> = Omit<
  InnerListClient<T>,
  'dangerouslyUpdateClientDirectly' | 'id'
>;
export type PresenceClient = Omit<
  InnerPresenceClient,
  'dangerouslyUpdateClientDirectly'
>;

interface DispatchDocCmdMsg {
  args: string[];
  from: string;
}

export class RoomClient {
  private ws: SuperlumeWebSocket;
  private token: string;
  private roomID: string;
  private docID: string;
  private actor: string;
  private checkpoint: DocumentCheckpoint;
  private errorListener: any;

  private InnerPresenceClient?: InnerPresenceClient;
  private listClients: { [key: string]: InnerListClient<any> } = {};
  private mapClients: { [key: string]: InnerMapClient<any> } = {};
  private expires: { [key: string]: NodeJS.Timeout } = {};

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
    this.InnerPresenceClient = undefined;

    const vs = vsReader(window.atob);

    this.ws.bind('doc:fwd', (body) => {
      if (body.room !== this.roomID) return;
      if (!body.args || body.args.length < 3) {
        // Potentially a network failure, we don't want to crash,
        // but do want to warn people
        console.error('Unexpected command: ', body.args);
        return;
      }
      // Ignore version stamps older than checkpoint
      if (vs.isOlderVS(body.vs, this.checkpoint.vs)) return;

      // Ignore validated commands
      if (body.from === this.actor) return;

      const [cmd, docID, objID] = [body.args[0], body.args[1], body.args[2]];

      if (docID !== this.docID) return;

      if (MAP_CMDS.includes(cmd)) {
        this.dispatchMapCmd(objID, body);
      } else if (LIST_CMDS.includes(cmd)) {
        this.dispatchListCmd(objID, body);
      } else {
        console.warn(
          'Unhandled Room Service doc:fwd command: ' +
            cmd +
            '. Consider updating the Room Service client.'
        );
      }
    });

    this.ws.bind('presence:fwd', (body) => {
      this.dispatchPresenceCmd(body);
    });

    this.ws.bind('room:rm_guest', (body) => {
      if (body.room !== this.roomID) return;
      const client = this.presence('_____any') as InnerPresenceClient;

      const newClient = client.dangerouslyUpdateClientDirectly(
        'room:rm_guest',
        body
      );
      for (let [_, cbs] of Object.entries(this.presenceCallbacksByKey)) {
        for (const cb of cbs) {
          cb(newClient, body.guest);
        }
      }
    });
  }

  private dispatchMapCmd(objID: string, body: DispatchDocCmdMsg) {
    if (!this.mapClients[objID]) {
      this.createMapLocally(objID);
    }

    const client = this.mapClients[objID];
    const updatedClient = client.dangerouslyUpdateClientDirectly(body.args);

    for (const cb of this.mapCallbacksByObjID[objID] || []) {
      cb(updatedClient.toObject(), body.from);
    }
  }

  private dispatchListCmd(objID: string, body: DispatchDocCmdMsg) {
    if (!this.listClients[objID]) {
      this.createListLocally(objID);
    }

    const client = this.listClients[objID];
    const updatedClient = client.dangerouslyUpdateClientDirectly(body.args);

    for (const cb of this.listCallbacksByObjID[objID] || []) {
      cb(updatedClient.toArray(), body.from);
    }
  }

  private dispatchPresenceCmd(body: Prop<WebSocketPresenceFwdMessage, 'body'>) {
    if (body.room !== this.roomID) return;
    if (body.from === this.actor) return;

    const client = this.presence(body.key) as InnerPresenceClient;
    const key = body.key;

    const now = new Date().getTime() / 1000;
    const secondsTillTimeout = body.expAt - now;
    if (secondsTillTimeout < 0) {
      // don't show expired stuff
      return;
    }

    // Expire stuff if it's within a reasonable range (12h)
    if (secondsTillTimeout < 60 * 60 * 12) {
      if (this.expires[key]) {
        clearTimeout(this.expires[key]);
      }

      let timeout = setTimeout(() => {
        const newClient = client.dangerouslyUpdateClientDirectly(
          'presence:expire',
          { key: body.key }
        );
        if (!newClient) return;
        for (const cb of this.presenceCallbacksByKey[key] ?? []) {
          cb(newClient, body.from);
        }
      }, secondsTillTimeout * 1000);

      this.expires[key] = timeout;
    }

    const newClient = client.dangerouslyUpdateClientDirectly(
      'presence:fwd',
      body
    );
    if (!newClient) return;
    for (const cb of this.presenceCallbacksByKey[key] ?? []) {
      cb(newClient, body.from);
    }
  }

  private async once(msg: string) {
    let off: (args: any) => any;
    return Promise.race([
      new Promise((_, reject) =>
        setTimeout(() => reject('timeout'), WEBSOCKET_TIMEOUT)
      ),
      new Promise((resolve) => {
        off = this.ws.bind(msg as any, (body) => {
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
      this.errorListener = this.ws.bind('error', (err) => {
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

  private createListLocally<T extends ListObject>(name: string) {
    const bus = new LocalBus<DispatchDocCmdMsg>();
    bus.subscribe((body) => {
      const client = this.listClients[name];
      for (const cb of this.listCallbacksByObjID[name] || []) {
        cb(client.toArray(), body.from);
      }
    });

    const l = new InnerListClient<T>({
      checkpoint: this.checkpoint,
      roomID: this.roomID,
      docID: this.docID,
      listID: name,
      ws: this.ws,
      actor: this.actor,
      bus,
    });
    this.listClients[name] = l;
    return l;
  }

  list<T extends ListObject>(name: string): ListClient<T> {
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

    return this.createListLocally(name);
  }

  private createMapLocally<T extends MapObject>(name: string) {
    const bus = new LocalBus<DispatchDocCmdMsg>();
    bus.subscribe((body) => {
      const client = this.mapClients[name];
      for (const cb of this.mapCallbacksByObjID[name] || []) {
        cb(client.toObject(), body.from);
      }
    });

    const m = new InnerMapClient<T>({
      checkpoint: this.checkpoint,
      roomID: this.roomID,
      docID: this.docID,
      mapID: name,
      ws: this.ws,
      bus,
      actor: this.actor,
    });
    this.mapClients[name] = m;
    return m;
  }

  map<T extends MapObject>(name: string): MapClient<T> {
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

    return this.createMapLocally(name);
  }

  presence(key: string): PresenceClient {
    if (this.InnerPresenceClient) {
      return this.InnerPresenceClient;
    }
    const bus = new LocalBus<{ key: string; value: any; expAt: number }>();
    bus.subscribe((body) => {
      this.dispatchPresenceCmd({
        key: body.key,
        value: body.value,
        expAt: body.expAt,
        from: this.actor,
        room: this.roomID,
      });
    });

    const p = new InnerPresenceClient({
      roomID: this.roomID,
      ws: this.ws,
      actor: this.actor,
      token: this.token,
      bus,
      key: key,
    });
    try {
      this.InnerPresenceClient = p;
    } catch (err) {
      throw new Error(
        `Don't Freeze State. See more: https://err.sh/getroomservice/browser/dont-freeze`
      );
    }
    return this.InnerPresenceClient;
  }

  private mapCallbacksByObjID: { [key: string]: Array<Function> } = {};
  private listCallbacksByObjID: { [key: string]: Array<Function> } = {};
  private presenceCallbacksByKey: { [key: string]: Array<Function> } = {};

  subscribe<T extends ListObject>(
    list: ListClient<T>,
    onChangeFn: (list: T) => any
  ): ListenerBundle;
  subscribe<T extends ListObject>(
    list: ListClient<T>,
    onChangeFn: (list: T, from: string) => any
  ): ListenerBundle;
  subscribe<T extends MapObject>(
    map: MapClient<T>,
    onChangeFn: (map: T) => {}
  ): ListenerBundle;
  subscribe<T extends MapObject>(
    map: MapClient<T>,
    onChangeFn: (map: T, from: string) => any
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
      return this.subscribePresence<T>(obj, onChangeFnOrString, onChangeFn);
    }

    // create new closure so fns can be subscribed/unsubscribed multiple times
    const cb = (
      obj: InnerMapClient<any> | InnerListClient<any>,
      from: string
    ) => {
      onChangeFnOrString(obj, from);
    };

    let objID;
    if (obj instanceof InnerMapClient) {
      const client = obj as InnerMapClient<any>;
      objID = client.id;
      this.mapCallbacksByObjID[objID] = this.mapCallbacksByObjID[objID] || [];
      this.mapCallbacksByObjID[objID].push(cb);
    }

    if (obj instanceof InnerListClient) {
      const client = obj as InnerListClient<any>;
      objID = client.id;
      this.listCallbacksByObjID[objID] = this.listCallbacksByObjID[objID] || [];
      this.listCallbacksByObjID[objID].push(cb);
    }

    return [
      {
        objID,
        fn: cb as (args: any) => void,
      },
    ];
  }

  private subscribePresence<T extends any>(
    obj: any,
    key: string,
    onChangeFn: ((obj: { [key: string]: T }, from: string) => any) | undefined
  ): ListenerBundle {
    invariant(
      obj,
      'subscribe() expects the first argument to not be undefined.'
    );

    //  create new closure so fns can be subscribed/unsubscribed multiple times
    const cb = (obj: any, from: string) => {
      if (onChangeFn) {
        onChangeFn(obj, from);
      }
    };

    this.presenceCallbacksByKey[key] = this.presenceCallbacksByKey[key] || [];
    this.presenceCallbacksByKey[key].push(cb);

    return [
      {
        objID: key,
        fn: cb as (args: any) => void,
      },
    ];
  }

  unsubscribe(listeners: ListenerBundle) {
    for (let l of listeners) {
      if (l.objID) {
        this.mapCallbacksByObjID[l.objID] = removeCallback(
          this.mapCallbacksByObjID[l.objID],
          l.fn
        );
        this.listCallbacksByObjID[l.objID] = removeCallback(
          this.listCallbacksByObjID[l.objID],
          l.fn
        );
        this.presenceCallbacksByKey[l.objID] = removeCallback(
          this.presenceCallbacksByKey[l.objID],
          l.fn
        );
      }
      if (l.event) {
        this.ws.unbind(l.event, l.fn);
      }
    }
  }
}

export async function createRoom<T extends object>(params: {
  conn: WebSocketLikeConnection;
  docsURL: string;
  authStrategy: AuthStrategy<T>;
  authCtx: T;
  room: string;
  document: string;
}): Promise<RoomClient> {
  const sess = await fetchSession(
    params.authStrategy,
    params.authCtx,
    params.room,
    params.document
  );
  const { body } = await fetchDocument(params.docsURL, sess.token, sess.docID);
  const roomClient = new RoomClient({
    conn: params.conn,
    actor: sess.guestReference,
    checkpoint: body,
    token: sess.token,
    roomID: sess.roomID,
  });
  await roomClient.reconnect();

  return roomClient;
}

function removeCallback(
  cbs: Array<Function> | undefined,
  rmCb: Function
): Array<Function> {
  if (!cbs) {
    return [];
  }
  return cbs.filter((existingCb) => {
    return existingCb !== rmCb;
  });
}
