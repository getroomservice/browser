import { ObjectClient, MapCheckpoint } from './types';
import SuperlumeWebSocket from './ws';
import { escape, unescape } from './escape';

export class InnerMapClient<T extends any> implements ObjectClient {
  private roomID: string;
  private docID: string;
  private ws: SuperlumeWebSocket;
  private store: { [key: string]: number | string | object | T };

  id: string;

  constructor(props: {
    checkpoint: MapCheckpoint;
    roomID: string;
    docID: string;
    mapID: string;
    ws: SuperlumeWebSocket;
  }) {
    this.roomID = props.roomID;
    this.docID = props.docID;
    this.id = props.mapID;
    this.ws = props.ws;
    this.store = {};

    // import
    for (let k in props.checkpoint) {
      const val = props.checkpoint[k];
      if (typeof val === 'string') {
        this.store[k] = unescape(val);
      }
    }
  }

  private sendCmd(cmd: string[]) {
    this.ws.send('doc:cmd', {
      room: this.roomID,
      args: cmd,
    });
  }

  private clone(): InnerMapClient<T> {
    return Object.assign(
      Object.create(Object.getPrototypeOf(this)),
      this
    ) as InnerMapClient<T>;
  }

  dangerouslyUpdateClientDirectly(cmd: string[]): InnerMapClient<T> {
    if (cmd.length < 3) {
      throw new Error('Unexpected command: ' + cmd);
    }
    const keyword = cmd[0];
    const docID = cmd[1];
    const id = cmd[2];

    if (docID !== this.docID || id !== this.id) {
      throw new Error('Command unexpectedly routed to the wrong client');
    }

    switch (keyword) {
      case 'mput':
        if (cmd.length !== 5) {
          console.error('Malformed command ', cmd);
          break;
        }
        const putKey = cmd[3];
        const putVal = cmd[4];
        this.store[putKey] = unescape(putVal);
        break;
      case 'mdel':
        if (cmd.length !== 4) {
          console.error('Malformed command ', cmd);
          break;
        }
        const delKey = cmd[3];
        delete this.store[delKey];
        break;
      default:
        throw new Error('Unexpected command keyword: ' + keyword);
    }

    return this.clone();
  }

  get keys() {
    return Object.keys(this.store);
  }

  get(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: T): InnerMapClient<T> {
    const escaped = escape(value as any);

    // Local
    this.store[key] = value;

    // Remote
    this.sendCmd(['mput', this.docID, this.id, key, escaped]);

    return this.clone();
  }

  toObject(): { [key: string]: T } {
    const obj = {} as { [key: string]: T };
    for (let key of this.keys) {
      obj[key] = this.get(key);
    }
    return obj;
  }

  delete(key: string): InnerMapClient<T> {
    // local
    delete this.store[key];

    // remote
    this.sendCmd(['mdel', this.docID, this.id, key]);

    return this.clone();
  }
}
