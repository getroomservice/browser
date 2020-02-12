// What you'd think an object is, not what typescript thinks an object is.
export type Obj = { [key: string]: any };

export interface Room {
  reference: string;
  id: string;
  state?: any;
}

export interface Session {
  token: string;
}
