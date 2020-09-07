import { fetchSession } from './remote';

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
      user_id: 'some_user_id',
    };
  });

  await fetchSession(fetcher as any, '123', '123');

  expect(fetcher.mock.calls[0]).toEqual(['123']);
});
