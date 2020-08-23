import { WS_URL, DOCS_URL } from './constants';
import { createRoom } from './RoomClient';
import { WebSocketLikeConnection } from 'types';

interface RoomServiceParameters {
  authURL: string;
}

export class RoomService {
  private authURL: string;

  constructor(params: RoomServiceParameters) {
    this.authURL = params.authURL;
  }

  async room(name: string) {
    const ws = new WebSocket(WS_URL);
    return createRoom(
      ws as WebSocketLikeConnection,
      DOCS_URL,
      this.authURL,
      name,
      'default'
    );
  }
}
