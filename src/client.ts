import RoomClient from "./room-client";
import { Obj } from "./types";

export default class RoomServiceClient {
  private readonly _authorizationUrl: string;
  private readonly _headers?: Headers;

  constructor(parameters: { authUrl: string; headers?: Headers }) {
    this._authorizationUrl = parameters.authUrl;
    this._headers = parameters.headers;
  }

  room<T extends Obj>(roomReference: string, defaultDoc?: T) {
    return new RoomClient({
      authUrl: this._authorizationUrl,
      roomReference,
      defaultDoc,
      headers: this._headers
    });
  }
}
