/**
 * Component styles (DEC-237, plan U1 KD1–KD4): how each kind of component
 * on a merchant's site is drawn, chosen per site from a few curated
 * options, never free CSS. Free on every plan (`StyleKind` does not name
 * them; `style-access.test.ts` holds that).
 *
 * Stored as `SiteStyle.components`, ABSENT until the owner sets something,
 * for the reason `look` is absent for Classic: the pending-change count
 * compares style bytes. Once set, a key is kept even when it equals the
 * look's default, so a choice survives Classic → Quiet → Classic; only
 * "Reset to <look>" removes the object.
 *
 * A look's DEFAULT option means "as the look draws it today", so a look's
 * defaults reproduce today's page exactly and the renderer writes nothing
 * for them (`component-theme.ts` in site-blocks). "Soft" corners and
 * "Standard" spacing are the look's own values. Every other option is a
 * fixed value ({@link COMPONENT_VALUES}).
 */

/** Each component and its options, in the board's (SBCustomise) order. */
export const COMPONENT_STYLE_OPTIONS = {
    buttons: ["square", "rounded", "pill"],
    secondButton: ["outline", "text"],
    /**
     * DEC-252: how the filled buttons are drawn, their size and their
     * colour (a palette role; a custom colour is per element or section
     * only, `element-styles.ts`). Each look's default is "as it draws today".
     */
    buttonColour: ["accent", "fg", "surface", "bg", "rule"],
    buttonStyle: ["filled", "outline", "soft", "link"],
    buttonSize: ["s", "m", "l"],
    cards: ["flat", "bordered", "raised"],
    cardCorners: ["square", "soft", "rounded"],
    /** Round is for people and product photos only; others keep Soft. */
    images: ["square", "soft", "arch", "round"],
    headings: ["normal", "caps", "display"],
    spacing: ["airy", "standard", "compact"],
    tags: ["pill", "tag"],
    links: ["underlined", "arrow"],
} as const;

export type ComponentKind = keyof typeof COMPONENT_STYLE_OPTIONS;
export type ComponentOption<K extends ComponentKind = ComponentKind> =
    (typeof COMPONENT_STYLE_OPTIONS)[K][number];

/** A site's choices: only the components the owner changed. */
export type ComponentStyles = { [K in ComponentKind]?: ComponentOption<K> };

/** Every component with a choice: a look's defaults. */
export type ComponentDefaults = { [K in ComponentKind]: ComponentOption<K> };

export const COMPONENT_KINDS = Object.keys(
    COMPONENT_STYLE_OPTIONS,
) as ComponentKind[];

/** The editor's words (SBCustomise). */
export const COMPONENT_LABELS: Record<ComponentKind, string> = {
    buttons: "Buttons",
    secondButton: "Second button",
    buttonStyle: "Button style",
    buttonSize: "Button size",
    buttonColour: "Button colour",
    cards: "Cards",
    cardCorners: "Card corners",
    images: "Images",
    headings: "Headings",
    spacing: "Spacing",
    tags: "Slots and tags",
    links: "Links",
};

export const COMPONENT_OPTION_LABELS: {
    [K in ComponentKind]: Record<ComponentOption<K>, string>;
} = {
    buttons: { square: "Square", rounded: "Rounded", pill: "Pill" },
    secondButton: { outline: "Outline", text: "Text" },
    buttonStyle: {
        filled: "Filled",
        outline: "Outline",
        soft: "Soft",
        link: "Link",
    },
    buttonSize: { s: "Small", m: "Medium", l: "Large" },
    buttonColour: {
        accent: "Brand",
        fg: "Text",
        surface: "Panels",
        bg: "Background",
        rule: "Lines",
    },
    cards: { flat: "Flat", bordered: "Bordered", raised: "Raised" },
    cardCorners: { square: "Square", soft: "Soft", rounded: "Rounded" },
    images: { square: "Square", soft: "Soft", arch: "Arch", round: "Round" },
    headings: { normal: "Normal", caps: "All caps", display: "Display" },
    spacing: { airy: "Airy", standard: "Standard", compact: "Compact" },
    tags: { pill: "Pill", tag: "Tag" },
    links: { underlined: "Underlined", arrow: "With arrow" },
};

/** Classic's defaults (BRIEF Wave 2); a look's are `LOOKS[id].components`. */
export const CLASSIC_COMPONENTS: ComponentDefaults = {
    buttons: "rounded",
    secondButton: "outline",
    buttonStyle: "filled",
    buttonSize: "m",
    buttonColour: "accent",
    cards: "bordered",
    cardCorners: "soft",
    images: "soft",
    headings: "normal",
    spacing: "standard",
    tags: "pill",
    links: "underlined",
};

/**
 * The fixed values behind the options that are not a look's own. A
 * corner is px (999 a pill); spacing is a factor of the look's own section
 * padding and grid gap, relative to the look's default (so Quiet's Airy is
 * today's 120px and its Standard 120 ÷ 1.25).
 */
export const COMPONENT_VALUES = {
    buttonRadius: { square: 0, rounded: 10, pill: 999 },
    cardRadius: { square: 0, rounded: 20 },
    imageRadius: { square: 0 },
    spacing: { airy: 1.25, standard: 1, compact: 0.75 },
} as const;

export function isComponentOption<K extends ComponentKind>(
    kind: K,
    value: unknown,
): value is ComponentOption<K> {
    return (
        typeof value === "string" &&
        (COMPONENT_STYLE_OPTIONS[kind] as readonly string[]).includes(value)
    );
}

/**
 * The listed choices in `input`, anything else dropped: the forgiving read
 * (`presetSiteStyle`, the renderer). Undefined when none is left, so an
 * empty object is never stored. The API's save refuses an unknown id
 * instead (U2) with {@link isComponentOption}.
 */
export function pickComponentStyles(
    input: unknown,
): ComponentStyles | undefined {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return undefined;
    }
    const out: Record<string, string> = {};
    for (const kind of COMPONENT_KINDS) {
        const value = (input as Record<string, unknown>)[kind];
        if (isComponentOption(kind, value)) out[kind] = value;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The variable carrying a choice to the renderer, by WORD (like
 * `--site-label-style`): `SiteTheme` turns it into rules from its own
 * table and never writes the value into CSS.
 */
export const COMPONENT_VARIABLE_PREFIX = "--site-choice-";

export function componentVariable(kind: ComponentKind): string {
    return `${COMPONENT_VARIABLE_PREFIX}${kind.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** The choices as variables: nothing at all for a site with none. */
export function componentStyleVariables(
    components: ComponentStyles | undefined,
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const kind of COMPONENT_KINDS) {
        const value = components?.[kind];
        if (value) out[componentVariable(kind)] = value;
    }
    return out;
}

/** The choices a publication's variables carry, unknown words dropped. */
export function componentStylesOf(
    variables: Readonly<Record<string, string>> | null | undefined,
): ComponentStyles {
    const out: Record<string, string> = {};
    for (const kind of COMPONENT_KINDS) {
        const value = variables?.[componentVariable(kind)];
        if (isComponentOption(kind, value)) out[kind] = value;
    }
    return out;
}
