import { DocumentContext, DocumentCheckpoint } from './types';
import ReverseTree from './ReverseTree';

export function newContext(id: string, actor: string): DocumentContext {
  return {
    lists: {},
    maps: {},
    localIndex: 0,
    actor,
    id,
  };
}

export function newContextFromCheckpoint(
  checkpoint: DocumentCheckpoint,
  actor: string
): DocumentContext {
  let newCtx: DocumentContext = {
    localIndex: checkpoint.index,
    lists: {},
    maps: checkpoint.maps,
    id: checkpoint.id,
    actor: actor,
  };

  for (let id in checkpoint.lists) {
    const rtree = new ReverseTree(id);
    rtree.import(checkpoint.lists[id]);
    newCtx.lists[id] = rtree;
  }
  return newCtx;
}

export function toJSON(ctx: DocumentContext) {
  let json = {} as any;
  for (let key in ctx.maps['root']) {
    json[key] = ctx.maps['root'][key];
  }
  return json;
}
