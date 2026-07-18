import sanitizeHtml from "sanitize-html";

/**
 * The publish-time HTML sanitizer (S2-005).
 *
 * The section contract validates the *shape* of `Section.content` but NEVER
 * sanitizes (see `packages/database/src/cms/section-contract.ts`). Fields that
 * carry authorable HTML are flagged by the contract in `sanitizedFields`
 * (e.g. `richText.value`). Those fields MUST be run through this sanitizer
 * DURING publish — before the value is written into the immutable Publication
 * snapshot — so the public renderer only ever reads already-safe HTML and never
 * needs to sanitize at read time.
 *
 * Policy: an allowlist of formatting/structural tags and safe attributes.
 * Everything else is dropped, which removes `<script>`/`<style>`/`<iframe>`,
 * `on*` event-handler attributes, and `javascript:` URLs. Being an allowlist,
 * it fails closed: an unknown/dangerous tag is stripped rather than passed
 * through.
 */
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
        "*": ["style"],
    },
    // Only safe URL schemes survive; `javascript:` and friends are dropped.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    // Drop the *contents* of these tags entirely (not just the tag), so no
    // inline script/style text leaks into the snapshot as text.
    nonTextTags: ["script", "style", "textarea", "option", "noscript"],
    disallowedTagsMode: "discard",
};

/**
 * Sanitize a single authorable HTML string. Safe to call on any string; a
 * non-string is coerced to `""` (the contract guarantees strings, but publish
 * is the last line of defense before an immutable write).
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
