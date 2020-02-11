import DocClient from "./doc-client";
import PresenceClient from "./presence-client";
import { Obj } from "./types";

interface RoomClientParameters {
  authUrl: string;
  roomReference: string;
  defaultDoc?: Obj;
}

export default class RoomClient {
  private readonly _docClient: DocClient<Obj>;
  private readonly _presenceClient: PresenceClient;

  constructor(parameters: RoomClientParameters) {
    this._docClient = new DocClient(parameters);
    this._presenceClient = new PresenceClient(parameters);
  }

  // used for testing locally
  private set _socketURL(url: string) {
    this._docClient._socketURL = url;
  }

  // Start the client, sync from cache, and connect.
  async init() {
    const { doc } = await this._docClient.init();
    return { doc };
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
  setDoc<D extends Obj>(change: (prevDoc: D) => void): Readonly<D> {
    return this._docClient.setDoc(change);
  }
  onSetDoc<D extends Obj>(callback: (newDoc: Readonly<D>) => void): void {
    this._docClient.onSetDoc(callback);
  }

  // Presence
  setPresence<P extends Obj>(key: string, value: P) {}
  onSetPresence<P extends Obj>(key: string, callback: (value: P) => void) {}
}
