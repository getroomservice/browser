/**
 * A wrapper around idb-keyval to make the
 * "set" and "get" functions more explicit and
 * readable.
 */

import { get, set } from "idb-keyval";
import uuid from "uuid/v4";

interface IOffline {
  getDoc: (roomRef: string, docId: string) => Promise<string>;
  setDoc: (roomRef: string, docId: string, value: string) => Promise<any>;
  getOrCreateActor: () => Promise<string>;
}

const Offline: IOffline = {
  getDoc: (roomRef, docId) => get("rs:" + roomRef + "/" + docId),
  setDoc: (roomRef, docId, value) => set("rs:" + roomRef + "/" + docId, value),
  getOrCreateActor: async () => {
    const actor = await get("rs:actor");
    if (actor) {
      return actor as string;
    }

    const id = uuid();
    set("rs:actor", id);
    return id;
  }
};

export default Offline;
