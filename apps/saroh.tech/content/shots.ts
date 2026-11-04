/**
 * The screenshots this site shows: its own, taken from the real app on the
 * Global demo businesses (`e2e/marketing-shots/shots.global.ts`) and each read
 * by a person for rupees, GST, UPI, +91 and India's places (plan U11). A key
 * with no shot draws no frame.
 */
import type { ShotKey } from "@saroh/marketing/content-types";
import type { Shot, ShotView } from "@saroh/marketing/shot";

import { CAPTURED } from "./shots.captured";

/**
 * Keys pages name but this site doesn't show, each with why. Retake them after
 * the app edition work; `lib/shots.test.ts` fails on any other missing image.
 */
export const PENDING_SHOTS: Partial<Record<ShotKey, string>> = {
    "r-subdetail": "Subscriptions isn't usable on Global yet.",
    "s-subs": "Subscriptions isn't usable on Global yet.",
    "g-packs": "Class packs aren't offered to any business yet (DEC-099).",
    "l-packs": "Class packs aren't offered to any business yet (DEC-099).",
};

/** The widths `pnpm --filter tech shots:sizes` makes (saroh.in's shot-widths.json). */
export const SHOT_WIDTHS = [640, 960, 1280, 1920] as const;

const shot = (key: string, c: (typeof CAPTURED)[string]): Shot => ({
    src: c.src,
    alt: c.alt,
    width: c.width,
    height: c.height,
    srcSet: [
        ...SHOT_WIDTHS.filter((w) => w < c.width).map(
            (w) => `/shots/v2/sized/${key}-${w}.webp ${w}w`,
        ),
        `${c.src} ${c.width}w`,
    ].join(", "),
});

export const GLOBAL_SHOTS: Partial<Record<ShotKey, Shot>> = Object.fromEntries(
    Object.entries(CAPTURED).map(([key, c]) => [key, shot(key, c)]),
);

/** The shot as `@saroh/marketing` draws it, or nothing when this site has none. */
export function shotView(key?: ShotKey, alt?: string): ShotView | undefined {
    const image = key && GLOBAL_SHOTS[key];
    return image ? { id: key, image, alt } : undefined;
}
