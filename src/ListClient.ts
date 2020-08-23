import SuperlumeWebSocket from './ws';
import { Tombstone } from './types';
import ReverseTree from './ReverseTree';
import { unescape, escape } from './escape';
import { ObjectClient } from './ObjectClient';

export class ListClient implements ObjectClient {
  id: string;
  private roomID: string;
  private docID: string;
  private ws: SuperlumeWebSocket;
  private rt: ReverseTree;

  // Map indexes to item ids
  private itemIDs: Array<string> = [];

  constructor(
    roomID: string,
    docID: string,
    listID: string,
    ws: SuperlumeWebSocket,
    actor: string
  ) {
    this.roomID = roomID;
    this.docID = docID;
    this.id = listID;
    this.ws = ws;
    this.rt = new ReverseTree(actor);
  }

  private sendCmd(cmd: string[]) {
    this.ws.send('doc:cmd', {
      room: this.roomID,
      args: cmd,
    });
  }

  update(cmd: string[]) {
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
      case 'lins':
        const insAfter = cmd[3];
        const insItemID = cmd[4];
        const insValue = cmd[5];
        this.rt.insert(insAfter, insValue, insItemID);
        break;
      case 'lput':
        const putItemID = cmd[3];
        const putVal = cmd[4];
        this.rt.put(putItemID, putVal);
        break;
      case 'ldel':
        const delItemID = cmd[3];
        this.rt.delete(delItemID);
        break;
      default:
        throw new Error('Unexpected command keyword: ' + keyword);
    }
  }

  get(index: number) {
    let itemID = this.itemIDs[index];
    if (!itemID) return undefined;

    const val = this.rt.get(itemID);
    if (typeof val === 'object') {
      if ((val as Tombstone).t === '') {
        return undefined;
      }
      throw new Error('Unimplemented references');
    }

    return unescape(val);
  }

  set(index: number, val: string | number) {
    let itemID = this.itemIDs[index];
    if (!itemID) {
      throw new Error('Unexpected');
    }
    const escaped = escape(val);

    // Local
    this.rt.put(itemID, escaped);

    // Remote
    this.sendCmd(['lput', this.docID, this.id, itemID, escaped]);
  }

  delete(index: number) {
    let itemID = this.itemIDs[index];
    if (!itemID) return;

    // Local
    this.rt.delete(itemID);

    // Remote
    this.sendCmd(['ldel', this.docID, this.id, itemID]);
  }

  insertAfter(index: number, val: string | number) {
    let afterID = this.itemIDs[index];
    if (!afterID) {
      throw new RangeError(`List '${this.id}' has no index: '${index}'`);
    }
    const escaped = escape(val);

    // Local
    const itemID = this.rt.insert(afterID, escaped);
    this.itemIDs.splice(index, 0, itemID);

    // Remote
    this.sendCmd(['lins', this.docID, this.id, afterID, itemID, escaped]);
  }

  push(val: string | number) {
    let lastID = 'root';
    if (this.itemIDs.length !== 0) {
      lastID = this.itemIDs[this.itemIDs.length - 1];
    }
    const escaped = escape(val);

    // Local
    const itemID = this.rt.insert(lastID, escaped);
    this.itemIDs.push(itemID);

    // Remote
    this.sendCmd(['lins', this.docID, this.id, lastID, itemID, escaped]);
  }

  toArray() {
    return this.rt.toArray();
  }
}
