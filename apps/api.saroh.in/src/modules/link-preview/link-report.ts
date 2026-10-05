import type { ImageFacts } from "./image-probe";
import type { HeadTags } from "./og-parse";

/**
 * What a checked page's tags mean for each app (resources plan U2, R14).
 *
 * ONE function ({@link buildReport}) turns the facts into the fixes, and
 * each fix names the apps it would put right. An app "looks right" when no
 * fix names it. So "Looks right on N of 6 apps. Fix M things to fix all 6."
 * can't disagree with the list under it: N is the apps no fix names, M is
 * the length of the list. The page, the unlocked panel and the emailed
 * report all read this one result.
 */

/** The six free cards, in the page's order. */
export const APPS = [
    "whatsapp",
    "facebook",
    "linkedin",
    "x",
    "slack",
    "google",
] as const;
export type AppKey = (typeof APPS)[number];

const APP_NAMES: Record<AppKey, string> = {
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    x: "X",
    slack: "Slack",
    google: "Google",
};

/** Facebook and LinkedIn crop to this; the right picture works on all six. */
export const RIGHT_IMAGE = { width: 1200, height: 630 } as const;
/** Above this WhatsApp drops the large picture. */
export const WHATSAPP_MAX_BYTES = 300 * 1024;
/** Google cuts a description about here. */
const DESCRIPTION_MAX = 160;

/** What the page states, as each app reads it. Sent to the page whole. */
export interface LinkFacts {
    /** The host the link was shared as, after redirects. */
    domain: string;
    finalUrl: string;
    status: number;
    /** What the cards show as the title: og:title, else twitter:title, else <title>. */
    title: string | null;
    /** og:description, else the meta description, else twitter:description. */
    description: string | null;
    siteName: string | null;
    image: ImageFacts | null;
    tags: HeadTags;
}

export type FixKey =
    | "title"
    | "google-title"
    | "description"
    | "google-description"
    | "image-missing"
    | "image-broken"
    | "image-small"
    | "image-heavy"
    | "x-card";

export interface Fix {
    key: FixKey;
    title: string;
    body: string;
    apps: AppKey[];
}

export type TagMark = "ok" | "warn" | "missing";

export interface TagRow {
    tag: "og:title" | "og:description" | "og:image" | "twitter:card" | "og:url";
    mark: TagMark;
    note: string;
}

export interface LinkReport {
    apps: { app: AppKey; ok: boolean }[];
    /** How many of the six look right. */
    right: number;
    fixes: Fix[];
    tags: TagRow[];
    /** The tags to paste into the page's <head>, from what it has and what it lacks. */
    suggestedTags: string;
}

/** Who reads which value, from the tags as parsed. */
export function factsFrom(
    tags: HeadTags,
    image: ImageFacts | null,
    finalUrl: URL,
    status: number,
): LinkFacts {
    return {
        domain: finalUrl.hostname,
        finalUrl: finalUrl.href,
        status,
        title: tags.og.title ?? tags.twitter.title ?? tags.title,
        description:
            tags.og.description ?? tags.description ?? tags.twitter.description,
        siteName: tags.og.siteName,
        image,
        tags,
    };
}

function kb(bytes: number): string {
    return `${Math.round(bytes / 1024)} KB`;
}

function list(names: string[]): string {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Whether a picture loads at a size below the right one. */
function tooSmall(image: ImageFacts): boolean {
    return (
        image.loads !== false &&
        image.width !== null &&
        image.height !== null &&
        (image.width < RIGHT_IMAGE.width || image.height < RIGHT_IMAGE.height)
    );
}

function tooHeavy(image: ImageFacts): boolean {
    return (
        image.loads !== false &&
        image.bytes !== null &&
        image.bytes > WHATSAPP_MAX_BYTES
    );
}

/** The fixes, in the order they matter most. Exported for the email. */
export function fixesFor(facts: LinkFacts): Fix[] {
    const { tags, image } = facts;
    const fixes: Fix[] = [];

    if (!facts.title) {
        fixes.push({
            key: "title",
            title: "Add a title.",
            body: "Every app shows a title first, and your page has none. Add og:title and a <title>: a few words that say what you sell.",
            apps: [...APPS],
        });
    } else if (!tags.title) {
        fixes.push({
            key: "google-title",
            title: "Give Google a page title.",
            body: "Google shows your page's <title> in search, and there isn't one. Use the same words as your share title.",
            apps: ["google"],
        });
    }

    if (!facts.description) {
        fixes.push({
            key: "description",
            title: "Add a description.",
            body: `WhatsApp, Facebook and Slack show nothing under your title. Write one sentence, under ${DESCRIPTION_MAX} characters, about what you sell.`,
            apps: ["whatsapp", "facebook", "slack", "google"],
        });
    } else if (!tags.description) {
        fixes.push({
            key: "google-description",
            title: "Give Google a description.",
            body: "Google shows your meta description under the title, and there isn't one. Use the same sentence as your share description.",
            apps: ["google"],
        });
    }

    const pictureApps: AppKey[] = ["whatsapp", "facebook", "linkedin", "x"];
    if (!image) {
        fixes.push({
            key: "image-missing",
            title: "Add a picture.",
            body: `Without one, ${list(pictureApps.map((a) => APP_NAMES[a]))} show a plain link. Use 1200 × 630, under 300 KB.`,
            apps: pictureApps,
        });
    } else if (image.loads === false) {
        fixes.push({
            key: "image-broken",
            title: "Fix your picture's address.",
            body: "Your og:image doesn't load, so the apps show no picture. Check the address, and that it's public.",
            apps: pictureApps,
        });
    } else {
        if (tooSmall(image)) {
            fixes.push({
                key: "image-small",
                title: "Use a bigger picture.",
                body: `Yours is ${image.width} × ${image.height}. Use 1200 × 630, and keep it under 300 KB so WhatsApp shows it.`,
                apps: ["facebook", "linkedin", "x"],
            });
        }
        if (tooHeavy(image)) {
            fixes.push({
                key: "image-heavy",
                title: "Make your picture lighter.",
                body: `Yours is ${kb(image.bytes ?? 0)}. WhatsApp only shows a picture under 300 KB; save it as a JPEG at 1200 × 630.`,
                apps: ["whatsapp"],
            });
        }
    }

    if (tags.twitter.card !== "summary_large_image") {
        fixes.push({
            key: "x-card",
            title: "Tell X to use a large card.",
            body: "Add twitter:card set to summary_large_image, or X shows a tiny square.",
            apps: ["x"],
        });
    }
    return fixes;
}

function tagRows(facts: LinkFacts): TagRow[] {
    const { tags, image } = facts;
    const rows: TagRow[] = [];

    rows.push(
        tags.og.title
            ? { tag: "og:title", mark: "ok", note: tags.og.title }
            : tags.title
              ? {
                    tag: "og:title",
                    mark: "warn",
                    note: "Missing. Apps use your page title.",
                }
              : { tag: "og:title", mark: "missing", note: "Missing" },
    );

    rows.push(
        tags.og.description
            ? { tag: "og:description", mark: "ok", note: tags.og.description }
            : facts.description
              ? {
                    tag: "og:description",
                    mark: "warn",
                    note: "Missing. Apps use your meta description.",
                }
              : { tag: "og:description", mark: "missing", note: "Missing" },
    );

    if (!image) {
        rows.push({ tag: "og:image", mark: "missing", note: "Missing" });
    } else if (image.loads === false) {
        rows.push({ tag: "og:image", mark: "missing", note: "Doesn't load" });
    } else {
        const size =
            image.width !== null && image.height !== null
                ? `${image.width} × ${image.height}`
                : null;
        if (tooSmall(image)) {
            rows.push({
                tag: "og:image",
                mark: "warn",
                note: `${size}, too small`,
            });
        } else if (tooHeavy(image)) {
            rows.push({
                tag: "og:image",
                mark: "warn",
                note: `${kb(image.bytes ?? 0)}, too heavy for WhatsApp`,
            });
        } else {
            const weight = image.bytes !== null ? kb(image.bytes) : null;
            const note = [size, weight].filter(Boolean).join(", ");
            rows.push({ tag: "og:image", mark: "ok", note: note || "Loads" });
        }
    }

    const card = tags.twitter.card;
    rows.push(
        card === "summary_large_image"
            ? { tag: "twitter:card", mark: "ok", note: card }
            : card
              ? {
                    tag: "twitter:card",
                    mark: "warn",
                    note: `${card}, so X shows a small square`,
                }
              : { tag: "twitter:card", mark: "missing", note: "Missing" },
    );

    rows.push(
        tags.og.url
            ? { tag: "og:url", mark: "ok", note: tags.og.url }
            : {
                  tag: "og:url",
                  mark: "warn",
                  note: "Missing. Apps use the address you shared.",
              },
    );
    return rows;
}

/** An attribute value, safe between double quotes. */
function attr(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
}

/** One line, at most `max` characters. */
function cut(value: string, max: number): string {
    const text = value.replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The tags to copy: the page's own values where they work, placeholders where they're missing. */
export function suggestedTags(facts: LinkFacts): string {
    const { image } = facts;
    const title = cut(
        facts.title ?? "Your business: what you sell, in a few words",
        70,
    );
    const description = cut(
        facts.description ??
            "One sentence, under 160 characters, about what you sell.",
        DESCRIPTION_MAX,
    );
    const imageOk =
        !!image &&
        image.loads !== false &&
        !tooSmall(image) &&
        !tooHeavy(image);
    const imageUrl = cut(
        imageOk ? image.url : `https://${facts.domain}/share-1200x630.jpg`,
        400,
    );
    const pageUrl = cut(
        facts.tags.canonical ?? facts.tags.og.url ?? facts.finalUrl,
        400,
    );
    const lines = [
        `<title>${attr(title)}</title>`,
        `<meta name="description" content="${attr(description)}">`,
        `<meta property="og:title" content="${attr(title)}">`,
        `<meta property="og:description" content="${attr(description)}">`,
        `<meta property="og:image" content="${attr(imageUrl)}">`,
        `<meta property="og:image:width" content="1200">`,
        `<meta property="og:image:height" content="630">`,
        `<meta property="og:url" content="${attr(pageUrl)}">`,
    ];
    if (facts.siteName) {
        lines.push(
            `<meta property="og:site_name" content="${attr(cut(facts.siteName, 60))}">`,
        );
    }
    lines.push(`<meta name="twitter:card" content="summary_large_image">`);
    return lines.join("\n");
}

/** The whole report, from the facts alone. */
export function buildReport(facts: LinkFacts): LinkReport {
    const fixes = fixesFor(facts);
    const named = new Set(fixes.flatMap((fix) => fix.apps));
    const apps = APPS.map((app) => ({ app, ok: !named.has(app) }));
    return {
        apps,
        right: apps.filter((a) => a.ok).length,
        fixes,
        tags: tagRows(facts),
        suggestedTags: suggestedTags(facts),
    };
}

/** "Looks right on N of 6 apps. Fix M things to fix all 6." */
export function scoreLine(report: Pick<LinkReport, "right" | "fixes">): string {
    const m = report.fixes.length;
    if (m === 0)
        return `Looks right on all ${APPS.length} apps. Nothing to fix.`;
    const fixWord = m === 1 ? "1 thing" : `${m} things`;
    return `Looks right on ${report.right} of ${APPS.length} apps. Fix ${fixWord} to fix all ${APPS.length}.`;
}
