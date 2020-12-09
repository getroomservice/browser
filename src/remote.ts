import {
  Message,
  DocumentCheckpoint,
  PresenceCheckpoint,
  AuthStrategy,
} from './types';

type AllPresence = { [key: string]: PresenceCheckpoint<any> };
export interface BootstrapState {
  presence: AllPresence;
  document: DocumentCheckpoint;
}

export async function fetchBootstrapState(props: {
  docsURL: string;
  presenceURL: string;
  token: string;
  roomID: string;
  docID: string;
}): Promise<BootstrapState> {
  const [allPresence, documentCheckpoint] = await Promise.all<
    AllPresence,
    DocumentCheckpoint
  >([
    fetchPresence(props.presenceURL, props.token, props.roomID),
    fetchDocument(props.docsURL, props.token, props.docID),
  ]);

  return {
    presence: allPresence,
    document: documentCheckpoint,
  };
}

export async function fetchPresence(
  url: string,
  token: string,
  roomID: string
): Promise<AllPresence> {
  const res = await fetch(url + '/' + roomID, {
    headers: {
      Authorization: 'Bearer: ' + token,
    },
  });

  const doc = (await res.json()) as { [key: string]: PresenceCheckpoint<any> };

  // Parse JSON values
  for (let key of Object.keys(doc)) {
    for (let actor of Object.keys(doc[key])) {
      if (typeof doc[key][actor].value === 'string') {
        let json;
        try {
          json = JSON.parse(doc[key][actor].value as string);
        } catch (err) {}
        if (json) {
          doc[key][actor].value = json;
        }
      }
    }
  }

  return doc;
}

export async function fetchDocument(
  url: string,
  token: string,
  docID: string
): Promise<DocumentCheckpoint> {
  const res = await fetch(url + '/' + docID, {
    headers: {
      Authorization: 'Bearer: ' + token,
    },
  });

  const doc: Message<DocumentCheckpoint> = await res.json();
  return doc.body;
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

export interface AuthBundle<T extends object> {
  strategy: AuthStrategy<T>;
  ctx: T;
}

export async function fetchSession<T extends object>(params: {
  authBundle: AuthBundle<T>;
  room: string;
  document: string;
}): Promise<LocalSession> {
  const {
    authBundle: { strategy, ctx },
    room,
    document,
  } = params;
  // A user defined function
  console.log(typeof strategy);
  if (typeof strategy === 'function') {
    const result = await strategy({
      room,
      ctx,
    });
    if (!result.user) {
      throw new Error(`The auth function must return a 'user' key.`);
    }

    const docID = result.resources.find((r) => r.object === 'document')!.id;
    const roomID = result.resources.find((r) => r.object === 'room')!.id;

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

  const docID = resources.find((r) => r.object === 'document')!.id;
  const roomID = resources.find((r) => r.object === 'room')!.id;

  return {
    token,
    guestReference: user,
    docID,
    roomID,
  };
}
