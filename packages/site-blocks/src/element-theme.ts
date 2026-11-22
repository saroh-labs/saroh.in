import type { CSSProperties } from "react";

import type { ColourRole } from "@saroh/block-contract";
import {
    buttonElementStyleOf,
    COLOUR_ROLES,
    COMPONENT_VALUES,
    customColourWords,
    imageStyleOf,
    normalizeHex,
} from "@saroh/block-contract";

/**
 * One element's own style (DEC-251), drawn on the element itself as an
 * inline style: the closest choice, so it beats the section's and the
 * site's rules without a selector race. An element with no style of its
 * own gets no `style` attribute at all, so a live page is what it was.
 */

/** Each role as a fill and the words its palette holds readable on it. */
const ROLE_PAIR: Record<ColourRole, { fill: string; ink: string }> = {
    accent: {
        fill: "hsl(var(--site-accent))",
        ink: "hsl(var(--site-accent-fg))",
    },
    fg: { fill: "hsl(var(--site-fg))", ink: "hsl(var(--site-bg))" },
    surface: { fill: "hsl(var(--site-surface))", ink: "hsl(var(--site-fg))" },
    bg: { fill: "hsl(var(--site-bg))", ink: "hsl(var(--site-fg))" },
    rule: {
        fill: "hsl(var(--site-rule, var(--site-border)))",
        ink: "hsl(var(--site-fg))",
    },
};

/**
 * A colour as a fill and its words: a role's pair, or a custom hex with
 * white or dark words, whichever reads (refused at save when neither
 * does). Null for anything else, so no unchecked value reaches CSS.
 */
export function colourPair(
    colour: string,
): { fill: string; ink: string } | null {
    if ((COLOUR_ROLES as readonly string[]).includes(colour)) {
        return ROLE_PAIR[colour as ColourRole];
    }
    const hex = normalizeHex(colour);
    return hex ? { fill: hex, ink: customColourWords(hex).ink } : null;
}

/** Small and Large; Medium is the look's own. */
export const BUTTON_SIZES = {
    s: { padding: "0.5rem 1rem", fontSize: "0.8125rem" },
    l: { padding: "0.875rem 1.75rem", fontSize: "1rem" },
} as const;

const px = (n: number) => `${n}px`;

const IMAGE_CORNERS: Record<string, string> = {
    square: px(COMPONENT_VALUES.imageRadius.square),
    arch: "999px 999px 0 0",
    round: "50%",
};

/** A button's own colour, corners and size as an inline style. */
export function buttonInlineStyle(
    style: string | undefined,
    own: unknown,
): CSSProperties | undefined {
    const el = buttonElementStyleOf(own);
    if (!el) return undefined;
    const out: CSSProperties = {};
    if (el.corners) {
        out.borderRadius = px(COMPONENT_VALUES.buttonRadius[el.corners]);
    }
    if (el.size && el.size !== "m" && style !== "link") {
        out.padding = BUTTON_SIZES[el.size].padding;
        out.fontSize = BUTTON_SIZES[el.size].fontSize;
    }
    const pair = el.colour ? colourPair(el.colour) : null;
    if (pair) {
        if (style === "secondary") out.borderColor = pair.fill;
        else if (style === "soft") {
            out.backgroundColor = `color-mix(in srgb, ${pair.fill} 16%, transparent)`;
        } else if (style === "link") out.textDecorationColor = pair.fill;
        else {
            out.backgroundColor = pair.fill;
            out.borderColor = pair.fill;
            out.color = pair.ink;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/** A photo's own corners as an inline style (Soft: the look's own). */
export function imageInlineStyle(own: unknown): CSSProperties | undefined {
    const corners = imageStyleOf(own)?.corners;
    const radius = corners ? IMAGE_CORNERS[corners] : undefined;
    return radius ? { borderRadius: radius } : undefined;
}

/**
 * What an element carries: its inline style, and on the editor's canvas
 * only its place in the content (`editorPath`, stamped by the canvas), so
 * a click on it can be told apart. Nothing for a live element with no
 * style of its own.
 */
export function elementProps(
    kind: "button" | "image",
    content: { elementStyle?: unknown; editorPath?: unknown; style?: string },
): { style?: CSSProperties; "data-site-el"?: string } {
    const style =
        kind === "button"
            ? buttonInlineStyle(content.style, content.elementStyle)
            : imageInlineStyle(content.elementStyle);
    const path =
        typeof content.editorPath === "string"
            ? `${kind}:${content.editorPath}`
            : undefined;
    return {
        ...(style ? { style } : {}),
        ...(path ? { "data-site-el": path } : {}),
    };
}

/** A short, stable mark for a section's styles: same styles, same mark. */
export function stylesMark(styles: unknown): string {
    const text = JSON.stringify(styles);
    let h = 5381;
    for (let i = 0; i < text.length; i++) {
        h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/** An element's props merged into props it already has (a photo's focus). */
export function withElement<P extends { style?: CSSProperties }>(
    kind: "button" | "image",
    content:
        { elementStyle?: unknown; editorPath?: unknown } | null | undefined,
    props: P,
): P {
    if (!content) return props;
    const el = elementProps(kind, content);
    if (!el.style && !el["data-site-el"]) return props;
    return {
        ...props,
        ...el,
        ...(el.style ? { style: { ...props.style, ...el.style } } : {}),
    };
}
