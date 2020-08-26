import { Message, DocumentCheckpoint } from './types';

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
  guest_id: string;
  resources: Array<{
    id: string;
    object: 'document' | 'room';
  }>;
}

export interface LocalSession {
  token: string;
  guestID: string;
  docID: string;
  roomID: string;
}

export async function fetchSession(
  url: string,
  room: string,
  document: string
): Promise<LocalSession> {
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      resources: [
        {
          object: 'document',
          reference: document,
          permission: 'read_write',
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

  const {
    token,
    guest_id: guestID,
    resources,
  } = (await res.json()) as ServerSession;

  if (!resources || !token || !guestID) {
    throw new Error('Invalid response from the AuthURL: ' + url);
  }

  const docID = resources.find(r => r.object === 'document')!.id;
  const roomID = resources.find(r => r.object === 'room')!.id;

  return {
    token,
    guestID,
    docID,
    roomID,
  };
}
