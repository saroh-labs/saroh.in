/**
 * The screenshots this site shows: its own, taken from the real app on the
 * Global demo businesses (`e2e/marketing-shots/shots.global.ts`), each what a
 * Free business can have, and each read by a person for rupees, GST, UPI,
 * +91, India's places, plan offers and "team" (plan U11). A key with no shot draws no frame.
 */
import type { ShotKey } from "@saroh/marketing/content-types";
import type { Shot, ShotView } from "@saroh/marketing/shot";

import PLACEHOLDERS from "./shot-placeholders.json";
import { CAPTURED } from "./shots.captured";

/** A spec in `shots.global.ts` with no capture yet: the next release run takes it. */
const NOT_TAKEN =
    "Its spec is in shots.global.ts; not captured yet (the marketing-shots workflow takes it).";
/** Claude's own screens, put in place by hand (`supplied` in shots.global.ts). */
const SUPPLIED = "Claude's own screen, put in place by hand; not supplied yet.";
const NO_SUBSCRIPTIONS = "Subscriptions isn't usable on Global yet.";
/** Ask AI refuses a Free business, and Global is Free until paid plans open (DEC-211). */
const NO_ASK_AI =
    "Ask AI is for paying plans, and Global's businesses are on Free.";

/**
 * Keys pages name but this site doesn't show, each with why; the slot draws
 * no shot. `lib/shots.test.ts` and `pnpm check:shots` fail on any other
 * missing image. A key comes off once its capture is committed.
 */
export const PENDING_SHOTS: Partial<Record<ShotKey, string>> = {
    "r-subdetail": NO_SUBSCRIPTIONS,
    "s-subs": NO_SUBSCRIPTIONS,
    "g-subs": NO_SUBSCRIPTIONS,
    "g-subdetail": NO_SUBSCRIPTIONS,
    "g-plans": NO_SUBSCRIPTIONS,
    "g-packs":
        "Class packs are a paid module, and Global's businesses are on Free.",
    "r-supply":
        "A bill of supply is India's GST rule; Global's invoices have no exempt-supply wording.",
    "p-site": NOT_TAKEN,
    "ai-hero": SUPPLIED,
    "ai-connect": SUPPLIED,
    "ai-ask": SUPPLIED,
    "ai-consent": NOT_TAKEN,
    "ai-activity": NOT_TAKEN,
    "ask-hero": NO_ASK_AI,
    "ask-hero-phone": NO_ASK_AI,
    "ask-start": NO_ASK_AI,
    "ask-answer": NO_ASK_AI,
    "ask-confirm": NO_ASK_AI,
    "ask-history": NO_ASK_AI,
    "sh-sheet": NOT_TAKEN,
    "sh-button": NOT_TAKEN,
    "sh-cards": NOT_TAKEN,
    "sh-phone": NOT_TAKEN,
    "sh-post": NOT_TAKEN,
    "sh-post-card": NOT_TAKEN,
};

/** The widths `pnpm --filter tech shots:sizes` makes (saroh.in's shot-widths.json). */
export const SHOT_WIDTHS = [640, 960, 1280, 1920] as const;

/** Blurred stand-ins `shots:sizes` writes, one per captured shot (`v2/<key>`). */
const PLACEHOLDER: Record<string, string> = PLACEHOLDERS;

const shot = (key: string, c: (typeof CAPTURED)[string]): Shot => ({
    placeholder: PLACEHOLDER[`v2/${key}`],
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
