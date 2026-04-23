// Single tunable knob for INT-based magnitude scaling. Primitives import this
// and apply it to damage, amount, and duration args — never to range or mpCost.

export function scale(base: number, int: number): number {
  return Math.floor(base * (1 + int / 10));
}
