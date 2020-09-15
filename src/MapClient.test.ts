import { MapClient } from './MapClient';
import SuperlumeWebSocket from './ws';
import { WebSocketDocCmdMessage } from './wsMessages';

describe('MapClient', () => {
  const send = jest.fn();
  const ws = new SuperlumeWebSocket({
    onmessage: jest.fn(),
    send,
  });

  const map = new MapClient({}, 'room', 'doc', 'map', ws);

  test('has the correct id', () => {
    expect(map.id).toEqual('map');
  });

  test('sends mput strings', () => {
    map.set('name', 'alice');
    const msg = JSON.parse(send.mock.calls[0][0]) as WebSocketDocCmdMessage;
    expect(msg.body.args).toEqual(['mput', 'doc', 'map', 'name', '"alice"']);
    expect(map.get('name')).toEqual('alice');
  });

  test('sends mput numbers', () => {
    map.set('dogs', 2);
    const msg = JSON.parse(send.mock.calls[1][0]) as WebSocketDocCmdMessage;
    expect(msg.body.args).toEqual(['mput', 'doc', 'map', 'dogs', '2']);
    expect(map.get('dogs')).toEqual(2);
  });

  test('sends mdel', () => {
    map.delete('dogs');
    const msg = JSON.parse(send.mock.calls[2][0]) as WebSocketDocCmdMessage;
    expect(msg.body.args).toEqual(['mdel', 'doc', 'map', 'dogs']);
    expect(map.get('dogs')).toBeFalsy();
  });

  test('interprets mput', () => {
    map.dangerouslyUpdateClientDirectly([
      'mput',
      'doc',
      'map',
      'cats',
      'smiles',
    ]);
    expect(map.get('cats')).toEqual('smiles');
  });

  test('interprets mdel', () => {
    map.dangerouslyUpdateClientDirectly(['mdel', 'doc', 'map', 'cats']);
    expect(map.get('cats')).toBeFalsy();
  });
});
