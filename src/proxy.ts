import { DocumentContext } from './types';
import { runCommandLocally } from './commands';
import SuperlumeWebSocket from './ws';

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
    const cmd = ['mput', this.ctx.id, this.mapID, prop, value];
    runCommandLocally(this.ctx, cmd);

    this.ws.send('doc:cmd', {
      room: this.roomID,
      args: cmd,
    });

    target[prop] = value;
    return true;
  }
}
