/**
 * A wrapper around idb-keyval to make the
 * "set" and "get" functions more explicit and
 * readable.
 */

import { get, set } from "idb-keyval";

interface IOffline {
  get: (roomRef: string, docId: string) => Promise<string>;
  set: (roomRef: string, docId: string, value: string) => Promise<any>;
}

const Offline: IOffline = {
  get: (roomRef, docId) => get(roomRef + "/" + docId),
  set: (roomRef, docId, value) => set(roomRef + "/" + docId, value)
};

export default Offline;
