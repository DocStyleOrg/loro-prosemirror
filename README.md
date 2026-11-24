# Prosemirror Binding for Loro

- Sync document state with Loro
- Sync cursors with Loro's EphemeralStore (preferred) or legacy Awareness and
  [Cursor](https://loro.dev/docs/tutorial/cursor)
- Undo/Redo in collaborative editing
- [🎨 Try it online](https://main--6661e86e215da40180d90507.chromatic.com)

```ts
import {
  CursorEphemeralStore,
  LoroEphemeralCursorPlugin,
  LoroSyncPlugin,
  LoroUndoPlugin,
  redo,
  undo,
} from "loro-prosemirror";
import { LoroDoc } from "loro-crdt";
import { EditorView } from "prosemirror-view";
import { EditorState } from "prosemirror-state";

const doc = new LoroDoc();
const presence = new CursorEphemeralStore(doc.peerIdStr);

const plugins = [
  ...pmPlugins,
  LoroSyncPlugin({ doc }),
  LoroUndoPlugin({ doc }),
  keymap({
    "Mod-z": undo,
    "Mod-y": redo,
    "Mod-Shift-z": redo,
  }),
  LoroEphemeralCursorPlugin(presence, {}),
];
const editor = new EditorView(editorDom, {
  state: EditorState.create({ doc, plugins }),
});
```

https://github.com/loro-dev/prosemirror/assets/18425020/d0f01760-b76c-43b5-b7f7-b0b224130d9d

## Syncing more than one editor instance

In case you want to sync multiple ProseMirror editor instances to the same Loro document, you can define for each ProseMirror editor the [Container ID](https://loro.dev/docs/advanced/cid) into which the editor's content will be stored:

```ts
const doc = new LoroDoc();
const map = doc.getMap("<unique-id-per-editor-instance>");

const plugins = [
  LoroSyncPlugin({ doc, containerId: map.id }),
  // see above for other plugins
];
```

## Moving blocks

By default, a node's children are stored in a `LoroList`, so moving a block in ProseMirror deletes it and inserts a copy. A concurrent edit inside the moved block doesn't follow it. With `movableChildren`, children are stored in a [`LoroMovableList`](https://loro.dev/docs/tutorial/list), and a move is a Loro move that keeps the block's container and the edits inside it:

```ts
LoroSyncPlugin({ doc, movableChildren: true });
```

The option decides the kind of list when the binding creates the document's first one. New lists take the kind of the list they sit in, so a document keeps one kind throughout. Moves stay within one list: moving a block into another list, such as into a list item, still deletes and re-creates it.
