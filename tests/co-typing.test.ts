// @vitest-environment jsdom
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { describe, expect, test } from "vitest";

import { blocks, docWith, fork, mount, paragraphText } from "./view";

describe("typing while remote changes arrive", () => {
  test("the caret stays put when another block changes", async () => {
    const doc = docWith(["one", "two"]);
    const other = fork(doc);
    const view = await mount(doc);
    view.dispatch(view.state.tr.setSelection(selectionAt(view, 4)));

    paragraphText(other, 1).insert(3, "B");
    other.commit();
    doc.import(other.export({ mode: "update", from: doc.oplogVersion() }));
    expect(blocks(view)).toEqual(["one", "twoB"]);

    // The next key, before any timer runs, goes where the caret was.
    view.dispatch(view.state.tr.insertText("A"));
    expect(blocks(view)).toEqual(["oneA", "twoB"]);
  });

  test("a remote insert at the caret lands after it", async () => {
    const doc = docWith(["one"]);
    const other = fork(doc);
    const view = await mount(doc);
    view.dispatch(view.state.tr.setSelection(selectionAt(view, 4)));

    paragraphText(other, 0).insert(3, "X");
    other.commit();
    doc.import(other.export({ mode: "update", from: doc.oplogVersion() }));

    // Each typist's run stays together: this one continues after "one".
    view.dispatch(view.state.tr.insertText("A"));
    view.dispatch(view.state.tr.insertText("B"));
    expect(blocks(view)).toEqual(["oneABX"]);
  });
});

function selectionAt(view: EditorView, pos: number) {
  return TextSelection.create(view.state.doc, pos);
}
