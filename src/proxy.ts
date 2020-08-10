import { DocumentContext } from './types';
import { runLins, runMput } from './commands';
import SuperlumeWebSocket from './ws';
import invariant from 'tiny-invariant';

// To distinguish between numbers and strings,
// we use quotes.
function cast(value: number | string): string {
  if (typeof value === 'number') return `${value}`;
  else return `"${value}"`;
}

export class MapProxyHandler<T extends object> implements ProxyHandler<T> {
  private ctx: DocumentContext;
  private ws: SuperlumeWebSocket;
  private roomID: string;
  private mapID: string;

  constructor(
    roomID: string,
    mapID: string,
    ctx: DocumentContext,
    ws: SuperlumeWebSocket
  ) {
    this.ctx = ctx;
    this.ws = ws;
    this.roomID = roomID;
    this.mapID = mapID;
  }

  set(target: any, prop: PropertyKey, value: any, __: any): boolean {
    if (typeof prop === 'symbol') {
      throw new Error('Room Service does not support symbols');
    }
    if (typeof prop === 'number') {
      throw new Error('Unimplemented');
    }
    if (typeof value === 'object') {
      throw new Error('Unimplemented');
    }

    const [ctx, cmd] = runMput(this.ctx, this.mapID, prop, cast(value));
    this.ctx = ctx;

    this.ws.send('doc:cmd', {
      room: this.roomID,
      args: cmd,
    });

    target[prop] = value;
    return true;
  }
}

export class ListProxyHandler<T extends Array<any>> implements ProxyHandler<T> {
  private ctx: DocumentContext;
  private ws: SuperlumeWebSocket;
  private roomID: string;
  private listID: string;

  // Maps indexes to item ids
  private itemIDs: { [key: number]: string } = {};

  constructor(
    roomID: string,
    listID: string,
    ctx: DocumentContext,
    ws: SuperlumeWebSocket
  ) {
    this.ctx = ctx;
    this.ws = ws;
    this.roomID = roomID;
    this.listID = listID;
  }

  set(target: any, prop: PropertyKey, value: any, __: any): boolean {
    if (prop === 'length') {
      target.length = value;
      return true;
    }

    if (typeof prop === 'symbol') {
      throw new Error('Room Service does not support symbols');
    }
    const index = typeof prop === 'number' ? prop : parseInt(prop);
    const length = this.ctx.lists[this.listID].length;
    const extension = index - length;

    invariant(
      length === target.length,
      'The Javascript Array and the the internal representation have diverged.'
    );

    // This can happen because Javascript lets you do stuff like this:
    //
    //   let arr = []
    //   arr[100000] = "hello"
    //
    // We don't allow this, since it would create a 100k-item long list
    // that could cause serious performance issues, and probably isn't
    // what the user intended to do.
    //
    // In the future, we might allow smaller cases of this, by prepopulating
    // an array. But we're erroring in the side of conservatism here.
    if (extension > 0) {
      throw new Error('List index is out of bounds.');
    }

    // The "traditional" behavior of list inserts
    target[prop] = value;

    // Inserts
    if (extension === 0) {
      // Inserting the first item into the array.
      if (index === 0) {
        const [ctx, itemID, cmd] = runLins(
          this.ctx,
          this.listID,
          'root',
          value
        );
        this.ctx = ctx;
        this.ws.send('doc:cmd', {
          args: cmd,
          room: this.roomID,
        });
        this.itemIDs[index] = itemID;
        return true;
      }

      // Inserting a later item
      const after = this.itemIDs[index - 1];
      invariant(after, 'No item id for previous index');
      const [ctx, itemID, cmd] = runLins(this.ctx, this.listID, after, value);
      this.ctx = ctx;
      this.ws.send('doc:cmd', {
        args: cmd,
        room: this.roomID,
      });
      this.itemIDs[index] = itemID;

      return true;
    }

    // Puts (TODO)
    return false;
  }
}
