import SuperlumeWebSocket from './ws';
import {
  WebSocketLikeConnection,
  DocumentContext,
  DocumentCheckpoint,
} from 'types';
import { runRemoteCommandLocally } from './commands';
import { newContextFromCheckpoint, toJSON } from './context';
import { fetchSession, fetchDocument } from './remote';

const WEBSOCKET_TIMEOUT = 1000 * 2;

type Listener = (args: any) => void;

export class DocumentClient<T extends any> {
  private ws: SuperlumeWebSocket;
  private ctx: DocumentContext;
  private token: string;
  private roomID: string;

  constructor(params: {
    conn: WebSocketLikeConnection;
    actor: string;
    checkpoint: DocumentCheckpoint;
    token: string;
    roomID: string;
  }) {
    this.ws = new SuperlumeWebSocket(params.conn);
    this.ctx = newContextFromCheckpoint(params.checkpoint, params.actor);
    this.token = params.token;
    this.roomID = params.roomID;
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

  async connect() {
    const authenticated = this.once('guest:authenticated');
    this.ws.send('guest:authenticate', this.token);
    await authenticated;

    const joined = this.once('room:joined');
    this.ws.send('room:join', this.roomID);
    await joined;
  }

  //   change(changeFn: (d: T) => void) {}

  onChange(onChangeFn: (d: T, from: string) => void): Listener {
    const bound = this.ws.bind('doc:fwd', body => {
      const newCtx = runRemoteCommandLocally(this.ctx, body.args);
      const json = toJSON(newCtx);
      onChangeFn(json, body.from);
    });
    return bound;
  }

  off(listener: Listener) {
    this.ws.unbind('doc:fwd', listener);
  }

  async load(): Promise<T> {
    return {} as T;
  }
}

export async function document<T>(
  conn: WebSocketLikeConnection,
  docsURL: string,
  provisionerURL: string,
  room: string,
  document: string
): Promise<DocumentClient<T>> {
  const sess = await fetchSession(provisionerURL, room, document);
  const { body } = await fetchDocument(docsURL, sess.token, sess.docID);
  const doc = new DocumentClient<T>({
    conn,
    actor: sess.guestID,
    checkpoint: body,
    token: sess.token,
    roomID: sess.roomID,
  });
  await doc.connect();

  return doc;
}
