// 🚌
// Local pubsub, so that if you call .set in one place
// it will trigger a .subscribe elsewhere, without
// needing to go through the websockets
export class LocalBus<T> {
  private subs: Set<(msg: T) => void>;

  constructor() {
    this.subs = new Set<(msg: T) => void>();
  }

  subscribe(fn: (msg: T) => void): (msg: T) => void {
    this.subs.add(fn);
    return fn;
  }

  unsubscribe(fn: (msg: T) => void) {
    this.subs.delete(fn);
  }

  publish(msg: T) {
    this.subs.forEach(fn => {
      fn(msg);
    });
  }
}
