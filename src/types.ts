import ReverseTree from './ReverseTree';

export type ListCheckpoint = Array<{
  after: string;
  value: string;
  id: string;
}>;

// A previous state of the document that came from superlume
export interface DocumentCheckpoint {
  id: string;
  index: number;
  api_version: number;
  lists: { [key: string]: ListCheckpoint };
  maps: { [key: string]: any };
}

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
  send: (data: any) => any;
}

export interface DocumentContext {
  lists: { [key: string]: ReverseTree };
  maps: { [key: string]: { [key: string]: any } };
  localIndex: number;
  actor: string;
  id: string;
}
