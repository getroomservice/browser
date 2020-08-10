import { MapProxyHandler, ListProxyHandler } from './proxy';
import { newContext } from './context';
import ReverseTree from './ReverseTree';

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
  expect(proxy).toEqual({ pet: 'dogs' });
  expect(send.mock.calls[0]).toEqual([
    'doc:cmd',
    { args: ['mput', 'doc', 'somemap', 'pet', '"dogs"'], room: 'room' },
  ]);
});

test('ListProxyHandler can handle insert commands', () => {
  const ctx = newContext('doc', 'me');
  ctx.lists = {
    mylist: new ReverseTree('me'),
  };
  const send = jest.fn();
  const proxy = new Proxy(
    [],
    new ListProxyHandler<Array<any>>('room', 'mylist', ctx, {
      send,
    } as any)
  ) as any;

  proxy[0] = 'hey';

  expect(proxy[0]).toEqual('hey');
  expect(send.mock.calls[0]).toEqual([
    'doc:cmd',
    {
      args: ['lins', 'doc', 'mylist', 'root', '0:me', 'hey'],
      room: 'room',
    },
  ]);
});

function getListCommandsWhen(cb: (p: any) => void) {
  const ctx = newContext('doc', 'me');
  ctx.lists = {
    list: new ReverseTree('me'),
  };
  const send = jest.fn();
  const proxy = new Proxy(
    [],
    new ListProxyHandler<Array<any>>('room', 'list', ctx, {
      send,
    } as any)
  ) as any;
  cb(proxy);
  return send.mock.calls.map(([_, val]) => val.args);
}

describe('list fixtures', () => {
  test('basic list insert', () => {
    expect(
      getListCommandsWhen(p => {
        p[0] = 'hey';
      })
    ).toEqual([['lins', 'doc', 'list', 'root', '0:me', 'hey']]);
  });

  test('three list inserts', () => {
    expect(
      getListCommandsWhen(p => {
        p[0] = 'cat';
        p[1] = 'dog';
        p[2] = 'bird';
      })
    ).toEqual([
      ['lins', 'doc', 'list', 'root', '0:me', 'cat'],
      ['lins', 'doc', 'list', '0:me', '1:me', 'dog'],
      ['lins', 'doc', 'list', '1:me', '2:me', 'bird'],
    ]);
  });

  test('push', () => {
    expect(
      getListCommandsWhen(p => {
        p.push('cat', 'dog', 'bird');
      })
    ).toEqual([
      ['lins', 'doc', 'list', 'root', '0:me', 'cat'],
      ['lins', 'doc', 'list', '0:me', '1:me', 'dog'],
      ['lins', 'doc', 'list', '1:me', '2:me', 'bird'],
    ]);
  });

  test('push split up', () => {
    expect(
      getListCommandsWhen(p => {
        p.push('cat', 'dog');
        p.push('bird');
      })
    ).toEqual([
      ['lins', 'doc', 'list', 'root', '0:me', 'cat'],
      ['lins', 'doc', 'list', '0:me', '1:me', 'dog'],
      ['lins', 'doc', 'list', '1:me', '2:me', 'bird'],
    ]);
  });

  test('put', () => {
    expect(
      getListCommandsWhen(p => {
        p[0] = 'dogs';
        p[0] = 'cats';
      })
    ).toEqual([
      ['lins', 'doc', 'list', 'root', '0:me', 'dogs'],
      ['lput', 'doc', 'list', '0:me', 'cats'],
    ]);
  });
});
