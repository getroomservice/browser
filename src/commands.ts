import ReverseTree from './ReverseTree';
import invariant from 'tiny-invariant';
import { DocumentContext } from './types';

function lcreate(ctx: DocumentContext, cmd: string[]) {
  invariant(cmd.length === 3);
  const [docID, listID] = [cmd[1], cmd[2]];
  invariant(ctx.id === docID);

  if (ctx.lists[listID]) {
    return; // noop
  }

  ctx.lists[listID] = new ReverseTree(ctx.actor);
  ctx.localIndex++;
}

function lins(ctx: DocumentContext, cmd: string[]) {
  invariant(cmd.length === 6);
  const [, docID, listID, afterID, newID, value] = cmd;

  invariant(ctx.id === docID);
  if (!ctx.lists[listID]) {
    return; // out of order noop
  }

  let list = ctx.lists[listID];
  list.insert(afterID, value, newID);

  ctx.localIndex++;
}

function lput(ctx: DocumentContext, cmd: string[]) {
  invariant(cmd.length === 5);
  const [, docID, listID, itemID, value] = cmd;

  invariant(ctx.id === docID);
  if (!ctx.lists[listID]) {
    return; // out of order noop
  }

  let list = ctx.lists[listID];
  list.put(itemID, value);

  ctx.localIndex++;
}

function mcreate(ctx: DocumentContext, cmd: string[]) {
  invariant(cmd.length === 3);
  const [docID, mapID] = [cmd[1], cmd[2]];

  invariant(ctx.id === docID);
  if (ctx.maps[mapID]) {
    return; // noop
  }

  ctx.maps[mapID] = {};
  ctx.localIndex++;
}

function mput(ctx: DocumentContext, cmd: string[]) {
  invariant(cmd.length === 5);
  const [, docID, mapID, key, value] = cmd;

  invariant(ctx.id === docID);
  if (ctx.maps[mapID]) {
    return; // noop
  }

  ctx.maps[mapID][key] = value;
  ctx.localIndex++;
}

/**
 * Runs any remote command
 */
export function runRemoteCommandLocally(ctx: DocumentContext, cmd: string[]) {
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

// Run mput locally, return the resulting command
export function runMput(
  ctx: DocumentContext,
  mapID: string,
  key: string,
  value: string
): [DocumentContext, Array<string>] {
  const cmd = ['mput', ctx.id, mapID, key, value];
  mput(ctx, cmd);
  return [ctx, cmd];
}

// Run lins locally, return the resulting command
export function runLins(
  ctx: DocumentContext,
  listID: string,
  after: string,
  value: string
): [DocumentContext, string, Array<string>] {
  const id = ctx.lists[listID].insert(after, value);
  const cmd = ['lins', ctx.id, listID, after, id, value];
  return [ctx, id, cmd];
}
