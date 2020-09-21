import SuperlumeWebSocket from './ws';
import { Tombstone, ObjectClient, DocumentCheckpoint } from './types';
import ReverseTree from './ReverseTree';
import { unescape, escape } from './escape';
import { unescapeID } from './util';
import invariant from 'tiny-invariant';

export class ListClient implements ObjectClient {
  private roomID: string;
  private docID: string;
  private ws: SuperlumeWebSocket;
  private rt: ReverseTree;

  // Map indexes to item ids
  private itemIDs: Array<string> = [];

  id: string;

  constructor(
    checkpoint: DocumentCheckpoint,
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

    invariant(
      checkpoint.lists[listID],
      `Unknown listid '${listID}' in checkpoint.`
    );

    this.rt.import(checkpoint, listID);
    const list = checkpoint.lists[listID];
    const ids = list.ids || [];
    for (let i = 0; i < ids.length; i++) {
      const val = checkpoint.lists[listID].values[i];
      if (typeof val === 'object' && val['t'] === '') {
        continue; // skip tombstones
      }
      this.itemIDs.push(unescapeID(checkpoint, ids[i]));
    }
  }

  private sendCmd(cmd: string[]) {
    this.ws.send('doc:cmd', {
      room: this.roomID,
      args: cmd,
    });
  }

  private clone(): ListClient {
    const cl = Object.assign(
      Object.create(Object.getPrototypeOf(this)),
      this
    ) as ListClient;
    return cl;
  }

  dangerouslyUpdateClientDirectly(cmd: string[]): ListClient {
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
        this.itemIDs.splice(
          this.itemIDs.findIndex(f => f === insAfter) + 1,
          0,
          insItemID
        );
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
        this.itemIDs.splice(
          this.itemIDs.findIndex(f => f === delItemID),
          1
        );
        break;
      default:
        throw new Error('Unexpected command keyword: ' + keyword);
    }
    return this.clone();
  }

  get(index: number) {
    let itemID = this.itemIDs[index];
    if (!itemID) return undefined;

    const val = this.rt.get(itemID);
    if (!val) return undefined;
    if (typeof val === 'object') {
      if ((val as Tombstone).t === '') {
        return undefined;
      }
      throw new Error('Unimplemented references');
    }

    return unescape(val);
  }

  set(index: number, val: string | number | object): ListClient {
    let itemID = this.itemIDs[index];
    if (!itemID) {
      throw new Error(
        `Index '${index}' doesn't already exist. Try .push() or .insertAfter() instead.`
      );
    }
    const escaped = escape(val);

    // Local
    this.rt.put(itemID, escaped);

    // Remote
    this.sendCmd(['lput', this.docID, this.id, itemID, escaped]);

    return this.clone();
  }

  delete(index: number): ListClient {
    let itemID = this.itemIDs[index];
    if (!itemID) {
      console.warn('Unknown index: ', index, this.itemIDs);
      return this.clone() as ListClient;
    }

    // Local
    this.rt.delete(itemID);
    this.itemIDs.splice(index, 1);

    // Remote
    this.sendCmd(['ldel', this.docID, this.id, itemID]);

    return this.clone();
  }

  insertAfter(index: number, val: string | number | object): ListClient {
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

    return this.clone();
  }

  push(val: string | number | object): ListClient {
    let lastID = this.rt.lastID();
    const escaped = escape(val);

    // Local
    const itemID = this.rt.insert(lastID, escaped);
    this.itemIDs.push(itemID);

    // Remote
    this.sendCmd(['lins', this.docID, this.id, lastID, itemID, escaped]);

    return this.clone();
  }

  toArray(): any[] {
    return this.rt.toArray().map(m => unescape(m));
  }
}
