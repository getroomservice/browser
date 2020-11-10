import { errNoInfiniteLoop } from './errs';

// 🚌
// Local pubsub, so that if you call .set in one place
// it will trigger a .subscribe elsewhere, without
// needing to go through the websockets
export class LocalBus<T> {
  private subs: Set<(msg: T) => void>;

  constructor() {
    this.subs = new Set<(msg: T) => void>();
  }

  unsubscribe(fn: (msg: T) => void) {
    this.subs.delete(fn);
  }

  subscribe(fn: (msg: T) => void): (msg: T) => void {
    this.subs.add(fn);
    return fn;
  }

  private isPublishing: boolean = false;

  publish(msg: T) {
    // This is an infinite loop
    if (this.isPublishing) {
      throw errNoInfiniteLoop();
    }

    this.isPublishing = true;
    this.subs.forEach((fn) => {
      fn(msg);
    });
    this.isPublishing = false;
  }
}
