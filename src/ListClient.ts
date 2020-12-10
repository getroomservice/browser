import { SuperlumeSend } from './ws';
import { ObjectClient, DocumentCheckpoint } from './types';
import invariant from 'tiny-invariant';
import { LocalBus } from './localbus';
import { ListInterpreter, ListMeta, ListStore } from '@roomservice/core';
import { BootstrapState } from 'remote';

export type ListObject = Array<any>;

export class InnerListClient<T extends ListObject> implements ObjectClient {
  private ws: SuperlumeSend;
  private bus: LocalBus<any>;
  private actor: string;
  private store: ListStore;
  private meta: ListMeta;

  id: string;

  constructor(props: {
    checkpoint: DocumentCheckpoint;
    docID: string;
    listID: string;
    ws: SuperlumeSend;
    actor: string;
    bus: LocalBus<{ args: string[]; from: string }>;
  }) {
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
      this.actor,
      props.checkpoint,
      this.meta.listID
    );
  }

  bootstrap(actor: string, checkpoint: BootstrapState) {
    this.actor = actor;
    ListInterpreter.importFromRawCheckpoint(
      this.store,
      this.actor,
      checkpoint.document,
      this.meta.listID
    );
  }

  private sendCmd(cmd: string[]) {
    this.ws.send('doc:cmd', {
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

  get<K extends number>(index: K): T[K] | undefined {
    return ListInterpreter.get<T>(this.store, index as any);
  }

  set<K extends number>(index: K, val: T[K]): InnerListClient<T> {
    const cmd = ListInterpreter.runSet(
      this.store,
      this.meta,
      index as any,
      val
    );

    // Remote
    this.sendCmd(cmd);

    return this.clone();
  }

  delete<K extends number>(index: K): InnerListClient<T> {
    const cmd = ListInterpreter.runDelete(this.store, this.meta, index as any);
    if (!cmd) {
      return this.clone();
    }

    // Remote
    this.sendCmd(cmd);

    return this.clone();
  }

  insertAfter<K extends number>(index: K, val: T[K]): InnerListClient<T> {
    return this.insertAt((index as number) + 1, val);
  }

  insertAt<K extends number>(index: K, val: T[K]): InnerListClient<T> {
    const cmd = ListInterpreter.runInsertAt(
      this.store,
      this.meta,
      index as number,
      val
    );

    // Remote
    this.sendCmd(cmd);

    return this.clone();
  }

  push<K extends number>(...args: Array<T[K]>): InnerListClient<T> {
    const cmds = ListInterpreter.runPush(this.store, this.meta, ...args);

    for (let cmd of cmds) {
      this.sendCmd(cmd);
    }

    return this as InnerListClient<T>;
  }

  map<K extends number>(
    fn: (val: T[K], index: number, key: string) => Array<T[number]>
  ): Array<T[K]> {
    return ListInterpreter.map(this.store, fn);
  }

  toArray(): T[number][] {
    return ListInterpreter.toArray<T[number]>(this.store);
  }
}
