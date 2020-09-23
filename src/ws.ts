import {
  WebSocketServerMessage,
  WebSocketDocFwdMessage,
  WebSocketClientMessage,
  WebSocketDocCmdMessage,
  WebSocketPresenceCmdMessage,
  WebSocketPresenceFwdMessage,
  WebSocketLeaveMessage,
  WebSocketJoinMessage,
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

  send(msgType: 'room:join', room: Prop<WebSocketJoinMessage, 'body'>): void;
  send(msgType: 'guest:authenticate', token: string): void;
  send(msgType: 'doc:cmd', body: Prop<WebSocketDocCmdMessage, 'body'>): void;
  send(
    msgType: 'presence:cmd',
    body: Prop<WebSocketPresenceCmdMessage, 'body'>
  ): void;
  send(msgType: Prop<WebSocketClientMessage, 'type'>, body: any): void {
    const ts = this.timestamp();
    const msg: WebSocketClientMessage = {
      type: msgType,
      ts,
      ver: 0,
      body,
    };

    // If the client is connecting, buffer a bit and retry
    if (this.conn.readyState === this.conn.CONNECTING) {
      setTimeout(() => {
        // @ts-ignore
        this.send(msgType, body);
      }, 100 + Math.random() * 100);
      return;
    }

    this.conn.send(JSON.stringify(msg));
  }

  bind(
    msgType: 'room:rm_guest',
    callback: (body: Prop<WebSocketLeaveMessage, 'body'>) => void
  ): Cb;
  bind(msgType: 'room:joined', callback: (body: string) => void): Cb;
  bind(
    msgType: 'doc:fwd',
    callback: (body: Prop<WebSocketDocFwdMessage, 'body'>) => void
  ): Cb;
  bind(
    msgType: 'presence:fwd',
    callback: (body: Prop<WebSocketPresenceFwdMessage, 'body'>) => void
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
