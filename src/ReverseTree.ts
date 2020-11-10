import { NodeValue, DocumentCheckpoint } from './types';
import invariant from 'tiny-invariant';
import { unescapeID } from './util';

interface Node {
  after: string;
  value: NodeValue;
  id: string;
}

interface IdValue {
  id: string;
  value: string;
}

interface Tree {
  childrenById: Map<string, Array<string>>;
  valueById: Map<string, NodeValue>;
}

/**
 * A Reverse Tree is one where the children point to the
 * parents, instead of the otherway around.
 *
 * We use a reverse tree because the "insert" operation
 * can be done in paralell.
 */
export default class ReverseTree {
  // an id of the user who's making operations
  private actor: string;

  // The number of operations used by this tree
  private count: number = 0;

  log: Node[];
  nodes: { [key: string]: Node };

  constructor(actor: string) {
    this.actor = actor;
    this.nodes = {};
    this.log = [];
  }

  import(checkpoint: DocumentCheckpoint, listID: string) {
    invariant(checkpoint);

    const list = checkpoint.lists[listID];
    const afters = list.afters || [];
    const ids = list.ids || [];
    const values = list.values || [];

    // Rehydrate the cache
    for (let i = 0; i < afters.length; i++) {
      const node = {
        after: unescapeID(checkpoint, afters[i]),
        id: unescapeID(checkpoint, ids[i]),
        value: values[i],
      };
      this.nodes[node.id] = node;
      this.log.push(node);
    }

    this.count = this.log.length;
  }

  get(itemID: string): NodeValue | undefined {
    if (this.nodes[itemID]) {
      return this.nodes[itemID].value;
    }
    return undefined;
  }

  insert(
    after: 'root' | string,
    value: NodeValue,
    externalNewID?: string
  ): string {
    invariant(this.log);
    let id = externalNewID;
    if (!id) {
      id = `${this.count}:${this.actor}`;
    }
    this.count++;

    const node: Node = {
      after,
      value,
      id,
    };
    this.nodes[id] = node;
    this.log.push(node);
    return id;
  }

  put(itemID: string, value: NodeValue) {
    if (!!this.nodes[itemID]) {
      this.nodes[itemID].value = value;
    }
  }

  has(itemID: string) {
    return !!this.nodes[itemID];
  }

  delete(itemID: string) {
    if (!this.nodes[itemID]) return;
    this.nodes[itemID].value = {
      t: '',
    };
  }

  get length() {
    return Object.keys(this.nodes).length;
  }

  private toTree(): Tree {
    const childrenById = new Map<string, Array<string>>();
    const valueById = new Map<string, NodeValue>();

    for (const node of this.log) {
      if (!childrenById.has(node.after)) {
        childrenById.set(node.after, []);
      }
      childrenById.get(node.after)?.push(node.id);
      valueById.set(node.id, node.value);
    }

    childrenById.forEach((children) => {
      //  sort by logical timestamp descending so that latest inserts appear first
      children.sort((a, b) => {
        const [leftCount, leftActor] = a.split(':');
        const [rightCount, rightActor] = b.split(':');

        if (leftCount === rightCount) {
          return leftActor.localeCompare(rightActor);
        }

        return parseInt(rightCount) - parseInt(leftCount);
      });
    });

    return {
      childrenById,
      valueById,
    };
  }

  lastID(): string {
    if (this.log.length === 0) {
      return 'root';
    }

    const root = this.toTree();

    // Search the right side of the tree
    function right(t: Tree, node: string): string {
      const children = t.childrenById.get(node);
      if (!children || children.length === 0) {
        return node;
      }

      return right(t, children[children.length - 1]);
    }

    return right(root, 'root');
  }

  preOrderTraverse() {
    // -- Convert the log into a regular tree
    const tree = this.toTree();

    const seenNodes = new Set<string>();

    // -- Do a depth-first traversal to get the result
    function preOrder(t: Tree, node: string): IdValue[] {
      if (seenNodes.has(node)) {
        console.warn(
          'RoomService list cycle detected. Consider updating @roomservice/browser.'
        );
        return [];
      }
      seenNodes.add(node);

      let result: IdValue[] = [];
      const value = t.valueById.get(node);

      if (value) {
        if (typeof value === 'string') {
          result.push({ value, id: node });
        } else if ('t' in value && value.t === '') {
          //  Skip tombstones
        } else {
          throw new Error('Unimplemented');
        }
      }

      const children = t.childrenById.get(node);
      if (!children || children.length === 0) {
        return result;
      }

      for (let child of children) {
        result = result.concat(preOrder(t, child));
      }

      return result;
    }

    return preOrder(tree, 'root');
  }

  toArray(): Array<any> {
    return this.preOrderTraverse().map((idValue) => idValue.value);
  }
}
