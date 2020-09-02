import ReverseTree from './ReverseTree';

export interface Ref {
  type: 'map' | 'list';
  ref: string;
}

export interface Tombstone {
  t: '';
}

export type NodeValue = string | Ref | Tombstone;

export interface ListCheckpoint {
  afters: string[];
  ids: string[];
  values: string[];
}

export type MapCheckpoint = { [key: string]: NodeValue };

// A previous state of the document that came from superlume
export interface DocumentCheckpoint {
  id: string;
  index: number;
  api_version: number;
  actors: { [key: number]: string };
  lists: { [key: string]: ListCheckpoint };
  maps: { [key: string]: MapCheckpoint };
}

interface PresenceObject<T> {
  expAt: Date;
  value: T;
}

export type PresenceCheckpoint<T> = { [key: string]: PresenceObject<T> };

export interface Message<T> {
  ref: string;
  type: string;
  version: number;
  body: T;
}

// A response that the server has forwarded
// us that originated in another client
export interface FwdResponse {
  version: number;
  type: 'fwd';
  body: {
    from: string;
    room: string;
    args: string[];
  };
}

export interface ErrorResponse {
  version: number;
  type: 'error';
  body: {
    request: string;
    message: string;
  };
}

export type Response = ErrorResponse | FwdResponse;

export interface Document {
  lists: { [key: string]: ReverseTree };
  maps: { [key: string]: { [key: string]: any } };
  localIndex: number;
}

export interface WebSocketLikeConnection {
  onmessage: (ev: MessageEvent) => any;
  // onopen: (ev: MessageEvent) => any;
  send: (data: any) => any;
}

export interface DocumentContext {
  lists: { [key: string]: ReverseTree };
  maps: { [key: string]: { [key: string]: any } };
  localIndex: number;
  actor: string;
  id: string;
}

// Utility type to get the type of property
export type Prop<V, K extends keyof V> = V[K];

export interface ObjectClient {
  id: string;
  update(msg: any): ObjectClient;
}
