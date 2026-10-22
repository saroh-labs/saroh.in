import type { FontPairKey } from "./fonts";
import type { SectionType } from "./section-contract";
import type { SiteTypeScale } from "./type-scale";

/**
 * A site's look (DEC-172, KD1): Folio, Quiet or Live, chosen per site in
 * Website › Style and stored as `Site.style.look`. ABSENT means Classic,
 * the sites as they were before looks, and is never written out: a style
 * with no look is byte for byte the style it always was, so no live site
 * reports a change nobody made.
 *
 * A look is data (KD3): the tokens the renderer writes under the business's
 * own colours, a font pair, a type scale, the layout each block takes when
 * a section has not chosen one (KD2), how booking is framed (KD8) and how
 * long anything may move (KD5). Colours are never a look's: they come from
 * the business, made safe by `safe-colours.ts`.
 *
 * Pure: no React, no Nest. The API validates a saved look with
 * {@link parseLook}, site creation and the editor's "Suggested for" read
 * {@link defaultLookForTemplate}, and the renderer reads the rest.
 */

export const LOOK_IDS = ["folio", "quiet", "live"] as const;
export type LookId = (typeof LOOK_IDS)[number];

/**
 * The font pair each look sets: its own `FONT_PAIRS` entry, with only the
 * weights its type uses (U3; `fonts.test.ts` checks every look's pair).
 */
export type LookFontPair = Extract<FontPairKey, "folio" | "quiet" | "live">;

/** How the booking steps are framed (KD8): one engine, three frames. */
export type BookingPresentation = "panel" | "page" | "sheets";

/** A length that differs on a phone and a desk, in px. */
export interface LookLength {
    phone: number;
    desk: number;
}

/** The look's tokens (KD3), each a new or existing `--site-*` role. */
export interface LookTokens {
    /** Buttons and inputs (`--site-radius`); 999 is a pill. */
    radius: number;
    /** Small things: chips, tags, a time slot (`--site-radius-s`). */
    radiusSmall: number;
    /** Photos (`--site-radius-photo`). */
    radiusPhoto: number;
    pageMargin: LookLength;
    sectionPadding: LookLength;
    /** The longest reading line, in characters. */
    measure: number;
}

/**
 * Motion (KD5, R5): the existing scale only, fade or rise of 8px or less,
 * ease-out, no bounce, no loops. `ceiling` is what nothing may exceed.
 */
export interface LookMotion {
    fast: number;
    base: number;
    slow: number;
    ceiling: number;
    /** The furthest anything rises, in px. */
    rise: number;
}

/** What a look adds to the colours it is given (`safe-colours.ts`). */
export interface LookColour {
    /**
     * How far the page sits from its cards, toward the text (0: the page
     * itself): the page is tinted and the cards keep the palette's ground.
     * Used only when the palette has no surface of its own.
     */
    surfaceTint: number;
    /**
     * What the accent as a fill must reach against the page and a card:
     * a graphic's 3:1, or (Live, board VB) 1, because Live only fills
     * what carries its own text (a button, a tag, a pill), which reads
     * at 4.5:1 on it; links and the like read `accentText`.
     */
    accentFillContrast: number;
}

export interface SiteLook {
    id: LookId;
    name: string;
    /** What it is and what it suits, in full: the Preview dialog (U16). */
    suits: string;
    /** A few words for the Look list's card, where `suits` is too long. */
    short: string;
    tokens: LookTokens;
    fontPair: LookFontPair;
    type: SiteTypeScale;
    /**
     * The layout each block takes where its section names none (KD2). Only
     * ids `BLOCK_META` has today (the tests hold that); U6 and U7 add their
     * new variants and switch these.
     */
    defaultVariants: Partial<Record<SectionType, string>>;
    booking: BookingPresentation;
    motion: LookMotion;
    colour: LookColour;
}

/** KD5's scale, the same for every look. */
const MOTION: LookMotion = {
    fast: 100,
    base: 140,
    slow: 200,
    ceiling: 200,
    rise: 8,
};

export const LOOKS: Readonly<Record<LookId, SiteLook>> = {
    folio: {
        id: "folio",
        name: "Folio",
        short: "Like a printed magazine",
        suits: "Like a printed magazine: a tinted page, square corners and a serif. Suits classes and yoga.",
        tokens: {
            radius: 0,
            radiusSmall: 0,
            radiusPhoto: 0,
            pageMargin: { phone: 20, desk: 64 },
            // Board VA: 136 a section, 72 on a phone.
            sectionPadding: { phone: 72, desk: 136 },
            measure: 64,
        },
        fontPair: "folio",
        type: {
            displaySize: 64,
            bodySize: 17,
            measure: 64,
            labelStyle: "eyebrow",
        },
        defaultVariants: {
            hero: "split",
            journal: "archive",
            timetable: "list",
            productGrid: "lead",
        },
        booking: "panel",
        motion: MOTION,
        colour: { surfaceTint: 0, accentFillContrast: 3 },
    },
    quiet: {
        id: "quiet",
        name: "Quiet",
        short: "Warm, airy, rounded",
        suits: "Warm white and airy, with rounded buttons and one question at a time. Suits salons, clinics, studios, bakeries, shops and makers.",
        tokens: {
            radius: 999,
            // Board VD: fields 14, photos 4.
            radiusSmall: 14,
            radiusPhoto: 4,
            pageMargin: { phone: 20, desk: 48 },
            sectionPadding: { phone: 72, desk: 120 },
            measure: 60,
        },
        fontPair: "quiet",
        type: { displaySize: 56, bodySize: 17, measure: 60 },
        defaultVariants: {
            hero: "centered",
            journal: "lead",
            timetable: "list",
            productGrid: "default",
        },
        booking: "page",
        motion: MOTION,
        colour: { surfaceTint: 0, accentFillContrast: 3 },
    },
    live: {
        id: "live",
        name: "Live",
        short: "Bold, like an app",
        suits: "Like an app, with cards and what's on now. Suits gyms and classes that fill up.",
        tokens: {
            // Board VB: pill buttons, 24 cards (drawn in the photo radius),
            // 16 chips.
            radius: 999,
            radiusSmall: 16,
            radiusPhoto: 24,
            pageMargin: { phone: 16, desk: 40 },
            // Board VB's `.sec`: 72 above and 8 below, about 80 between
            // sections (48 + 8 on a phone); split evenly here.
            sectionPadding: { phone: 28, desk: 40 },
            measure: 68,
        },
        fontPair: "live",
        type: { displaySize: 48, bodySize: 16, measure: 68 },
        defaultVariants: {
            timetable: "grid",
            productGrid: "default",
        },
        booking: "sheets",
        motion: MOTION,
        colour: { surfaceTint: 0.05, accentFillContrast: 1 },
    },
};

/** Whether `value` is a look this build has. */
export function isLookId(value: unknown): value is LookId {
    return (
        typeof value === "string" &&
        (LOOK_IDS as readonly string[]).includes(value)
    );
}

export type LookResult =
    { ok: true; look: LookId | undefined } | { ok: false; message: string };

/**
 * Validate a saved look. Absent and null are Classic (`look: undefined`);
 * a listed id is itself; anything else, "classic" included, is refused
 * rather than coerced, like a colour key: only a listed look reaches a
 * page.
 */
export function parseLook(input: unknown): LookResult {
    if (input === undefined || input === null) {
        return { ok: true, look: undefined };
    }
    if (isLookId(input)) return { ok: true, look: input };
    return { ok: false, message: "Choose one of the looks offered" };
}

/**
 * The look a new site starts in, by the template it is made from (R10,
 * DEC-172): the template id is the industry signal, because the business's
 * kind (BUSINESS, SOLO, WORK) says nothing about its trade. Quiet for
 * salons, clinics, studios, bakeries, shops and makers; Folio for classes
 * and yoga (no such template yet, so it is keyed for one); Live for gyms.
 * Any other template, the starter included, starts Quiet.
 *
 * One mapping, read by site creation (API) and the picker's "Suggested
 * for" (editor, U16).
 */
export const TEMPLATE_LOOKS: Readonly<Record<string, LookId>> = {
    gym: "live",
    yoga: "folio",
    classes: "folio",
    salon: "quiet",
    clinic: "quiet",
    dietician: "quiet",
    studio: "quiet",
    bakery: "quiet",
    ceramics: "quiet",
    starter: "quiet",
};

/** The look a site made from `templateId` starts in. */
export function defaultLookForTemplate(
    templateId: string | null | undefined,
): LookId {
    return templateId &&
        Object.prototype.hasOwnProperty.call(TEMPLATE_LOOKS, templateId)
        ? TEMPLATE_LOOKS[templateId]
        : "quiet";
}

/**
 * Who a template is for, in the words "Suggested for {industry}" ends
 * with in the editor's Look row (U16). Only templates with a trade: the
 * starter and the personal, writing and portfolio templates name none,
 * and their suggestion says only "Suggested".
 */
export const TEMPLATE_INDUSTRIES: Readonly<Record<string, string>> = {
    gym: "gyms",
    yoga: "yoga",
    classes: "classes",
    salon: "salons",
    clinic: "clinics",
    dietician: "dieticians",
    studio: "studios",
    bakery: "bakeries",
    ceramics: "makers",
};

/**
 * The look the editor suggests for a site made from `templateId`, and who
 * it is suggested for ("salons"), or null when the template names no
 * trade. The same look a new site starts in ({@link defaultLookForTemplate}).
 */
export function lookSuggestion(templateId: string | null | undefined): {
    look: LookId;
    industry: string | null;
} {
    const industry =
        templateId &&
        Object.prototype.hasOwnProperty.call(TEMPLATE_INDUSTRIES, templateId)
            ? TEMPLATE_INDUSTRIES[templateId]
            : null;
    return { look: defaultLookForTemplate(templateId), industry };
}
