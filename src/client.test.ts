import { DocumentClient } from './client';
import { WebSocketClientMessage } from 'wsMessages';

const cp = {
  api_version: 0,
  id: 'doc_123',
  index: 0,
  lists: {},
  maps: {},
};

test('DocumentClient.connect() will send authenticate and connect messages', done => {
  const conn = {
    onmessage: (_?: MessageEvent) => {},
    send: (_?: any) => {},
  };
  const client = new DocumentClient({
    actor: 'me',
    checkpoint: cp,
    roomID: 'room',
    token: 'token',
    conn: conn,
  });

  conn.send = (data: string) => {
    const event = JSON.parse(data) as WebSocketClientMessage;

    if (event.type === 'room:join') {
      conn.onmessage({
        data: JSON.stringify({
          type: 'room:joined',
          body: 'OK',
          ver: 0,
        }),
      } as MessageEvent);
      return;
    }

    if (event.type === 'guest:authenticate') {
      conn.onmessage({
        data: JSON.stringify({
          type: 'guest:authenticated',
          body: 'OK',
          ver: 0,
        }),
      } as MessageEvent);
      return;
    }
  };

  client.connect().then(() => {
    done();
  });
});
