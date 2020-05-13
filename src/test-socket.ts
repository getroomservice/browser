/**
 * Fake sockets implemented as Node events
 * to test the client.
 */

import Emitter from 'events';
import Sockets from './socket';

export const injectFakeSocket = () => {
  jest
    .spyOn(Sockets, 'newSocket')
    // @ts-ignore because typescript doesn't like our deep testing magic
    .mockImplementation((url, connectopts) => {
      return {};
    });

  const events = new Emitter();

  jest.spyOn(Sockets, 'on').mockImplementation((_, event, fn) => {
    events.on(event, fn);
  });

  jest.spyOn(Sockets, 'emit').mockImplementation((_, event, ...args) => {
    events.emit(event, ...args);
  });

  jest.spyOn(Sockets, 'disconnect').mockImplementation(() => {
    events.removeAllListeners();
  });

  return events;
};
