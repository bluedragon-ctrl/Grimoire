// Minimal CanvasRenderingContext2D stub — covers every method/property the
// ported draws touch. Each method is a no-op; property setters silently store.
// Sufficient for smoke-testing "does this draw throw?"; not for pixel-level
// verification.

type GradStub = { addColorStop: (offset: number, color: string) => void };

export function makeCanvasMock(): CanvasRenderingContext2D {
  const grad: GradStub = { addColorStop: () => {} };
  const ctx = {
    // State
    strokeStyle: "#000",
    fillStyle: "#000",
    shadowColor: "#000",
    shadowBlur: 0,
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,

    // Path
    beginPath: () => {},
    closePath: () => {},
    moveTo: (_x: number, _y: number) => {},
    lineTo: (_x: number, _y: number) => {},
    arc: () => {},
    ellipse: () => {},
    rect: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},

    // Draw
    stroke: () => {},
    fill: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
    strokeText: () => {},

    // Transform
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    setTransform: () => {},

    // Gradient
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}
