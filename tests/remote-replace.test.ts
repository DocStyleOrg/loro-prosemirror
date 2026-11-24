// @vitest-environment jsdom
import { TextSelection } from "prosemirror-state";
import { describe, expect, test } from "vitest";

import { blocks, docWith, fork, mount, paragraphText } from "./view";

describe("applying a remote change", () => {
  test("replaces only what changed, so the caret maps through it", async () => {
    // The caret is in an empty paragraph, where there is no text to anchor a
    // Loro cursor to: only ProseMirror's mapping can keep it in place.
    const doc = docWith(["one", "", "two"]);
    const other = fork(doc);
    const view = await mount(doc);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)),
    );

    paragraphText(other, 2).insert(3, "B");
    other.commit();
    doc.import(other.export({ mode: "update", from: doc.oplogVersion() }));
    expect(blocks(view)).toEqual(["one", "", "twoB"]);

    // The next key, before any timer runs, goes where the caret was.
    view.dispatch(view.state.tr.insertText("A"));
    expect(blocks(view)).toEqual(["one", "A", "twoB"]);
  });

  test("keeps the unchanged blocks' nodes and their DOM", async () => {
    const doc = docWith(["one", "two"]);
    const other = fork(doc);
    const view = await mount(doc);
    const node = view.state.doc.child(0);
    const dom = view.dom.children[0];

    paragraphText(other, 1).insert(3, "B");
    other.commit();
    doc.import(other.export({ mode: "update", from: doc.oplogVersion() }));
    expect(blocks(view)).toEqual(["one", "twoB"]);
    expect(view.state.doc.child(0)).toBe(node);
    expect(view.dom.children[0]).toBe(dom);

    // The binding still finds the kept block: a local edit in it syncs.
    view.dispatch(view.state.tr.insertText("A", 4));
    expect(paragraphText(doc, 0).toString()).toBe("oneA");
  });
});
