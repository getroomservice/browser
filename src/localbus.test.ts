import { LocalBus } from './localbus';

test('localbus works in the simple case', () => {
  const bus = new LocalBus<string>();

  let pet = 'cats';
  bus.subscribe((v) => {
    pet = v;
  });
  bus.publish('dogs');

  expect(pet).toEqual('dogs');
});

test('localbus can get rid of subscribers', () => {
  const bus = new LocalBus<string>();

  let pet = 'cats';
  const unsub = bus.subscribe((v) => {
    pet = v;
  });
  bus.unsubscribe(unsub);
  bus.publish('dogs'); // doesn't get applied

  expect(pet).toEqual('cats');
});

test('localbus can subscribe twice', () => {
  const bus = new LocalBus<string>();

  let pets = [] as string[];
  bus.subscribe((v) => {
    pets.push(v);
  });
  bus.subscribe((v) => {
    pets.push(v);
  });

  bus.publish('dogs');

  expect(pets).toEqual(['dogs', 'dogs']);
});
