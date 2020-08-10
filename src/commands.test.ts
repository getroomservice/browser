import { runRemoteCommandLocally } from './commands';
import { newContext } from './context';
import ReverseTree from './ReverseTree';

test('lcreate creates a list', () => {
  let ctx = newContext('my-doc', 'me');
  ctx = runRemoteCommandLocally(ctx, ['lcreate', 'my-doc', 'my-list']);
  expect(ctx.lists['my-list']).toEqual(new ReverseTree('me'));
});

test('lins inserts an item', () => {
  let ctx = newContext('my-doc', 'me');

  ctx = runRemoteCommandLocally(ctx, ['lcreate', 'my-doc', 'my-list']);
  ctx = runRemoteCommandLocally(ctx, [
    'lins',
    'my-doc',
    'my-list',
    'root',
    '1-blah',
    'dogs',
  ]);

  expect(ctx.lists['my-list'].toArray()).toEqual(['dogs']);
});

test('lput updates an item', () => {
  let ctx = newContext('my-doc', 'me');
  ctx = runRemoteCommandLocally(ctx, ['lcreate', 'my-doc', 'my-list']);
  ctx = runRemoteCommandLocally(ctx, [
    'lins',
    'my-doc',
    'my-list',
    'root',
    '1-blah',
    'dogs',
  ]);
  let d = runRemoteCommandLocally(ctx, [
    'lput',
    'my-doc',
    'my-list',
    '1-blah',
    'cats',
  ]);

  expect(d.lists['my-list'].toArray()).toEqual(['cats']);
});

test('mcreate creates a map', () => {
  let ctx = newContext('my-doc', 'me');

  ctx = runRemoteCommandLocally(ctx, ['mcreate', 'my-doc', 'my-map']);
  expect(ctx.maps['my-map']).toBeTruthy();
});
