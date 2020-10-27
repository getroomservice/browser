import { ObjectClient } from './types';
import { SuperlumeSend } from './ws';
import { LocalBus } from './localbus';
import {
  MapMeta,
  MapStore,
  MapInterpreter,
  DocumentCheckpoint,
} from '@roomservice/core';

export type MapObject = { [key: string]: any };

export class InnerMapClient<T extends MapObject> implements ObjectClient {
  private roomID: string;
  private ws: SuperlumeSend;

  private meta: MapMeta;
  private store: MapStore<any>;
  private bus: LocalBus<any>;
  private actor: string;

  constructor(props: {
    checkpoint: DocumentCheckpoint;
    roomID: string;
    docID: string;
    mapID: string;
    actor: string;
    ws: SuperlumeSend;
    bus: LocalBus<{ from: string; args: string[] }>;
  }) {
    this.roomID = props.roomID;
    this.ws = props.ws;
    this.bus = props.bus;
    this.actor = props.actor;

    const { store, meta } = MapInterpreter.newMap<T>(props.docID, props.mapID);
    this.store = store;
    this.meta = meta;

    //TODO: defer initial bootstrap?
    MapInterpreter.importFromRawCheckpoint(
      this.store,
      props.checkpoint,
      this.meta.mapID
    );
  }

  public bootstrap(checkpoint: DocumentCheckpoint) {
    MapInterpreter.importFromRawCheckpoint(
      this.store,
      checkpoint,
      this.meta.mapID
    );
  }

  public get id(): string {
    return this.meta.mapID;
  }

  private sendCmd(cmd: string[]) {
    this.ws.send('doc:cmd', {
      room: this.roomID,
      args: cmd,
    });

    this.bus.publish({
      from: this.actor,
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
    MapInterpreter.validateCommand(this.meta, cmd);
    MapInterpreter.applyCommand(this.store, cmd);
    return this.clone();
  }

  get keys() {
    return Object.keys(this.store);
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.store[key as any] as T[K];
  }

  set<K extends keyof T>(key: K, value: T[K]): InnerMapClient<T> {
    const cmd = MapInterpreter.runSet(this.store, this.meta, key as any, value);

    // Remote
    this.sendCmd(cmd);

    return this.clone();
  }

  toObject(): T {
    const obj = {} as any;
    for (let key of this.keys) {
      obj[key] = this.get(key);
    }
    return obj;
  }

  delete<K extends keyof T>(key: K): InnerMapClient<T> {
    const cmd = MapInterpreter.runDelete(this.store, this.meta, key as any);

    // remote
    this.sendCmd(cmd);

    return this.clone();
  }
}
