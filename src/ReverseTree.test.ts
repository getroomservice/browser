import ReverseTree from './ReverseTree';

test('reverse tree can insert items', () => {
  const rt = new ReverseTree('me');
  rt.insert('root', 'dogs');
  expect(rt.toArray()).toEqual(['dogs']);
});

test('reverse tree can insert lots of items', () => {
  const rt = new ReverseTree('me');

  const result = [];
  for (let i = 0; i < 20; i++) {
    result.push(`donut #${i}`);
    rt.insert('root', `donut #${i}`);
  }
  expect(rt.toArray()).toEqual(result);
});

test('reverse tree always returns the last id', () => {
  const rt = new ReverseTree('me');

  const result = [];
  for (let i = 0; i < 20; i++) {
    result.push(`${i}`);
    rt.insert('root', `${i}`);
  }

  const arr = rt.toArray();
  expect(rt.nodes[`19:me`].value).toEqual(arr[arr.length - 1]);
});

test('reverse tree doesnt interweave', () => {
  const rt = new ReverseTree('me');

  function insertFromActor(rt: ReverseTree, actor: string, word: string) {
    let after = 'root';
    for (let i = 0; i < word.length; i++) {
      after = rt.insert(after, word[i], `${i}:${actor}`);
    }
  }

  insertFromActor(rt, 'birds', 'birds');
  insertFromActor(rt, 'dogs', 'dogs');
  insertFromActor(rt, 'cats', 'cats');
  insertFromActor(rt, 'ants', 'ants');
  insertFromActor(rt, 'somereallylongtext', 'somereallylongtext');

  expect(rt.toArray().join('')).toEqual('antsbirdscatsdogssomereallylongtext');
});

test('reverse tree can delete items', () => {
  const rt = new ReverseTree('me');
  const first = rt.insert('root', 'dog');
  const second = rt.insert(first, 'cat');
  const third = rt.insert(second, 'bird');
  expect(rt.toArray()).toEqual(['dog', 'cat', 'bird']);

  rt.delete(first);
  expect(rt.toArray()).toEqual(['cat', 'bird']);

  rt.delete(second);
  expect(rt.toArray()).toEqual(['bird']);

  rt.delete(third);
  expect(rt.toArray()).toEqual([]);
});

test('can add items after a deleted item', () => {
  const rt = new ReverseTree('me');
  const first = rt.insert('root', 'dog');
  const second = rt.insert(first, 'cat');

  rt.delete(second);
  rt.insert(second, 'bird');

  expect(rt.toArray()).toEqual(['dog', 'bird']);
});
