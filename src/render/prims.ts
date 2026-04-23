// Batched canvas primitives. One beginPath/stroke per call shared across many
// sub-shapes — meaningful perf win when shadowBlur > 0, since each stroke()
// triggers a full blur pass. Ported from Samples/ui/render-prims.js.

const TAU = Math.PI * 2;

type Pt = [number, number];

/** Stroke many dots sharing style. pts: [[x,y], ...]. */
export function dots(ctx: CanvasRenderingContext2D, pts: Pt[], r: number): void {
  ctx.beginPath();
  for (const [x, y] of pts) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
  ctx.stroke();
}

/** Stroke a mirrored pair of dots — eyes, symmetric markings. */
export function eyePair(ctx: CanvasRenderingContext2D, cx: number, cy: number, dx: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(cx - dx + r, cy); ctx.arc(cx - dx, cy, r, 0, TAU);
  ctx.moveTo(cx + dx + r, cy); ctx.arc(cx + dx, cy, r, 0, TAU);
  ctx.stroke();
}

/** Stroke many disconnected segments. segs: [[x1,y1,x2,y2], ...]. */
export function lines(ctx: CanvasRenderingContext2D, segs: [number, number, number, number][]): void {
  ctx.beginPath();
  for (const [a, b, c, d] of segs) { ctx.moveTo(a, b); ctx.lineTo(c, d); }
  ctx.stroke();
}

/** Stroke a connected polyline. pts: [[x,y], ...]. Closed if `closed`. */
export function poly(ctx: CanvasRenderingContext2D, pts: Pt[], closed = false): void {
  if (pts.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  if (closed) ctx.closePath();
  ctx.stroke();
}

/** Stroke a zigzag polyline by alternating xs,ys arrays flattened:
 *  pts = [x0,y0, x1,y1, ...]. Shorthand for lightning/crack patterns. */
export function zigzag(ctx: CanvasRenderingContext2D, pts: number[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
  ctx.stroke();
}

/** Orbit particles — n dots around (cx,cy) with phase offset, one stroke.
 *  rx/ry: elliptical radii, speed: angular velocity, size: dot radius. */
export function orbit(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  n: number, t: number,
  rx: number, ry: number,
  speed: number, size: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = t * speed + i * (TAU / n);
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    ctx.moveTo(x + size, y);
    ctx.arc(x, y, size, 0, TAU);
  }
  ctx.stroke();
}
