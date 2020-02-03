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
  getDoc: async (roomRef, docId) => {
    try {
      return await get("rs:" + roomRef + "/" + docId);
    } catch (err) {
      console.warn(
        "Something went wrong getting Room Service's state offline",
        err
      );
      return "";
    }
  },
  setDoc: async (roomRef, docId, value) => {
    try {
      await set("rs:" + roomRef + "/" + docId, value);
    } catch (err) {
      console.warn(
        "Something went wrong saving Room Service's state offline",
        err
      );
    }
  },
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
