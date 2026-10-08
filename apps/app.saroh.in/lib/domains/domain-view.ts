import { shortDate } from "@/lib/sites/format-date";

import type { DomainCheckFailure, SiteDomain } from "./service";

/**
 * What the domain screen shows for one domain (#861), from the api's state.
 *
 * The api reports two things: whether the TXT check passed (`status`) and,
 * since #859, where the hostname stands with our hosting (`hosting.state`).
 * The owner's four states (7 Oct) map onto them:
 *
 * | scene         | api                                  | the merchant sees                              |
 * | ------------- | ------------------------------------ | ---------------------------------------------- |
 * | `waiting`     | not VERIFIED                          | both records to copy, as before                |
 * | `not-pointed` | VERIFIED, hosting NOT_POINTED         | the CNAME, "Visitors don't reach your site yet" |
 * | `live`        | VERIFIED, hosting LIVE                | "Live at ‹domain›"; records folded away        |
 * | `problem`     | VERIFIED, hosting PROBLEM             | the records again, with what is wrong in words |
 * | `verified-off`| VERIFIED, hosting OFF (or not sent)   | the CNAME, as before #861; never "Live"        |
 *
 * OFF means hosting isn't set up on this instance: the api can't tell
 * whether the domain serves, so the screen claims nothing it can't know.
 * An unknown state reads as `not-pointed` — never as live.
 *
 * Pure, and kept apart from `service.ts` (which reads the session through
 * `next/headers`) so the client component can import it.
 */

export type DomainScene =
    "waiting" | "verified-off" | "not-pointed" | "live" | "problem";

/** Where verified domains point, when the api doesn't name it. */
export const DEFAULT_CNAME_TARGET = "saroh.app";

export function domainScene(
    domain: Pick<SiteDomain, "status" | "hosting">,
): DomainScene {
    if (domain.status !== "VERIFIED") return "waiting";
    switch (domain.hosting?.state) {
        case undefined:
        case "OFF":
            return "verified-off";
        case "LIVE":
            return "live";
        case "PROBLEM":
            return "problem";
        default:
            // NOT_POINTED, or a state this screen doesn't know.
            return "not-pointed";
    }
}

export interface DomainBadge {
    label: string;
    variant: "outline" | "success" | "info" | "warning";
}

export interface DomainView {
    scene: DomainScene;
    badge: DomainBadge;
    /** The sentence above the records; null where none is shown. */
    intro: string | null;
    /** The TXT record that proves ownership is listed. */
    showTxt: boolean;
    /** The CNAME that sends visitors is listed. */
    showCname: boolean;
    /** The records sit folded under "DNS records" (closed at first). */
    foldRecords: boolean;
    /** The CNAME to add: the api's when it names one. */
    cname: { name: string; value: string };
    /** Where the live site opens, for "Live at ‹domain›". */
    liveUrl: string | null;
    /** What is wrong, in words, for `problem`. */
    problem: string | null;
    /** The check button's label, or null for no button. */
    checkLabel: string | null;
    /** What removing it does to visitors, said before it happens. */
    removeWarning: string;
}

export const DOMAIN_WORDS = {
    waitingIntro:
        "Add these two records at your registrar. Copy each part exactly.",
    offIntro:
        "You own this domain. To send visitors to your site, add this record at your registrar:",
    notPointedIntro:
        "Verified: you own this domain. Visitors don't reach your site yet. Add this record at your registrar, then check again:",
    problemIntro:
        "Check these records at your registrar, then check again. Copy each part exactly.",
    liveRecords:
        "Keep these records at your registrar. The CNAME is what sends visitors to your site.",
    problemFallback:
        "Something is wrong with this domain at our hosting. Check the records below, then check again.",
    txtHeading: "1. Proves you own the domain",
    cnameHeadingWaiting: "2. Sends visitors to your site once it's verified",
    cnameHeading: "2. Sends visitors to your site",
    recordsToggle: "DNS records",
} as const;

export function domainView(
    domain: Pick<SiteDomain, "hostname" | "status" | "hosting">,
    fallbackTarget: string = DEFAULT_CNAME_TARGET,
): DomainView {
    const scene = domainScene(domain);
    const h = domain.hostname;
    const record = domain.hosting?.dnsRecord ?? null;
    const cname = {
        name: record?.name ?? h,
        value: record?.value ?? fallbackTarget,
    };
    const outage = `Visitors to ${h} will stop reaching your site and see an error until you point the domain somewhere else. Your web address on Saroh keeps working.`;
    const notServing = `Nothing changes for visitors: ${h} doesn't reach your site yet. Your web address on Saroh keeps working.`;
    const base = {
        scene,
        cname,
        liveUrl: null,
        problem: null,
        foldRecords: false,
    };

    switch (scene) {
        case "waiting":
            return {
                ...base,
                badge: { label: "Waiting for DNS", variant: "outline" },
                intro: DOMAIN_WORDS.waitingIntro,
                showTxt: true,
                showCname: true,
                checkLabel: "Check now",
                removeWarning: `Nothing changes for visitors: ${h} is not serving your site yet. You can add it again later; the record will be different.`,
            };
        case "verified-off":
            return {
                ...base,
                badge: { label: "Verified", variant: "success" },
                intro: DOMAIN_WORDS.offIntro,
                showTxt: false,
                showCname: true,
                checkLabel: null,
                removeWarning: outage,
            };
        case "not-pointed":
            return {
                ...base,
                badge: { label: "Not live yet", variant: "info" },
                intro: DOMAIN_WORDS.notPointedIntro,
                showTxt: false,
                showCname: true,
                checkLabel: "Check again",
                removeWarning: notServing,
            };
        case "live":
            return {
                ...base,
                badge: { label: "Live", variant: "success" },
                intro: DOMAIN_WORDS.liveRecords,
                showTxt: true,
                showCname: true,
                foldRecords: true,
                liveUrl: `https://${h}`,
                // A live domain whose last look failed may be looked at again.
                checkLabel: domain.hosting?.problem ? "Check again" : null,
                removeWarning: outage,
            };
        case "problem":
            return {
                ...base,
                badge: { label: "Needs attention", variant: "warning" },
                intro: DOMAIN_WORDS.problemIntro,
                problem:
                    domain.hosting?.problem ?? DOMAIN_WORDS.problemFallback,
                showTxt: true,
                showCname: true,
                checkLabel: "Check again",
                removeWarning: notServing,
            };
    }
}

/** Narrow the free-form `lastCheckResult`: unknown reads as "no record". */
function checkFailure(result: string | null): DomainCheckFailure | null {
    return result === "NO_RECORD" ||
        result === "WRONG_VALUE" ||
        result === "LOOKUP_FAILED"
        ? result
        : null;
}

/**
 * The line under the records: what the last check found and what to do
 * next. Null when the scene has nothing to say.
 */
export function checkLine(
    domain: Pick<
        SiteDomain,
        "status" | "hosting" | "lastCheckedAt" | "lastCheckResult"
    >,
    zone: string,
): string | null {
    const scene = domainScene(domain);
    if (scene === "waiting") return txtCheckLine(domain, zone);
    const checkedAt = domain.hosting?.checkedAt ?? null;
    const problem = domain.hosting?.problem ?? null;
    const when = checkedAt ? shortDate(checkedAt, zone) : null;
    switch (scene) {
        case "not-pointed":
            if (!when) return "Add the record, then check.";
            return problem
                ? `Checked ${when}: ${problem}`
                : `Checked ${when}: not live yet. A new DNS record can take up to 48 hours to spread; check again later.`;
        case "live":
            return when && problem ? `Checked ${when}: ${problem}` : null;
        case "problem":
            return when ? `Checked ${when}.` : null;
        default:
            return null;
    }
}

/** What the last TXT check means for the merchant, and what to do next. */
function txtCheckLine(
    domain: Pick<SiteDomain, "lastCheckedAt" | "lastCheckResult">,
    zone: string,
): string {
    if (!domain.lastCheckedAt) {
        return "Not checked yet. Add the record, then check.";
    }
    const when = shortDate(domain.lastCheckedAt, zone);
    switch (checkFailure(domain.lastCheckResult)) {
        case "WRONG_VALUE":
            return `Checked ${when}: a record exists, but its value does not match. Copy the value again, exactly, and replace what is there.`;
        case "LOOKUP_FAILED":
            return `Checked ${when}: DNS for this domain did not answer. Check the domain is registered and its nameservers are set, then try again.`;
        case "NO_RECORD":
        case null:
        default:
            return `Checked ${when}: no record found yet. A new DNS record can take up to 48 hours to spread; check again later.`;
    }
}

export interface CheckToast {
    tone: "success" | "info" | "warning";
    message: string;
    description?: string;
}

/**
 * The toast after Check now / Check again: what the check found, from the
 * domain as it was and as the api now reports it.
 */
export function checkToast(
    before: Pick<SiteDomain, "status">,
    after: Pick<
        SiteDomain,
        "hostname" | "status" | "hosting" | "lastCheckedAt" | "lastCheckResult"
    >,
    zone: string,
): CheckToast {
    const h = after.hostname;
    switch (domainScene(after)) {
        case "waiting":
            return {
                tone: "info",
                message: "Not verified yet.",
                description: checkLine(after, zone) ?? undefined,
            };
        case "live":
            return { tone: "success", message: `${h} is live.` };
        case "problem":
            return {
                tone: "warning",
                message: `${h} needs attention.`,
                description:
                    after.hosting?.problem ?? DOMAIN_WORDS.problemFallback,
            };
        case "not-pointed":
            return before.status !== "VERIFIED"
                ? {
                      tone: "success",
                      message: `${h} is verified.`,
                      description:
                          "Now add the CNAME record so visitors reach your site.",
                  }
                : {
                      tone: "info",
                      message: "Not live yet.",
                      description: checkLine(after, zone) ?? undefined,
                  };
        case "verified-off":
            return { tone: "success", message: `${h} is verified.` };
    }
}
