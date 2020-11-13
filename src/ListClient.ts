import SuperlumeWebSocket from './ws';
import { ObjectClient, DocumentCheckpoint } from './types';
import invariant from 'tiny-invariant';
import { LocalBus } from './localbus';
import { ListInterpreter, ListMeta, ListStore } from '@roomservice/core';

export class InnerListClient<T extends any> implements ObjectClient {
  private roomID: string;
  private ws: SuperlumeWebSocket;
  private bus: LocalBus<any>;
  private actor: string;
  private store: ListStore;
  private meta: ListMeta;

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
    this.ws = props.ws;
    this.bus = props.bus;
    this.actor = props.actor;
    this.id = props.listID;

    const { meta, store } = ListInterpreter.newList(
      props.docID,
      props.listID,
      props.actor
    );
    this.meta = meta;
    this.store = store;

    invariant(
      props.checkpoint.lists[props.listID],
      `Unknown listid '${props.listID}' in checkpoint.`
    );

    ListInterpreter.importFromRawCheckpoint(
      this.store,
      props.checkpoint,
      this.meta.listID
    );
  }

  private sendCmd(cmd: string[]) {
    this.ws.send('doc:cmd', {
      room: this.roomID,
      args: cmd,
    });

    this.bus.publish({
      args: cmd,
      from: this.actor,
    });
  }

  private clone(): InnerListClient<T> {
    const cl = Object.assign(
      Object.create(Object.getPrototypeOf(this)),
      this
    ) as InnerListClient<T>;
    return cl;
  }

  dangerouslyUpdateClientDirectly(cmd: string[]): InnerListClient<T> {
    ListInterpreter.validateCommand(this.meta, cmd);
    ListInterpreter.applyCommand(this.store, cmd);
    return this.clone();
  }

  get(index: number): T | undefined {
    return ListInterpreter.get<T>(this.store, index);
  }

  set(index: number, val: T): InnerListClient<T> {
    const cmd = ListInterpreter.runSet(this.store, this.meta, index, val);

    // Remote
    this.sendCmd(cmd);

    return this.clone();
  }

  delete(index: number): InnerListClient<T> {
    const cmd = ListInterpreter.runDelete(this.store, this.meta, index);
    if (!cmd) {
      return this.clone();
    }

    // Remote
    this.sendCmd(cmd);

    return this.clone();
  }

  insertAfter(index: number, val: T): InnerListClient<T> {
    return this.insertAt(index + 1, val);
  }

  insertAt(index: number, val: T): InnerListClient<T> {
    const cmd = ListInterpreter.runInsertAt(this.store, this.meta, index, val);

    // Remote
    this.sendCmd(cmd);

    return this.clone();
  }

  push(...args: T[]): InnerListClient<T> {
    const cmds = ListInterpreter.runPush(this.store, this.meta, ...args);

    for (let cmd of cmds) {
      this.sendCmd(cmd);
    }

    return this as InnerListClient<T>;
  }

  map<T extends any>(fn: (val: T, index: number, key: string) => T[]): T[] {
    return ListInterpreter.map(this.store, fn);
  }

  toArray(): T[] {
    return ListInterpreter.toArray(this.store);
  }
}
