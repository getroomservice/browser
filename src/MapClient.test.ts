import { Prop } from './types';
import { LocalBus } from './localbus';
import { InnerMapClient } from './MapClient';
import { WebSocketDocCmdMessage } from './wsMessages';

describe('InnerMapClient', () => {
  const send = jest.fn();
  const ws = { send };

  const map = new InnerMapClient({
    // @ts-ignore
    checkpoint: {
      maps: {},
    },
    roomID: 'room',
    docID: 'doc',
    mapID: 'map',
    ws,
    bus: new LocalBus(),
    actor: 'actor',
  });

  test('has the correct id', () => {
    expect(map.id).toEqual('map');
  });

  test('sends mput strings', () => {
    map.set('name', 'alice');
    const body = send.mock.calls[0][1] as Prop<WebSocketDocCmdMessage, 'body'>;
    expect(body.args).toEqual(['mput', 'doc', 'map', 'name', '"alice"']);
    expect(map.get('name')).toEqual('alice');
  });

  test('sends mput numbers', () => {
    map.set('dogs', 2);
    const body = send.mock.calls[1][1] as Prop<WebSocketDocCmdMessage, 'body'>;
    expect(body.args).toEqual(['mput', 'doc', 'map', 'dogs', '2']);
    expect(map.get('dogs')).toEqual(2);
  });

  test('sends mdel', () => {
    map.delete('dogs');
    const body = send.mock.calls[2][1] as Prop<WebSocketDocCmdMessage, 'body'>;
    expect(body.args).toEqual(['mdel', 'doc', 'map', 'dogs']);
    expect(map.get('dogs')).toBeFalsy();
  });

  test('interprets mput', () => {
    map.dangerouslyUpdateClientDirectly(
      ['mput', 'doc', 'map', 'cats', 'smiles'],
      btoa('1'),
      false
    );
    expect(map.get('cats')).toEqual('smiles');
  });

  test('interprets mdel', () => {
    map.dangerouslyUpdateClientDirectly(
      ['mdel', 'doc', 'map', 'cats'],
      btoa('1'),
      false
    );
    expect(map.get('cats')).toBeFalsy();
  });

  test('interprets mput', () => {
    const val = map.set('dogs', 'good').set('snakes', 'snakey').toObject();

    expect(val).toEqual({
      dogs: 'good',
      name: 'alice',
      snakes: 'snakey',
    });
  });

  test('immediately hides deleted keys', () => {
    map.set('k', 'v');
    map.delete('k');

    expect(map.get('k')).toBeUndefined();
    expect(map.keys.find((s) => s === 'k')).toBeUndefined();
    expect(map.toObject()['k']).toBeUndefined();
  });
});
