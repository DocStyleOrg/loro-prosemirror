import type { Cursor, LoroEventBatch, LoroMap } from "loro-crdt";
import { Fragment, Slice } from "prosemirror-model";
import {
  type EditorState,
  Plugin,
  type StateField,
  TextSelection,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import {
  caretToCursor,
  cursorToAbsolutePosition,
  cursorToCaret,
} from "./cursor/common";
import {
  clearChangedNodes,
  createNodeFromLoroObj,
  type LoroDocType,
  type LoroNodeContainerType,
  type LoroNodeMapping,
  ROOT_DOC_KEY,
  safeSetSelection,
  updateLoroToPmState,
} from "./lib";
import {
  loroSyncPluginKey,
  type LoroSyncPluginProps,
  type LoroSyncPluginState,
} from "./sync-plugin-key";
import { configLoroTextStyle } from "./text-style";
import { loroUndoPluginKey } from "./undo-plugin-key";

type PluginTransactionType =
  | {
      type: "doc-changed";
    }
  | {
      type: "non-local-updates";
    }
  | {
      type: "update-state";
      state: Partial<LoroSyncPluginState>;
    };

export const LoroSyncPlugin = (props: LoroSyncPluginProps): Plugin => {
  return new Plugin({
    key: loroSyncPluginKey,
    props: {
      editable: (state) => {
        const syncState = loroSyncPluginKey.getState(state);
        return syncState?.snapshot == null;
      },
    },
    state: {
      init: (_config, editorState): LoroSyncPluginState => {
        configLoroTextStyle(props.doc, editorState.schema);

        return {
          doc: props.doc,
          mapping: props.mapping ?? new Map(),
          changedBy: "local",
          containerId: props.containerId,
        };
      },
      apply: (tr, state, oldEditorState, newEditorState) => {
        const meta = tr.getMeta(
          loroSyncPluginKey,
        ) as PluginTransactionType | null;
        const undoState = loroUndoPluginKey.getState(oldEditorState);

        if (meta?.type === "non-local-updates") {
          state.changedBy = "import";
        } else {
          state.changedBy = "local";
        }
        switch (meta?.type) {
          case "doc-changed":
            if (!undoState?.isUndoing.current) {
              updateLoroToPmState(
                state.doc as LoroDocType,
                state.mapping,
                newEditorState,
                props.containerId,
              );
            }
            break;
          case "update-state":
            state = { ...state, ...meta.state };
            state.doc.commit({
              origin: "sys:init",
              timestamp: Date.now(),
            });
            break;
          default:
            break;
        }
        return state;
      },
    } as StateField<LoroSyncPluginState>,
    appendTransaction: (transactions, _oldEditorState, newEditorState) => {
      if (transactions.some((tr) => tr.docChanged)) {
        return newEditorState.tr.setMeta(loroSyncPluginKey, {
          type: "doc-changed",
        });
      }
      return null;
    },
    view: (view: EditorView) => {
      const timeoutId = setTimeout(() => init(view), 0);
      return {
        update: (view: EditorView, _prevState: EditorState) => {
          storeCaret(view);
        },
        destroy: () => {
          clearTimeout(timeoutId);
        },
      };
    },
  });
};

// This is called when the plugin's state is associated with an editor view
function init(view: EditorView) {
  if (view.isDestroyed) {
    return;
  }

  const state = loroSyncPluginKey.getState(view.state) as LoroSyncPluginState;

  let docSubscription = state.docSubscription;

  docSubscription?.();

  if (state.containerId) {
    docSubscription = state
      .doc!.getContainerById(state.containerId)!
      .subscribe((event) => {
        updateNodeOnLoroEvent(view, event);
      });
  } else {
    docSubscription = state.doc.subscribe((event) =>
      updateNodeOnLoroEvent(view, event),
    );
  }

  const innerDoc = state.containerId
    ? (state.doc.getContainerById(
        state.containerId,
      ) as LoroMap<LoroNodeContainerType>)
    : (state.doc as LoroDocType).getMap(ROOT_DOC_KEY);

  const mapping: LoroNodeMapping = new Map();
  if (innerDoc.size === 0) {
    // Empty doc
    const tr = view.state.tr.delete(0, view.state.doc.content.size);
    tr.setMeta(loroSyncPluginKey, {
      type: "update-state",
      state: { mapping, docSubscription, snapshot: null },
    });
    view.dispatch(tr);
  } else {
    const schema = view.state.schema;
    // Create node from loro object
    const node = createNodeFromLoroObj(
      schema,
      innerDoc as LoroMap<LoroNodeContainerType>,
      mapping,
    );
    const tr = view.state.tr.replace(
      0,
      view.state.doc.content.size,
      new Slice(Fragment.from(node), 0, 0),
    );
    tr.setMeta(loroSyncPluginKey, {
      type: "update-state",
      state: { mapping, docSubscription, snapshot: null },
    });
    view.dispatch(tr);
  }
}

function updateNodeOnLoroEvent(view: EditorView, event: LoroEventBatch) {
  if (view.isDestroyed) {
    return;
  }

  const state = loroSyncPluginKey.getState(view.state) as LoroSyncPluginState;
  state.changedBy = event.by;
  if (event.by === "local" && event.origin !== "undo") {
    return;
  }

  const mapping = state.mapping;
  clearChangedNodes(state.doc as LoroDocType, event, mapping);
  const node = createNodeFromLoroObj(
    view.state.schema,
    state.containerId
      ? (state.doc.getContainerById(
          state.containerId,
        ) as LoroMap<LoroNodeContainerType>)
      : (state.doc as LoroDocType).getMap(ROOT_DOC_KEY),
    mapping,
  );
  const tr = view.state.tr.replace(
    0,
    view.state.doc.content.size,
    new Slice(Fragment.from(node), 0, 0),
  );

  // Put the caret back in the same transaction, from the cursors taken before
  // the import. Restoring it later would let keys typed in between land
  // wherever the replace left it.
  const caret = state.caret;
  if (caret) {
    const anchor = cursorToCaret(caret.anchor, state.doc, mapping);
    const head =
      caret.head === caret.anchor
        ? anchor
        : cursorToCaret(caret.head, state.doc, mapping);
    const size = tr.doc.content.size;
    if (anchor != null && head != null && anchor <= size && head <= size) {
      tr.setSelection(
        TextSelection.between(tr.doc.resolve(anchor), tr.doc.resolve(head)),
      );
    }
  }

  tr.setMeta(loroSyncPluginKey, {
    type: "non-local-updates",
  });
  view.dispatch(tr);
}

/**
 * Remembers the selection as Loro cursors. Called after every view update,
 * when the view and the Loro document agree.
 */
function storeCaret(view: EditorView) {
  const state = loroSyncPluginKey.getState(view.state);
  if (!state || state.snapshot !== null || state.mapping == null) {
    return;
  }
  const { anchor, head } = view.state.selection;
  const doc = state.doc as LoroDocType;
  const anchorCursor = caretToCursor(
    view.state.doc,
    anchor,
    doc,
    state.mapping,
  );
  const headCursor =
    head === anchor
      ? anchorCursor
      : caretToCursor(view.state.doc, head, doc, state.mapping);
  state.caret =
    anchorCursor && headCursor
      ? { anchor: anchorCursor, head: headCursor }
      : null;
}

/**
 * Update ProseMirror selection based on the given Loro cursors.
 */
export function syncCursorsToPmSelection(
  view: EditorView,
  anchor: Cursor,
  focus?: Cursor,
) {
  if (view.isDestroyed) {
    return;
  }

  const state = loroSyncPluginKey.getState(view.state);
  if (!state) {
    return;
  }

  const { doc, mapping } = state;
  const anchorPos = cursorToAbsolutePosition(anchor, doc, mapping)[0];
  const focusPos = focus && cursorToAbsolutePosition(focus, doc, mapping)[0];
  if (anchorPos == null) {
    return;
  }

  // If the cursors are synced faster than the document, then the cursors might
  // be out of bounds. Thus, we need to check if the cursors are out of bounds.
  safeSetSelection(view, anchorPos, focusPos);
}
