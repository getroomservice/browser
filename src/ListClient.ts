import SuperlumeWebSocket from './ws';
import { Tombstone, ObjectClient, DocumentCheckpoint } from './types';
import ReverseTree from './ReverseTree';
import { unescape, escape } from './escape';
import { unescapeID } from './util';
import invariant from 'tiny-invariant';
import { LocalBus } from './localbus';
import { errNoInfiniteLoop } from './errs';

export class InnerListClient<T extends any> implements ObjectClient {
  private roomID: string;
  private docID: string;
  private ws: SuperlumeWebSocket;
  private rt: ReverseTree;
  private bus: LocalBus<any>;
  private actor: string;

  // If true, this client will throw an error if it's trying to
  // mutate itself to prevent an infinite loop.
  private throwsOnMutate: boolean = false;

  // Map indexes to item ids
  private itemIDs: Array<string> = [];

  id: string;

  constructor(props: {
    checkpoint: DocumentCheckpoint;
    roomID: string;
    docID: string;
    listID: string;
    ws: SuperlumeWebSocket;
    actor: string;
    bus: LocalBus<{ args: string[]; from: string }>;
  }) {
    this.roomID = props.roomID;
    this.docID = props.docID;
    this.id = props.listID;
    this.ws = props.ws;
    this.rt = new ReverseTree(props.actor);
    this.bus = props.bus;
    this.actor = props.actor;

    invariant(
      props.checkpoint.lists[props.listID],
      `Unknown listid '${props.listID}' in checkpoint.`
    );

    this.rt.import(props.checkpoint, props.listID);
    const list = props.checkpoint.lists[props.listID];
    const ids = list.ids || [];
    for (let i = 0; i < ids.length; i++) {
      const val = props.checkpoint.lists[props.listID].values[i];
      if (typeof val === 'object' && val['t'] === '') {
        continue; // skip tombstones
      }
      this.itemIDs.push(unescapeID(props.checkpoint, ids[i]));
    }
  }

  private sendCmd(cmd: string[]) {
    if (this.throwsOnMutate) {
      throw errNoInfiniteLoop();
    }

    this.ws.send('doc:cmd', {
      room: this.roomID,
      args: cmd,
    });

    this.throwsOnMutate = true;
    this.bus.publish({
      args: cmd,
      from: this.actor,
    });
    this.throwsOnMutate = false;
  }

  private clone(): InnerListClient<T> {
    const cl = Object.assign(
      Object.create(Object.getPrototypeOf(this)),
      this
    ) as InnerListClient<T>;
    return cl;
  }

  dangerouslyUpdateClientDirectly(cmd: string[]): InnerListClient<T> {
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

  get(index: number): T | undefined {
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

    return unescape(val) as T;
  }

  set(index: number, val: T): InnerListClient<T> {
    let itemID = this.itemIDs[index];
    if (!itemID) {
      throw new Error(
        `Index '${index}' doesn't already exist. Try .push() or .insertAfter() instead.`
      );
    }
    const escaped = escape(val as any);

    // Local
    this.rt.put(itemID, escaped);

    // Remote
    this.sendCmd(['lput', this.docID, this.id, itemID, escaped]);

    return this.clone();
  }

  delete(index: number): InnerListClient<T> {
    if (this.itemIDs.length === 0) {
      return this.clone();
    }
    let itemID = this.itemIDs[index];
    if (!itemID) {
      console.warn('Unknown index: ', index, this.itemIDs);
      return this.clone() as InnerListClient<T>;
    }

    // Local
    this.rt.delete(itemID);
    this.itemIDs.splice(index, 1);

    // Remote
    this.sendCmd(['ldel', this.docID, this.id, itemID]);

    return this.clone();
  }

  insertAfter(index: number, val: T): InnerListClient<T> {
    return this.insertAt(index + 1, val);
  }

  insertAt(index: number, val: T): InnerListClient<T> {
    if (index < 0) {
      throw 'negative indices unsupported';
    }
    let afterID: string;
    if (index == 0) {
      afterID = 'root';
    } else {
      afterID = this.itemIDs[index - 1];
    }

    if (!afterID) {
      throw new RangeError(`List '${this.id}' has no index: '${index}'`);
    }
    const escaped = escape(val as any);

    // Local
    const itemID = this.rt.insert(afterID, escaped);
    this.itemIDs.splice(index, 0, itemID);

    // Remote
    this.sendCmd(['lins', this.docID, this.id, afterID, itemID, escaped]);

    return this.clone();
  }

  private pushOne(val: T): InnerListClient<T> {
    let lastID = this.rt.lastID();
    const escaped = escape(val as any);

    // Local
    const itemID = this.rt.insert(lastID, escaped);
    this.itemIDs.push(itemID);

    // Remote
    this.sendCmd(['lins', this.docID, this.id, lastID, itemID, escaped]);

    return this.clone();
  }

  push(...args: T[]): InnerListClient<T> {
    let self;
    for (let arg of args) {
      self = this.pushOne(arg);
    }
    return self as InnerListClient<T>;
  }

  map<T extends any>(fn: (val: T, index: number, key: string) => T[]): T[] {
    return this.rt
      .preOrderTraverse()
      .map((idValue, i) =>
        fn(unescape(idValue.value) as T, i, idValue.id)
      ) as Array<T>;
  }

  toArray(): T[] {
    return this.rt.toArray().map(m => unescape(m)) as any[];
  }
}
