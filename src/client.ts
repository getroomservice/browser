import RoomClient from "./room-client";
import { Obj } from "./types";

const RoomPool: { [key: string]: RoomClient } = {};

export default class RoomServiceClient {
  private readonly _authorizationUrl: string;
  private readonly _headers?: Headers;

  constructor(parameters: { authUrl: string; headers?: Headers }) {
    this._authorizationUrl = parameters.authUrl;
    this._headers = parameters.headers;
  }

  room<T extends Obj>(roomReference: string, defaultDoc?: T) {
    if (RoomPool[roomReference]) {
      return RoomPool[roomReference];
    }

    const room = new RoomClient({
      authUrl: this._authorizationUrl,
      roomReference,
      defaultDoc,
      headers: this._headers
    });

    RoomPool[roomReference] = room;
    return room;
  }
}
