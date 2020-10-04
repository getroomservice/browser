import { WS_URL, DOCS_URL } from './constants';
import { createRoom, RoomClient } from './RoomClient';
import { WebSocketLikeConnection, AuthStrategy } from 'types';

export interface RoomServiceParameters {
  auth: AuthStrategy;
}

export class RoomService {
  private auth: AuthStrategy;
  private roomClients: { [key: string]: RoomClient } = {};

  constructor(params: RoomServiceParameters) {
    this.auth = params.auth;
  }

  async room(name: string) {
    if (this.roomClients[name]) {
      return this.roomClients[name];
    }

    const ws = new WebSocket(WS_URL);
    const client = await createRoom(
      ws as WebSocketLikeConnection,
      DOCS_URL,
      this.auth,
      name,
      'default'
    );
    this.roomClients[name] = client;

    return client;
  }
}
