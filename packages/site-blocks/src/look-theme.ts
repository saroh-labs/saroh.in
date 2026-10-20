import type { LookId, SiteFontPair } from "@saroh/block-contract";
import { findFontPair, LOOKS, typeScaleVariables } from "@saroh/block-contract";

/**
 * A look's tokens as CSS (DEC-172, KD3), written by `SiteTheme` AFTER the
 * merchant's own variables, so the look's corners, spacing, measure and
 * type win while every colour stays the business's (already made safe by
 * the publisher, `safe-colours.ts`). New `--site-*` names only: nothing
 * here is Saroh's, and gates G2, G6 and G7 hold that.
 *
 * Never written for Classic: `SiteTheme` calls this only with a look, so a
 * site with none draws the stylesheet it always did.
 */

/** The type-scale variables a look sets, or clears (`initial`) when it has none. */
const TYPE_VARIABLES = [
    "--site-display-size",
    "--site-body-size",
    "--site-measure",
    "--site-content-width",
] as const;

/** Where a look's desk spacing starts: Tailwind's `md`. */
export const LOOK_DESK_FROM = 768;

/**
 * The family a look's body text takes its rupee sign from, when its body
 * face has none (U3: Jost and Hanken Grotesk draw no ₹). See
 * {@link rupeeFaceRules}.
 */
export const RUPEE_FAMILY = "Site Rupee";

/**
 * A look's type scale as variables, with every size it leaves unset
 * cleared, so a template's own column or measure never leaks under a look
 * that does not set one. `--site-label-style` is a word that picks a rule
 * (`site-theme.tsx`), never written as CSS; it is returned for that rule.
 */
export function lookTypeVariables(look: LookId): Record<string, string> {
    const set = typeScaleVariables(LOOKS[look].type);
    const out: Record<string, string> = {};
    for (const name of TYPE_VARIABLES) out[name] = set[name] ?? "initial";
    if (set["--site-label-style"]) {
        out["--site-label-style"] = set["--site-label-style"];
    }
    return out;
}

/**
 * The merchant's variables as the look sees them: their own, with the
 * look's type scale in place of the template's. What the theme's rules
 * read to decide (a label style, a column, a measure); the merchant's
 * declarations themselves are written unchanged.
 */
export function lookViewOf(
    variables: Record<string, string> | null | undefined,
    look: LookId,
): Record<string, string> {
    const own = { ...(variables ?? {}) };
    delete own["--site-label-style"];
    const view: Record<string, string> = { ...own };
    for (const [name, value] of Object.entries(lookTypeVariables(look))) {
        if (value === "initial") delete view[name];
        else view[name] = value;
    }
    return view;
}

/** Whether a face draws the rupee sign: only one that loads `latin-ext` (U3). */
function drawsRupee(pair: SiteFontPair): boolean {
    return pair.body.subsets?.includes("latin-ext") ?? false;
}

/**
 * The rupee in a look's body text (the ₹ decision, U4; recorded in the
 * plan's U4 notes and `frontend-design-system.md`).
 *
 * Quiet's Jost and Folio's Hanken Grotesk have no ₹. Left alone, a price
 * in their text took its ₹ from whatever came next in the stack: on a Mac
 * the body face's metric fallback (Arial), on a phone the system face,
 * somewhere else a serif. The boards set prices in the body face (a sans,
 * tabular figures), so the ₹ must be a sans too, the same on every
 * device. A third font file is out (two families per look), and the look's
 * display face is a serif that would set the ₹ apart from its figures.
 *
 * So the body stack names a face that covers U+20B9 ONLY, right after the
 * body face, built from the sans faces already on the device that draw
 * one (Arial, Roboto, Segoe UI, Noto Sans and the Linux sans; the first
 * found is used, so each must have the glyph): it costs
 * no download, every other character still comes from the body face, and
 * a bold price has a bold ₹. Live's Figtree draws its own and gets none.
 */
export function rupeeFaceRules(): string {
    const faces = (weights: string, local: readonly string[]) => `
            @font-face {
                font-family: "${RUPEE_FAMILY}";
                src: ${local.map((name) => `local("${name}")`).join(", ")};
                font-weight: ${weights};
                unicode-range: U+20B9;
            }`;
    return (
        faces("100 500", [
            "Arial",
            "ArialMT",
            "Roboto",
            "Roboto-Regular",
            "Segoe UI",
            "Noto Sans",
            "NotoSans-Regular",
            "Liberation Sans",
            "DejaVu Sans",
        ]) +
        faces("600 900", [
            "Arial Bold",
            "Arial-BoldMT",
            "Roboto Bold",
            "Roboto-Bold",
            "Segoe UI Bold",
            "Noto Sans Bold",
            "NotoSans-Bold",
            "Liberation Sans Bold",
            "DejaVu Sans Bold",
        ])
    );
}

/**
 * A body stack with the rupee face after its first family: the loaded
 * face (or its plain name), then the rupee, then the rest of the stack
 * (the loader's metric fallback and the system faces).
 */
export function withRupee(stack: string): string {
    const comma = stack.indexOf(",");
    if (comma < 0) return `${stack}, "${RUPEE_FAMILY}"`;
    return `${stack.slice(0, comma)}, "${RUPEE_FAMILY}"${stack.slice(comma)}`;
}

/** Whether a look's body face needs {@link rupeeFaceRules}. */
export function lookNeedsRupee(look: LookId): boolean {
    const pair = findFontPair(LOOKS[look].fontPair);
    return pair ? !drawsRupee(pair) : false;
}

/**
 * The look's own declarations at the theme's scope: its corners, its
 * phone spacing (and its desk spacing from {@link LOOK_DESK_FROM}), its
 * measure and type, its motion scale, and its faces. `fonts` are the
 * stacks for its pair, from the faces the app loaded; the mono role is
 * cleared, since a look's pair has none.
 */
export function lookRules(
    at: string,
    look: LookId,
    fonts: { heading: string; body: string } | null,
): string {
    const { tokens, motion } = LOOKS[look];
    const px = (n: number) => `${n}px`;
    const declarations: [string, string][] = [
        ["--site-radius", px(tokens.radius)],
        ["--site-radius-s", px(tokens.radiusSmall)],
        ["--site-radius-photo", px(tokens.radiusPhoto)],
        ["--site-page-margin", px(tokens.pageMargin.phone)],
        ["--site-section-padding", px(tokens.sectionPadding.phone)],
        ["--site-motion-fast", `${motion.fast}ms`],
        ["--site-motion-base", `${motion.base}ms`],
        ["--site-motion-slow", `${motion.slow}ms`],
        ["--site-rise", px(motion.rise)],
        ...Object.entries(lookTypeVariables(look)).filter(
            ([name]) => name !== "--site-label-style",
        ),
    ];
    if (fonts) {
        declarations.push(
            ["--site-font-heading", fonts.heading],
            [
                "--site-font-body",
                lookNeedsRupee(look) ? withRupee(fonts.body) : fonts.body,
            ],
        );
    }
    declarations.push(["--site-font-mono", "initial"]);
    const block = declarations
        .map(([name, value]) => `                ${name}: ${value};`)
        .join("\n");
    return `
            ${at} {
${block}
            }
            @media (min-width: ${LOOK_DESK_FROM}px) {
                ${at} {
                    --site-page-margin: ${px(tokens.pageMargin.desk)};
                    --site-section-padding: ${px(tokens.sectionPadding.desk)};
                }
            }${cardCorners(at)}${fonts && lookNeedsRupee(look) ? rupeeFaceRules() : ""}`;
}

/**
 * The corners of the blocks a look restyles by tokens alone (DEC-172, U7:
 * hours, FAQ, projects, rich text and the editor's notes). Their cards
 * and photos are rounded from the BUTTON's radius on Classic, a step
 * rounder for a card; under Quiet that radius is a pill, so a card would
 * be a capsule. Here a card takes the look's small radius and a photo its
 * photo radius, one rule for every such block, without touching their
 * Classic markup. A block drawn for the look names `rounded-site-s` or
 * `rounded-site-photo` itself and is not matched.
 */
function cardCorners(at: string): string {
    return `
            ${at} [class*="rounded-[calc(var(--site-radius)*1.4)]"],
            ${at} [class*="rounded-[calc(var(--site-radius)*1.6)]"] {
                border-radius: var(--site-radius-s);
            }
            ${at} img[class*="rounded-[var(--site-radius)]"] {
                border-radius: var(--site-radius-photo);
            }`;
}
