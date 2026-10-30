// Places point labels on a plot so they don't cover each other, other points, or the plot edge.
// Greedy: labels are placed in priority order, each at the first free spot around its point;
// a label with no free spot is left out (unless it's forced, like the hovered point's).

export interface LabelRequest {
  id: string;
  x: number; // the point's position, in pixels
  y: number;
  text: string;
  force?: boolean; // place it even if every spot is taken
}

export interface PlacedLabel {
  id: string;
  text: string;
  x: number; // text anchor position (SVG text x/y)
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const CHAR_WIDTH = 5.6; // average width of a 10px system-ui character
const HEIGHT = 11;
const GAP = 7; // space between the point and its label
const POINT_RADIUS = 5;

export const labelWidth = (text: string) => text.length * CHAR_WIDTH + 2;

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

function candidates(req: LabelRequest, bounds: Bounds): { box: Box; label: PlacedLabel }[] {
  const w = labelWidth(req.text);
  const { x, y, id, text } = req;
  const at = (left: number, top: number, anchor: PlacedLabel['anchor']) => {
    const box = { left, top, right: left + w, bottom: top + HEIGHT };
    const textX = anchor === 'start' ? left : anchor === 'end' ? left + w : left + w / 2;
    return { box, label: { id, text, x: textX, y: top + HEIGHT - 2.5, anchor } };
  };
  const left = at(x - GAP - w, y - HEIGHT / 2, 'end');
  const right = at(x + GAP, y - HEIGHT / 2, 'start');
  const above = at(x - w / 2, y - GAP - HEIGHT, 'middle');
  const below = at(x - w / 2, y + GAP, 'middle');
  const upLeft = at(x - GAP - w, y - GAP - HEIGHT + 2, 'end');
  const upRight = at(x + GAP, y - GAP - HEIGHT + 2, 'start');
  const downLeft = at(x - GAP - w, y + GAP - 2, 'end');
  const downRight = at(x + GAP, y + GAP - 2, 'start');
  // Prefer the side facing the middle of the plot, where there's usually more room
  const inward = x > (bounds.left + bounds.right) / 2;
  return inward
    ? [left, upLeft, downLeft, below, above, right, upRight, downRight]
    : [right, upRight, downRight, below, above, left, upLeft, downLeft];
}

export function placeLabels(requests: LabelRequest[], points: { x: number; y: number }[], bounds: Bounds): PlacedLabel[] {
  const placed: { box: Box; label: PlacedLabel }[] = [];
  const pointBoxes = points.map((p) => ({
    left: p.x - POINT_RADIUS,
    right: p.x + POINT_RADIUS,
    top: p.y - POINT_RADIUS,
    bottom: p.y + POINT_RADIUS,
  }));
  const inside = (b: Box) => b.left >= bounds.left && b.right <= bounds.right && b.top >= bounds.top && b.bottom <= bounds.bottom;
  const clearOfLabels = (b: Box) => placed.every((p) => !overlaps(b, p.box));
  const clearOfPoints = (b: Box) => pointBoxes.every((p) => !overlaps(b, p));

  for (const req of requests) {
    const spots = candidates(req, bounds);
    const choice =
      spots.find((s) => inside(s.box) && clearOfLabels(s.box) && clearOfPoints(s.box)) ??
      spots.find((s) => inside(s.box) && clearOfLabels(s.box)) ?? // may cover a point, but no label
      (req.force ? spots.find((s) => inside(s.box)) ?? spots[0] : undefined);
    if (choice) placed.push(choice);
  }
  return placed.map((p) => p.label);
}
