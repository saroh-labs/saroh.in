import { formatDate } from "@/lib/format/datetime";
import type { DomainView } from "./domain-view";
import type { SiteDomain } from "./service";

/**
 * What the domain screen says about a bare domain (DEC-140).
 *
 * A business that types `yourshop.in` is connected as `www.yourshop.in`,
 * because many providers refuse a CNAME record on a bare domain. The bare
 * domain then forwards to `www` at the provider, which Saroh can only look
 * at from outside. The api reports what it found (`bare.state`), and this
 * turns it into the step and the line the merchant reads:
 *
 * | api `bare.state`     | the merchant reads                                    | the step |
 * | -------------------- | ----------------------------------------------------- | -------- |
 * | none yet             | the forwarding step                                   | shown    |
 * | `FORWARDS`           | "‹domain› forwards to www.‹domain›."                  | hidden   |
 * | `FORWARDS_HTTP_ONLY` | it forwards, and https:// on it warns                 | hidden   |
 * | `POINTS_HERE`        | it points straight at Saroh: add it as a domain too   | hidden   |
 * | `NOT_FORWARDING`     | it doesn't forward yet, and www is not affected       | shown    |
 *
 * It is a notice beside the `www` domain's own state, never part of it: a
 * `www` site that is live stays "Live" whatever its bare domain does. An
 * unknown state reads as not checked.
 *
 * Pure, and kept apart from `service.ts` (which reads the session through
 * `next/headers`) so the client component can import it.
 */

export type BareTone = "plain" | "info" | "warning";

export interface BareView {
    /** The bare domain: `yourshop.in`. */
    hostname: string;
    /** The `www` address the site lives at: `www.yourshop.in`. */
    www: string;
    /** Where the bare domain forwards, to copy: `https://www.yourshop.in`. */
    forwardTo: string;
    /** The forwarding step is listed, with what to set at the provider. */
    showStep: boolean;
    /** The step's heading, numbered when it follows the two records. */
    stepHeading: string;
    /** What the last look found, in words; null before the first look. */
    line: string | null;
    /** `plain` is small text; `info` and `warning` are a notice. Never an error. */
    tone: BareTone;
    /** The bare domain can be added as a domain of its own, here. */
    canAdd: boolean;
    /** The row offers a check even when the `www` domain is live. */
    offerCheck: boolean;
}

export const BARE_WORDS = {
    /** Under the dialog's field, before anything is typed. */
    fieldHint:
        "A domain you already own, like www.yourshop.in. Leave out www and Saroh adds it, then shows how to forward the rest.",
    stepBody:
        "Sign in where you manage the domain and look for Forwarding, Redirect or URL redirect. It is often under Domain settings or DNS. Choose a permanent redirect (301) if it asks, and leave masking off.",
    from: "Domain",
    to: "Forward to",
    add: (bare: string) => `Add ${bare}`,
} as const;

/** "Your site will live at www…": said once the bare domain became `www`. */
export function connectedAsWww(bare: string, www: string): string {
    return `Your site will live at ${www}. ${bare} will forward to it, which is the last step below.`;
}

/** What to do instead where the provider can point the bare domain itself. */
export function aliasNote(bare: string, target: string): string {
    return `If your provider offers an ALIAS, ANAME or flattened CNAME record, you can point ${bare} at ${target} with it instead. Then add ${bare} here as a domain too.`;
}

/**
 * For a bare domain connected as itself: the record only works where the
 * provider flattens it, and `www` is the way out where it doesn't.
 */
export function bareSelfNote(bare: string): string {
    return `${bare} has no www in front, and many providers don't allow a CNAME record there. Use an ALIAS, ANAME or flattened CNAME record with the same value if yours has one. If it has none, remove this domain and add www.${bare}.`;
}

/**
 * The bare-domain part of a domain's row, or null when it has none: only
 * a `www` connection has a bare domain to forward.
 */
export function bareView(
    domain: Pick<SiteDomain, "hostname" | "status" | "bare">,
    view: Pick<DomainView, "scene" | "showTxt" | "showCname">,
    zone: string,
): BareView | null {
    const bare = domain.bare;
    if (!bare) return null;
    const h = bare.hostname;
    const www = domain.hostname;
    const numbered = view.showTxt && view.showCname;
    const base = {
        hostname: h,
        www,
        forwardTo: bare.forwardTo,
        stepHeading: `${numbered ? "3. " : ""}Forward ${h} to ${www}`,
        canAdd: false,
    };
    const when = bare.checkedAt ? formatDate(bare.checkedAt, zone) : null;
    const checked = (words: string) =>
        when ? `Checked ${when}: ${words}` : words;
    // A check is offered wherever one can run and has something to find.
    const verified = domain.status === "VERIFIED";
    const canCheck = verified && view.scene !== "verified-off";

    switch (bare.state) {
        case "FORWARDS":
            return {
                ...base,
                showStep: false,
                line: checked(`${h} forwards to ${www}.`),
                tone: "plain",
                offerCheck: false,
            };
        case "FORWARDS_HTTP_ONLY":
            return {
                ...base,
                showStep: false,
                line: checked(
                    `${h} forwards to ${www}, but not over https. Someone who types https://${h} will see a browser warning. Turn on HTTPS or SSL for forwarding at your provider if it offers it. ${www} is not affected.`,
                ),
                tone: "warning",
                offerCheck: canCheck,
            };
        case "POINTS_HERE":
            return bare.added
                ? {
                      ...base,
                      showStep: false,
                      line: checked(
                          `${h} points straight at Saroh and is added as a domain of its own. Its own row says where it stands.`,
                      ),
                      tone: "plain",
                      offerCheck: false,
                  }
                : {
                      ...base,
                      showStep: false,
                      line: checked(
                          `${h} points straight at Saroh, so it needs no forwarding. It won't open your site until you add it as a domain too.`,
                      ),
                      tone: "info",
                      canAdd: true,
                      offerCheck: canCheck,
                  };
        case "NOT_FORWARDING":
            return {
                ...base,
                showStep: true,
                line: checked(
                    `${h} doesn't forward to ${www} yet. Someone who types ${h} won't reach your site. ${www} is not affected.`,
                ),
                tone: "warning",
                offerCheck: canCheck,
            };
        default:
            // Not looked at yet: before the domain is verified, or where
            // the api doesn't check. The step is still what to do.
            return {
                ...base,
                showStep: true,
                line: null,
                tone: "plain",
                offerCheck: false,
            };
    }
}
