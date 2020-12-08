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
import { BootstrapState, fetchBootstrapState, LocalSession } from './remote';
import { delay } from './util';
type Cb = (body: any) => void;

const WEBSOCKET_TIMEOUT = 1000 * 2;

const MAX_UNSENT_DOC_CMDS = 10_000;

const FORWARDED_TYPES = ['doc:fwd', 'presence:fwd', 'room:rm_guest'];

export class ReconnectingWebSocket implements SuperlumeSend {
  private wsURL: string;
  private docsURL: string;
  private room: string;

  private session: LocalSession;

  private wsFactory: WebSocketFactory;
  private bootstrapFetch: BootstrapFetch;

  // Invariant: at most 1 of current/pendingConn are present
  private currentConn?: WebSocketLikeConnection;
  private pendingConn?: Promise<WebSocketLikeConnection>;

  private dispatcher: WebsocketDispatch;
  private callbacks: { [key: string]: Array<Cb> } = {};

  constructor(params: {
    dispatcher: WebsocketDispatch;
    wsURL: string;
    docsURL: string;
    room: string;
    session: LocalSession;
    wsFactory?: WebSocketFactory;
    bootstrapFetch?: BootstrapFetch;
  }) {
    this.dispatcher = params.dispatcher;
    this.wsURL = params.wsURL;
    this.docsURL = params.docsURL;
    this.room = params.room;
    this.session = params.session;
    this.wsFactory = params.wsFactory || openWS;
    this.bootstrapFetch = params.bootstrapFetch || fetchBootstrapState;

    this.wsLoop();
  }

  close() {
    if (this.currentConn) {
      this.currentConn.onmessage = null;
      this.currentConn.onclose = null;
      this.currentConn.close();
      this.currentConn = undefined;
    }

    if (this.pendingConn) {
      this.pendingConn = undefined;
    }

    this.dispatcher.startQueueingCmds();
  }

  //  one-off attempt to connect and authenticate
  private async connectAndAuth(): Promise<WebSocketLikeConnection> {
    const ws = await this.wsFactory(this.wsURL);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as WebSocketServerMessage;
      this.dispatch(msg.type, msg.body);
    };
    ws.onclose = () => this.close();
    return Promise.resolve(ws).then(async (ws) => {
      ws.send(this.serializeMsg('guest:authenticate', this.session.token));
      await this.once('guest:authenticated');

      ws.send(this.serializeMsg('room:join', this.room));
      await this.once('room:joined');

      const bootstrapState = await this.bootstrapFetch({
        docID: this.session.docID,
        roomID: this.session.roomID,
        url: this.docsURL,
        token: this.session.token,
      });

      this.dispatcher.bootstrap(bootstrapState);

      return ws;
    });
  }

  //  main logic to obtain an active and auth'd connection
  private async conn(): Promise<WebSocketLikeConnection> {
    if (this.currentConn) {
      return this.currentConn;
    }

    if (this.pendingConn) {
      return this.pendingConn;
    }

    this.close();
    this.pendingConn = (async () => {
      let delayMs = 0;
      let maxDelayMs = 60 * 1000;

      while (true) {
        const jitteredDelay = (delayMs * (Math.random() + 1)) / 2;
        await delay(jitteredDelay);
        delayMs = Math.min(2 * delayMs + 100, maxDelayMs);

        try {
          let ws = await this.connectAndAuth();
          this.currentConn = ws;
          this.pendingConn = undefined;
          return ws;
        } catch (err) {
          console.error(
            'Connection to RoomService failed with',
            err,
            '\nRetrying...'
          );
        }
      }
    })();

    return this.pendingConn;
  }

  private async wsLoop() {
    while (true) {
      await this.conn();
      this.processSendQueue();
      await delay(1000);
    }
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

  serializeMsg(
    msgType: 'room:join',
    room: Prop<WebSocketJoinMessage, 'body'>
  ): string;
  serializeMsg(msgType: 'guest:authenticate', token: string): string;
  serializeMsg(
    msgType: 'doc:cmd',
    body: Prop<WebSocketDocCmdMessage, 'body'>
  ): string;
  serializeMsg(
    msgType: 'presence:cmd',
    body: Prop<WebSocketPresenceCmdMessage, 'body'>
  ): string;
  serializeMsg(
    msgType: Prop<WebSocketClientMessage, 'type'>,
    body: any
  ): string {
    const ts = this.timestamp();
    const msg: WebSocketClientMessage = {
      type: msgType,
      ts,
      ver: 0,
      body,
    };

    return JSON.stringify(msg);
  }

  private docCmdSendQueue: Array<string> = [];

  //  only most recent presence cmd per-key is kept
  private presenceCmdSendQueue: Map<string, string> = new Map();

  send(msgType: 'doc:cmd', body: Prop<WebSocketDocCmdMessage, 'body'>): void;
  send(
    msgType: 'presence:cmd',
    body: Prop<WebSocketPresenceCmdMessage, 'body'>
  ): void;
  send(msgType: Prop<WebSocketClientMessage, 'type'>, body: any): void {
    if (msgType == 'doc:cmd') {
      if (this.docCmdSendQueue.length >= MAX_UNSENT_DOC_CMDS) {
        throw 'RoomService send queue full';
      }
      const msg = this.serializeMsg(msgType, body);
      this.docCmdSendQueue.push(msg);
    }

    if (msgType == 'presence:cmd') {
      const msg = this.serializeMsg(msgType, body);
      let presenceBody = body as Prop<WebSocketPresenceCmdMessage, 'body'>;
      this.presenceCmdSendQueue.set(presenceBody.key, msg);
    }

    this.processSendQueue();
  }

  private processSendQueue() {
    if (!this.currentConn) {
      return;
    }

    try {
      while (this.presenceCmdSendQueue.size > 0) {
        const first = this.presenceCmdSendQueue.entries().next();
        if (first) {
          const [key, msg] = first.value;
          this.currentConn.send(msg);
          this.presenceCmdSendQueue.delete(key);
        }
      }

      while (this.docCmdSendQueue.length > 0) {
        const msg = this.docCmdSendQueue[0];
        this.currentConn.send(msg);
        this.docCmdSendQueue.splice(0, 1);
      }
    } catch (e) {
      console.error(e);
    }
  }

  private bind(
    msgType: 'room:rm_guest',
    callback: (body: Prop<WebSocketLeaveMessage, 'body'>) => void
  ): Cb;
  private bind(msgType: 'room:joined', callback: (body: string) => void): Cb;
  private bind(
    msgType: 'doc:fwd',
    callback: (body: Prop<WebSocketDocFwdMessage, 'body'>) => void
  ): Cb;
  private bind(
    msgType: 'presence:fwd',
    callback: (body: Prop<WebSocketPresenceFwdMessage, 'body'>) => void
  ): Cb;
  private bind(
    msgType: 'guest:authenticated',
    callback: (body: string) => void
  ): Cb;
  private bind(msgType: 'error', callback: (body: string) => void): Cb;
  private bind(
    msgType: Prop<WebSocketServerMessage, 'type'>,
    callback: Cb
  ): Cb {
    this.callbacks[msgType] = this.callbacks[msgType] || [];
    this.callbacks[msgType].push(callback);
    return callback;
  }

  private unbind(msgType: string, callback: Cb) {
    this.callbacks[msgType] = this.callbacks[msgType].filter(
      (c) => c !== callback
    );
  }

  private dispatch(msgType: string, body: any) {
    if (msgType == 'error') {
      console.error(body);
    }

    const stack = this.callbacks[msgType];
    if (stack) {
      for (let i = 0; i < stack.length; i++) {
        stack[i](body);
      }
    }

    if (FORWARDED_TYPES.includes(msgType)) {
      this.dispatcher.forwardCmd(msgType, body);
    }
  }

  private async once(msg: string) {
    let off: (args: any) => any;
    return Promise.race([
      new Promise((_, reject) =>
        setTimeout(() => reject('timeout'), WEBSOCKET_TIMEOUT)
      ),
      new Promise((resolve) => {
        off = this.bind(msg as any, (body) => {
          resolve(body);
        });
      }),
    ]).then(() => {
      if (off) this.unbind(msg, off);
    });
  }
}

export type ForwardedMessageBody =
  | Prop<WebSocketDocFwdMessage, 'body'>
  | Prop<WebSocketPresenceFwdMessage, 'body'>
  | Prop<WebSocketLeaveMessage, 'body'>;

export interface WebsocketDispatch {
  forwardCmd(type: string, body: ForwardedMessageBody): void;
  bootstrap(state: BootstrapState): void;
  startQueueingCmds(): void;
}

async function openWS(url: string): Promise<WebSocket> {
  return new Promise(function (resolve, reject) {
    var ws = new WebSocket(url);
    ws.onopen = function () {
      resolve(ws);
    };
    ws.onerror = function (err) {
      reject(err);
    };
  });
}

export interface SuperlumeSend {
  send(msgType: 'doc:cmd', body: Prop<WebSocketDocCmdMessage, 'body'>): void;
  send(
    msgType: 'presence:cmd',
    body: Prop<WebSocketPresenceCmdMessage, 'body'>
  ): void;
  send(msgType: Prop<WebSocketClientMessage, 'type'>, body: any): void;
}

export type WebSocketFactory = (url: string) => Promise<WebSocketTransport>;

export type WebSocketTransport = Pick<
  WebSocket,
  'send' | 'onclose' | 'onmessage' | 'onerror' | 'close'
>;

export type BootstrapFetch = (props: {
  url: string;
  token: string;
  roomID: string;
  docID: string;
}) => Promise<BootstrapState>;
