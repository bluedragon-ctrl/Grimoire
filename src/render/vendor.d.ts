// Ambient declarations for the vendored JS renderer. We deliberately do not
// set allowJs — the vendor tree is treated as an opaque module graph whose
// public surface is just the two functions below.

declare module "./vendor/ui/renderer.js" {
  export function initRenderer(canvas: HTMLCanvasElement): void;
  export function render(state: unknown): void;
}

declare module "./vendor/config/visuals.js" {
  export const PROJECTILE_PRESETS: Record<string, { projectile: string; colors: { color: string; color2: string } }>;
  export const BURST_PRESETS: Record<string, { burst: string; colors: { color: string; color2: string } }>;
  export const CLOUD_PRESETS: Record<string, { colors: { color: string; color2: string } }>;
  export const ELEMENT_DEFAULTS: Record<string, Record<string, string>>;
  export function resolveVisual(verb: string, name?: string): { colors?: { color: string; color2: string } } | undefined;
  export function defaultVisual(verb: string, element?: string): { colors?: { color: string; color2: string } } | undefined;
}
