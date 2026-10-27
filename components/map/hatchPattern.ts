// Diagonal-stripe pattern used to mark counties with no data.

export const HATCH_IMAGE_ID = 'no-data-hatch';

// CSS version of the pattern, for the legend swatch
export const HATCH_CSS = 'repeating-linear-gradient(-45deg, #94a3b8 0 1.5px, #ffffff 1.5px 4px)';

// Draws one tile of the pattern. Browser-only (uses document), so call it
// from inside the map's load handler, never at module level.
export function makeHatchPattern(size = 16): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Three offset lines so the stripes join up seamlessly when the tile repeats
  for (const offset of [-size, 0, size]) {
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
  }
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}
