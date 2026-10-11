import { MAP_LINK_PLACEHOLDER, normaliseMapLink } from "@saroh/block-contract";

/**
 * A location's address and its Google Maps link (DEC-128), as its sheet
 * edits them: on the location's own screen and, in place, in Website
 * settings. One set of words, checks and patch for both, so the two stay
 * one implementation. Pure; no server code, so a client sheet can use it.
 */

/** What is saved for an address: the lines, and its place on the map. */
export interface SavedAddress {
    address: string | null;
    mapUrl?: string | null;
}

/** What is typed in the sheet. */
export interface AddressDraft {
    address: string;
    mapUrl: string;
}

/** The Google Maps link field's words, wherever it is drawn. */
export const MAP_LINK = {
    label: "Google Maps link",
    placeholder: MAP_LINK_PLACEHOLDER,
    note: "Optional. Get directions on your website opens it. Without one, it searches for the address.",
    opens: "Get directions opens",
} as const;

/** A saved link as the field shows it: without its "https://". */
export function mapLinkFieldValue(url: string | null | undefined): string {
    return url ? url.replace(/^https:\/\/(www\.)?/, "") : "";
}

export function addressDraftOf(saved: SavedAddress): AddressDraft {
    return {
        address: saved.address ?? "",
        mapUrl: mapLinkFieldValue(saved.mapUrl),
    };
}

/**
 * What a typed link is: nothing, the address it will be kept as, or what
 * is wrong with it. The rule is the API's own (`normaliseMapLink`), so the
 * field never says yes to a link Save will refuse.
 */
export type MapLinkRead =
    | { kind: "empty" }
    | { kind: "opens"; url: string; shown: string }
    | { kind: "problem"; problem: string };

export function readMapLink(typed: string): MapLinkRead {
    if (typed.trim() === "") return { kind: "empty" };
    const check = normaliseMapLink(typed);
    if (!check.ok) return { kind: "problem", problem: check.problem };
    const shown = mapLinkFieldValue(check.url);
    return {
        kind: "opens",
        url: check.url,
        shown: shown.length > 60 ? `${shown.slice(0, 57)}…` : shown,
    };
}

/** What is wrong with a typed link, or null when it will be accepted. */
export function mapLinkProblem(typed: string): string | null {
    const read = readMapLink(typed);
    return read.kind === "problem" ? read.problem : null;
}

/**
 * What Save sends: only what changed. An emptied address or link is sent
 * as `null`, which clears it. Empty: nothing changed, nothing to send.
 */
export function addressPatch(
    draft: AddressDraft,
    saved: SavedAddress,
): { address?: string | null; mapUrl?: string | null } {
    const patch: { address?: string | null; mapUrl?: string | null } = {};
    const address = draft.address.trim();
    if (address !== (saved.address ?? "")) patch.address = address || null;
    const read = readMapLink(draft.mapUrl);
    const link = read.kind === "opens" ? read.url : null;
    if (read.kind === "problem" || link !== (saved.mapUrl ?? null)) {
        patch.mapUrl = draft.mapUrl.trim() || null;
    }
    return patch;
}
