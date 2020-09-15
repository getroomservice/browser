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

export interface WebSocketDocCmdMessage {
  ver: number;
  type: 'doc:cmd';
  body: {
    room: string;
    args: string[];
  };
  ts: string;
}

export interface WebSocketDocFwdMessage {
  ver: number;
  type: 'doc:fwd';
  body: {
    from: string; // a guest id
    room: string;
    vs: string;
    args: string[];
  };
}

export interface WebSocketPresenceCmdMessage {
  ver: number;
  type: 'presence:cmd';
  body: {
    room: string;
    key: string;
    value: string;
    expAt: number; // unix timestamp
  };
  ts: string;
}

export interface WebSocketPresenceFwdMessage {
  ver: number;
  type: 'presence:fwd';
  body: {
    from: string; // a guest id
    room: string;
    key: string;
    value: string;
    expAt: number; // unix timestamp
  };
}

export interface WebSocketErrorMessage {
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
  | WebSocketDocFwdMessage
  | WebSocketPresenceFwdMessage
  | WebSocketJoinedMessage
  | WebSocketErrorMessage;

// Messages coming from the client
export type WebSocketClientMessage =
  | WebSocketAuthenticateMessage
  | WebSocketDocCmdMessage
  | WebSocketPresenceCmdMessage
  | WebSocketJoinMessage;
