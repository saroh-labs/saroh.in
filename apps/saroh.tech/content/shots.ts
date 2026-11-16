/**
 * The screenshots this site shows: its own, taken from the real app on the
 * Global demo businesses (`e2e/marketing-shots/shots.global.ts`), each what a
 * Free business can have, and each read by a person for rupees, GST, UPI,
 * +91, India's places, plan offers and "team" (plan U11). A key still pending
 * draws the same neutral frame saroh.in draws for an uncaptured shot (same
 * slot, same shape), never nothing and never another kind of picture.
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
 * Keys pages name but this site has no capture of yet, each with why; the
 * slot draws saroh.in's neutral frame (`ShotImage` with `src: null`). `lib/shots.test.ts` and `pnpm check:shots` fail on any other
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

/**
 * The shape saroh.in gives a shot it hasn't captured (`content/shots.ts`
 * `pending`): the frame a pending key draws here, so the slot matches.
 */
const PENDING_SIZE = { width: 1600, height: 1000 } as const;

/** What a pending frame is called, where the slot gives it no caption. */
const PENDING_ALT = "A screen from Saroh, shown here once it's captured";

/**
 * The shot as `@saroh/marketing` draws it: the capture, else for a pending
 * key the neutral frame of the same shape saroh.in draws, else nothing.
 */
export function shotView(key?: ShotKey, alt?: string): ShotView | undefined {
    if (!key) return undefined;
    const image = GLOBAL_SHOTS[key];
    if (image) return { id: key, image, alt };
    if (!(key in PENDING_SHOTS)) return undefined;
    return {
        id: key,
        image: { src: null, alt: alt ?? PENDING_ALT, ...PENDING_SIZE },
        alt,
    };
}
