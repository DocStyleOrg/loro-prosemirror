import { LoroDoc, LoroList, LoroMovableList, LoroText } from "loro-crdt";
import type { Node } from "prosemirror-model";
import { EditorState, type Transaction } from "prosemirror-state";
import { describe, expect, test } from "vitest";

import {
  type LoroDocType,
  type LoroNode,
  type LoroNodeMapping,
  ROOT_DOC_KEY,
  createNodeFromLoroObj,
  getLoroMapChildren,
  updateLoroToPmState,
} from "../src/lib";
import { schema } from "./schema";

type Peer = {
  doc: LoroDocType;
  mapping: LoroNodeMapping;
  state: EditorState;
  movable: boolean;
};

const paragraph = (text: string) =>
  schema.node("paragraph", null, [schema.text(text)]);

function peer(id: number, from?: Peer, movable = from?.movable ?? true): Peer {
  const doc: LoroDocType = new LoroDoc();
  doc.setPeerId(BigInt(id));
  const self: Peer = { doc, mapping: new Map(), state: null!, movable };
  if (from) {
    doc.import(from.doc.export({ mode: "snapshot" }));
    read(self);
  } else {
    self.state = EditorState.create({
      schema,
      doc: schema.node(
        "doc",
        null,
        ["one", "two", "three", "four"].map(paragraph),
      ),
    });
    updateLoroToPmState(doc, self.mapping, self.state, undefined, {
      movableChildren: movable,
    });
  }
  return self;
}

function read(p: Peer) {
  p.mapping = new Map();
  p.state = EditorState.create({
    schema,
    doc: createNodeFromLoroObj(schema, p.doc.getMap(ROOT_DOC_KEY), p.mapping),
  });
}

function edit(p: Peer, build: (tr: Transaction, doc: Node) => Transaction) {
  p.state = p.state.apply(build(p.state.tr, p.state.doc));
  updateLoroToPmState(p.doc, p.mapping, p.state, undefined, {
    movableChildren: p.movable,
  });
}

function sync(a: Peer, b: Peer) {
  a.doc.import(b.doc.export({ mode: "update", from: a.doc.oplogVersion() }));
  b.doc.import(a.doc.export({ mode: "update", from: b.doc.oplogVersion() }));
  read(a);
  read(b);
}

/** Moves top-level block `from` to index `to` among the others. */
const move = (from: number, to: number) => (tr: Transaction, doc: Node) => {
  let pos = 0;
  for (let i = 0; i < from; i++) pos += doc.child(i).nodeSize;
  const node = doc.child(from);
  tr.delete(pos, pos + node.nodeSize);
  let at = 0;
  for (let i = 0; i < to; i++) at += tr.doc.child(i).nodeSize;
  return tr.insert(at, node);
};

/** Types `text` at the end of top-level block `index`. */
const typeAtEnd =
  (index: number, text: string) => (tr: Transaction, doc: Node) => {
    let pos = 0;
    for (let i = 0; i <= index; i++) pos += doc.child(i).nodeSize;
    return tr.insertText(text, pos - 1);
  };

const blocks = (p: Peer) => {
  const out: string[] = [];
  p.state.doc.forEach((child) => out.push(child.textContent));
  return out;
};
const children = (p: Peer) => getLoroMapChildren(p.doc.getMap(ROOT_DOC_KEY));
const ids = (p: Peer) =>
  children(p)
    .toArray()
    .map((child) => (child as LoroNode).id);

describe("movableChildren", () => {
  test("is off by default: children are LoroLists", () => {
    const a = peer(1, undefined, false);
    expect(children(a)).toBeInstanceOf(LoroList);
  });

  test("stores children in LoroMovableLists, nested ones too", () => {
    const a = peer(1);
    expect(children(a)).toBeInstanceOf(LoroMovableList);
    edit(a, (tr, doc) =>
      tr.insert(
        doc.content.size,
        schema.node("bulletList", null, [
          schema.node("listItem", null, [paragraph("item")]),
        ]),
      ),
    );
    const list = children(a).get(4) as LoroNode;
    const item = getLoroMapChildren(list).get(0) as LoroNode;
    expect(getLoroMapChildren(list)).toBeInstanceOf(LoroMovableList);
    expect(getLoroMapChildren(item)).toBeInstanceOf(LoroMovableList);
  });

  test("a ProseMirror move is a Loro move: every block keeps its container", () => {
    const a = peer(1);
    const before = ids(a);
    edit(a, move(3, 0));
    expect(blocks(a)).toEqual(["four", "one", "two", "three"]);
    expect(ids(a)).toEqual([before[3], before[0], before[1], before[2]]);
  });

  test("a concurrent move and an edit inside the moved block both survive", () => {
    const a = peer(1);
    const b = peer(2, a);
    edit(a, move(3, 0));
    edit(b, typeAtEnd(3, "!"));
    sync(a, b);
    expect(blocks(a)).toEqual(["four!", "one", "two", "three"]);
    expect(blocks(b)).toEqual(blocks(a));
  });

  test("without it, the same edit doesn't follow the moved block", () => {
    const a = peer(1, undefined, false);
    const b = peer(2, a);
    edit(a, move(3, 0));
    edit(b, typeAtEnd(3, "!"));
    sync(a, b);
    expect(blocks(a)).not.toContain("four!");
  });

  test("two peers moving the same block leave it in one place, once", () => {
    const a = peer(1);
    const b = peer(2, a);
    edit(a, move(3, 0));
    edit(b, move(3, 1));
    sync(a, b);
    expect(blocks(a)).toHaveLength(4);
    expect(blocks(a).filter((text) => text === "four")).toHaveLength(1);
    expect(blocks(b)).toEqual(blocks(a));
  });

  test("inserting a block twice is a copy: one keeps the container", () => {
    const a = peer(1);
    const before = ids(a);
    edit(a, (tr, doc) => tr.insert(doc.content.size, doc.child(0)));
    const after = ids(a);
    expect(blocks(a)).toEqual(["one", "two", "three", "four", "one"]);
    expect(after.slice(0, 4)).toEqual(before);
    expect(before).not.toContain(after[4]);
    expect(
      (
        getLoroMapChildren(children(a).get(4) as LoroNode).get(0) as LoroText
      ).toString(),
    ).toBe("one");
  });
});
