import { ObjectClient, MapCheckpoint } from './types';
import SuperlumeWebSocket from './ws';
import { escape } from './escape';

export class MapClient implements ObjectClient {
  private roomID: string;
  private docID: string;
  private ws: SuperlumeWebSocket;
  private store: { [key: string]: number | string | object };

  id: string;

  constructor(
    checkpoint: MapCheckpoint,
    roomID: string,
    docID: string,
    mapID: string,
    ws: SuperlumeWebSocket
  ) {
    this.roomID = roomID;
    this.docID = docID;
    this.id = mapID;
    this.ws = ws;
    this.store = {};

    // import
    for (let k in checkpoint) {
      const val = checkpoint[k];
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

  private clone(): MapClient {
    return Object.assign(
      Object.create(Object.getPrototypeOf(this)),
      this
    ) as MapClient;
  }

  dangerouslyUpdateClientDirectly(cmd: string[]): MapClient {
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

  get(key: string) {
    return this.store[key];
  }

  set(key: string, value: string | number | object): MapClient {
    const escaped = escape(value);

    // Local
    this.store[key] = value;

    // Remote
    this.sendCmd(['mput', this.docID, this.id, key, escaped]);

    return this.clone();
  }

  delete(key: string): MapClient {
    // local
    delete this.store[key];

    // remote
    this.sendCmd(['mdel', this.docID, this.id, key]);

    return this.clone();
  }
}
