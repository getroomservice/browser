import { ListCheckpoint } from './types';
import invariant from 'tiny-invariant';

interface Node {
  after: string;
  value: any;
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

  import(checkpoint: ListCheckpoint) {
    invariant(checkpoint);
    this.log = checkpoint;
    this.nodes = {};

    // Rehydrate the cache
    for (let node of this.log) {
      this.nodes[node.id] = node;
    }
  }

  insert(after: 'root' | string, value: string, externalNewID?: string) {
    invariant(this.log);
    let id = externalNewID;
    if (!id) {
      id = `${this.count}:${this.actor}`;
      this.count++;
    }

    const node: Node = {
      after,
      value,
      id,
    };
    this.nodes[id] = node;
    this.log.push(node);
    return id;
  }

  put(itemID: string, value: string) {
    if (!!this.nodes[itemID]) {
      this.nodes[itemID].value = value;
    }
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
    this.sortLog();

    // -- Convert the log into a regular tree
    const root = this.toTree();

    // Search the left side of the tree
    function left(t: Tree): Tree {
      if (!t.children || t.children.length === 0) {
        return t;
      }

      return left(t.children[0]);
    }

    return left(root).id;
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
        vals = vals.concat([child.value, ...postorder(child)]);
      }

      return vals;
    }

    return postorder(root);
  }
}
