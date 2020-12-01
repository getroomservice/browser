import { SuperlumeSend } from './ws';
import { PresenceCheckpoint, Prop } from './types';
import { fetchPresence } from './remote';
import { PRESENCE_URL } from './constants';
import {
  WebSocketPresenceFwdMessage,
  WebSocketLeaveMessage,
} from './wsMessages';
import { throttleByFirstArgument } from './throttle';
import { LocalBus } from 'localbus';

export type LocalPresenceUpdate = {
  key: string;
  valuesByActor: { [key: string]: any };
};

export class InnerPresenceClient {
  private roomID: string;
  private ws: SuperlumeSend;
  private actor: string;
  private token: string;
  private cache: { [key: string]: PresenceCheckpoint<any> };
  private sendPres: (key: string, args: any) => any;
  private bus: LocalBus<LocalPresenceUpdate>;

  constructor(props: {
    roomID: string;
    ws: SuperlumeSend;
    actor: string;
    token: string;
    bus: LocalBus<LocalPresenceUpdate>;
  }) {
    this.roomID = props.roomID;
    this.ws = props.ws;
    this.actor = props.actor;
    this.token = props.token;
    this.cache = {};
    this.bus = props.bus;

    const sendPres = (_: string, args: any) => {
      this.ws.send('presence:cmd', args);
    };
    this.sendPres = throttleByFirstArgument(sendPres, 40);
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
    //  only initialize non-present values so we don't lose actors not present in this checkpoint
    this.cache[key] = {
      ...val,
      ...(this.cache[key] || {}),
    };

    return this.withoutExpired(key);
  }

  private withoutExpired(key: string): { [key: string]: any } {
    const result = {} as { [key: string]: any };
    for (let actor in this.cache[key]) {
      const obj = this.cache[key][actor];

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

    this.sendPres(key, {
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

    const result = this.withoutExpired(key);
    this.bus.publish({ key, valuesByActor: result });

    return result;
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
    type: 'presence:expire',
    body: { key: string }
  ): {
    [key: string]: any;
  };
  dangerouslyUpdateClientDirectly(
    type: 'room:rm_guest' | 'presence:fwd' | 'presence:expire',
    body: any
  ):
    | {
        [key: string]: any;
      }
    | false {
    if (type === 'room:rm_guest') {
      return this.withoutActorOrExpired(body.guest);
    }
    if (type === 'presence:expire') {
      const foo = this.withoutExpired(body.key);
      return foo;
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

    return this.withoutExpired(body.key);
  }
}
