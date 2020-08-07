import { runCommandLocally, newContext } from './commands';
import ReverseTree from './ReverseTree';

test('lcreate creates a list', () => {
  let ctx = newContext('me');
  ctx.docs['my-doc'] = {
    lists: {},
    maps: {},
    localIndex: 0,
  };

  ctx = runCommandLocally(ctx, ['lcreate', 'my-doc', 'my-list']);

  const d = ctx.docs['my-doc'];
  expect(d.lists['my-list']).toEqual(new ReverseTree('me'));
});

test('lins inserts an item', () => {
  let ctx = newContext('me');
  ctx.docs['my-doc'] = {
    lists: {},
    maps: {},
    localIndex: 0,
  };

  ctx = runCommandLocally(ctx, ['lcreate', 'my-doc', 'my-list']);
  ctx = runCommandLocally(ctx, [
    'lins',
    'my-doc',
    'my-list',
    'root',
    '1-blah',
    'dogs',
  ]);

  const d = ctx.docs['my-doc'];
  expect(d.lists['my-list'].toArray()).toEqual(['dogs']);
});

test('lput updates an item', () => {
  let ctx = newContext('me');
  ctx.docs['my-doc'] = {
    lists: {},
    maps: {},
    localIndex: 0,
  };

  ctx = runCommandLocally(ctx, ['lcreate', 'my-doc', 'my-list']);
  ctx = runCommandLocally(ctx, [
    'lins',
    'my-doc',
    'my-list',
    'root',
    '1-blah',
    'dogs',
  ]);
  ctx = runCommandLocally(ctx, ['lput', 'my-doc', 'my-list', '1-blah', 'cats']);

  const d = ctx.docs['my-doc'];
  expect(d.lists['my-list'].toArray()).toEqual(['cats']);
});

test('mcreate creates a map', () => {
  let ctx = newContext('me');
  ctx.docs['my-doc'] = {
    lists: {},
    maps: {},
    localIndex: 0,
  };

  ctx = runCommandLocally(ctx, ['mcreate', 'my-doc', 'my-map']);

  const d = ctx.docs['my-doc'];
  expect(d.maps['my-map']).toBeTruthy();
});
