import type {
    ButtonElementStyle,
    ComponentStyles,
    ImageStyle,
    LookId,
    SectionStyles,
} from "@saroh/block-contract";
import {
    componentDefaults,
    contrastRatio,
    customColourWords,
    hslTripleToHex,
    LOOKS,
    normalizeHex,
} from "@saroh/block-contract";

/**
 * One element on the canvas and its style at each level (DEC-251): this
 * element, this section, the whole site. Pure, so the desk's Style tab,
 * the phone's sheet and a test share one rule.
 */

export type ElementKind = "button" | "image";
export type StyleScope = "element" | "section" | "site";

/** What a click on the canvas picked: its kind and its place in the content. */
export interface SelectedElement {
    kind: ElementKind;
    /** Dotted path in the section's content; "." is the content itself. */
    path: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
    v !== null && typeof v === "object" && !Array.isArray(v);

/** A CTA (a label and a link or an action) or a photo (a `src`). */
function kindOf(value: Obj): ElementKind | null {
    if (
        typeof value.label === "string" &&
        ("href" in value || "action" in value)
    ) {
        return "button";
    }
    if (typeof value.src === "string") return "image";
    return null;
}

/**
 * The content with every button and photo stamped with its place
 * (`editorPath`), for the canvas only: the renderer marks a stamped
 * element `data-site-el="kind:path"`. Never saved, never published.
 */
export function stampElements(content: unknown, path = ""): unknown {
    if (Array.isArray(content)) {
        return content.map((v, i) => stampElements(v, join(path, String(i))));
    }
    if (!isObj(content)) return content;
    const out: Obj = {};
    for (const [key, value] of Object.entries(content)) {
        out[key] =
            key === "frame" ? value : stampElements(value, join(path, key));
    }
    if (kindOf(content)) out.editorPath = path === "" ? "." : path;
    return out;
}

const join = (a: string, b: string) => (a === "" ? b : `${a}.${b}`);

/** "button:cta" from the canvas mark, or null. */
export function parseElementMark(mark: string | null): SelectedElement | null {
    const m = mark ? /^(button|image):(.+)$/.exec(mark) : null;
    return m ? { kind: m[1] as ElementKind, path: m[2] } : null;
}

export function elementMark(el: SelectedElement): string {
    return `${el.kind}:${el.path}`;
}

/** The element's own object in the content. */
export function elementAt(content: unknown, path: string): Obj | null {
    if (path === ".") return isObj(content) ? content : null;
    let at: unknown = content;
    for (const key of path.split(".")) {
        if (Array.isArray(at)) at = at[Number(key)];
        else if (isObj(at)) at = at[key];
        else return null;
    }
    return isObj(at) ? at : null;
}

/** The content with the element at `path` replaced by `next(element)`. */
export function withElementAt(
    content: unknown,
    path: string,
    next: (element: Obj) => Obj,
): unknown {
    if (path === ".") return isObj(content) ? next(content) : content;
    const [head, ...rest] = path.split(".");
    const tail = rest.join(".");
    const child = (v: unknown) =>
        tail === "" ? (isObj(v) ? next(v) : v) : withElementAt(v, tail, next);
    if (Array.isArray(content)) {
        return (content as unknown[]).map((v, i) =>
            String(i) === head ? child(v) : v,
        );
    }
    if (!isObj(content)) return content;
    const at: unknown = content[head];
    return { ...content, [head]: child(at) };
}

/** An object with its empty keys left out, or undefined when none is left. */
export function compact<T extends Obj>(value: T): T | undefined {
    const kept = Object.fromEntries(
        Object.entries(value).filter(([, v]) => v !== undefined),
    ) as T;
    return Object.keys(kept).length > 0 ? kept : undefined;
}

/** A button's style fields, whatever level holds them. */
export interface ButtonLook {
    colour?: string;
    style?: "filled" | "outline" | "soft" | "link";
    corners?: "square" | "rounded" | "pill";
    size?: "s" | "m" | "l";
}

/** The CTA's own style word, as the Style tiles name it. */
const FILL_OF_CTA = {
    primary: "filled",
    secondary: "outline",
    soft: "soft",
    link: "link",
} as const;
export const CTA_OF_FILL = {
    filled: "primary",
    outline: "secondary",
    soft: "soft",
    link: "link",
} as const;

/** A button's style at each level, and the look's own. */
export function buttonLevels(
    element: Obj | null,
    section: SectionStyles | undefined,
    site: ComponentStyles | undefined,
    look: LookId | undefined,
): Record<StyleScope | "look", ButtonLook> {
    const own = (element?.elementStyle ?? {}) as ButtonElementStyle;
    const cta = element?.style as keyof typeof FILL_OF_CTA | undefined;
    const d = componentDefaults(look);
    return {
        element: {
            ...own,
            style: cta && cta !== "primary" ? FILL_OF_CTA[cta] : undefined,
        },
        section: { ...(section?.button ?? {}) },
        site: {
            colour: site?.buttonColour,
            style: site?.buttonStyle,
            corners: site?.buttons,
            size: site?.buttonSize,
        },
        look: {
            colour: d.buttonColour,
            style: d.buttonStyle,
            corners: d.buttons,
            size: d.buttonSize,
        },
    };
}

export function imageLevels(
    element: Obj | null,
    section: SectionStyles | undefined,
    site: ComponentStyles | undefined,
    look: LookId | undefined,
): Record<StyleScope | "look", ImageStyle> {
    return {
        element: { ...((element?.elementStyle ?? {}) as ImageStyle) },
        section: { ...(section?.image ?? {}) },
        site: { corners: site?.images },
        look: { corners: componentDefaults(look).images },
    };
}

const ORDER: (StyleScope | "look")[] = ["element", "section", "site", "look"];
const FROM: Record<StyleScope, number> = { element: 0, section: 1, site: 2 };

/** What is in force at `scope`: the closest level that names each field. */
export function inForce<T extends object>(
    levels: Record<StyleScope | "look", T>,
    scope: StyleScope,
): T {
    const out: Obj = {};
    for (const level of ORDER.slice(FROM[scope]).reverse()) {
        for (const [k, v] of Object.entries(levels[level])) {
            if (v !== undefined) out[k] = v;
        }
    }
    return out as T;
}

/** The fields this level names that differ from the look's own. */
export function changedFields<T extends object>(
    levels: Record<StyleScope | "look", T>,
    scope: StyleScope,
): (keyof T)[] {
    return Object.entries(levels[scope])
        .filter(([k, v]) => v !== undefined && v !== (levels.look as Obj)[k])
        .map(([k]) => k as keyof T);
}

/**
 * A colour's fill and words as hex, from the site's resolved variables,
 * and how well they read. Null when the palette doesn't name it.
 */
export function readableLine(
    colour: string,
    vars: Readonly<Partial<Record<string, string>>> | undefined,
): { fill: string; ink: string; ratio: number; light: boolean } | null {
    const custom = normalizeHex(colour);
    if (custom) {
        const w = customColourWords(custom);
        return {
            fill: custom,
            ink: w.ink,
            ratio: w.ratio,
            light: w.words === "light",
        };
    }
    const PAIRS: Record<string, [string, string]> = {
        accent: ["--site-accent", "--site-accent-fg"],
        fg: ["--site-fg", "--site-bg"],
        surface: ["--site-surface", "--site-fg"],
        bg: ["--site-bg", "--site-fg"],
        rule: ["--site-rule", "--site-fg"],
    };
    const pair = PAIRS[colour] as [string, string] | undefined;
    if (!pair || !vars) return null;
    const fill = hslTripleToHex(vars[pair[0]] ?? vars["--site-border"] ?? "");
    const ink = hslTripleToHex(vars[pair[1]] ?? "");
    if (!fill || !ink) return null;
    const ratio = contrastRatio(fill, ink);
    return {
        fill,
        ink,
        ratio,
        light: contrastRatio(ink, "#FFFFFF") < contrastRatio(ink, "#000000"),
    };
}

/** The section's buttons and photos, in content order, with a name each. */
export function elementsOf(
    content: unknown,
): (SelectedElement & { name: string })[] {
    const out: (SelectedElement & { name: string })[] = [];
    const walk = (value: unknown, path: string) => {
        if (Array.isArray(value)) {
            value.forEach((v, i) => walk(v, join(path, String(i))));
            return;
        }
        if (!isObj(value)) return;
        const kind = kindOf(value);
        if (kind) {
            const name = textOf(kind === "button" ? value.label : value.alt);
            out.push({
                kind,
                path: path === "" ? "." : path,
                name: name || (kind === "button" ? "Button" : "Photo"),
            });
        }
        for (const [key, v] of Object.entries(value)) {
            if (key !== "frame") walk(v, join(path, key));
        }
    };
    walk(content, "");
    return out;
}

/** The variable each palette role draws with, in the resolved style. */
const ROLE_VARIABLE: Record<string, string> = {
    bg: "--site-bg",
    surface: "--site-surface",
    fg: "--site-fg",
    accent: "--site-accent",
    rule: "--site-rule",
};

/** A role's colour as a CSS `hsl()`, for a swatch in the editor. */
export function roleFill(
    vars: Readonly<Partial<Record<string, string>>>,
    role: string,
): string {
    const v = ROLE_VARIABLE[role] as string | undefined;
    return `hsl(${(v && vars[v]) ?? vars["--site-border"] ?? "0 0% 90%"})`;
}

/** A content field's words, or "" for anything that isn't text. */
export function textOf(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

/**
 * The corners the look actually draws a button with, in words: a look's
 * own radius, or Classic's from the site's stored corner value, which an
 * older site may still hold (Northwind's 2px).
 */
export function lookCorners(
    look: LookId | undefined,
    vars: Readonly<Partial<Record<string, string>>>,
): string {
    const n = look
        ? LOOKS[look].tokens.radius
        : Number.parseFloat(vars["--site-radius"] ?? "");
    if (!Number.isFinite(n)) return "with rounded corners";
    if (n <= 0) return "with square corners";
    if (n >= 999) return "as pills";
    return `with ${Math.round(n)}px corners`;
}

/** Hue (0–360), saturation and value (0–1): the custom picker's square and strip. */
export interface Hsv {
    h: number;
    s: number;
    v: number;
}

/** A `#RRGGBB` colour as {@link Hsv}. */
export function hexToHsv(hex: string): Hsv {
    const n = Number.parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(
        (c) => c / 255,
    ) as [number, number, number];
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = 0;
    if (d > 0) {
        if (max === r) h = ((g - b) / d + 6) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
    }
    return { h: h * 60, s: max === 0 ? 0 : d / max, v: max };
}

/** {@link Hsv} as a `#RRGGBB` colour in capitals. */
export function hsvToHex({ h, s, v }: Hsv): string {
    const f = (k: number) => {
        const m = (k + h / 60) % 6;
        return v - v * s * Math.max(0, Math.min(m, 4 - m, 1));
    };
    return `#${[f(5), f(3), f(1)]
        .map((c) =>
            Math.round(c * 255)
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`.toUpperCase();
}

/*
 * Recent custom colours, newest first (CSI-C "Recent"). A per-browser
 * convenience, so localStorage, which may throw or come back empty.
 */
const RECENT_KEY = "saroh.recent-colours";
const RECENT_MAX = 6;

export function recentColours(): string[] {
    try {
        const raw: unknown = JSON.parse(
            window.localStorage.getItem(RECENT_KEY) ?? "[]",
        );
        return Array.isArray(raw)
            ? raw
                  .map(normalizeHex)
                  .filter((h): h is string => h !== null)
                  .slice(0, RECENT_MAX)
            : [];
    } catch {
        return [];
    }
}

/** Puts `hex` first in Recent; the list it now holds. */
export function rememberColour(hex: string): string[] {
    const next = [hex, ...recentColours().filter((h) => h !== hex)].slice(
        0,
        RECENT_MAX,
    );
    try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
        // Private window or blocked storage: Recent stays as it was.
    }
    return next;
}
