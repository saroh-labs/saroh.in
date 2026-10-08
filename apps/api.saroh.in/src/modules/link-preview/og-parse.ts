import { Parser } from "htmlparser2";

/**
 * The share tags in a page's `<head>` (resources plan U2, KTD-3): Open
 * Graph, X's `twitter:*`, the `<title>`, the meta description and the
 * canonical link. Nothing from `<body>` is read: the apps don't, and a tag
 * there is one they ignore.
 *
 * The head ends at `</head>`, at `<body>`, or at the first tag that can't be
 * in a head (a page may leave both tags out). Reading stops there.
 */

/** The page reads at most this much HTML; the head is almost always in it. */
export const MAX_HTML_BYTES = 512 * 1024;

/** A value longer than this is cut: it is shown, never stored whole. */
const MAX_VALUE = 500;

export interface OgTags {
    title: string | null;
    description: string | null;
    image: string | null;
    imageWidth: number | null;
    imageHeight: number | null;
    imageType: string | null;
    url: string | null;
    siteName: string | null;
    type: string | null;
}

export interface TwitterTags {
    card: string | null;
    title: string | null;
    description: string | null;
    image: string | null;
}

export interface HeadTags {
    /** The `<title>`. */
    title: string | null;
    /** `<meta name="description">`. */
    description: string | null;
    /** `<link rel="canonical">`, absolute. */
    canonical: string | null;
    og: OgTags;
    twitter: TwitterTags;
    /** Whether the head's end was found: a page cut off before it may have more. */
    headEnded: boolean;
}

/** Tags a head may hold; any other opens the body. */
const HEAD_TAGS = new Set([
    "html",
    "head",
    "title",
    "meta",
    "link",
    "base",
    "script",
    "style",
    "noscript",
    "template",
]);

function clean(value: string | undefined | null): string | null {
    if (value === undefined || value === null) return null;
    const text = value.replace(/\s+/g, " ").trim();
    if (!text) return null;
    return text.length > MAX_VALUE ? text.slice(0, MAX_VALUE) : text;
}

function positive(value: string | null): number | null {
    if (!value || !/^\d{1,5}$/.test(value.trim())) return null;
    const n = Number(value.trim());
    return n > 0 ? n : null;
}

/** An address on the page, made absolute; only http(s) is kept. */
export function absoluteUrl(value: string | null, base: string): string | null {
    if (!value) return null;
    try {
        const url = new URL(value, base);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        return url.href;
    } catch {
        return null;
    }
}

/**
 * The share tags in `html`, with relative addresses resolved against the
 * page's `<base href>` when it has one, else `pageUrl`.
 */
export function parseHead(html: string, pageUrl: string): HeadTags {
    const meta = new Map<string, string>();
    let title: string | null = null;
    let titleText: string | null = null;
    let canonical: string | null = null;
    let baseHref: string | null = null;
    let headEnded = false;
    let done = false;
    // A <noscript> or <template> in the head may hold an <img> (a tracking
    // pixel, often): it doesn't open the body.
    let wrapped = 0;

    const parser = new Parser(
        {
            onopentag(name, attrs) {
                // An attribute the tag doesn't have is absent, whatever the type says.
                const attributes: Record<string, string | undefined> = attrs;
                if (done) return;
                const tag = name.toLowerCase();
                if (tag === "noscript" || tag === "template") wrapped += 1;
                if (wrapped > 0) return;
                if (!HEAD_TAGS.has(tag)) {
                    done = true;
                    headEnded = true;
                    parser.pause();
                    return;
                }
                if (tag === "title" && title === null) titleText = "";
                if (tag === "meta") {
                    const key = (
                        attributes.property ??
                        attributes.name ??
                        attributes.itemprop ??
                        ""
                    )
                        .trim()
                        .toLowerCase();
                    const content = attributes.content;
                    // The first of each wins, as the apps read them.
                    if (key && content !== undefined && !meta.has(key)) {
                        meta.set(key, content);
                    }
                }
                if (tag === "link") {
                    const rel = (attributes.rel ?? "")
                        .toLowerCase()
                        .split(/\s+/);
                    if (rel.includes("canonical") && canonical === null) {
                        canonical = attributes.href ?? null;
                    }
                }
                if (tag === "base" && baseHref === null && attributes.href) {
                    baseHref = attributes.href;
                }
            },
            ontext(text) {
                if (!done && titleText !== null) titleText += text;
            },
            onclosetag(name, implied) {
                // end() closes whatever is still open: that's the read
                // running out, not the page ending its head.
                if (done || implied) return;
                const tag = name.toLowerCase();
                if (tag === "noscript" || tag === "template") {
                    wrapped = Math.max(0, wrapped - 1);
                    return;
                }
                if (wrapped > 0) return;
                if (tag === "title" && titleText !== null) {
                    title = clean(titleText);
                    titleText = null;
                }
                if (tag === "head") {
                    done = true;
                    headEnded = true;
                    parser.pause();
                }
            },
        },
        {
            decodeEntities: true,
            lowerCaseTags: true,
            lowerCaseAttributeNames: true,
        },
    );
    parser.write(html);
    parser.end();

    const base = absoluteUrl(baseHref, pageUrl) ?? pageUrl;
    const get = (key: string) => clean(meta.get(key));
    const url = (key: string) => absoluteUrl(get(key), base);

    return {
        title,
        description: get("description"),
        canonical: absoluteUrl(clean(canonical), base),
        og: {
            title: get("og:title"),
            description: get("og:description"),
            image:
                url("og:image") ??
                url("og:image:url") ??
                url("og:image:secure_url"),
            imageWidth: positive(get("og:image:width")),
            imageHeight: positive(get("og:image:height")),
            imageType: get("og:image:type"),
            url: url("og:url"),
            siteName: get("og:site_name"),
            type: get("og:type"),
        },
        twitter: {
            card: get("twitter:card")?.toLowerCase() ?? null,
            title: get("twitter:title"),
            description: get("twitter:description"),
            image: url("twitter:image") ?? url("twitter:image:src"),
        },
        headEnded,
    };
}

/** Whether a page set any tag an app would draw a card from. */
export function hasAnyTag(tags: HeadTags): boolean {
    return [
        tags.title,
        tags.description,
        tags.og.title,
        tags.og.description,
        tags.og.image,
        tags.twitter.title,
        tags.twitter.description,
        tags.twitter.image,
    ].some((value) => value !== null);
}

/** The charset the reply or the page names, for decoding its bytes. */
export function charsetOf(
    contentType: string | undefined,
    head: Buffer,
): string {
    const fromHeader = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType ?? "");
    if (fromHeader?.[1]) return fromHeader[1].toLowerCase();
    // <meta charset="…"> or the http-equiv form, in the first 2 KB.
    const start = head.subarray(0, 2048).toString("latin1");
    const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(start);
    return fromMeta?.[1]?.toLowerCase() ?? "utf-8";
}

/** The page's bytes as text, in its own charset when Node knows it. */
export function decodeHtml(
    body: Buffer,
    contentType: string | undefined,
): string {
    const charset = charsetOf(contentType, body);
    try {
        return new TextDecoder(charset).decode(body);
    } catch {
        return new TextDecoder("utf-8").decode(body);
    }
}
