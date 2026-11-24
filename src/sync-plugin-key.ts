import type { ContainerID, LoroDoc, Subscription } from "loro-crdt";
import { PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { LoroDocType, LoroNodeMapping, LoroSyncOptions } from "./lib";

export const loroSyncPluginKey = new PluginKey<LoroSyncPluginState>(
  "loro-sync",
);

export interface LoroSyncPluginProps extends LoroSyncOptions {
  doc: LoroDocType;
  mapping?: LoroNodeMapping;
  containerId?: ContainerID;
}

export interface LoroSyncPluginState extends LoroSyncPluginProps {
  changedBy: "local" | "import" | "checkout";
  mapping: LoroNodeMapping;
  snapshot?: LoroDoc | null;
  view?: EditorView;
  containerId?: ContainerID;
  docSubscription?: Subscription | null;
}
