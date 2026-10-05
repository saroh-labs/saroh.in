/**
 * The link preview tool's shapes and rules on saroh.in (resources plan U2).
 * The API decides everything about a page (`modules/link-preview`): its
 * facts, which apps look right, the score line and the fixes, all from one
 * report. This file mirrors those shapes, cleans what the visitor types,
 * and words each failure.
 */

export const APPS = [
    "whatsapp",
    "facebook",
    "linkedin",
    "x",
    "slack",
    "google",
] as const;
export type AppKey = (typeof APPS)[number];

export const APP_NAMES: Record<AppKey, string> = {
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    x: "X",
    slack: "Slack",
    google: "Google",
};

/** The four the email unlocks, drawn as small tiles. */
export const EXTRA_APPS = ["Telegram", "Discord", "iMessage", "Pinterest"];

export interface ImageFacts {
    url: string;
    loads: boolean | null;
    width: number | null;
    height: number | null;
    type: string | null;
    bytes: number | null;
}

export interface HeadTags {
    title: string | null;
    description: string | null;
    canonical: string | null;
    og: {
        title: string | null;
        description: string | null;
        image: string | null;
        url: string | null;
        siteName: string | null;
    };
    twitter: {
        card: string | null;
        title: string | null;
        description: string | null;
        image: string | null;
    };
}

export interface LinkFacts {
    domain: string;
    finalUrl: string;
    status: number;
    title: string | null;
    description: string | null;
    siteName: string | null;
    image: ImageFacts | null;
    tags: HeadTags;
}

export interface TagRow {
    tag: string;
    mark: "ok" | "warn" | "missing";
    note: string;
}

export interface Fix {
    key: string;
    title: string;
    body: string;
    apps: AppKey[];
}

/** What the API can't do with an address, plus this site's own two. */
export type CheckFailure =
    | "invalid"
    | "blocked"
    | "unreachable"
    | "not-html"
    | "no-tags"
    | "too-large"
    | "timeout"
    | "rate-limited"
    | "unavailable";

export type CheckResult =
    | {
          ok: true;
          url: string;
          checkedAt: string;
          facts: LinkFacts;
          apps: { app: AppKey; ok: boolean }[];
          right: number;
          fixCount: number;
          /** "Looks right on N of 6 apps. Fix M things to fix all 6.", from the API's one report. */
          score: string;
          tags: TagRow[];
          /** The page's sample chip: fixed tags, nothing fetched. */
          sample?: true;
      }
    | {
          ok: false;
          url: string;
          failure: CheckFailure;
          status?: number;
      };

export type UnlockResult =
    | {
          unlocked: true;
          emailed: "sent" | "limited" | "not-sent";
          fixes: Fix[];
          suggestedTags: string;
      }
    | {
          unlocked: false;
          failure: CheckFailure | "bad-email";
      };

/**
 * What was typed or pasted, split into its scheme and the rest, so the
 * field (which already shows "https://") never holds a second one (R19).
 * A pasted "http://" is kept as http.
 */
export function splitScheme(value: string): {
    scheme: "https" | "http" | null;
    rest: string;
} {
    const text = value.trim();
    // Repeated: "https://https://shop.in" pasted into a field that had one.
    const match = /^(?:(https?):\/\/)+/i.exec(text);
    if (!match) return { scheme: null, rest: text };
    const scheme = match[1].toLowerCase() === "http" ? "http" : "https";
    return { scheme, rest: text.slice(match[0].length) };
}

/** Why an address can't be checked as typed, in the page's words, or null. */
export function addressProblem(rest: string): string | null {
    const text = rest.trim();
    if (!text) return "Paste a web address first, like yourbusiness.in.";
    const host = text.split(/[/?#]/)[0] ?? "";
    if (
        /\s/.test(text) ||
        !/^[^.\s]+(\.[^.\s]+)+$/.test(host.split(":")[0] ?? "")
    ) {
        return "That doesn't look like a web address. Try something like yourbusiness.in.";
    }
    return null;
}

/** The host to name in a sentence: what was typed, before any path. */
export function domainOf(address: string): string {
    const { rest } = splitScheme(address);
    return (rest.split(/[/?#]/)[0] ?? rest).toLowerCase();
}

/** Each failure in the page's voice. */
export function failureMessage(
    failure: CheckFailure,
    domain: string,
    status?: number,
): string {
    switch (failure) {
        case "invalid":
            return "That doesn't look like a web address. Try something like yourbusiness.in.";
        case "blocked":
            return "We can't check that address. It points inside a private network, not at a public website.";
        case "unreachable":
            return status
                ? `We reached ${domain}, but it answered with an error (${status}). Check the address and try again.`
                : `We couldn't reach ${domain}. Check the address, or try again in a minute.`;
        case "not-html":
            return `${domain} sent a file, not a web page, so there's no card to check.`;
        case "no-tags":
            return `We read ${domain}, but found no share tags: no title, description or picture for the apps to use.`;
        case "too-large":
            return `${domain}'s page is too big to read: its tags weren't in the first 512 KB.`;
        case "timeout":
            return `${domain} took too long to answer. Try again in a minute.`;
        case "rate-limited":
            return "That's a lot of checks in a row. Wait a minute and try again.";
        case "unavailable":
            return "The checker isn't working right now. Try again in a minute.";
    }
}

/** "Checked just now." or "Checked at 7:42 pm." */
export function checkedLine(
    checkedAt: string,
    now: number = Date.now(),
): string {
    const at = new Date(checkedAt);
    if (Number.isNaN(at.getTime()) || now - at.getTime() < 60_000) {
        return "Checked just now.";
    }
    const time = at
        .toLocaleTimeString("en-IN", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Kolkata",
        })
        .replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toLowerCase()}`);
    return `Checked at ${time}.`;
}

/** The address to share this report by: this page with `?url=`. */
export function reportLink(origin: string, address: string): string {
    const { scheme } = splitScheme(address);
    // "https://shop.in/" reads as "shop.in": a bare host loses its last slash.
    const rest = splitScheme(address).rest.replace(/^([^/?#]+)\/$/, "$1");
    const value = scheme === "http" ? `http://${rest}` : rest;
    return `${origin}/tools/link-preview?url=${encodeURIComponent(value)}`;
}

/** What each app's card is drawn from: each app reads its own tags first. */
export function cardText(
    facts: LinkFacts,
    platform: AppKey | "small",
): { title: string; description: string; siteName: string } {
    const { tags } = facts;
    const fallbackTitle = facts.title ?? facts.domain;
    const siteName = facts.siteName ?? facts.domain;
    switch (platform) {
        case "google":
            return {
                title: tags.title ?? fallbackTitle,
                description: tags.description ?? "",
                siteName,
            };
        case "x":
            return {
                title: tags.twitter.title ?? fallbackTitle,
                description:
                    tags.twitter.description ?? facts.description ?? "",
                siteName,
            };
        default:
            return {
                title: fallbackTitle,
                description: facts.description ?? "",
                siteName,
            };
    }
}

/**
 * The picture as the cards draw it; one that doesn't load is none. The
 * sample's picture is drawn as its stand-in: it isn't a real site, so
 * there's nothing to fetch.
 */
export function cardImage(
    facts: LinkFacts,
    sample = false,
): {
    url: string;
    width: number | null;
    height: number | null;
    bytes: number | null;
} | null {
    const image = facts.image;
    if (!image || image.loads === false) return null;
    return {
        url: sample ? "" : image.url,
        width: image.width,
        height: image.height,
        bytes: image.bytes,
    };
}
