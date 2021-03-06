import { LocalBus } from './localbus';
import { InnerListClient } from './ListClient';
import { DocumentCheckpoint, Prop } from './types';
import { WebSocketDocCmdMessage } from './wsMessages';

describe('list clients', () => {
  const checkpoint: DocumentCheckpoint = {
    actors: {},
    api_version: 0,
    id: '123',
    vs: 'AAAAOTKy5nUAAA==',
    index: 0,
    lists: {
      list: {
        afters: [],
        ids: [],
        values: [],
      },
    },
    maps: {},
  };
  const roomID = 'room';
  const docID = 'doc';
  const listID = 'list';
  const send = jest.fn();
  const ws = { send };

  test("List clients don't include extra quotes", () => {
    const alpha = new InnerListClient({
      checkpoint,
      roomID,
      docID,
      listID,
      ws,
      actor: 'alpha',
      bus: new LocalBus(),
    });

    const finishedAlpha = alpha.push('"1"').push('2').push(3).push('');

    expect(finishedAlpha.toArray()).toEqual(['"1"', '2', 3, '']);
  });

  test('list clients can map over items', () => {
    const alpha = new InnerListClient({
      checkpoint,
      roomID,
      docID,
      listID,
      ws,
      actor: 'alpha',
      bus: new LocalBus(),
    });

    const finished = alpha.push(1).push({ x: 20, y: 30 }).push(3).push('cats');

    const session = alpha.session();

    expect(finished.map((val, i, key) => [val, i, key])).toEqual([
      [1, 0, `0:${session}`],
      [{ x: 20, y: 30 }, 1, `1:${session}`],
      [3, 2, `2:${session}`],
      ['cats', 3, `3:${session}`],
    ]);
  });

  test('list.push supports varags', () => {
    const alpha = new InnerListClient({
      checkpoint,
      roomID,
      docID,
      listID,
      ws,
      actor: 'alpha',
      bus: new LocalBus(),
    });

    const finished = alpha.push(1, 2, 'foo');
    expect(finished.toArray()).toEqual([1, 2, 'foo']);
  });

  test('List Clients send stuff to websockets', () => {
    const send = jest.fn();
    const ws = { send };

    const alpha = new InnerListClient({
      checkpoint: checkpoint,
      roomID: roomID,
      docID,
      listID,
      ws,
      actor: 'alpha',
      bus: new LocalBus(),
    });
    alpha.push('cats');

    const body = send.mock.calls[0][1] as Prop<WebSocketDocCmdMessage, 'body'>;
    expect(body.args).toEqual([
      'lins',
      'doc',
      'list',
      'root',
      `0:${alpha.session()}`,
      '"cats"',
    ]);
  });

  test('List Clients add stuff to the end of the list', () => {
    const send = jest.fn();
    const ws = { send };

    let alpha = new InnerListClient({
      checkpoint,
      roomID,
      docID,
      listID,
      ws,
      actor: 'alpha',
      bus: new LocalBus(),
    });
    alpha = alpha.push('cats');
    alpha = alpha.dangerouslyUpdateClientDirectly(
      ['lins', 'doc', 'list', `0:${alpha.session()}`, '0:bob', '"dogs"'],
      btoa('1'),
      false
    );
    alpha = alpha.push('birds');
    alpha = alpha.push('lizards');
    alpha = alpha.push('blizzards');

    expect(alpha.toArray()).toEqual([
      'cats',
      'dogs',
      'birds',
      'lizards',
      'blizzards',
    ]);
  });

  test('List Clients add stuff to the end of the list in the fixture case', () => {
    const fixture = {
      type: 'result',
      body: {
        id: '1f87412b-d411-49ad-a58b-a1464c15959c',
        index: 6,
        api_version: 0,
        vs: 'AAAAOTKy5nUAAA==',
        actors: {
          '0': 'gst_b355e9c9-f1d3-4233-a6c5-e75e1cd0e52c',
          '1': 'gst_b2b6d556-6d0a-4862-b196-6a6e4aa2ff33',
        },
        lists: {
          todo: {
            ids: ['0:0', '1:1', '1:0', '2:1'],
            afters: ['root', '0:0', '0:0', '1:1'],
            values: ['"okay"', '"alright cool"', '"right"', '"left"'],
          },
        },
        maps: { root: {} },
      },
    };

    const send = jest.fn();
    const ws = { send };

    let alpha = new InnerListClient({
      checkpoint: fixture.body,
      roomID,
      docID: fixture.body.id,
      listID: 'todo',
      ws,
      actor: 'gst_b355e9c9-f1d3-4233-a6c5-e75e1cd0e52c',
      bus: new LocalBus(),
    });

    // Sanity check our import is correct
    expect(alpha.toArray()).toEqual(['okay', 'alright cool', 'left', 'right']);

    alpha = alpha.push('last');

    // Assume we just added something to our understand of the end of the list
    expect(alpha.toArray()).toEqual([
      'okay',
      'alright cool',
      'left',
      'right',
      'last',
    ]);
  });

  test('List Clients insertAt correctly', () => {
    const l = new InnerListClient({
      checkpoint,
      roomID,
      docID,
      listID,
      ws,
      actor: 'me',
      bus: new LocalBus(),
    });

    const finished = l.insertAt(0, 'c').insertAt(0, 'a').insertAt(1, 'b');

    expect(finished.toArray()).toEqual(['a', 'b', 'c']);
  });

  test('set undefined == delete', () => {
    const l = new InnerListClient({
      checkpoint,
      roomID,
      docID,
      listID,
      ws,
      actor: 'me',
      bus: new LocalBus(),
    });

    l.insertAt(0, 'a');
    l.set(0, undefined);

    expect(l.toArray()).toEqual([]);
  });
});
