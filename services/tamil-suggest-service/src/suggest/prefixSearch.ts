import { CorpusItem } from "./types.js";

type TrieNode = {
  children: Map<string, TrieNode>;
  // Store a small list of best items for this prefix for fast top-N
  top: CorpusItem[];
};

function makeNode(): TrieNode {
  return { children: new Map(), top: [] };
}

export class PrefixIndex {
  private root: TrieNode = makeNode();
  private maxTopPerNode: number;

  constructor(opts?: { maxTopPerNode?: number }) {
    this.maxTopPerNode = Math.max(10, Math.min(opts?.maxTopPerNode ?? 60, 200));
  }

  insert(item: CorpusItem) {
    const text = item.text;
    if (!text) return;

    let node = this.root;
    this.maybePushTop(node, item);
    for (const ch of text) {
      let next = node.children.get(ch);
      if (!next) {
        next = makeNode();
        node.children.set(ch, next);
      }
      node = next;
      this.maybePushTop(node, item);
    }
  }

  /**
   * Returns top candidates for a given Tamil prefix (exact prefix traversal).
   */
  lookupPrefix(prefix: string, limit: number): CorpusItem[] {
    if (!prefix) return [];
    let node = this.root;
    for (const ch of prefix) {
      const next = node.children.get(ch);
      if (!next) return [];
      node = next;
    }
    return node.top.slice(0, limit);
  }

  private maybePushTop(node: TrieNode, item: CorpusItem) {
    // Keep dedupe by text in node.top for memory sanity.
    // We only keep a small list, sorted by frequency desc.
    const existingIdx = node.top.findIndex((x) => x.text === item.text);
    if (existingIdx >= 0) {
      if (item.frequency > node.top[existingIdx].frequency) {
        node.top[existingIdx] = item;
      }
    } else {
      node.top.push(item);
    }

    node.top.sort((a, b) => b.frequency - a.frequency || a.text.localeCompare(b.text, "ta"));
    if (node.top.length > this.maxTopPerNode) {
      node.top.length = this.maxTopPerNode;
    }
  }
}


