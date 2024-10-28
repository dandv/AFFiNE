export type DocInfo = {
  cursor: number;
  total: number;
  width: number;
  height: number;
};

export type ViewportInfo = {
  dpi: number;
  width: number;
  height: number;
};

export enum State {
  Connecting = 0,
  Connected,
  Loading,
  Loaded,
  Syncing,
  Synced,
}

export enum MessageState {
  Poll,
  Ready,
}

export enum MessageOp {
  Init,
  Open,
  SyncDocInfo,
  SyncViewportInfo,
  Render,
  Rendered,
}

export enum RenderKind {
  Page,
  Thumbnail,
}

export interface MessageDataMap {
  [MessageOp.Init]: undefined;
  [MessageOp.Open]: {
    blob: Blob;
  };
  [MessageOp.SyncDocInfo]: Partial<DocInfo>;
  [MessageOp.SyncViewportInfo]: Partial<ViewportInfo>;
  [MessageOp.Render]: {
    index: number;
    kind: RenderKind;
  };
  [MessageOp.Rendered]: {
    index: number;
    kind: RenderKind;
    imageBitmap: ImageBitmap;
  };
}

export type MessageDataType<T = MessageDataMap> = {
  [P in keyof T]: T[P];
};

export type MessageData<T = MessageOp, P = MessageDataType> = {
  state: MessageState;
  type: T;
} & P;
