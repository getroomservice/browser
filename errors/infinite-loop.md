# Infinite Loop

Infinite loop detected.

## Why this error is happening

Somewhere in your code, you're trying to change an object (like a Map or a List) within the `subscribe` function that's listening to that object. Since this would cause an infinite loop, Room Service throws an error.

For example, this code throws an "Infinite loop detected" error:

```tsx
// This is causes an infinite loop
room.subscribe(map, (json) => {
  map.set('name', 'joe');
});
```

## How to fix

Ensure you're not making updates inside of subscription functions. For example:

```tsx
room.subscribe(map, (json) => {
  // ...
});

// This does not cause an infinite loop
nextMap.set('name', 'joe');
```
