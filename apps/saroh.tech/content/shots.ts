/**
 * The screenshots this site shows: its own, taken from the real app on the
 * Global demo businesses (`e2e/marketing-shots/shots.global.ts`), each what a
 * Free business can have, and each read by a person for rupees, GST, UPI,
 * +91, India's places, plan offers and "team" (plan U11). A key with no shot draws no frame.
 */
import type { ShotKey } from "@saroh/marketing/content-types";
import type { Shot, ShotView } from "@saroh/marketing/shot";

import { CAPTURED } from "./shots.captured";

/**
 * Keys pages name but this site doesn't show, each with why. Retake them after
 * the app edition work; `lib/shots.test.ts` fails on any other missing image.
 */
/** AI apps, Ask AI and Share (plan 2026-11-13-002): taken in U16. */
const NOT_YET_SHOWN =
    "Its page isn't built while its switch is off; taken when Global turns it on.";

export const PENDING_SHOTS: Partial<Record<ShotKey, string>> = {
    "d-customer":
        "The booking-page note's card says \"for the team\" to one person; retake when the app's words are fixed.",
    "r-subdetail": "Subscriptions isn't usable on Global yet.",
    "s-subs": "Subscriptions isn't usable on Global yet.",
    "ai-hero": NOT_YET_SHOWN,
    "ai-connect": NOT_YET_SHOWN,
    "ai-consent": NOT_YET_SHOWN,
    "ai-ask": NOT_YET_SHOWN,
    "ai-activity": NOT_YET_SHOWN,
    "ask-hero": NOT_YET_SHOWN,
    "ask-start": NOT_YET_SHOWN,
    "ask-answer": NOT_YET_SHOWN,
    "ask-confirm": NOT_YET_SHOWN,
    "ask-history": NOT_YET_SHOWN,
    "sh-sheet": NOT_YET_SHOWN,
    "sh-button": NOT_YET_SHOWN,
    "sh-cards": NOT_YET_SHOWN,
    "sh-phone": NOT_YET_SHOWN,
    "sh-post": NOT_YET_SHOWN,
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
