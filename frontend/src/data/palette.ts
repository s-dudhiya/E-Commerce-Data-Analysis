import type { Platform } from "./dataset";

/**
 * Chart palette. These hex values mirror the design tokens defined in
 * src/styles.css (oklch there, hex here because SVG chart primitives need
 * concrete color values, not CSS var() references).
 *
 * Amazon = muted forest green, Flipkart = warm amber. Restrained by design.
 */
export const PLATFORM_COLORS: Record<Platform, string> = {
  Amazon: "#1E293B",   // Prussian Slate Navy
  Flipkart: "#4338CA", // Deep Royal Iris Blue
};

export const CHART = {
  primary: "#4338CA",     // Deep Royal Iris Blue
  secondary: "#7C3AED",   // Amethyst Violet (Price Hikes)
  negative: "#BE123C",    // Refined Berry Rose (Out of Stock / Cuts)
  positive: "#0284C7",    // Sky Cobalt Blue (Savings / Drops)
  neutral: "#64748B",     // Cool Slate
  charcoal: "#1E293B",    // Slate Charcoal
  grid: "#E2E8F0",        // Clean Slate Border
  axis: "#64748B",
  categorical: ["#4338CA", "#7C3AED", "#0284C7", "#4F46E5", "#64748B", "#8B5CF6"],
} as const;


