import type {
    ComponentDefaults,
    ComponentKind,
    ComponentStyles,
    LookId,
} from "@saroh/block-contract";
import {
    COMPONENT_KINDS,
    COMPONENT_VALUES,
    componentDefaults,
    componentStylesOf,
    LOOKS,
} from "@saroh/block-contract";

import { ACCOUNT_PARTS } from "./account/look-account-rules";
import { LOOK_DESK_FROM } from "./look-theme";

/**
 * Component styles as CSS (DEC-227, plan U1 KD2), written by `SiteTheme`
 * LAST, after the look's rules, so a merchant's choice beats the look.
 *
 * Only a choice that differs from the look's default writes anything: a
 * look's default is how it draws today, so a site with no choices (or
 * only defaults) gets exactly the sheet it always had, byte for byte
 * (`component-theme.test.tsx` pins every look × colourway, `classic-pin`
 * Classic's).
 *
 * The blocks are not re-classed. Each rule finds its component by the
 * classes the blocks already write (the way the look's `cardCorners`
 * does), and sets a dedicated variable (`--site-button-radius`,
 * `--site-card-radius`, `--site-image-radius`, `--site-tag-radius`) that
 * the rule reads. So old publications, which carry no choices, draw as
 * they did, and the markup's own fallback chain (Classic cards
 * `calc(var(--site-radius)*1.4)`, a look's cards `--site-radius-photo` or
 * `--site-radius-s`, buttons `--site-radius`) stays in force for every
 * component nobody changed.
 *
 * Colour: no rule here picks a colour. Raised cards fill with the page's
 * card colour (`--site-surface`) and Bordered draws the control edge
 * (`--site-rule`), both held by the palette; a text second button keeps
 * its words' colour. Nothing touches a focus ring (`ctaClasses` draws it
 * as a ring, `site-craft.ts` as an outline) or a control's height.
 */

/**
 * Buttons: the shared `ctaClasses`, the look blocks' `rounded-site`, and
 * the customer's account's (DEC-229: the account takes the same styles).
 */
const BUTTON = `:is(:is(a, button):is([class*="rounded-[var(--site-radius)"], [class~="rounded-site"]), ${ACCOUNT_PARTS.button})`;

/**
 * Cards: Classic's rounder-than-a-button boxes, the looks' card fills and
 * the account's cards.
 */
const CARD = `:is([class*="rounded-[calc(var(--site-radius)*1.4)]"], [class*="rounded-[calc(var(--site-radius)*1.6)]"], .bg-site-surface.rounded-site-photo, ${ACCOUNT_PARTS.card})`;

/** Photographs: Classic's and the looks', and a frame clipping one. */
const IMAGE =
    ':is(img[class*="rounded-[var(--site-radius)"], img.rounded-site-photo, .rounded-site-photo:not(.bg-site-surface):has(> img))';

/**
 * People and product photos, the only ones Round reaches. No block marks
 * them yet: until one does (U4, U5), Round leaves every photo the look's.
 */
const ROUND_PHOTO =
    ':is([data-site-photo="person"], [data-site-photo="product"]) :is(img, [class*="rounded-"]):not(:has(*))';

/** Slots, chips and tags: the small radius, and a padded pill badge. */
const TAG =
    ':is([class~="rounded-site-s"], [class~="rounded-full"][class*="px-"]):not(input, select, textarea)';

/** Text links: a link-style button, or a link a block marks. */
const LINK = ':is(a[class~="underline"], a[data-site-link])';

type Rule = (at: string, ctx: Context) => string;

interface Context {
    look: LookId | undefined;
    defaults: ComponentDefaults;
    variables: Readonly<Record<string, string>> | null | undefined;
}

const px = (n: number) => `${Math.round(n)}px`;

/** The page-scope variable and the rule that reads it. */
function radius(at: string, name: string, value: string, selector: string) {
    return `
            ${at} {
                ${name}: ${value};
            }
            ${at} ${selector} {
                border-radius: var(${name});
            }`;
}

// Partial: an option that keeps the look's own value (e.g. "soft") has no rule.
const RULES: Record<ComponentKind, Partial<Record<string, Rule>>> = {
    buttons: Object.fromEntries(
        Object.entries(COMPONENT_VALUES.buttonRadius).map(([id, n]) => [
            id,
            (at) =>
                radius(at, "--site-button-radius", px(n), BUTTON) +
                // A look's account rounds its buttons from the look's own
                // radius (`accountLookRules`); the merchant's choice wins.
                `
            ${at} [data-account-look] :is(${ACCOUNT_PARTS.button}) {
                border-radius: var(--site-button-radius);
            }`,
        ]),
    ),
    secondButton: {
        // The bordered button, as words alone: its padding, so its height.
        text: (at) => `
            ${at} ${BUTTON}[class~="border"]:not([class*="bg-site-"]) {
                border-color: transparent;
                background-color: transparent;
                text-decoration-line: underline;
                text-underline-offset: 4px;
            }`,
        outline: (at) => `
            ${at} ${BUTTON}[class~="underline"] {
                border: 1px solid currentColor;
                padding: 0.625rem 1.25rem;
                text-decoration-line: none;
            }`,
    },
    cards: {
        flat: (at) => `
            ${at} ${CARD} {
                border-color: transparent;
                box-shadow: none;
            }`,
        bordered: (at) => `
            ${at} ${CARD} {
                border: 1px solid hsl(var(--site-rule, var(--site-border)));
                box-shadow: none;
            }`,
        raised: (at) => `
            ${at} ${CARD} {
                border-color: transparent;
                background-color: hsl(var(--site-surface));
            }
            ${at} ${CARD}:not(:focus-visible) {
                box-shadow: 0 1px 2px hsl(var(--site-fg) / 0.06), 0 12px 32px -16px hsl(var(--site-fg) / 0.3);
            }`,
    },
    cardCorners: {
        // Soft is the look's own corner: never written.
        square: (at) =>
            radius(
                at,
                "--site-card-radius",
                px(COMPONENT_VALUES.cardRadius.square),
                CARD,
            ),
        rounded: (at) =>
            radius(
                at,
                "--site-card-radius",
                px(COMPONENT_VALUES.cardRadius.rounded),
                CARD,
            ),
    },
    images: {
        // Soft is the look's own photo corner: never written.
        square: (at) =>
            radius(
                at,
                "--site-image-radius",
                px(COMPONENT_VALUES.imageRadius.square),
                IMAGE,
            ),
        arch: (at) =>
            radius(at, "--site-image-radius", "999px 999px 0 0", IMAGE),
        round: (at) => `
            ${at} ${ROUND_PHOTO} {
                border-radius: 50%;
            }`,
    },
    headings: {
        normal: (at) => `
            ${at} [data-site-section] :is(h1, h2, h3) {
                text-transform: none;
            }`,
        caps: (at) => `
            ${at} [data-site-section] :is(h1, h2, h3) {
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }`,
        display: (at) => `
            ${at} [data-site-section] :is(h1, h2) {
                text-transform: none;
                font-weight: 400;
                letter-spacing: -0.035em;
                line-height: 1.02;
            }`,
    },
    spacing: Object.fromEntries(
        (["airy", "standard", "compact"] as const).map((id) => [
            id,
            (at, ctx) => spacing(at, ctx, id),
        ]),
    ),
    tags: {
        pill: (at) => radius(at, "--site-tag-radius", "999px", TAG),
        tag: (at) => radius(at, "--site-tag-radius", "4px", TAG),
    },
    links: {
        arrow: (at) => `
            ${at} [data-site-section] ${LINK} {
                text-decoration-line: none;
            }
            ${at} [data-site-section] ${LINK}::after {
                content: "\\2192" / "";
                margin-inline-start: 0.35em;
            }`,
        underlined: (at) => `
            ${at} [data-site-section] ${LINK} {
                text-decoration-line: underline;
                text-underline-offset: 0.2em;
            }`,
    },
};

/**
 * Spacing as a factor of the look's own section padding and grid gap,
 * relative to the look's default option, so the default is ×1 (today).
 * Classic's own is the merchant's slider, from their variables.
 */
function spacing(
    at: string,
    { look, defaults, variables }: Context,
    id: keyof typeof COMPONENT_VALUES.spacing,
): string {
    const f =
        COMPONENT_VALUES.spacing[id] /
        COMPONENT_VALUES.spacing[defaults.spacing];
    const own = (name: string, fallback: number) =>
        Number.parseFloat(variables?.[name] ?? "") || fallback;
    const gap = px(own("--site-grid-gap", 14) * f);
    if (!look) {
        return `
            ${at} {
                --site-section-padding: ${px(own("--site-section-padding", 52) * f)};
                --site-grid-gap: ${gap};
            }`;
    }
    const { sectionPadding } = LOOKS[look].tokens;
    return `
            ${at} {
                --site-section-padding: ${px(sectionPadding.phone * f)};
                --site-grid-gap: ${gap};
            }
            @media (min-width: ${LOOK_DESK_FROM}px) {
                ${at} {
                    --site-section-padding: ${px(sectionPadding.desk * f)};
                }
            }`;
}

/** The choices that differ from the look's defaults: what gets written. */
export function changedComponents(
    look: LookId | undefined,
    choices: ComponentStyles,
): ComponentStyles {
    const defaults = componentDefaults(look);
    return Object.fromEntries(
        COMPONENT_KINDS.filter(
            (kind) => choices[kind] && choices[kind] !== defaults[kind],
        ).map((kind) => [kind, choices[kind]]),
    );
}

/**
 * The component rules for a site: empty unless a choice differs from the
 * look's default. `variables` are the publication's (choices by word,
 * `componentStyleVariables`); a word this build does not know is dropped.
 */
export function componentRules(
    at: string,
    look: LookId | undefined,
    variables: Readonly<Record<string, string>> | null | undefined,
): string {
    const changed = changedComponents(look, componentStylesOf(variables));
    const ctx: Context = { look, defaults: componentDefaults(look), variables };
    return COMPONENT_KINDS.map((kind) => {
        const id = changed[kind];
        return id ? (RULES[kind][id]?.(at, ctx) ?? "") : "";
    }).join("");
}
