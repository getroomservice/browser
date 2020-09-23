import { NodeValue, DocumentCheckpoint } from './types';
import invariant from 'tiny-invariant';
import { unescapeID } from './util';

interface Node {
  after: string;
  value: NodeValue;
  id: string;
}

interface Tree {
  children: Tree[];
  value: any;
  id: string;
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
    const root: Tree = {
      children: [],
      id: 'root',
      value: '',
    };
    const trees: { [key: string]: Tree } = { root };

    for (const node of this.log) {
      const tree: Tree = {
        children: [],
        id: node.id,
        value: node.value,
      };
      trees[node.id] = tree;

      if (node.after === 'root') {
        root.children.push(tree);
      } else {
        if (!trees[node.after]) {
          throw new Error(`Unexpectedly missing node ${node.after}`);
        }

        trees[node.after].children.push(tree);
      }
    }

    return root;
  }

  sortLog() {
    this.log.sort((a, b) => {
      const [leftCount, leftActor] = a.id.split(':');
      const [rightCount, rightActor] = b.id.split(':');

      if (leftCount === rightCount) {
        return leftActor.localeCompare(rightActor);
      }

      return parseInt(leftCount) - parseInt(rightCount);
    });
  }

  lastID(): string {
    if (this.log.length === 0) {
      return 'root';
    }

    this.sortLog();
    const root = this.toTree();

    // Search the right side of the tree
    function right(t: Tree): Tree {
      if (!t.children || t.children.length === 0) {
        return t;
      }

      return right(t.children[t.children.length - 1]);
    }

    return right(root).id;
  }

  toArray(): Array<any> {
    this.sortLog();

    // -- Convert the log into a regular tree
    const root = this.toTree();

    // -- Do a depth-first traversal to get the result
    function postorder(t: Tree): string[] {
      if (!t.children || t.children.length === 0) {
        return [];
      }

      let vals: string[] = [];
      for (let child of t.children) {
        let value = child.value;
        if (typeof child.value !== 'string') {
          // Skip tombstones
          if (child.value.t === '') {
            vals = vals.concat([...postorder(child)]);
            continue;
          }
          throw new Error('Unimplemented');
        }

        vals = vals.concat([value, ...postorder(child)]);
      }

      return vals;
    }

    return postorder(root);
  }
}
