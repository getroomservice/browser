import RoomClient from "./room-client";
import { Obj } from "./types";

export default class RoomServiceClient {
  private readonly _authorizationUrl: string;

  constructor(parameters: { authUrl: string }) {
    this._authorizationUrl = parameters.authUrl;
  }

  room<T extends Obj>(roomReference: string, defaultDoc?: T) {
    return new RoomClient({
      authUrl: this._authorizationUrl,
      roomReference,
      defaultDoc
    });
  }
}
