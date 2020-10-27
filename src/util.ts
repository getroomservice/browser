import { DocumentCheckpoint } from 'types';

export function unescapeID(checkpoint: DocumentCheckpoint, id: string): string {
  if (id === 'root') return 'root';
  let [index, a] = id.split(':');
  return index + ':' + checkpoint.actors[parseInt(a)];
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}