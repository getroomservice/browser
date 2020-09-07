import { WS_URL, DOCS_URL } from './constants';
import { createRoom } from './RoomClient';
import { WebSocketLikeConnection, AuthStrategy } from 'types';

interface RoomServiceParameters {
  auth: AuthStrategy;
}

export class RoomService {
  private auth: AuthStrategy;

  constructor(params: RoomServiceParameters) {
    this.auth = params.auth;
  }

  async room(name: string) {
    const ws = new WebSocket(WS_URL);
    return createRoom(
      ws as WebSocketLikeConnection,
      DOCS_URL,
      this.auth,
      name,
      'default'
    );
  }
}
