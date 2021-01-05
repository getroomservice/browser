import { AuthResponse } from './types';
import { AuthBundle, fetchSession } from './remote';

export function mockAuthBundle(): AuthBundle<{}> {
  const strategy = async (_: {
    room: string;
    ctx: {};
  }): Promise<AuthResponse> => {
    return {
      resources: [
        {
          reference: 'doc_123',
          permission: 'read_write',
          object: 'document',
          id: '123',
        },
        {
          reference: 'room_123',
          permission: 'join',
          object: 'room',
          id: '123',
        },
      ],
      token: 'some-token',
      user: 'some_user_id',
    };
  };

  return {
    strategy,
    ctx: {},
  };
}

test('Test fetchSession', async () => {
  const fetcher = jest.fn(() => {
    return {
      resources: [
        {
          object: 'document',
          id: '123',
        },
        {
          object: 'room',
          id: '123',
        },
      ],
      token: 'some-token',
      user: {
        id: 'some_user_id',
        reference: 'my-user',
      },
    };
  });

  await fetchSession({
    authBundle: { strategy: fetcher as any, ctx: {} },
    room: '123',
    document: '123',
  });

  expect(fetcher.mock.calls[0]).toEqual([
    {
      ctx: {},
      room: '123',
    },
  ]);
});
