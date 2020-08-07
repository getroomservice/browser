import SuperlumeWebSocket from './ws';
import {
  WebSocketLikeConnection,
  DocumentContext,
  DocumentCheckpoint,
} from 'types';
import { runCommandLocally } from './commands';
import { newContextFromCheckpoint, toJSON } from './context';

type Listener = (args: any) => void;

export class DocumentClient<T extends any> {
  private ws: SuperlumeWebSocket;
  private ctx: DocumentContext;

  constructor(params: {
    conn: WebSocketLikeConnection;
    actor: string;
    checkpoint: DocumentCheckpoint;
  }) {
    this.ws = new SuperlumeWebSocket(params.conn);
    this.ctx = newContextFromCheckpoint(params.checkpoint, params.actor);
  }

  //   change(changeFn: (d: T) => void) {}

  onChange(onChangeFn: (d: T, from: string) => void): Listener {
    const bound = this.ws.bind('doc:fwd', body => {
      const newCtx = runCommandLocally(this.ctx, body.args);
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
