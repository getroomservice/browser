import { from, save } from "automerge";
import nock from "nock";
import RoomServiceClient from "./client";
import Offline from "./offline";
import Sockets from "./socket";
import { injectFakeSocket } from "./test-socket";

const URL = "https://coolsite.com";
jest.mock("idb-keyval");

function mockAuthEndpoint(stateStr?: string) {
  return nock(URL)
    .post("/api/roomservice")
    .reply(200, {
      room: {
        id: "id",
        reference: "my-room",
        state: stateStr || "{}"
      },
      session: {
        token: "short-lived-token"
      }
    });
}

it("should call the authorization endpoint when creating a room", async () => {
  const socket = injectFakeSocket();
  const scope = mockAuthEndpoint();
  const client = new RoomServiceClient({
    authUrl: URL + "/api/roomservice"
  });
  const room = client.room("my-room");

  await room.init();

  expect(scope.isDone()).toBeTruthy();
});

test("room gets called with bearer token", async () => {
  mockAuthEndpoint();
  const mock = jest
    .spyOn(Sockets, "newSocket")
    .mockImplementation((url, connectopts) => {
      // @ts-ignore
      return { on: jest.fn() } as SocketIOClient.Socket;
    }).mock;

  const client = new RoomServiceClient({
    authUrl: URL + "/api/roomservice"
  });
  const room = client.room("my-room");
  await room.init();
  const [url, args] = mock.calls[0];

  expect(url).toBe("https://api.roomservice.dev");

  // @ts-ignore because bad typings make me sad
  expect(args.transportOptions!.polling.extraHeaders.authorization).toBe(
    "Bearer short-lived-token"
  );
});

test("room.publish() can change a document", async () => {
  mockAuthEndpoint();

  const client = new RoomServiceClient({
    authUrl: URL + "/api/roomservice"
  });

  const room = client.room("my-room");
  const sockets = injectFakeSocket();
  await room.init();
  sockets.emit("connect");

  const newState = await room.publishDoc(prevState => {
    prevState.someOption = "hello!";
  });

  expect(newState.someOption).toBe("hello!");
});

test("room.restore() attempts to restore from offline", async () => {
  const client = new RoomServiceClient({
    authUrl: URL + "/api/roomservice"
  });
  const room = client.room("my-room");

  jest.spyOn(Offline, "getDoc").mockImplementation(async (ref, doc) => {
    return save(from({ name: "offlinedoc" }));
  });

  const doc = await room.restore();
  expect(doc).toEqual({ name: "offlinedoc" });
});

test("room.init() will merge online data with offline data", async () => {
  const client = new RoomServiceClient({
    authUrl: URL + "/api/roomservice"
  });
  const room = client.room("my-room");

  // setup offline
  jest.spyOn(Offline, "getDoc").mockImplementation(async (ref, doc) => {
    return save(from({ offline: "offline" }));
  });

  // setup online
  mockAuthEndpoint(save(from({ online: "online" })));

  const { doc } = await room.init();
  expect(doc).toEqual({
    offline: "offline",
    online: "online"
  });
});

test("room.onUpdateDoc callback tries to save the document to offline", async done => {
  mockAuthEndpoint();
  const client = new RoomServiceClient({
    authUrl: URL + "/api/roomservice"
  });
  const room = client.room("my-room");

  const cb = jest.fn();
  room.onUpdateDoc(cb);

  // @ts-ignore private
  const onUpdateSocket = room._onUpdateSocketCallback;
  expect(onUpdateSocket).toBeTruthy();

  await room.init();

  // @ts-ignore private; we'd normally get this from the auth endpoint
  room._roomId = "my-room-id";

  const setOffline = jest.spyOn(Offline, "setDoc");

  onUpdateSocket!(
    JSON.stringify({
      meta: {
        roomId: "my-room-id"
      },
      payload: {
        msg: {
          clock: new Map(),
          docId: "default"
        }
      }
    })
  );

  // Sanity check that our onUpdateDoc callback was called
  expect(cb.mock.calls.length).toBeGreaterThan(1);

  // We wait here because saving offline is debounced.
  setTimeout(() => {
    expect(setOffline.mock.calls.length).toBeGreaterThanOrEqual(1);
    done();
  }, 160); // Debounce time
});
