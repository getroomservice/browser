import {
  WebSocketServerMessage,
  WebSocketFwdMessage,
  WebSocketClientMessage,
  WebSocketCmdMessage,
} from './wsMessages';
import { WebSocketLikeConnection, Prop } from 'types';

type Cb = (body: any) => void;

export default class SuperlumeWebSocket {
  private conn: WebSocketLikeConnection;
  private callbacks: { [key: string]: Array<Cb> } = {};

  constructor(conn: WebSocketLikeConnection) {
    this.conn = conn;
    this.conn.onmessage = ev => {
      const msg = JSON.parse(ev.data) as WebSocketServerMessage;
      this.dispatch(msg.type, msg.body);
    };
  }

  private lastTime: number = 0;
  private msgsThisMilisecond: number = 0;

  private timestamp() {
    const time = Date.now();
    if (time === this.lastTime) {
      this.msgsThisMilisecond++;
    } else {
      this.lastTime = time;
      this.msgsThisMilisecond = 0;
    }
    return `${time}:${this.msgsThisMilisecond}`;
  }

  send(msgType: 'room:join', room: string): void;
  send(msgType: 'guest:authenticate', token: string): void;
  send(msgType: 'doc:cmd', body: Prop<WebSocketCmdMessage, 'body'>): void;
  send(msgType: Prop<WebSocketClientMessage, 'type'>, body: any): void {
    const ts = this.timestamp();
    const msg: WebSocketClientMessage = {
      type: msgType,
      ts,
      ver: 0,
      body,
    };

    this.conn.send(JSON.stringify(msg));
  }

  bind(msgType: 'room:joined', callback: (body: string) => void): Cb;
  bind(
    msgType: 'doc:fwd',
    callback: (body: Prop<WebSocketFwdMessage, 'body'>) => void
  ): Cb;
  bind(msgType: 'guest:authenticated', callback: (body: string) => void): Cb;
  bind(msgType: 'error', callback: (body: string) => void): Cb;
  bind(msgType: Prop<WebSocketServerMessage, 'type'>, callback: Cb): Cb {
    this.callbacks[msgType] = this.callbacks[msgType] || [];
    this.callbacks[msgType].push(callback);
    return callback;
  }

  unbind(msgType: string, callback: Cb) {
    this.callbacks[msgType] = this.callbacks[msgType].filter(
      c => c !== callback
    );
  }

  private dispatch(msgType: string, body: any) {
    const stack = this.callbacks[msgType];
    if (!stack) return;
    for (let i = 0; i < stack.length; i++) {
      stack[i](body);
    }
  }
}
