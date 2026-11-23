import { z } from "zod";

import type { ComponentOption } from "./component-styles";
import { COMPONENT_STYLE_OPTIONS } from "./component-styles";
import {
    contrastRatio,
    mixHex,
    normalizeHex,
    PALETTE_MIN_CONTRAST,
} from "./palette";

/**
 * Styles for one element or one section (DEC-253, DEC-254), under the
 * site's component styles (DEC-237). What wins, closest first: this
 * element › this section › the whole site (`SiteStyle.components`) › the
 * look's own. Each level stores only what was changed, so a page nobody
 * styled is byte for byte what it was.
 *
 * - An element's style rides on the element's own content: a button's on
 *   its CTA object (`elementStyle`, and its `style` for Filled, Outline,
 *   Soft or Link), a photo's on its image object.
 * - A section's rides in its `frame.styles`, beside Background and Spacing.
 *
 * Colour is a site palette role, or a custom `#RRGGBB` (DEC-254) whose
 * words read at 4.5:1: white when white reads, else dark ink. A colour
 * neither reads on is refused, and the editor offers the nearest darker
 * shade that does (CS4).
 */

/** The palette roles a button can take (board CSI-C, without "Brand tint"). */
export const COLOUR_ROLES = COMPONENT_STYLE_OPTIONS.buttonColour;
export type ColourRole = (typeof COLOUR_ROLES)[number];

export type ButtonFill = ComponentOption<"buttonStyle">;
export type ButtonSize = ComponentOption<"buttonSize">;

/** The dark words a custom colour takes when white doesn't read. */
export const CUSTOM_INK = "#1C1A18";
const WHITE = "#FFFFFF";

/** The words on a custom fill, and how well they read. */
export function customColourWords(hex: string): {
    words: "light" | "dark";
    ink: string;
    ratio: number;
    readable: boolean;
} {
    const light = contrastRatio(WHITE, hex);
    if (light >= PALETTE_MIN_CONTRAST) {
        return { words: "light", ink: WHITE, ratio: light, readable: true };
    }
    const dark = contrastRatio(CUSTOM_INK, hex);
    return dark >= light
        ? {
              words: "dark",
              ink: CUSTOM_INK,
              ratio: dark,
              readable: dark >= PALETTE_MIN_CONTRAST,
          }
        : { words: "light", ink: WHITE, ratio: light, readable: false };
}

/** The nearest darker shade white words read on (CS4's second fix). */
export function darkenToRead(hex: string): string {
    for (let i = 0; i <= 50; i++) {
        const shade = mixHex(hex, "#000000", i / 50);
        if (contrastRatio(WHITE, shade) >= PALETTE_MIN_CONTRAST) return shade;
    }
    return "#000000";
}

/** Why a colour can't be used, or null when it can. */
export function colourProblem(value: string): string | null {
    if ((COLOUR_ROLES as readonly string[]).includes(value)) return null;
    const hex = normalizeHex(value);
    if (!hex) return "A colour is one of the site's colours or #RRGGBB";
    const { readable, ratio } = customColourWords(hex);
    return readable
        ? null
        : `Words on ${hex} are hard to read (${ratio.toFixed(1)} : 1; it needs ${PALETTE_MIN_CONTRAST} : 1)`;
}

const colour = z.string().superRefine((value, ctx) => {
    const problem = colourProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
});

/**
 * One button's own style. Its Filled / Outline / Soft / Link is the CTA's
 * `style` (primary / secondary / soft / link), so it is not repeated here.
 */
export const buttonElementStyleSchema = z
    .object({
        colour: colour.optional(),
        corners: z.enum(COMPONENT_STYLE_OPTIONS.buttons).optional(),
        size: z.enum(COMPONENT_STYLE_OPTIONS.buttonSize).optional(),
    })
    .strict();
export type ButtonElementStyle = z.infer<typeof buttonElementStyleSchema>;

/** Every button in a section. */
export const buttonSectionStyleSchema = buttonElementStyleSchema
    .extend({ style: z.enum(COMPONENT_STYLE_OPTIONS.buttonStyle).optional() })
    .strict();
export type ButtonSectionStyle = z.infer<typeof buttonSectionStyleSchema>;

export const cardStyleSchema = z
    .object({
        card: z.enum(COMPONENT_STYLE_OPTIONS.cards).optional(),
        corners: z.enum(COMPONENT_STYLE_OPTIONS.cardCorners).optional(),
    })
    .strict();
export type CardStyle = z.infer<typeof cardStyleSchema>;

export const imageStyleSchema = z
    .object({ corners: z.enum(COMPONENT_STYLE_OPTIONS.images).optional() })
    .strict();
export type ImageStyle = z.infer<typeof imageStyleSchema>;

/** A section's styles for its elements, in `frame.styles`. */
export const sectionStylesSchema = z
    .object({
        button: buttonSectionStyleSchema.optional(),
        card: cardStyleSchema.optional(),
        image: imageStyleSchema.optional(),
    })
    .strict();
export type SectionStyles = z.infer<typeof sectionStylesSchema>;

export type ElementKind = keyof SectionStyles;

/** The section's styles as the renderer may use them; bad ones dropped. */
export function sectionStylesOf(value: unknown): SectionStyles | undefined {
    const parsed = sectionStylesSchema.safeParse(value);
    if (!parsed.success) return undefined;
    const kept: SectionStyles = Object.fromEntries(
        Object.entries(parsed.data).filter(
            ([, v]) => Object.keys(v).length > 0,
        ),
    );
    return Object.keys(kept).length > 0 ? kept : undefined;
}

/** A button's own style as the renderer may use it; bad fields dropped. */
export function buttonElementStyleOf(
    value: unknown,
): ButtonElementStyle | undefined {
    if (!value || typeof value !== "object") return undefined;
    const out: Record<string, string> = {};
    for (const [key, schema] of Object.entries(
        buttonElementStyleSchema.shape,
    )) {
        const parsed = schema.safeParse(
            (value as Record<string, unknown>)[key],
        );
        if (parsed.success && parsed.data !== undefined) out[key] = parsed.data;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/** A photo's own style as the renderer may use it. */
export function imageStyleOf(value: unknown): ImageStyle | undefined {
    const parsed = imageStyleSchema.safeParse(value);
    return parsed.success && parsed.data.corners ? parsed.data : undefined;
}
