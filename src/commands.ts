import ReverseTree from './ReverseTree';
import invariant from 'tiny-invariant';
import { DocumentCheckpoint } from './types';

interface Document {
  lists: { [key: string]: ReverseTree };
  maps: { [key: string]: { [key: string]: any } };
  localIndex: number;
}

interface Context {
  docs: { [key: string]: Document };
  actor: string;
}

export function newContext(actor: string): Context {
  return {
    actor,
    docs: {},
  };
}

export function importDoc(
  ctx: Context,
  checkpoint: DocumentCheckpoint
): Context {
  ctx.docs[checkpoint.id] = {
    localIndex: checkpoint.index,
    lists: {},
    maps: checkpoint.maps,
  };

  for (let id in checkpoint.lists) {
    const rtree = new ReverseTree(id);
    rtree.import(checkpoint.lists[id]);
    ctx.docs[checkpoint.id].lists[id] = rtree;
  }
  return ctx;
}

function lcreate(ctx: Context, cmd: string[]) {
  invariant(cmd.length === 3);
  const [docID, listID] = [cmd[1], cmd[2]];

  invariant(ctx.docs[docID]);
  if (ctx.docs[docID].lists[listID]) {
    return; // noop
  }

  ctx.docs[docID].lists[listID] = new ReverseTree(ctx.actor);
  ctx.docs[docID].localIndex++;
}

function lins(ctx: Context, cmd: string[]) {
  invariant(cmd.length === 6);
  const [, docID, listID, afterID, newID, value] = cmd;

  invariant(ctx.docs[docID]);
  if (!ctx.docs[docID].lists[listID]) {
    return; // out of order noop
  }

  let list = ctx.docs[docID].lists[listID];
  list.insert(afterID, value, newID);

  ctx.docs[docID].localIndex++;
}

function lput(ctx: Context, cmd: string[]) {
  invariant(cmd.length === 5);
  const [, docID, listID, itemID, value] = cmd;

  invariant(ctx.docs[docID]);
  if (!ctx.docs[docID].lists[listID]) {
    return; // out of order noop
  }

  let list = ctx.docs[docID].lists[listID];
  list.put(itemID, value);

  ctx.docs[docID].localIndex++;
}

function mcreate(ctx: Context, cmd: string[]) {
  invariant(cmd.length === 3);
  const [docID, mapID] = [cmd[1], cmd[2]];

  invariant(ctx.docs[docID]);
  if (ctx.docs[docID].maps[mapID]) {
    return; // noop
  }

  ctx.docs[docID].maps[mapID] = {};
  ctx.docs[docID].localIndex++;
}

function mput(ctx: Context, cmd: string[]) {
  invariant(cmd.length === 3);
  const [, docID, mapID, key, value] = cmd;

  invariant(ctx.docs[docID]);
  if (ctx.docs[docID].maps[mapID]) {
    return; // noop
  }

  ctx.docs[docID].maps[mapID][key] = value;
  ctx.docs[docID].localIndex++;
}

/**
 * Runs a command locally
 */
export function runCommandLocally(ctx: Context, cmd: string[]) {
  invariant(cmd.length > 1, `Unexpectedly short command: ${cmd}`);

  const keyword = cmd[0];
  switch (keyword) {
    case 'lcreate':
      lcreate(ctx, cmd);
      break;
    case 'lins':
      lins(ctx, cmd);
      break;
    case 'lput':
      lput(ctx, cmd);
      break;
    case 'mcreate':
      mcreate(ctx, cmd);
      break;
    case 'mput':
      mput(ctx, cmd);
      break;
    default:
      throw new Error(`Unknown command '${keyword}'`);
  }

  return ctx;
}
