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

  const doc = (await res.json()) as PresenceCheckpoint<T>;

  // Parse JSON values
  for (let k in doc) {
    if (typeof doc[k].value === 'string') {
      let json;
      try {
        json = JSON.parse(doc[k].value as string);
      } catch (err) {}
      if (json) {
        doc[k].value = json;
      }
    }
  }

  return doc;
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
    headers: {
      'Content-Type': 'application/json',
    },
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
    throw new Error('The Auth Webhook returned unauthorized.');
  }
  if (res.status !== 200) {
    throw new Error('The Auth Webhook returned a status code other than 200.');
  }

  const json = (await res.json()) as ServerSession;
  const { resources, token, user } = json;

  if (!resources || !token || !user) {
    if ((json as any).body === 'Unauthorized') {
      throw new Error(
        'The Auth Webhook unexpectedly return unauthorized. You may be using an invalid API key.'
      );
    }

    throw new Error(
      'The Auth Webhook has an incorrectly formatted JSON response.'
    );
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
