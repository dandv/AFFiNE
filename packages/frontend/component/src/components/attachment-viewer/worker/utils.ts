export function resizeImageBitmap(
  imageBitmap: ImageBitmap,
  options: {
    resizeWidth: number;
    resizeHeight: number;
  }
) {
  return createImageBitmap(
    imageBitmap,
    0,
    0,
    imageBitmap.width,
    imageBitmap.height,
    {
      colorSpaceConversion: 'none',
      resizeQuality: 'pixelated',
      ...options,
    }
  );
}
