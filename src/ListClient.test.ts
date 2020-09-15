import { ListClient } from './ListClient';
import { DocumentCheckpoint } from './types';
import SuperlumeWebSocket from './ws';

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
  const ws = new SuperlumeWebSocket({
    onmessage: jest.fn(),
    send,
    readyState: WebSocket.OPEN,
  });

  test("List clients don't include extra quotes", () => {
    const alpha = new ListClient(
      checkpoint,
      roomID,
      docID,
      listID,
      ws,
      'alpha'
    );

    const finishedAlpha = alpha
      .push('"1"')
      .push('2')
      .push(3)
      .push('');

    expect(finishedAlpha.toArray()).toEqual(['"1"', '2', 3, '']);
  });

  test('List Clients send stuff to websockets', () => {
    const send = jest.fn();
    const ws = new SuperlumeWebSocket({
      onmessage: jest.fn(),
      send,
      readyState: WebSocket.OPEN,
    });

    const alpha = new ListClient(
      checkpoint,
      roomID,
      docID,
      listID,
      ws,
      'alpha'
    );
    alpha.push('cats');

    const msg = JSON.parse(send.mock.calls[0][0]) as any;
    expect(msg.body.args).toEqual([
      'lins',
      'doc',
      'list',
      'root',
      '0:alpha',
      '"cats"',
    ]);
  });

  test('List Clients add stuff to the end of the list', () => {
    const send = jest.fn();
    const ws = new SuperlumeWebSocket({
      onmessage: jest.fn(),
      send,
    });

    let alpha = new ListClient(checkpoint, roomID, docID, listID, ws, 'alpha');
    alpha = alpha.push('cats');
    alpha = alpha.dangerouslyUpdateClientDirectly([
      'lins',
      'doc',
      'list',
      '0:alpha',
      '0:bob',
      '"dogs"',
    ]);
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
    const ws = new SuperlumeWebSocket({
      onmessage: jest.fn(),
      send,
    });

    let alpha = new ListClient(
      fixture.body,
      roomID,
      fixture.body.id,
      'todo',
      ws,
      'gst_b355e9c9-f1d3-4233-a6c5-e75e1cd0e52c'
    );

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
});
