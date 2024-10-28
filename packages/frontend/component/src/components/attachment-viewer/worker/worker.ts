import { DebugLogger } from '@affine/debug';
import type { Document } from '@toeverything/pdf-viewer';
import {
  createPDFium,
  PageRenderingflags,
  Runtime,
  Viewer,
} from '@toeverything/pdf-viewer';

import type { MessageData, MessageDataType } from './types';
import { MessageOp, MessageState, RenderKind } from './types';
import { resizeImageBitmap } from './utils';

const logger = new DebugLogger('affine:worker:pdf');

let inited = false;
let viewer: Viewer | null = null;
let doc: Document | undefined = undefined;

const canvas = new OffscreenCanvas(0, 0);
const ctx = canvas.getContext('2d');
const cached = new Map<number, ImageBitmap>();
const docInfo = { cursor: 0, total: 0, width: 1, height: 1 };
const viewportInfo = { dpi: 2, width: 1, height: 1 };
const flags = PageRenderingflags.REVERSE_BYTE_ORDER | PageRenderingflags.ANNOT;

function post<T extends MessageOp>(type: T, data?: MessageDataType[T]) {
  self.postMessage({ state: MessageState.Ready, type, [type]: data });
}

async function start() {
  logger.debug('pdf worker pending');
  self.postMessage({ state: MessageState.Poll, type: MessageOp.Init });

  const pdfium = await createPDFium();
  viewer = new Viewer(new Runtime(pdfium));
  inited = true;

  self.postMessage({ state: MessageState.Ready, type: MessageOp.Init });
  logger.debug('pdf worker ready');
}

async function process({ data }: MessageEvent<MessageData>) {
  if (!inited || !viewer) {
    await start();
  }

  if (!viewer) return;

  const { type, state } = data;

  if (state !== MessageState.Poll) return;

  switch (type) {
    case MessageOp.Open: {
      const action = data[type];
      if (!action?.blob) return;

      doc = await viewer.openWithBlob(action.blob);

      if (!doc) return;

      post(MessageOp.Open);
      break;
    }

    case MessageOp.SyncViewportInfo: {
      const updated = data[type];

      if (updated) {
        Object.assign(viewportInfo, updated);
      }

      break;
    }

    case MessageOp.SyncDocInfo: {
      if (!doc) return;

      const updated = data[type];

      if (updated) {
        Object.assign(docInfo, updated);
      }

      const page = doc.page(0);

      if (page) {
        Object.assign(docInfo, {
          cursor: 0,
          total: doc.pageCount(),
          height: Math.ceil(page.height()),
          width: Math.ceil(page.width()),
        });
        page.close();
        post(MessageOp.SyncDocInfo, docInfo);
      }
      break;
    }

    case MessageOp.Render: {
      if (!doc) return;

      const { index, kind } = data[type];

      let imageBitmap = cached.size > 0 ? cached.get(index) : undefined;
      if (imageBitmap) {
        if (kind === RenderKind.Thumbnail) {
          const rw = 94 * viewportInfo.dpi;
          const rh = (docInfo.height / docInfo.width) * rw;
          imageBitmap = await resizeImageBitmap(imageBitmap, {
            resizeWidth: Math.ceil(rw),
            resizeHeight: Math.ceil(rh),
          });
        }

        post(MessageOp.Rendered, { index, kind, imageBitmap });
        return;
      }

      const width = Math.ceil(docInfo.width * viewportInfo.dpi);
      const height = Math.ceil(docInfo.height * viewportInfo.dpi);
      const page = doc.page(index);

      if (page) {
        const bitmap = viewer.createBitmap(width, height, 0);
        bitmap.fill(0, 0, width, height);
        page.render(bitmap, 0, 0, width, height, 0, flags);

        const data = bitmap.toBytes();

        bitmap.close();
        page.close();

        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const imageData = new ImageData(
          new Uint8ClampedArray(data),
          width,
          height
        );
        ctx?.clearRect(0, 0, width, height);
        ctx?.putImageData(imageData, 0, 0);
        imageBitmap = canvas.transferToImageBitmap();

        cached.set(index, imageBitmap);

        if (kind === RenderKind.Thumbnail) {
          const rw = 94 * viewportInfo.dpi;
          const rh = (docInfo.height / docInfo.width) * rw;
          imageBitmap = await resizeImageBitmap(imageBitmap, {
            resizeWidth: Math.ceil(rw),
            resizeHeight: Math.ceil(rh),
          });
        }

        post(MessageOp.Rendered, { index, kind, imageBitmap });
      }

      break;
    }
  }
}

self.addEventListener('message', (event: MessageEvent<MessageData>) => {
  process(event).catch(console.error);
});

start().catch(console.error);
