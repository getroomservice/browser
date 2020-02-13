<p align="center">
  <img src="./misc/logo.svg" width=450 />
</p>

# @roomservice/browser

[Room Service](https://www.roomservice.dev/) helps you add real-time collaboration to your app. It's a real-time service with a built-in [CRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) that automatically merges multiple people's state together without horrifying nightmare bugs. To learn more, see [roomservice.dev](https://www.roomservice.dev).

This is the official, javascript SDK.

## Install

```bash
npm install --save @roomservice/browser
```

## Usage

To get started, create a client with your [Auth Endpoint](https://docs.roomservice.dev/auth).

```ts
import RoomService from "@roomservice/browser";

const client = new RoomService({
  authUrl: "https://mysite.com/auth/roomservice"
});
```

Next, we'll create a room client and try to connect to
the room:

```ts
const room = client.room("my-room");
const { doc } = await room.init();
```

Then, you can publish changes to the room:

```ts
room.publishDoc(doc => {
  doc.title = "LaTeX: a Method of Obscuring Redundancy";
});
```

And listen for any incoming changes:

```ts
room.onUpdate(newDoc => {
  console.log(newDoc);
});
```

## Server Side Rendering

To render on the server, you must include any headers that should be passed along to your
auth endpoint. In most cases, this is just your session cookie.

For example, in Next.js:

```ts
const room = client.room("my-room");

MyComponent.getInitialProps = async ctx => {
  const { doc } = await room.init({
    headers: {
      cookie: ctx.req.headers
    }
  });

  return { doc };
};
```
