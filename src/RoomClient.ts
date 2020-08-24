import SuperlumeWebSocket from './ws';
import {
  WebSocketLikeConnection,
  DocumentCheckpoint,
  ObjectClient,
} from './types';
import { fetchSession, fetchDocument } from './remote';
import { ListClient } from './ListClient';
import { MapClient } from './MapClient';

const WEBSOCKET_TIMEOUT = 1000 * 2;

type Listener = (args: any) => void;

export class RoomClient {
  private ws: SuperlumeWebSocket;
  private token: string;
  private roomID: string;
  private docID: string;
  private actor: string;
  private checkpoint: DocumentCheckpoint;

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
    const authenticated = this.once('guest:authenticated');
    this.ws.send('guest:authenticate', this.token);
    await authenticated;

    const joined = this.once('room:joined');
    this.ws.send('room:join', this.roomID);
    await joined;
  }

  async list(name: string): Promise<ListClient> {
    // create a list if it doesn't exist
    if (!this.checkpoint.lists[name]) {
      this.ws.send('doc:cmd', {
        args: ['lcreate', this.docID, name],
        room: this.roomID,
      });
    }

    const l = new ListClient(
      this.checkpoint.lists[name] || [],
      this.roomID,
      this.docID,
      name,
      this.ws,
      this.actor
    );

    return l;
  }

  async map(name: string): Promise<MapClient> {
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

    return m;
  }

  onUpdate(
    obj: ObjectClient,
    onChangeFn: (cmd: string[], from?: string) => {}
  ): Listener {
    const bound = this.ws.bind('doc:fwd', body => {
      if (body.room !== this.roomID) return;
      if (!body.args || body.args.length < 3) {
        // Potentially a network failure, we don't want to crash,
        // but do want to warn people
        console.error('Unexpected command: ', body.args);
        return;
      }

      const [docID, objID] = [body.args[1], body.args[2]];
      if (docID !== this.docID) return;
      if (objID !== obj.id) return;

      onChangeFn(body.args, body.from);
    });
    return bound;
  }

  off(listener: Listener) {
    this.ws.unbind('doc:fwd', listener);
  }
}

export async function createRoom(
  conn: WebSocketLikeConnection,
  docsURL: string,
  provisionerURL: string,
  room: string,
  document: string
): Promise<RoomClient> {
  const sess = await fetchSession(provisionerURL, room, document);
  const { body } = await fetchDocument(docsURL, sess.token, sess.docID);
  const roomClient = new RoomClient({
    conn,
    actor: sess.guestID,
    checkpoint: body,
    token: sess.token,
    roomID: sess.roomID,
  });
  await roomClient.reconnect();

  return roomClient;
}
