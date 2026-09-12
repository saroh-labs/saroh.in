import sanitizeHtml from "sanitize-html";

/**
 * The HTML sanitizer for everything a merchant authors as rich text.
 *
 * The section contract validates the *shape* of `Section.content` but NEVER
 * sanitizes (see `packages/block-contract/src/section-contract.ts`). Fields that
 * carry authorable HTML are flagged by the contract in `sanitizedFields`
 * (e.g. `richText.value`), and the site footer carries the same shape.
 *
 * It runs at three boundaries:
 * - when a draft is SAVED (`replaceDraftSections`, `updateFooter`);
 * - when the editor LOADS a draft (`getPageDraft`), which cleans rows saved
 *   before the first boundary existed;
 * - at PUBLISH, before the immutable Publication snapshot is written.
 *
 * It used to run only at publish (#280). That was enough for the public
 * renderer, which reads only snapshots, but the editor's preview renders the
 * DRAFT as HTML on app.saroh.in. Anything a direct API call stored ran as
 * script in the session of whoever opened the editor next.
 *
 * Policy: an allowlist of formatting/structural tags, attributes and CSS
 * properties. Everything else is dropped, which removes `<script>`/`<style>`/
 * `<iframe>`, `on*` event handlers, `javascript:` URLs, and CSS that could lift
 * content out of its section. Being an allowlist, it fails closed.
 *
 * It is idempotent: sanitizing already-sanitized HTML returns it unchanged, so
 * running at all three boundaries changes nothing after the first.
 */

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, and `rgb()`/`rgba()` — what a colour picker writes. */
const COLOUR = [
    /^#[0-9a-f]{3,8}$/i,
    /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i,
];

const OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: [
        "p",
        "br",
        "hr",
        "span",
        "div",
        "blockquote",
        "pre",
        "code",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "ul",
        "ol",
        "li",
        "a",
        "b",
        "strong",
        "i",
        "em",
        "u",
        "s",
        // The editor's highlight (#208) renders as <mark>. It was missing
        // here, so every highlight a merchant applied was stripped at publish:
        // present in the editor, gone on the live site.
        "mark",
        "sub",
        "sup",
        "img",
        "figure",
        "figcaption",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
    ],
    allowedAttributes: {
        a: ["href", "title", "target", "rel"],
        img: ["src", "alt", "title", "width", "height"],
        mark: ["data-color"],
        th: ["colspan", "rowspan"],
        td: ["colspan", "rowspan"],
        "*": ["style"],
    },
    /*
     * Exactly the CSS the rich text editor writes (#280), and nothing else.
     *
     * `style` used to be allowed on every tag with any property, so a draft
     * could `position: fixed` itself over the whole page, including over the
     * share link's "not live" bar. Each property here corresponds to an editor
     * extension:
     * - `color`, `font-family`, `font-size`: TextStyleKit;
     * - `background-color`: Highlight (`color: inherit` rides along with it);
     * - `text-align`: TextAlign.
     *
     * An extension that writes a new property needs it added here first, or its
     * formatting silently vanishes on save.
     */
    allowedStyles: {
        "*": {
            color: [...COLOUR, /^inherit$/i],
            "background-color": COLOUR,
            "text-align": [/^(left|right|center|justify)$/i],
            "font-family": [/^[a-z0-9 ,'"-]+$/i],
            "font-size": [/^\d{1,3}(\.\d{1,3})?(rem|em|px|%)$/i],
        },
    },
    // Only safe URL schemes survive; `javascript:` and friends are dropped.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    transformTags: {
        /*
         * A link that opens a new tab always gets `rel="noopener noreferrer"`
         * (#280), so the page it opens cannot reach back through
         * `window.opener`. The target is normalised to `_blank`: `_top` or
         * `_parent` would let a link replace the page it sits on, which no
         * editor control asks for.
         */
        a: (tagName, attribs) =>
            attribs.target
                ? {
                      tagName,
                      attribs: {
                          ...attribs,
                          target: "_blank",
                          rel: "noopener noreferrer",
                      },
                  }
                : { tagName, attribs },
    },
    // Drop the *contents* of these tags entirely (not just the tag), so no
    // inline script/style text leaks through as text.
    nonTextTags: ["script", "style", "textarea", "option", "noscript"],
    disallowedTagsMode: "discard",
};

/**
 * Sanitize a single authorable HTML string. Safe to call on any string; a
 * non-string is coerced to `""` (the contract guarantees strings, but this is
 * the last line of defense before a write).
 */
export function sanitizeRichHtml(value: unknown): string {
    if (typeof value !== "string") return "";
    return sanitizeHtml(value, OPTIONS);
}

/**
 * Read a dot-path (e.g. `"value"`, `"a.b"`) out of a plain object. Returns
 * `undefined` if any segment is missing or not an object.
 */
function getPath(obj: unknown, path: string): unknown {
    let cursor: unknown = obj;
    for (const segment of path.split(".")) {
        if (cursor === null || typeof cursor !== "object") return undefined;
        cursor = (cursor as Record<string, unknown>)[segment];
    }
    return cursor;
}

/**
 * Write a value at a dot-path, cloning the containers along the way so the
 * caller's input object is never mutated in place.
 */
function setPath(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
): Record<string, unknown> {
    const segments = path.split(".");
    const root = { ...obj };
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i];
        const next = cursor[segment];
        const cloned =
            next && typeof next === "object"
                ? { ...(next as Record<string, unknown>) }
                : {};
        cursor[segment] = cloned;
        cursor = cloned;
    }
    cursor[segments[segments.length - 1]] = value;
    return root;
}

/**
 * Return a sanitized copy of a section's `content`, running every field the
 * contract flagged in `sanitizedFields` through {@link sanitizeRichHtml}. The
 * input is treated as immutable — a fresh object is returned. Fields absent
 * from the content (or non-string) are left untouched.
 */
export function sanitizeSectionContent(
    content: unknown,
    sanitizedFields: readonly string[],
): unknown {
    if (
        sanitizedFields.length === 0 ||
        content === null ||
        typeof content !== "object"
    ) {
        return content;
    }
    let out = content as Record<string, unknown>;
    for (const field of sanitizedFields) {
        const current = getPath(out, field);
        if (typeof current === "string") {
            out = setPath(out, field, sanitizeRichHtml(current));
        }
    }
    return out;
}
