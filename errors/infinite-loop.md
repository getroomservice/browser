# Infinite Loop

Infinite loop detected.

## Why this error is happening

Somewhere in your code, you're trying to change an object (like a Map or a List) within the `subscribe` function that's listening to that object. Since this would cause an infinite loop, Room Service throws an error.

For example, this code throws an "Infinite loop detected" error:

```tsx
// This is causes an infinite loop
room.subscribe(map, (nextMap) => {
  nextMap.set('name', 'joe');
});
```

## How to fix

Ensure you're not making updates inside of subscription functions. Instead, store the state somewhere else, and then update it.

For example:

```tsx
// This does not cause an infinite loop
let state = map;

room.subscribe(map, (nextMap) => {
  state = nextMap;
});

nextMap.set('name', 'joe');
```
