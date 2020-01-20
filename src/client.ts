import RoomClient from "./room-client";
import { KeyValueObject } from "./types";

export default class RoomServiceClient {
  private readonly _authorizationUrl: string;

  constructor(parameters: { authUrl: string }) {
    this._authorizationUrl = parameters.authUrl;
  }

  room<T extends KeyValueObject>(roomReference: string) {
    return new RoomClient<T>({
      authUrl: this._authorizationUrl,
      reference: roomReference
    });
  }
}
