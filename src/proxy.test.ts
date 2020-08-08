import { MapProxyHandler } from './proxy';
import { newContext } from './context';

test('MapProxyHandler can create mput commands', () => {
  const ctx = newContext('doc', 'me');
  ctx.maps = {
    somemap: {},
  };

  const send = jest.fn();

  const proxy = new Proxy(
    {},
    new MapProxyHandler<any>('room', 'somemap', ctx, {
      send,
    } as any)
  ) as any;

  proxy['pet'] = 'dogs';
  expect(send.mock.calls[0]).toEqual([
    'doc:cmd',
    { args: ['mput', 'doc', 'somemap', 'pet', 'dogs'], room: 'room' },
  ]);
});
