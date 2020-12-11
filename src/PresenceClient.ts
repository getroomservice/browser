import { SuperlumeSend } from './ws';
import { PresenceCheckpoint, Prop } from './types';
import {
  WebSocketPresenceFwdMessage,
  WebSocketLeaveMessage,
} from './wsMessages';
import { throttleByFirstArgument } from './throttle';
import { LocalBus } from 'localbus';
import { BootstrapState } from 'remote';

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
    checkpoint: BootstrapState;
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

    this.bootstrap(this.actor, props.checkpoint);
  }

  bootstrap(actor: string, checkpoint: BootstrapState) {
    this.actor = actor;

    this.cache = {
      ...this.cache,
      ...(checkpoint.presence[this.key] || {}),
    };
  }

  /**
   * Gets all values for the presence key this client was created with,
   * organized by user id.
   */
  getAll(): ValuesByUser<T> {
    return this.withoutExpired();
  }

  /**
   * Gets the current user's value.
   */
  getMine(): T | undefined {
    return (this.cache || {})[this.actor]?.value;
  }

  private withoutExpired(): ValuesByUser<T> {
    const result = {} as ValuesByUser<T>;
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
    const result = {} as ValuesByUser<T>;
    for (let a in this.cache) {
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
