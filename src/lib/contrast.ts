/**
 * WCAG 2.x relative luminance and contrast ratio helpers.
 * Pure functions — no DOM, no React. Compatible with
 * `node --experimental-strip-types`.
 */

/**
 * Parse a 6-digit hex color string into [r, g, b] integers (0-255).
 * Accepts both "#rrggbb" and "rrggbb".
 */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length !== 6) {
    throw new Error(`hexToRgb: expected 6-digit hex, got "${hex}"`);
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/**
 * Convert a single 8-bit sRGB channel value (0-255) to its linear-light value.
 * WCAG 2.x formula, IEC 61966-2-1.
 */
function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Compute WCAG 2.x relative luminance for a 6-digit hex color.
 * Returns a value in [0, 1] where 0 is black and 1 is white.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Compute the WCAG 2.x contrast ratio between two hex colors.
 * Returns a value in [1, 21].
 * WCAG AA normal text requires >= 4.5; large text / UI components >= 3.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
