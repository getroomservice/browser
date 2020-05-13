import RoomClient from './room-client';
import { Obj } from './types';

export default class RoomServiceClient {
  private readonly _authorizationUrl: string;
  private readonly _headers?: Headers;

  private readonly _roomPool: { [key: string]: RoomClient } = {};

  constructor(parameters: { authUrl: string; headers?: Headers }) {
    this._authorizationUrl = parameters.authUrl;
    this._headers = parameters.headers;
  }

  room<T extends Obj>(roomReference: string, defaultDoc?: T) {
    if (this._roomPool[roomReference]) {
      return this._roomPool[roomReference];
    }

    const room = new RoomClient({
      authUrl: this._authorizationUrl,
      roomReference,
      defaultDoc,
      headers: this._headers,
    });

    this._roomPool[roomReference] = room;
    return room;
  }
}
