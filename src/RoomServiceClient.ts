import { DOCS_URL, PRESENCE_URL } from './constants';
import { createRoom, RoomClient } from './RoomClient';
import { AuthStrategy, AuthFunction } from './types';

interface SimpleAuthParams {
  auth: string;
}

interface ComplexAuthParams<T extends object> {
  auth: AuthFunction<T>;
  ctx: T;
}

export type RoomServiceParameters<T extends object> =
  | SimpleAuthParams
  | ComplexAuthParams<T>;

export class RoomService<T extends object> {
  private auth: AuthStrategy<T>;
  private ctx: T;
  private roomClients: { [key: string]: RoomClient } = {};

  constructor(params: RoomServiceParameters<T>) {
    this.auth = params.auth;
    this.ctx = (params as ComplexAuthParams<T>).ctx || ({} as T);
  }

  async room(name: string): Promise<RoomClient> {
    if (this.roomClients[name]) {
      return this.roomClients[name];
    }

    const client = await createRoom<T>({
      docsURL: DOCS_URL,
      presenceURL: PRESENCE_URL,
      authStrategy: this.auth,
      authCtx: this.ctx,
      room: name,
      document: 'default',
    });
    this.roomClients[name] = client;

    return client;
  }
}
