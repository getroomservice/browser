import { RoomClient } from './RoomClient';
import { DocumentCheckpoint } from './types';
import { AuthBundle, BootstrapState, LocalSession } from 'remote';
import { mockAuthBundle } from './remote.test';

export function mockSession(): LocalSession {
  return {
    token: 'mock token',
    guestReference: 'mock actor',
    docID: 'moc docID',
    roomID: 'moc roomID',
  };
}

export function mockSessionFetch(_: {
  authBundle: AuthBundle<any>;
  room: string;
  document: string;
}): Promise<LocalSession> {
  return Promise.resolve(mockSession());
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
  const authBundle = mockAuthBundle();

  return new RoomClient({
    auth: authBundle.strategy,
    authCtx: authBundle.ctx,
    session,
    wsURL: 'wss://websocket.invalid',
    docsURL: 'https://docs.invalid',
    presenceURL: 'https://presence.invalid',
    actor: 'me',
    bootstrapState,
    token: session.token,
    room: 'myRoom',
    document: 'default',
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
