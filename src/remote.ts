import {
  Message,
  DocumentCheckpoint,
  PresenceCheckpoint,
  AuthStrategy,
} from './types';

export async function fetchPresence<T extends any>(
  url: string,
  token: string,
  roomID: string,
  key: string
): Promise<PresenceCheckpoint<T>> {
  const res = await fetch(url + '/' + roomID + '/' + encodeURIComponent(key), {
    headers: {
      Authorization: 'Bearer: ' + token,
    },
  });

  const doc = await res.json();
  return doc as PresenceCheckpoint<T>;
}

export async function fetchDocument(
  url: string,
  token: string,
  docID: string
): Promise<Message<DocumentCheckpoint>> {
  const res = await fetch(url + '/' + docID, {
    headers: {
      Authorization: 'Bearer: ' + token,
    },
  });

  const doc = await res.json();
  return doc as Message<DocumentCheckpoint>;
}

export interface ServerSession {
  token: string;
  user: string;
  resources: Array<{
    id: string;
    object: 'document' | 'room';
  }>;
}

export interface LocalSession {
  token: string;
  guestReference: string;
  docID: string;
  roomID: string;
}

export async function fetchSession(
  strategy: AuthStrategy,
  room: string,
  document: string
): Promise<LocalSession> {
  // A user defined function
  if (typeof strategy === 'function') {
    const result = await strategy(room);
    if (!result.user) {
      throw new Error(`The auth function must return a 'user' key.`);
    }

    const docID = result.resources.find(r => r.object === 'document')!.id;
    const roomID = result.resources.find(r => r.object === 'room')!.id;

    return {
      token: result.token,
      guestReference: result.user,
      docID,
      roomID,
    };
  }

  // The generic function
  const url = strategy;
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      resources: [
        {
          object: 'document',
          reference: document,
          permission: 'read_write',
          room: room,
        },
        {
          object: 'room',
          reference: room,
          permission: 'join',
        },
      ],
    }),
  });

  if (res.status === 401) {
    // Todo, make a better path for handling this
    throw new Error('AuthURL returned unauthorized');
  }

  const { token, user, resources } = (await res.json()) as ServerSession;

  if (!resources || !token || !user) {
    throw new Error('Invalid response from the AuthURL: ' + url);
  }

  const docID = resources.find(r => r.object === 'document')!.id;
  const roomID = resources.find(r => r.object === 'room')!.id;

  return {
    token,
    guestReference: user,
    docID,
    roomID,
  };
}
