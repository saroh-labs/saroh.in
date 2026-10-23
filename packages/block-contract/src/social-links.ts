/**
 * A business's social links (DEC-128): its accounts on a fixed list of
 * networks, shown on its website's footer and named to search engines.
 *
 * The one place that says what a merchant may enter, shared by the API
 * (which refuses anything else), the workspace (which says so while the
 * merchant types) and the site (which re-checks before it draws a link).
 * Two promises rest on it:
 *
 * - **A link only ever opens the network it is filed under.** A merchant
 *   types a handle (`@rye`) or pastes a link; either is rebuilt into one
 *   canonical `https://` address on that network's own host, from the parts
 *   that passed its shape. Nothing typed is kept as typed, so there is no
 *   arbitrary link to phish with and nothing on a merchant's page that
 *   opens somewhere the label doesn't say.
 * - **Normalising is stable.** A canonical address normalises to itself, so
 *   a stored value can be re-checked on the way out (`parseSocialLinks`):
 *   one that no longer passes is dropped, never drawn.
 */

import { E164, normalisePhoneNumber, PHONE_SEPARATORS } from "./phone";

/** The networks, in the order they are listed and drawn. */
export const SOCIAL_NETWORKS = [
    "instagram",
    "facebook",
    "whatsapp",
    "youtube",
    "x",
    "linkedin",
    "pinterest",
    "telegram",
] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

/** Each network's name, as a merchant and a visitor read it. */
export const SOCIAL_LABELS: Readonly<Record<SocialNetwork, string>> = {
    instagram: "Instagram",
    facebook: "Facebook",
    whatsapp: "WhatsApp",
    youtube: "YouTube",
    x: "X",
    linkedin: "LinkedIn",
    pinterest: "Pinterest",
    telegram: "Telegram",
};

/** What each field accepts, shown as its placeholder. */
export const SOCIAL_PLACEHOLDERS: Readonly<Record<SocialNetwork, string>> = {
    instagram: "@yourname or instagram.com/yourname",
    facebook: "yourpage or facebook.com/yourpage",
    whatsapp: "+91 98450 12345",
    youtube: "@yourchannel or youtube.com/@yourchannel",
    x: "@yourname or x.com/yourname",
    linkedin: "linkedin.com/company/yourname",
    pinterest: "yourname or pinterest.com/yourname",
    telegram: "@yourname or t.me/yourname",
};

/** The longest value a field takes. */
export const SOCIAL_INPUT_MAX = 600;

/** The links a business has set, each a canonical address. */
export type SocialLinks = Partial<Record<SocialNetwork, string>>;

export type SocialCheck =
    { ok: true; url: string } | { ok: false; problem: string };

const refuse = (problem: string): SocialCheck => ({ ok: false, problem });
const TOO_LONG = "That link is too long.";
const keep = (url: string): SocialCheck => ({ ok: true, url });

/** A handle typed alone: no path, no scheme, no spaces. */
function typedHandle(raw: string): string | null {
    if (/[/:\s?#]/.test(raw)) return null;
    return raw.startsWith("@") ? raw.slice(1) : raw;
}

/**
 * What was typed as a web address on https, or null: a scheme other than
 * http(s), a port, or a name and password in it are never a profile link.
 */
function typedUrl(raw: string): URL | null {
    if (/\s/.test(raw)) return null;
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw)?.[1];
    if (scheme && !/^https?$/i.test(scheme)) return null;
    // "mailto:x", "javascript:x": a scheme with no "//" is never a link here.
    if (!scheme && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(raw)) return null;
    let url: URL;
    try {
        url = new URL(scheme ? raw : `https://${raw}`);
    } catch {
        return null;
    }
    if (url.username || url.password || url.port) return null;
    return url;
}

/** The path's parts, decoded, or null when one can't be read. */
function segments(url: URL): string[] | null {
    const out: string[] = [];
    for (const part of url.pathname.split("/")) {
        if (part === "") continue;
        try {
            out.push(decodeURIComponent(part));
        } catch {
            return null;
        }
    }
    return out;
}

const host = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, "");

/** A network's own host typed alone ("instagram.com"): not a name on it. */
const isHost = (typed: string, hosts: readonly string[]) =>
    hosts.includes(typed.toLowerCase().replace(/^www\./, ""));

/** A network whose link is `https://<base>/<handle>`. */
interface HandleRule {
    label: string;
    hosts: readonly string[];
    handle: RegExp;
    /** First path parts that are the network's own pages, not a profile. */
    reserved: readonly string[];
    build: (handle: string) => string;
    example: string;
}

const HANDLE_RULES: Readonly<
    Record<"instagram" | "x" | "pinterest" | "telegram", HandleRule>
> = {
    instagram: {
        label: "Instagram",
        hosts: ["instagram.com"],
        handle: /^[A-Za-z0-9._]{1,30}$/,
        reserved: [
            "p",
            "reel",
            "reels",
            "explore",
            "accounts",
            "stories",
            "tv",
            "direct",
        ],
        build: (h) => `https://www.instagram.com/${h}`,
        example: "@yourname or instagram.com/yourname",
    },
    x: {
        label: "X",
        hosts: ["x.com", "twitter.com", "mobile.x.com", "mobile.twitter.com"],
        handle: /^[A-Za-z0-9_]{1,15}$/,
        reserved: [
            "home",
            "i",
            "intent",
            "share",
            "search",
            "hashtag",
            "explore",
            "settings",
            "login",
        ],
        build: (h) => `https://x.com/${h}`,
        example: "@yourname or x.com/yourname",
    },
    pinterest: {
        label: "Pinterest",
        hosts: ["pinterest.com", "in.pinterest.com"],
        handle: /^[A-Za-z0-9_]{3,30}$/,
        reserved: ["pin", "search", "ideas", "today", "login"],
        build: (h) => `https://www.pinterest.com/${h}/`,
        example: "yourname or pinterest.com/yourname",
    },
    telegram: {
        label: "Telegram",
        hosts: ["t.me", "telegram.me"],
        handle: /^[A-Za-z][A-Za-z0-9_]{3,31}$/,
        reserved: ["joinchat", "share", "addstickers", "s", "c"],
        build: (h) => `https://t.me/${h}`,
        example: "@yourname or t.me/yourname",
    },
};

function byHandle(rule: HandleRule, raw: string): SocialCheck {
    const wrong = `That isn't ${article(rule.label)} ${rule.label} link. Use ${rule.example}.`;
    const handle = typedHandle(raw);
    if (handle !== null && !isHost(handle, rule.hosts)) {
        return rule.handle.test(handle)
            ? keep(rule.build(handle))
            : refuse(
                  `That isn't a name ${rule.label} allows. Use ${rule.example}.`,
              );
    }
    const url = typedUrl(raw);
    if (!url || !rule.hosts.includes(host(url))) return refuse(wrong);
    const parts = segments(url);
    if (!parts || parts.length === 0) {
        return refuse(`Add your name after it, like ${rule.example}.`);
    }
    const name = parts[0]?.replace(/^@/, "") ?? "";
    if (parts.length > 1 || rule.reserved.includes(name.toLowerCase())) {
        return refuse(
            `That link isn't your ${rule.label} profile. Use ${rule.example}.`,
        );
    }
    return rule.handle.test(name) ? keep(rule.build(name)) : refuse(wrong);
}

const article = (label: string) => (/^[AEIOUX]/.test(label) ? "an" : "a");

/** A Facebook page, profile or group: up to three plain path parts. */
const FACEBOOK_PART = /^[A-Za-z0-9._-]{1,100}$/;
const FACEBOOK_HOSTS = ["facebook.com", "m.facebook.com", "fb.com"];

function facebook(raw: string): SocialCheck {
    const example = "yourpage or facebook.com/yourpage";
    const wrong = `That isn't a Facebook link. Use ${example}.`;
    const handle = typedHandle(raw);
    if (handle !== null && !isHost(handle, FACEBOOK_HOSTS)) {
        return /^[A-Za-z0-9.]{2,50}$/.test(handle)
            ? keep(`https://www.facebook.com/${handle}`)
            : refuse(`That isn't a name Facebook allows. Use ${example}.`);
    }
    const url = typedUrl(raw);
    if (!url || !FACEBOOK_HOSTS.includes(host(url))) return refuse(wrong);
    const parts = segments(url);
    if (!parts || parts.length === 0) {
        return refuse(`Add your page after it, like ${example}.`);
    }
    // The older profile address: only its id is kept.
    if (parts.length === 1 && parts[0] === "profile.php") {
        const id = url.searchParams.get("id") ?? "";
        return /^\d{1,20}$/.test(id)
            ? keep(`https://www.facebook.com/profile.php?id=${id}`)
            : refuse(wrong);
    }
    if (
        parts.length > 3 ||
        parts.some((p) => !FACEBOOK_PART.test(p) || /\.php$/i.test(p))
    ) {
        return refuse(wrong);
    }
    return keep(`https://www.facebook.com/${parts.join("/")}`);
}

const YOUTUBE_HOSTS = ["youtube.com", "m.youtube.com"];
const YOUTUBE_HANDLE = /^[A-Za-z0-9._-]{3,30}$/;

function youtube(raw: string): SocialCheck {
    const example = "@yourchannel or youtube.com/@yourchannel";
    const wrong = `That isn't a YouTube channel link. Use ${example}.`;
    const handle = typedHandle(raw);
    // youtu.be is a video's short address, never a channel.
    if (handle !== null && !isHost(handle, [...YOUTUBE_HOSTS, "youtu.be"])) {
        return YOUTUBE_HANDLE.test(handle)
            ? keep(`https://www.youtube.com/@${handle}`)
            : refuse(wrong);
    }
    const url = typedUrl(raw);
    if (!url || !YOUTUBE_HOSTS.includes(host(url))) return refuse(wrong);
    const parts = segments(url);
    if (!parts) return refuse(wrong);
    const [first = "", second = ""] = parts;
    if (parts.length === 1 && first.startsWith("@")) {
        const name = first.slice(1);
        return YOUTUBE_HANDLE.test(name)
            ? keep(`https://www.youtube.com/@${name}`)
            : refuse(wrong);
    }
    if (parts.length === 2 && first === "channel") {
        return /^UC[A-Za-z0-9_-]{22}$/.test(second)
            ? keep(`https://www.youtube.com/channel/${second}`)
            : refuse(wrong);
    }
    if (parts.length === 2 && (first === "c" || first === "user")) {
        return /^[A-Za-z0-9._-]{1,100}$/.test(second)
            ? keep(`https://www.youtube.com/${first}/${second}`)
            : refuse(wrong);
    }
    return refuse(`That link isn't your channel. Use ${example}.`);
}

const LINKEDIN_KINDS = ["company", "in", "school", "showcase"];
const LINKEDIN_HOST = /^([a-z]{2}\.)?linkedin\.com$/;
/** A LinkedIn name: letters of any script, digits, hyphens and dots. */
function linkedinName(name: string): boolean {
    if (name.length < 1 || name.length > 100) return false;
    for (const char of name) {
        // Past ASCII is a letter of another script; within it, a short list.
        const ascii = (char.codePointAt(0) ?? 0) < 128;
        if (ascii && !/^[A-Za-z0-9._-]$/.test(char)) return false;
    }
    return true;
}

function linkedin(raw: string): SocialCheck {
    const example = "linkedin.com/company/yourname";
    const wrong = `That isn't a LinkedIn link. Paste the full link, like ${example}.`;
    // "company/rye" typed without the host reads as the link it is.
    const short = /^(company|in|school|showcase)\/[^/]+\/?$/i.test(raw);
    const url = typedUrl(short ? `linkedin.com/${raw}` : raw);
    if (!url || !LINKEDIN_HOST.test(host(url))) return refuse(wrong);
    const parts = segments(url);
    const [kind = "", name = ""] = parts ?? [];
    if (
        parts?.length !== 2 ||
        !LINKEDIN_KINDS.includes(kind.toLowerCase()) ||
        !linkedinName(name)
    ) {
        return refuse(wrong);
    }
    return keep(
        `https://www.linkedin.com/${kind.toLowerCase()}/${encodeURIComponent(name)}`,
    );
}

const GOOGLE_HOST = /^google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;
const MAPS_GOOGLE_HOST =
    /^maps\.google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;
const SHORT_CODE = /^[A-Za-z0-9_-]{1,60}$/;

/** What the Google Maps link field accepts, shown as its placeholder. */
export const MAP_LINK_PLACEHOLDER = "maps.app.goo.gl/… or g.page/yourname";

/** The longest a map link runs: a place's long address is long. */
export const MAP_LINK_MAX = 600;

const NOT_A_MAP_LINK =
    "That isn't a Google Maps link. In Google Maps, press Share and paste the link here.";

/**
 * A place's Google Maps link (DEC-128): what "Get directions" opens for an
 * address. Not a social link: it belongs to the address it is the map of,
 * a location's or the registered one. The same promise as a social link's:
 * only Google's own map pages are kept, each rebuilt into one canonical
 * address, never a redirect and never another site. Pure.
 */
export function normaliseMapLink(raw: string): SocialCheck {
    const typed = raw.trim();
    if (typed === "") return refuse("Enter a link, or leave it empty.");
    if (typed.length > MAP_LINK_MAX) return refuse(TOO_LONG);
    const check = googleMaps(typed);
    return check.ok && check.url.length > MAP_LINK_MAX
        ? refuse(TOO_LONG)
        : check;
}

/**
 * A stored map link as it may be drawn, or null: re-checked on the way
 * out, so a value that isn't already Google's own canonical address is
 * never a link on a page.
 */
export function mapLinkOrNull(stored: unknown): string | null {
    if (typeof stored !== "string") return null;
    const check = normaliseMapLink(stored);
    return check.ok && check.url === stored ? stored : null;
}

function googleMaps(raw: string): SocialCheck {
    const wrong = NOT_A_MAP_LINK;
    const url = typedUrl(raw);
    if (!url) return refuse(wrong);
    const parts = segments(url);
    if (!parts) return refuse(wrong);
    const name = host(url);
    const short = parts.every((p) => SHORT_CODE.test(p));
    // The Share button's short links, and a Business Profile's.
    if (name === "maps.app.goo.gl" && parts.length === 1 && short) {
        return keep(`https://maps.app.goo.gl/${parts[0]}`);
    }
    if (
        name === "goo.gl" &&
        parts.length === 2 &&
        parts[0] === "maps" &&
        short
    ) {
        return keep(`https://goo.gl/maps/${parts[1]}`);
    }
    if (name === "g.page" && parts.length >= 1 && parts.length <= 3 && short) {
        return keep(`https://g.page/${parts.join("/")}`);
    }
    if (name === "g.co" && parts.length === 2 && parts[0] === "kgs" && short) {
        return keep(`https://g.co/kgs/${parts[1]}`);
    }
    if (name === "share.google" && parts.length === 1 && short) {
        return keep(`https://share.google/${parts[0]}`);
    }
    // A place's long address: only under /maps, and always on google.com,
    // whichever country's Google it was copied from. The path and query are
    // the parser's own encoding of what was pasted, never the text itself.
    if (GOOGLE_HOST.test(name) && parts[0] === "maps") {
        return keep(`https://www.google.com${url.pathname}${url.search}`);
    }
    if (
        MAPS_GOOGLE_HOST.test(name) &&
        (parts.length === 0 || parts[0] === "maps")
    ) {
        return keep(`https://maps.google.com${url.pathname}${url.search}`);
    }
    return refuse(wrong);
}

const WHATSAPP_HOSTS = ["wa.me", "api.whatsapp.com"];

/** A `wa.me` link from an E.164 number ("+919845012345"), or null. */
export function whatsappLinkFromPhone(phone: string): string | null {
    return E164.test(phone) ? `https://wa.me/${phone.slice(1)}` : null;
}

/**
 * A click-to-chat link that opens WhatsApp on `phone` with `text` already
 * typed (DEC-173): `https://wa.me/919845011234?text=Hi%20Vivek`. The number
 * is read as `normalisePhoneNumber` reads one, so a saved E.164 number or one
 * typed the way people say it ("+91 98450 11234", "98450 11234") both work;
 * null when it can't be dialled. Saroh sends nothing: the person presses
 * Send in WhatsApp, or doesn't.
 */
export function whatsappChatLink(phone: string, text: string): string | null {
    const read = normalisePhoneNumber(phone);
    if (!("phone" in read) || read.phone === null) return null;
    const base = `https://wa.me/${read.phone.slice(1)}`;
    return text.trim() === ""
        ? base
        : `${base}?text=${encodeURIComponent(text)}`;
}

function whatsapp(raw: string): SocialCheck {
    const example = "+91 98450 12345";
    const wrong = `That isn't a WhatsApp number. Use + and the country code, like ${example}.`;
    let number = raw.replace(PHONE_SEPARATORS, "");
    if (!number.startsWith("+")) {
        // A link WhatsApp itself gives out: its digits are the number.
        const url = /[/.]/.test(raw) ? typedUrl(raw) : null;
        if (url && WHATSAPP_HOSTS.includes(host(url))) {
            const parts = segments(url) ?? [];
            const digits =
                host(url) === "wa.me"
                    ? parts.length === 1
                        ? parts[0]
                        : ""
                    : (url.searchParams.get("phone") ?? "");
            number = `+${digits.replace(/^\+/, "")}`;
        } else if (/^\d{6,15}$/.test(number)) {
            return refuse(
                `Start with + and the country code, like ${example}.`,
            );
        } else {
            return refuse(wrong);
        }
    }
    if (!E164.test(number)) return refuse(wrong);
    // India's numbers are ten digits after +91.
    if (number.startsWith("+91") && number.length !== 13) {
        return refuse("An Indian number is +91 and then 10 digits.");
    }
    return keep(`https://wa.me/${number.slice(1)}`);
}

/**
 * What was typed for a network, as the one address it is kept as, or why it
 * can't be. A handle and a pasted link give the same answer. Pure.
 */
export function normaliseSocialLink(
    network: SocialNetwork,
    raw: string,
): SocialCheck {
    const typed = raw.trim();
    if (typed === "") return refuse("Enter a link, or leave it empty.");
    if (typed.length > SOCIAL_INPUT_MAX) return refuse(TOO_LONG);
    const check = checkFor(network, typed);
    // The kept address is held to the same length, so it passes again when
    // it is re-checked on the way out.
    return check.ok && check.url.length > SOCIAL_INPUT_MAX
        ? refuse(TOO_LONG)
        : check;
}

function checkFor(network: SocialNetwork, typed: string): SocialCheck {
    switch (network) {
        case "facebook":
            return facebook(typed);
        case "youtube":
            return youtube(typed);
        case "linkedin":
            return linkedin(typed);
        case "whatsapp":
            return whatsapp(typed);
        default:
            return byHandle(HANDLE_RULES[network], typed);
    }
}

/**
 * A link as a person reads where it opens: "instagram.com/rye",
 * "wa.me/919845012345". A long one is cut to its start.
 */
export function socialLinkShown(url: string): string {
    const shown = url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "");
    return shown.length > 60 ? `${shown.slice(0, 57)}…` : shown;
}

/**
 * Stored links, re-checked on the way out rather than trusted (the column
 * is JSON). Only a known network whose value is already its own canonical
 * address survives, so nothing that was never accepted can reach a page.
 */
export function parseSocialLinks(value: unknown): SocialLinks {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {};
    }
    const stored = value as Record<string, unknown>;
    const links: SocialLinks = {};
    for (const network of SOCIAL_NETWORKS) {
        const url = stored[network];
        if (typeof url !== "string") continue;
        const check = normaliseSocialLink(network, url);
        if (check.ok && check.url === url) links[network] = url;
    }
    return links;
}

/** One link to draw: its network, its name and where it opens. */
export interface SocialLinkItem {
    network: SocialNetwork;
    label: string;
    url: string;
}

/** The links that are set, in the networks' order. */
export function socialLinkItems(links: SocialLinks): SocialLinkItem[] {
    return SOCIAL_NETWORKS.flatMap((network) => {
        const url = links[network];
        return url ? [{ network, label: SOCIAL_LABELS[network], url }] : [];
    });
}

/** "Instagram, WhatsApp, YouTube", or "" when none is set. */
export function socialLinksSummary(links: SocialLinks): string {
    return socialLinkItems(links)
        .map((item) => item.label)
        .join(", ");
}
