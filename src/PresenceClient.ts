import { SuperlumeSend } from './ws';
import { DocumentCheckpoint, PresenceCheckpoint, Prop } from './types';
import {
  WebSocketPresenceFwdMessage,
  WebSocketLeaveMessage,
} from './wsMessages';
import { throttleByFirstArgument } from './throttle';
import { LocalBus } from 'localbus';

export type LocalPresenceUpdate = {
  key: string;
  valuesByUser: { [key: string]: any };
};

type ValuesByUser<T extends any> = { [key: string]: T };

export class InnerPresenceClient<T extends any> {
  private roomID: string;
  private ws: SuperlumeSend;
  private actor: string;
  private cache: PresenceCheckpoint<T>;
  private sendPres: (key: string, args: any) => any;
  private bus: LocalBus<LocalPresenceUpdate>;
  key: string;

  constructor(props: {
    roomID: string;
    ws: SuperlumeSend;
    actor: string;
    key: string;
    bus: LocalBus<LocalPresenceUpdate>;
  }) {
    this.roomID = props.roomID;
    this.ws = props.ws;
    this.actor = props.actor;
    this.key = props.key;
    this.cache = {};
    this.bus = props.bus;

    const sendPres = (_: string, args: any) => {
      this.ws.send('presence:cmd', args);
    };
    this.sendPres = throttleByFirstArgument(sendPres, 40);
  }

  bootstrap(checkpoint: DocumentCheckpoint) {
    this.cache = {
      ...this.cache,
      ...(checkpoint.presence[this.key] || {}),
    };
  }

  /**
   * Gets all values for an identifier, organized by user id.
   * @param key the identifier. Ex: "position"
   */
  getAll(): ValuesByUser<T> {
    //  only initialize non-present values so we don't lose actors not present in this checkpoint

    return this.withoutExpired();
  }

  my<T extends any>(): T | undefined {
    return (this.cache || {})[this.actor] as T | undefined;
  }

  private withoutExpired(): ValuesByUser<T> {
    const result = {} as { [key: string]: any };
    for (let actor in this.cache) {
      const obj = this.cache[actor];

      if (new Date() > obj.expAt) {
        delete this.cache[actor];
        continue;
      }
      result[actor] = obj.value;
    }

    return result;
  }

  private withoutActorOrExpired(actor: string): ValuesByUser<T> {
    const result = {} as { [key: string]: any };
    for (let key in this.cache) {
      for (let a in this.cache[key]) {
        const obj = this.cache[a];
        if (!obj) continue;

        // remove this actor
        if (a === actor && this.cache[a]) {
          delete this.cache[a];
          continue;
        }

        // Remove expired
        if (new Date() > obj.expAt) {
          delete this.cache[a];
          continue;
        }

        result[a] = obj.value;
      }
    }
    return result;
  }

  /**
   * @param value Any arbitrary object, string, boolean, or number.
   * @param exp (Optional) Expiration time in seconds
   */
  set(value: T, exp?: number): { [key: string]: T } {
    let addition = exp ? exp : 60;
    // Convert to unix + add seconds
    const expAt = Math.round(new Date().getTime() / 1000) + addition;

    this.sendPres(this.key, {
      room: this.roomID,
      key: this.key,
      value: JSON.stringify(value),
      expAt: expAt,
    });

    this.cache[this.actor] = {
      value,
      expAt: new Date(expAt * 1000),
    };

    const result = this.withoutExpired();
    this.bus.publish({ key: this.key, valuesByUser: result });

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
      const foo = this.withoutExpired();
      return foo;
    }

    if (body.room !== this.roomID) return false;
    if (body.from === this.actor) return false; // ignore validation msgs

    const obj = {
      expAt: new Date(body.expAt * 1000),
      value: JSON.parse(body.value),
    };

    this.cache[body.from] = obj;

    return this.withoutExpired();
  }
}
