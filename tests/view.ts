import { LoroDoc, type LoroText } from "loro-crdt";
import { type Plugin, EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import {
  type LoroDocType,
  type LoroNode,
  ROOT_DOC_KEY,
  getLoroMapChildren,
  updateLoroToPmState,
} from "../src/lib";
import { LoroSyncPlugin } from "../src/sync-plugin";
import { schema } from "./schema";
import { oneMs } from "./utils";

/** A Loro document holding `paragraphs`, written by the binding. */
export function docWith(paragraphs: string[]): LoroDocType {
  const doc: LoroDocType = new LoroDoc();
  const state = EditorState.create({
    schema,
    doc: schema.node(
      "doc",
      null,
      paragraphs.map((text) =>
        schema.node("paragraph", null, text ? [schema.text(text)] : []),
      ),
    ),
  });
  updateLoroToPmState(doc, new Map(), state);
  return doc;
}

/** Another peer's copy of `doc`, with its own peer id. */
export function fork(doc: LoroDocType): LoroDocType {
  const copy: LoroDocType = new LoroDoc();
  copy.import(doc.export({ mode: "snapshot" }));
  return copy;
}

/** Sends `from`'s changes that `to` hasn't seen, and waits for its events. */
export async function deliver(from: LoroDocType, to: LoroDocType) {
  to.import(from.export({ mode: "update", from: to.oplogVersion() }));
  await oneMs();
}

/** An editor on `doc` with the sync plugin, once the binding has loaded it. */
export async function mount(
  doc: LoroDocType,
  plugins: Plugin[] = [],
): Promise<EditorView> {
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      schema,
      plugins: [LoroSyncPlugin({ doc }), ...plugins],
    }),
  });
  await oneMs();
  return view;
}

/** The text of each top-level block. */
export function blocks(view: EditorView): string[] {
  const out: string[] = [];
  view.state.doc.forEach((child) => out.push(child.textContent));
  return out;
}

/** The LoroText of top-level paragraph `index`, as another peer would edit it. */
export function paragraphText(doc: LoroDocType, index: number): LoroText {
  const block = getLoroMapChildren(doc.getMap(ROOT_DOC_KEY)).get(index);
  return getLoroMapChildren(block as LoroNode).get(0) as LoroText;
}
