// @vitest-environment jsdom
import { history, undo, undoDepth } from "prosemirror-history";
import { describe, expect, test } from "vitest";

import { blocks, deliver, docWith, fork, mount, paragraphText } from "./view";

describe("ProseMirror history", () => {
  test("loading the document is not an undoable step", async () => {
    const view = await mount(docWith(["one", "two"]), [history()]);
    expect(blocks(view)).toEqual(["one", "two"]);
    expect(undoDepth(view.state)).toBe(0);

    // Undoing the load would empty the editor, and the binding would sync
    // that as deleting the whole document.
    undo(view.state, view.dispatch);
    expect(blocks(view)).toEqual(["one", "two"]);
  });

  test("a remote change is not an undoable step", async () => {
    const doc = docWith(["one", "two"]);
    const other = fork(doc);
    const view = await mount(doc, [history()]);

    paragraphText(other, 1).insert(3, "B");
    other.commit();
    await deliver(other, doc);
    expect(blocks(view)).toEqual(["one", "twoB"]);
    expect(undoDepth(view.state)).toBe(0);

    undo(view.state, view.dispatch);
    expect(blocks(view)).toEqual(["one", "twoB"]);
  });
});
