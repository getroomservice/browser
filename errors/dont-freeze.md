# Don't Freeze

Don't call `Object.freeze()` on the RoomServiceClient or the RoomClient.

## Why this error is happening

Some libraries, such as Recoil.js, will ["freeze"](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze) a javascript object, making any the object immutable, and causing any updates to the object to throw an error.

Some of Room Service's object's keep an internal cache necessary to prevent bugs and keep your code fast. In doing so, the object will occasionally need to update itself (`this.foobar = "..."`), and will break if frozen.

## Ways to fix this

### If you're using Recoil.js

Don't store `RoomClient` or `RoomServiceClient` in `useRecoilState`.

### If you're using `Object.freeze()`

Don't freeze `RoomClient` or `RoomServiceClient`.
