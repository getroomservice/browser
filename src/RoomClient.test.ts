import { RoomClient } from './RoomClient';
import { DocumentCheckpoint } from './types';
import { LocalSession } from 'remote';

export function mockSession(): LocalSession {
  return {
    token: 'mock token',
    guestReference: 'mock actor',
    docID: 'moc docID',
    roomID: 'moc roomID',
  };
}

export function mockCheckpoint(): DocumentCheckpoint {
  return {
    maps: {},
    lists: {},
    id: 'mock checkpoint',
    index: 0,
    api_version: 0,
    vs: 'AAo=',
    actors: [],
  };
}

function mockRoomClient(): RoomClient {
  const session = mockSession();
  const checkpoint = mockCheckpoint();

  return new RoomClient({
    auth: 'xyz',
    authCtx: null,
    session,
    wsURL: 'wss://websocket.invalid',
    docsURL: 'https://docs.invalid',
    actor: 'me',
    checkpoint,
    token: session.token,
    roomID: session.roomID,
    docID: session.docID,
  });
}

test('we catch infinite loops', () => {
  function thisThrows() {
    const client = mockRoomClient();
    const m = client.map('mymap');
    client.subscribe(m, () => {
      m.set('I', 'cause an infinite loop');
    });

    m.set('I', 'trigger the bad times');
  }

  expect(thisThrows).toThrow();
});
