import DocClient from './doc-client';
import PresenceClient, { PresenceMeta } from './presence-client';
import { Obj } from './types';
import authorize from './authorize';
import { throttle } from 'lodash';

interface RoomClientParameters {
  authUrl: string;
  roomReference: string;
  headers?: Headers;
  defaultDoc?: Obj;
}

export default class RoomClient {
  private readonly _docClient: DocClient<Obj>;
  private readonly _presenceClient: PresenceClient;
  private readonly _authorizationUrl: string;
  private readonly _roomReference: string;
  private readonly _headers?: Headers;

  constructor(parameters: RoomClientParameters) {
    this._docClient = new DocClient(parameters);
    this._presenceClient = new PresenceClient(parameters);
    this._authorizationUrl = parameters.authUrl;
    this._roomReference = parameters.roomReference;
    this._headers = parameters.headers;
  }

  // @ts-ignore used for testing locally
  private set _socketURL(url: string) {
    this._docClient._socketURL = url;
    this._presenceClient._socketURL = url;
  }

  private _init = throttle(
    async () => {
      let room;
      let session;
      try {
        const params = await authorize(
          this._authorizationUrl,
          this._roomReference,
          this._headers
        );
        room = params.room;
        session = params.session;
      } catch (err) {
        console.error(
          "Room Service can't access the auth endpoint. More details: https://err.sh/getroomservice/browser/cant-access-auth-endpoint"
        );
        console.warn(err);
      }

      // We're on the server, so we shouldn't init, because we don't need
      // to connect to the clients.
      if (typeof window === 'undefined') {
        // This would signal that the server side can't access the auth endpoint
        if (!room) {
          throw new Error(
            "Room Service can't access the auth endpoint on the server. More details: https://err.sh/getroomservice/browser/server-side-no-network"
          );
        }

        return { doc: room?.state };
      }

      // Presence client
      this._presenceClient.init({
        room,
        session,
      });

      // Doc client
      const { doc } = await this._docClient.init({
        room,
        session,
      });

      return { doc };
    },
    100,
    {
      leading: true,
    }
  );

  // Start the client, sync from cache, and connect.
  // This function is throttled at 100ms, since it's only
  // supposed to be called once, but
  async init(): Promise<Obj> {
    return this._init();
  }

  // Manually restore from cache
  async restore() {
    const doc = await this._docClient.restore();
    return doc;
  }

  // Connection
  onConnect(callback: () => void) {
    this._docClient.onConnect(callback);
  }
  onDisconnect(callback: () => void) {
    this._docClient.onDisconnect(callback);
  }
  disconnect() {
    this._docClient.disconnect();
  }

  // Documents
  async setDoc<D extends Obj>(
    change: (prevDoc: D) => void
  ): Promise<Readonly<D>> {
    return this._docClient.setDoc(change);
  }
  onSetDoc<D extends Obj>(callback: (newDoc: D) => void): void {
    this._docClient.onSetDoc(callback);
  }

  // Presence
  setPresence<P extends Obj>(key: string, value: P) {
    this._presenceClient.setPresence(key, value);
  }
  onSetPresence<P extends Obj>(
    callback: (meta: PresenceMeta, value: P) => void
  ) {
    this._presenceClient.onSetPresence(callback);
  }
}
