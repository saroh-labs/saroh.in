import { vi } from "vitest";

/**
 * `next/font/local` is compiled by Next, not by Vitest. A page that loads a
 * merchant's fonts for its drawings (Home, /features, the Reach pages) gets
 * an empty class here, as on saroh.in.
 */
vi.mock("next/font/local", () => ({
    default: () => ({ variable: "", className: "", style: {} }),
}));
