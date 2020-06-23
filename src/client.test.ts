import { from, save } from 'automerge';
import nock from 'nock';
import RoomServiceClient from './client';
import Offline from './offline';
import Sockets from './socket';
import { injectFakeSocket } from './test-socket';
import { uniq } from 'lodash';
import { ROOM_SERICE_CLIENT_URL } from './constants';

const URL = 'https://coolsite.com';
const ROOM_ID = 'my-room-id';
jest.mock('idb-keyval');

function mockAuthEndpoint() {
  return nock(URL)
    .post('/api/roomservice')
    .reply(200, {
      room: {
        id: ROOM_ID,
        reference: 'my-room',
      },
      session: {
        token: 'short-lived-token',
      },
    });
}

function mockDocumentEndpoint(doc?: any) {
  return nock(ROOM_SERICE_CLIENT_URL)
    .get(`/client/v1/rooms/${ROOM_ID}/documents/default`)
    .reply(200, save(from(doc || { foo: 'hello' })));
}

it('should call the authorization endpoint when creating a room', async () => {
  const authScope = mockAuthEndpoint();
  const docScope = mockDocumentEndpoint();
  const client = new RoomServiceClient({
    authUrl: URL + '/api/roomservice',
  });
  const room = client.room('my-room');

  await room.init();

  expect(authScope.isDone()).toBeTruthy();
  expect(docScope.isDone()).toBeTruthy();
});

test('room emits authenticate call', async () => {
  mockAuthEndpoint();
  mockDocumentEndpoint();

  const mockEmit = jest.fn();
  const mock = jest.spyOn(Sockets, 'newSocket').mockImplementation(() => {
    // @ts-ignore
    return { on: jest.fn(), emit: mockEmit } as SocketIOClient.Socket;
  }).mock;

  const client = new RoomServiceClient({
    authUrl: URL + '/api/roomservice',
  });
  const room = client.room('my-room');
  await room.init();

  const urls = mock.calls.map(([url]) => url);

  expect(uniq(urls.sort())).toStrictEqual(
    [
      'https://aws.roomservice.dev/v1/doc',
      'https://aws.roomservice.dev/v1/presence',
    ].sort()
  );

  expect(mockEmit.mock.calls[0]).toEqual([
    'authenticate',
    {
      payload: 'short-lived-token',
      meta: {
        roomId: 'my-room-id',
      },
    },
  ]);
});

test('room.publish() can change a document', async () => {
  mockAuthEndpoint();
  mockDocumentEndpoint();

  const client = new RoomServiceClient({
    authUrl: URL + '/api/roomservice',
  });

  const room = client.room('my-room');
  const sockets = injectFakeSocket();
  await room.init();
  sockets.emit('connect');

  const newState = await room.setDoc((prevState: any) => {
    prevState.someOption = 'hello!';
  });

  expect(newState.someOption).toBe('hello!');
});

test('room.restore() attempts to restore from offline', async () => {
  const client = new RoomServiceClient({
    authUrl: URL + '/api/roomservice',
  });
  const room = client.room('my-room');

  // @ts-ignore because trust me typescript, I am very wise and have
  // been on this earth longer than thee, and I, the great programmer,
  // know for certain that window.indexDB is, in fact, equal to
  // wiggly-woggle-pop.
  window.indexedDB = 'wiggly-woggle-pop';

  jest.spyOn(Offline, 'getDoc').mockImplementation(async () => {
    return save(from({ name: 'offlinedoc' }));
  });

  const doc = await room.restore();
  expect(doc).toEqual({ name: 'offlinedoc' });
});

test('room.init() will merge online data with offline data', async () => {
  const client = new RoomServiceClient({
    authUrl: URL + '/api/roomservice',
  });
  const room = client.room('my-room');

  // setup offline
  jest.spyOn(Offline, 'getDoc').mockImplementation(async () => {
    return save(from({ offline: 'offline' }));
  });

  // setup online
  mockAuthEndpoint();
  mockDocumentEndpoint({
    online: 'online',
  });

  const { doc } = await room.init();
  expect(doc).toEqual({
    offline: 'offline',
    online: 'online',
  });
});
