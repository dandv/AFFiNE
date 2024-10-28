import type { AttachmentBlockModel } from '@blocksuite/affine/blocks';

export async function getAttachmentBlob(model: AttachmentBlockModel) {
  const sourceId = model.sourceId;
  if (!sourceId) {
    return null;
  }

  const doc = model.doc;
  let blob = await doc.blobSync.get(sourceId);

  if (blob) {
    blob = new Blob([blob], { type: model.type });
  }

  return blob;
}

export function download(model: AttachmentBlockModel) {
  (async () => {
    const blob = await getAttachmentBlob(model);
    if (!blob) {
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = model.name;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  })().catch(console.error);
}

export function renderItem(
  scroller: HTMLElement | null,
  id: number,
  imageBitmap: ImageBitmap
) {
  if (!scroller) return;

  const wrapper = scroller.querySelector(`[data-index="${id}"]`);
  if (!wrapper) return;

  const item = wrapper.firstElementChild;
  if (!item) return;
  if (item.firstElementChild) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('bitmaprenderer');
  if (!ctx) return;

  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  ctx.transferFromImageBitmap(imageBitmap);

  item.append(canvas);
}
