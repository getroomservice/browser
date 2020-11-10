import { RoomClient } from './RoomClient';
import { WebSocketClientMessage } from './wsMessages';
import { DocumentCheckpoint } from './types';

const cp: DocumentCheckpoint = {
  api_version: 0,
  id: 'doc_123',
  index: 0,
  vs: 'AAAAOTKy5nUAAA==',
  actors: {},
  lists: {},
  maps: {
    root: {},
  },
};

test('RoomClient.connect() will send authenticate and connect messages', (done) => {
  const conn = {
    onmessage: (_?: MessageEvent) => {},
    send: (_?: any) => {},
    readyState: WebSocket.OPEN,
  };
  const client = new RoomClient({
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

  client.reconnect().then(() => {
    done();
  });
});

test('infinite loop bugs can be fixed with example', () => {
  const conn = {
    onmessage: (_?: MessageEvent) => {},
    send: (_?: any) => {},
    readyState: WebSocket.OPEN,
  };
  const client = new RoomClient({
    actor: 'me',
    checkpoint: cp,
    roomID: 'room',
    token: 'token',
    conn: conn,
  });

  const m = client.map('mymap');
  let state = m;
  client.subscribe(m, (nextMap) => {
    state = nextMap;
  });
  state.set('dogs', 'cats');
  state.set('cats', 'dogs'); // Two loops are fine!

  expect(state !== m).toBeTruthy();
});

test('we catch infinite loops', () => {
  function thisThrows() {
    const conn = {
      onmessage: (_?: MessageEvent) => {},
      send: (_?: any) => {},
      readyState: WebSocket.OPEN,
    };
    const client = new RoomClient({
      actor: 'me',
      checkpoint: cp,
      roomID: 'room',
      token: 'token',
      conn: conn,
    });
    const m = client.map('mymap');
    client.subscribe(m, (nextMap) => {
      nextMap.set('I', 'cause an infinite loop');
    });

    m.set('I', 'trigger the bad times');
  }

  expect(thisThrows).toThrow();
});
