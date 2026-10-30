import { describe, expect, it } from 'vitest';
import { labelWidth, placeLabels, type PlacedLabel } from './labelPlacement';

const bounds = { left: 0, top: 0, right: 400, bottom: 300 };

// The box a placed label covers (same size estimate as labelPlacement.ts)
function box(label: PlacedLabel) {
  const w = labelWidth(label.text);
  const left = label.anchor === 'start' ? label.x : label.anchor === 'end' ? label.x - w : label.x - w / 2;
  return { left, right: left + w, top: label.y - 8.5, bottom: label.y + 2.5 };
}
const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('placeLabels', () => {
  it('never lets labels overlap, even when points are piled together', () => {
    // Eight points crowded along the top edge, like results capped at q < 1e-300
    const points = Array.from({ length: 8 }, (_, i) => ({ x: 300 + i * 10, y: 10 }));
    const requests = points.map((p, i) => ({ id: `m${i}`, ...p, text: `Measure number ${i}` }));
    const labels = placeLabels(requests, points, bounds);

    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThan(points.length); // some are left out rather than piled up
    for (let i = 0; i < labels.length; i++) {
      const b = box(labels[i]);
      expect(b.left).toBeGreaterThanOrEqual(bounds.left);
      expect(b.right).toBeLessThanOrEqual(bounds.right);
      for (let j = i + 1; j < labels.length; j++) expect(overlap(b, box(labels[j]))).toBe(false);
    }
  });

  it('puts labels on the side facing the middle of the plot', () => {
    const [right] = placeLabels([{ id: 'r', x: 380, y: 150, text: 'Right' }], [], bounds);
    const [left] = placeLabels([{ id: 'l', x: 20, y: 150, text: 'Left' }], [], bounds);
    expect(right.anchor).toBe('end');
    expect(left.anchor).toBe('start');
  });

  it('always places a forced label (the hovered point)', () => {
    const points = [{ x: 200, y: 150 }];
    const blocker = { id: 'a', x: 200, y: 150, text: 'A very long label that takes space' };
    // A thin plot with room for only one label, which the first one takes
    const labels = placeLabels([blocker, { ...blocker, id: 'b', force: true }], points, {
      left: 0,
      top: 140,
      right: 300,
      bottom: 162,
    });
    expect(labels.map((l) => l.id)).toEqual(['a', 'b']);
  });
});
