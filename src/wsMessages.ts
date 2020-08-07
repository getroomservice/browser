export interface WebSocketAuthenticateMessage {
  ver: number;
  type: 'guest:authenticate';
  body: string;
  ts: string;
}

export interface WebSocketAuthenticatedMessage {
  ver: number;
  type: 'guest:authenticated';
  body: string;
}

export interface WebSocketJoinMessage {
  ver: number;
  type: 'room:join';
  body: string;
  ts: string;
}

export interface WebSocketJoinedMessage {
  ver: number;
  type: 'room:joined';
  body: string;
}

export interface WebSocketCmdMessage {
  ver: number;
  type: 'doc:cmd';
  body: {
    room: string;
    args: string[];
  };
  ts: string;
}

export interface WebSocketFwdMessage {
  ver: number;
  type: 'doc:fwd';
  body: {
    from: string;
    room: string;
    args: string[];
  };
}

export interface WebSocketErorrMessage {
  ver: number;
  type: 'error';
  body: {
    request: string;
    message: string;
  };
}

// Messages coming from the server
export type WebSocketServerMessage =
  | WebSocketAuthenticatedMessage
  | WebSocketFwdMessage
  | WebSocketJoinedMessage
  | WebSocketErorrMessage;

// Messages coming from the client
export type WebSocketClientMessage =
  | WebSocketAuthenticateMessage
  | WebSocketCmdMessage
  | WebSocketJoinMessage;
