/**
 * Where a visit to this site came from, and the visit itself (U15, #1099).
 *
 * THE RULES (A13; the API checks the same in `analytics/visit-source.ts`):
 *
 * - **What is read.** The referrer's host, and two values from the
 *   address the visit landed on: `ref` and `utm_source`. Nothing else in
 *   the query string is read, and none of it is sent.
 * - **What is sent.** One of five groups (`instagram`, `google`,
 *   `whatsapp`, `direct` for "Typed your address", `other`) and, at most,
 *   one label the merchant chose for their own link (`?ref=diwali-post`),
 *   in a short safe shape: lower-case letters, digits and hyphens, no run
 *   of six digits (a phone number or an order number is no label).
 * - **The visit lives in this tab's memory only.** It is never written to
 *   a cookie, `localStorage`, `sessionStorage` or any other store, has no
 *   id, and nothing about it identifies the visitor. It ends when the tab
 *   is closed or reloaded, or after 30 minutes without a page
 *   ({@link VISIT_IDLE_MS}). A link inside the site keeps it; a reload or
 *   another tab starts a new one, as a QR code's tag does (DEC-108).
 * - **What ties it to a paid order** is its group and label, sent with the
 *   checkout ({@link visitFields}) and kept on the order, never an id.
 * - **Each step is sent at most once per visit**: the visit began, it
 *   looked at a product or the booking page, it started a checkout. The
 *   page-view beacon starts the visit, so a browser that asks not to be
 *   tracked, a private page, a preview or a test release starts none, and
 *   then no step and no checkout source is sent either.
 *
 * A plain module: its state is the module's, shared by the beacon in the
 * site's layout and the checkout in this package, which import the same
 * file (`@saroh/site-blocks/visit-source`).
 */

/** The five groups. */
export type VisitSource =
    "instagram" | "google" | "whatsapp" | "direct" | "other";

/** The steps a visit sends, at most once each. */
export type VisitStep = "visit" | "looked" | "started";

/** What a visit says about where it came from. */
export interface VisitOrigin {
    source: VisitSource;
    ref: string | null;
}

const SOURCES: ReadonlySet<string> = new Set([
    "instagram",
    "google",
    "whatsapp",
    "direct",
    "other",
]);

/** True for one of the five groups. */
export function isVisitSource(value: unknown): value is VisitSource {
    return typeof value === "string" && SOURCES.has(value);
}

/** A visit ends after this long without a page. */
export const VISIT_IDLE_MS = 30 * 60 * 1000;

const REF_SHAPE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const DIGIT_RUN = /\d{6,}/;

/** A label as it may be sent, or null. */
export function visitRefOf(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const ref = value.trim().toLowerCase();
    if (ref.length === 0 || ref.length > 32) return null;
    if (!REF_SHAPE.test(ref) || DIGIT_RUN.test(ref)) return null;
    return ref;
}

/** A label that only names a group ("instagram", "ig", "wa"…). */
const LABEL_GROUPS: Readonly<Partial<Record<string, VisitSource>>> = {
    instagram: "instagram",
    insta: "instagram",
    ig: "instagram",
    google: "google",
    whatsapp: "whatsapp",
    wa: "whatsapp",
};

/** The group a referrer's host belongs to, or null for any other site. */
export function groupOfHost(host: string): VisitSource | null {
    const h = host.toLowerCase().replace(/\.$/, "");
    const under = (domain: string) => h === domain || h.endsWith(`.${domain}`);
    if (under("instagram.com")) return "instagram";
    if (under("whatsapp.com") || under("wa.me")) return "whatsapp";
    // Search itself: google.com, www.google.co.in, www.google.de… Not
    // mail.google.com or googleusercontent.com, which aren't a search.
    if (/^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h)) return "google";
    return null;
}

/** The referrer's host, or null when there is none or it is this site. */
function referrerHost(referrer: string, ownHost: string): string | null {
    if (!referrer) return null;
    try {
        const url = new URL(referrer);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        if (url.host === ownHost) return null;
        return url.hostname;
    } catch {
        return null;
    }
}

/** `ref`, then `utm_source`, as labels; nothing else in the query. */
function labelsOf(search: string): string[] {
    let params: URLSearchParams;
    try {
        params = new URLSearchParams(search);
    } catch {
        return [];
    }
    return [params.get("ref"), params.get("utm_source")]
        .map((v) => visitRefOf(v))
        .filter((v): v is string => v !== null);
}

/**
 * Where a visit came from, from the referrer and the landing address.
 *
 * The group: a label that names one (`?ref=instagram`, `?utm_source=ig`),
 * else the referrer's host, else "other" for another site or a merchant's
 * own link opened with no referrer (a WhatsApp app sends none), else
 * "direct". The label kept is the first that isn't only a group's name.
 */
export function classifyVisit(input: {
    referrer: string;
    ownHost: string;
    search: string;
}): VisitOrigin {
    const labels = labelsOf(input.search);
    const host = referrerHost(input.referrer, input.ownHost);
    const named = labels
        .map((l) => LABEL_GROUPS[l])
        .find((g): g is VisitSource => g !== undefined);
    const source: VisitSource =
        named ??
        (host ? groupOfHost(host) : null) ??
        (host || labels.length > 0 ? "other" : "direct");
    const ref = labels.find((l) => LABEL_GROUPS[l] === undefined) ?? null;
    return { source, ref };
}

/* ------------------------------------------------------------------------- *
 * The visit, in this tab's memory.
 * ------------------------------------------------------------------------- */

interface Visit extends VisitOrigin {
    lastSeen: number;
    sent: Set<VisitStep>;
}

/** Sends one step; registered by the site's beacon on a live host only. */
export type VisitSender = (step: VisitStep, origin: VisitOrigin) => void;

let visit: Visit | null = null;
let sender: VisitSender | null = null;

function live(now: number): Visit | null {
    if (visit && now - visit.lastSeen < VISIT_IDLE_MS) return visit;
    return null;
}

function originOf(v: Visit): VisitOrigin {
    return { source: v.source, ref: v.ref };
}

/** The beacon's sender, or null to stop sending (its unmount). */
export function registerVisitSender(send: VisitSender | null): void {
    sender = send;
}

/**
 * A page of the visit was seen: keep the visit going, or begin one and
 * send its first step. The referrer belongs to the page load, so a visit
 * begun after the last one ended counts only its address's label, else
 * "direct".
 */
export function seeVisitPage(
    now: number,
    page: { referrer: string; ownHost: string; search: string },
): VisitOrigin {
    const current = live(now);
    if (current) {
        current.lastSeen = now;
        return originOf(current);
    }
    const origin = classifyVisit(visit ? { ...page, referrer: "" } : page);
    visit = { ...origin, lastSeen: now, sent: new Set() };
    sendOnce(visit, "visit");
    return origin;
}

function sendOnce(v: Visit, step: VisitStep): boolean {
    if (v.sent.has(step) || !sender) return false;
    v.sent.add(step);
    sender(step, originOf(v));
    return true;
}

/**
 * The visit looked at a product or the booking page, or started a
 * checkout: sent once per visit, and only while a visit is going.
 */
export function markVisitStep(
    step: Exclude<VisitStep, "visit">,
    now: number = Date.now(),
): boolean {
    const current = live(now);
    if (!current) return false;
    current.lastSeen = now;
    return sendOnce(current, step);
}

/** Where the visit going now came from, or null. */
export function currentVisit(now: number = Date.now()): VisitOrigin | null {
    const current = live(now);
    return current ? originOf(current) : null;
}

/**
 * The fields a checkout sends so its order is counted to its visit's
 * source; empty when no visit is going.
 */
export function visitFields(now: number = Date.now()): {
    visitSource?: VisitSource;
    visitRef?: string;
} {
    const current = live(now);
    if (!current) return {};
    return current.ref
        ? { visitSource: current.source, visitRef: current.ref }
        : { visitSource: current.source };
}

/** Tests only: forget the visit and the sender. */
export function forgetVisitForTests(): void {
    visit = null;
    sender = null;
}
