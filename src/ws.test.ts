import SuperlumeWebSocket from './ws';
import { WebSocketJoinMessage } from './wsMessages';

test('websocket send will send a message of the right format', () => {
  const send = jest.fn();
  const onmessage = jest.fn();

  const ws = new SuperlumeWebSocket({
    send,
    onmessage,
  });

  // Join
  ws.send('room:join', 'my-room');
  let msg = JSON.parse(send.mock.calls[0][0]) as WebSocketJoinMessage;
  expect(msg.body).toEqual('my-room');
  expect(msg.type).toEqual('room:join');
  expect(msg.ver).toEqual(0);

  // Authenticate
  ws.send('guest:authenticate', 'token');
  msg = JSON.parse(send.mock.calls[1][0]) as WebSocketJoinMessage;
  expect(msg.body).toEqual('token');
  expect(msg.type).toEqual('guest:authenticate');
  expect(msg.ver).toEqual(0);

  // Cmd
  ws.send('doc:cmd', {
    args: ['lcreate', 'mylist'],
    room: 'my-room',
  });
  msg = JSON.parse(send.mock.calls[2][0]) as WebSocketJoinMessage;
  expect(msg.body).toEqual({
    args: ['lcreate', 'mylist'],
    room: 'my-room',
  });
  expect(msg.type).toEqual('doc:cmd');
  expect(msg.ver).toEqual(0);
});

test('websocket resets onmessage event', () => {
  const oldOnmessage = () => {};
  const conn = {
    send: jest.fn(),
    onmessage: oldOnmessage,
  };
  new SuperlumeWebSocket(conn);

  expect(conn.onmessage).not.toEqual(oldOnmessage);
});

test('websocket can bind events', done => {
  const conn: { send: any; onmessage: any } = {
    send: jest.fn(),
    onmessage: () => {},
  };
  const ws = new SuperlumeWebSocket(conn);

  ws.bind('room:joined', body => {
    expect(body).toBe('ok');
    done();
  });

  conn.onmessage({
    data: JSON.stringify({
      type: 'room:joined',
      ver: 0,
      body: 'ok',
    }),
  });
});
