import { RoomClient } from './RoomClient';
import { DocumentCheckpoint } from './types';
import { BootstrapState, LocalSession } from 'remote';

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

export function mockBootstrapState(): BootstrapState {
  return {
    document: mockCheckpoint(),
    presence: {},
  };
}

function mockRoomClient(): RoomClient {
  const session = mockSession();
  const bootstrapState = mockBootstrapState();

  return new RoomClient({
    auth: 'xyz',
    authCtx: null,
    session,
    wsURL: 'wss://websocket.invalid',
    docsURL: 'https://docs.invalid',
    actor: 'me',
    bootstrapState,
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
