import { ReverseTree } from '@roomservice/core/dist/ReverseTree';

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
  vs: string;
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

type RequireSome<T, K extends keyof T> = Partial<Omit<T, K>> &
  Required<Pick<T, K>>;

export type WebSocketLikeConnection = RequireSome<
  WebSocket,
  'send' | 'onmessage' | 'close'
>;

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
  dangerouslyUpdateClientDirectly(msg: any): ObjectClient;
}

export interface Resource {
  id: string;
  object: string;
  reference: string;
  permission: 'read_write' | 'join';
}

export interface AuthResponse {
  token: string;
  user: string;
  resources: Resource[];
}

export type AuthFunction<T extends object> = (params: {
  room: string;
  ctx: T;
}) => Promise<AuthResponse>;
export type AuthStrategy<T extends object> = string | AuthFunction<T>;
