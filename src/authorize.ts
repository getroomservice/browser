import invariant from 'invariant';
import ky from 'ky-universal';

interface RoomValue {
  id: string;
  reference: string;
  state: string;
}

export default async function authorize(
  authorizationUrl: string,
  roomReference: string,
  headers?: Headers
) {
  // Generates and then records a session token
  const result = await ky.post(authorizationUrl, {
    json: {
      room: {
        reference: roomReference,
      },
    },

    headers: headers || undefined,

    // This only works on sites that have setup DNS,
    // or the debugger on roomservice.dev/app, which
    // uses this SDK.
    credentials:
      authorizationUrl.includes('https://api.roomservice.dev') &&
      authorizationUrl.includes('debugger-auth-endpoint')
        ? 'include'
        : undefined,
    throwHttpErrors: false,
  });

  // This is just user error, so it's probably fine to throw here.
  invariant(
    result.status !== 405,
    'Your authorization endpoint does not appear to accept a POST request.'
  );

  if (result.status < 200 || result.status >= 400) {
    throw new Error(
      `Your Auth endpoint at '${authorizationUrl}' is not functioning properly, returned status of ${result.status}.`
    );
  }

  const res = await result.json();
  const { room, session } = res as {
    room: RoomValue;
    session: { token: string };
  };
  return { room, session };
}
