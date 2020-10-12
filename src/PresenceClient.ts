import SuperlumeWebSocket from './ws';
import { PresenceCheckpoint, Prop } from './types';
import { fetchPresence } from './remote';
import { PRESENCE_URL } from './constants';
import {
  WebSocketPresenceFwdMessage,
  WebSocketLeaveMessage,
} from './wsMessages';
import throttle from './throttle';

export class InnerPresenceClient {
  private roomID: string;
  private ws: SuperlumeWebSocket;
  private actor: string;
  private token: string;
  private cache: { [key: string]: PresenceCheckpoint<any> };
  private send: Prop<SuperlumeWebSocket, 'send'>;

  constructor(
    roomID: string,
    ws: SuperlumeWebSocket,
    actor: string,
    token: string
  ) {
    this.roomID = roomID;
    this.ws = ws;
    this.actor = actor;
    this.token = token;
    this.cache = {};
    this.send = throttle(this.ws.send.bind(this.ws), 40);
  }

  /**
   * Gets all values for an identifier, organized by user id.
   * @param key the identifier. Ex: "position"
   */
  async getAll<T extends any>(key: string): Promise<{ [key: string]: T }> {
    const val = await fetchPresence<T>(
      PRESENCE_URL,
      this.token,
      this.roomID,
      key
    );
    this.cache[key] = val;

    return this.withoutExpiredAndSelf(key);
  }

  private withoutExpiredAndSelf(key: string) {
    const result = {} as { [key: string]: any };
    for (let actor in this.cache[key]) {
      const obj = this.cache[key][actor];

      // Remove expired
      if (new Date() > obj.expAt) {
        delete this.cache[key][actor];
        continue;
      }
      result[actor] = obj.value;
    }

    return result;
  }

  private withoutActorOrExpired(actor: string) {
    const result = {} as { [key: string]: any };
    for (let key in this.cache) {
      for (let a in this.cache[key]) {
        const obj = this.cache[key][a];
        if (!obj) continue;

        // remove this actor
        if (a === actor && this.cache[key][a]) {
          delete this.cache[key][a];
          continue;
        }

        // Remove expired
        if (new Date() > obj.expAt) {
          delete this.cache[key][a];
          continue;
        }

        result[a] = obj.value;
      }
    }
    return result;
  }

  // Deprecated
  get me() {
    console.warn(
      'presence.me() is deprecated and will be removed in a future version!'
    );
    return this.actor;
  }

  /**
   *
   * @param key
   * @param value Any arbitrary object, string, boolean, or number.
   * @param exp (Optional) Expiration time in seconds
   */
  set<T extends any>(
    key: string,
    value: T,
    exp?: number
  ): { [key: string]: T } {
    let addition = exp ? exp : 60;
    // Convert to unix + add seconds
    const expAt = Math.round(new Date().getTime() / 1000) + addition;

    this.send('presence:cmd', {
      room: this.roomID,
      key: key,
      value: JSON.stringify(value),
      expAt: expAt,
    });

    if (!this.cache[key]) {
      this.cache[key] = {};
    }

    this.cache[key][this.actor] = {
      value,
      expAt: new Date(expAt * 1000),
    };

    return this.withoutExpiredAndSelf(key);
  }

  dangerouslyUpdateClientDirectly(
    type: 'room:rm_guest',
    body: Prop<WebSocketLeaveMessage, 'body'>
  ): {
    [key: string]: any;
  };
  dangerouslyUpdateClientDirectly(
    type: 'presence:fwd',
    body: Prop<WebSocketPresenceFwdMessage, 'body'>
  ): {
    [key: string]: any;
  };
  dangerouslyUpdateClientDirectly(
    type: 'room:rm_guest' | 'presence:fwd',
    body: any
  ):
    | {
        [key: string]: any;
      }
    | false {
    if (type === 'room:rm_guest') {
      return this.withoutActorOrExpired(body.guest);
    }

    if (body.room !== this.roomID) return false;
    if (body.from === this.actor) return false; // ignore validation msgs

    const obj = {
      expAt: new Date(body.expAt * 1000),
      value: JSON.parse(body.value),
    };

    if (!this.cache[body.key]) {
      this.cache[body.key] = {};
    }
    this.cache[body.key][body.from] = obj;

    return this.withoutExpiredAndSelf(body.key);
  }
}
