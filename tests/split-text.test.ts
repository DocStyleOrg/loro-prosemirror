import { LoroDoc, LoroText } from "loro-crdt";
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

type Peer = { doc: LoroDocType; mapping: LoroNodeMapping; state: EditorState };

function peer(id: number, from?: Peer): Peer {
  const doc: LoroDocType = new LoroDoc();
  doc.setPeerId(BigInt(id));
  const self: Peer = { doc, mapping: new Map(), state: null! };
  if (from) {
    doc.import(from.doc.export({ mode: "snapshot" }));
    read(self);
  } else {
    self.state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [schema.node("paragraph")]),
    });
    updateLoroToPmState(doc, self.mapping, self.state);
  }
  return self;
}

/** Rebuilds the editor state from Loro, as the sync plugin does after an import. */
function read(p: Peer) {
  p.mapping = new Map();
  p.state = EditorState.create({
    schema,
    doc: createNodeFromLoroObj(schema, p.doc.getMap(ROOT_DOC_KEY), p.mapping),
  });
}

function edit(p: Peer, build: (tr: Transaction) => Transaction) {
  p.state = p.state.apply(build(p.state.tr));
  updateLoroToPmState(p.doc, p.mapping, p.state);
}

function sync(a: Peer, b: Peer) {
  a.doc.import(b.doc.export({ mode: "update", from: a.doc.oplogVersion() }));
  b.doc.import(a.doc.export({ mode: "update", from: b.doc.oplogVersion() }));
  read(a);
  read(b);
}

/** Types `text` right after the first `after` in the paragraph. */
const typeAfter = (p: Peer, after: string, text: string) =>
  edit(p, (tr) =>
    tr.insertText(
      text,
      1 + p.state.doc.textContent.indexOf(after) + after.length,
    ),
  );

const texts = (p: Peer) =>
  getLoroMapChildren(
    getLoroMapChildren(p.doc.getMap(ROOT_DOC_KEY)).get(0) as LoroNode,
  )
    .toArray()
    .map((child) => (child as LoroText).toString());

describe("a paragraph whose text is in several LoroTexts", () => {
  test("two peers typing first into one empty paragraph keep every character once", () => {
    const a = peer(1);
    const b = peer(2, a);

    // Each creates the paragraph's first LoroText, so it ends up with two.
    typeAfter(a, "", "A");
    typeAfter(b, "", "B");
    sync(a, b);
    expect(texts(a)).toHaveLength(2);
    const joined = a.state.doc.textContent;
    expect(joined.split("").sort().join("")).toBe("AB");

    // Each keeps typing after their own first character.
    typeAfter(a, "A", "a");
    typeAfter(b, "B", "b");
    sync(a, b);

    const expected = joined.replace("A", "Aa").replace("B", "Bb");
    expect(a.state.doc.textContent).toBe(expected);
    expect(b.state.doc.textContent).toBe(expected);
  });

  test("an edit changes only the LoroTexts it touches", () => {
    const a = peer(1);
    const b = peer(2, a);
    typeAfter(a, "", "t");
    typeAfter(b, "", "P");
    sync(a, b);
    const [first, second] = texts(a);

    // At the boundary, an insert goes to the text it follows.
    typeAfter(a, first, "h");
    expect(texts(a)).toEqual([first + "h", second]);
    // A delete across the boundary takes from both and removes neither.
    edit(a, (tr) => tr.delete(2, 4));
    expect(texts(a)).toEqual([first, second.slice(1)]);
  });
});
