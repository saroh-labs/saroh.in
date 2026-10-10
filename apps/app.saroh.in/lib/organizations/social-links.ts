import type { SocialLinks, SocialNetwork } from "@saroh/block-contract";
import {
    normaliseSocialLink,
    SOCIAL_NETWORKS,
    socialLinkShown,
    socialLinksSummary,
} from "@saroh/block-contract";

import { phoneLabel } from "./business-phone";

/**
 * The business's social links in the workspace (DEC-125): what the "Social
 * links" row says, what its sheet starts from, what it says under a field
 * as the merchant types, and the patch a Save sends. The rules themselves
 * are `@saroh/block-contract`'s, which the API judges by, so a field never
 * says yes to something Save will refuse. Pure.
 */

/** What is typed in the sheet: one string per network, "" for none. */
export type SocialDraft = Record<SocialNetwork, string>;

/** The row when nothing is linked. */
export const NO_SOCIAL_LINKS = "None yet";

/** "Instagram, WhatsApp, Google Maps", or "None yet". */
export function socialRowSummary(
    links: SocialLinks | null | undefined,
): string {
    return socialLinksSummary(links ?? {}) || NO_SOCIAL_LINKS;
}

/**
 * A saved link as the field shows it: the address without its "https://",
 * and WhatsApp as the number it was made from ("+91 98450 12345"). Typed
 * back unchanged, it is kept as the same link.
 */
export function socialFieldValue(network: SocialNetwork, url: string): string {
    if (network === "whatsapp") {
        const digits = /^https:\/\/wa\.me\/(\d+)$/.exec(url)?.[1];
        if (digits) return phoneLabel(`+${digits}`);
    }
    return url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "");
}

/** What the sheet starts from. */
export function socialDraftOf(
    links: SocialLinks | null | undefined,
): SocialDraft {
    const draft = {} as SocialDraft;
    for (const network of SOCIAL_NETWORKS) {
        const url = links?.[network];
        draft[network] = url ? socialFieldValue(network, url) : "";
    }
    return draft;
}

/**
 * What a field says under itself: nothing while it is empty, where the
 * link will open while it is one the API takes, and what is wrong with it
 * otherwise.
 */
export type SocialFieldRead =
    | { kind: "empty" }
    | { kind: "opens"; url: string; shown: string }
    | { kind: "problem"; problem: string };

export function readSocialField(
    network: SocialNetwork,
    typed: string,
): SocialFieldRead {
    if (typed.trim() === "") return { kind: "empty" };
    const check = normaliseSocialLink(network, typed);
    return check.ok
        ? { kind: "opens", url: check.url, shown: socialLinkShown(check.url) }
        : { kind: "problem", problem: check.problem };
}

/** Each field that Save would be refused for, with why. */
export function socialProblems(
    draft: SocialDraft,
): Partial<Record<SocialNetwork, string>> {
    const problems: Partial<Record<SocialNetwork, string>> = {};
    for (const network of SOCIAL_NETWORKS) {
        const read = readSocialField(network, draft[network]);
        if (read.kind === "problem") problems[network] = read.problem;
    }
    return problems;
}

/**
 * What Save sends: only the networks whose link would change, each as it
 * was typed ("" clears one). Empty: nothing changed, nothing to send.
 */
export function socialPatch(
    draft: SocialDraft,
    saved: SocialLinks | null | undefined,
): Partial<Record<SocialNetwork, string>> {
    const patch: Partial<Record<SocialNetwork, string>> = {};
    for (const network of SOCIAL_NETWORKS) {
        const read = readSocialField(network, draft[network]);
        const before = saved?.[network] ?? null;
        const after = read.kind === "opens" ? read.url : null;
        if (read.kind === "problem" || after !== before) {
            patch[network] = draft[network].trim();
        }
    }
    return patch;
}

/** The network a refusal's field names ("socialLinks.instagram"), if any. */
export function socialNetworkOfField(
    field: string | undefined,
): SocialNetwork | null {
    const name = field?.startsWith("socialLinks.")
        ? field.slice("socialLinks.".length)
        : null;
    return SOCIAL_NETWORKS.find((n) => n === name) ?? null;
}

/** What a save says. */
export function socialSavedWords(links: SocialLinks): string {
    return Object.keys(links).length > 0
        ? "Social links saved. Your website shows them now."
        : "Social links removed from your website";
}
