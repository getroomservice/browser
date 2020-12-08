import { mockSession } from './RoomClient.test';
import { Prop } from 'types';
import {
  BootstrapFetch,
  ReconnectingWebSocket,
  WebsocketDispatch,
  WebSocketFactory,
} from './ws';

function makeTestWSFactory(
  send: Prop<WebSocket, 'send'>,
  onmessage: Prop<WebSocket, 'onmessage'>
): WebSocketFactory {
  return async function (_: string) {
    return {
      onerror: jest.fn(),
      send,
      onmessage,
      onclose: jest.fn(),
      close: jest.fn(),
    };
  };
}

function mockDispatch(): WebsocketDispatch {
  return {
    forwardCmd: jest.fn(),
    bootstrap: jest.fn(),
    startQueueingCmds: jest.fn(),
  };
}

function mockReconnectingWS(
  send: Prop<WebSocket, 'send'>,
  onmessage: Prop<WebSocket, 'onmessage'>,
  fetch: BootstrapFetch
): ReconnectingWebSocket {
  return new ReconnectingWebSocket({
    dispatcher: mockDispatch(),
    wsURL: 'wss://ws.invalid',
    docsURL: 'https://docs.invalid',
    room: 'mock-room',
    session: mockSession(),
    wsFactory: makeTestWSFactory(send, onmessage),
    bootstrapFetch: fetch,
  });
}

test('Reconnecting WS sends handshake message using ws factory', async (done) => {
  const [send, sendDone] = awaitFnNTimes(1);
  const onmessage = jest.fn();
  const fetch = jest.fn();

  //@ts-ignore
  const _ws = mockReconnectingWS(send, onmessage, fetch);

  await sendDone;
  expect(JSON.parse(send.mock.calls[0][0])['type']).toEqual(
    'guest:authenticate'
  );

  done();
});

function awaitFnNTimes(n: number): [jest.Mock, Promise<any>] {
  let resolve: any = null;
  const p: Promise<any> = new Promise((res) => {
    resolve = res;
  });
  let count = 0;

  return [
    jest.fn(() => {
      count++;
      if (count == n) {
        resolve();
      }
    }),
    p,
  ];
}
