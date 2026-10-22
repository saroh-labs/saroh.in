import { parseSectionContent } from "@saroh/block-contract";

import type { Section, SectionType } from "@/lib/sites/service";

/** A section the editor is keeping back from this save, and why. */
export interface HeldBackSection {
    /** Where it sits in the EDITOR's list, not in what was sent. */
    index: number;
    key: string | undefined;
    type: SectionType;
    /** Shown on the section, so it is written for the merchant. */
    message: string;
}

export interface SaveableSections {
    /** What to PUT, in the editor's order. */
    toSend: Section[];
    /** For each entry of `toSend`, its index in the editor's list. */
    sentFrom: number[];
    heldBack: HeldBackSection[];
}

/**
 * Said when the contract's own message is not one written for an author — a
 * base schema failure reads `Invalid content for section "faq" v1`, which is a
 * developer's sentence and names nothing a merchant could fix.
 */
export const UNFINISHED_MESSAGE =
    "Not finished yet, so not saved. Fill in the empty fields and it will save.";

/**
 * Split the editor's sections into what can be saved now and what cannot.
 *
 * The API validates every section and refuses the whole list on the first one
 * that fails its contract. A section is added empty — a hero with no heading,
 * a gallery with no images — so before this, adding one stopped EVERYTHING on
 * the page from saving: other edits, a reorder, a hide, until it was filled in.
 *
 * So each section is checked here first, against the same contract:
 *
 * - valid: sent as it is;
 * - invalid, but a version of it was saved before (same `key`): the SAVED
 *   version is sent, because the save replaces the whole list and leaving it
 *   out would delete it;
 * - invalid and never saved: left out until it is finished.
 *
 * Anything not sent as it is on screen is in `heldBack`, and the page is not
 * fully saved while that list is non-empty.
 */
export function saveableSections(
    current: Section[],
    saved: Section[],
): SaveableSections {
    const savedByKey = new Map<string, Section>();
    for (const section of saved) {
        if (section.key) savedByKey.set(section.key, section);
    }

    const toSend: Section[] = [];
    const sentFrom: number[] = [];
    const heldBack: HeldBackSection[] = [];

    current.forEach((section, index) => {
        const result = parseSectionContent(
            section.type,
            section.contractVersion,
            section.content,
        );
        if (result.success) {
            toSend.push(section);
            sentFrom.push(index);
            return;
        }
        heldBack.push({
            index,
            key: section.key,
            type: section.type,
            message: authorMessage(result.error),
        });
        const previous = section.key ? savedByKey.get(section.key) : undefined;
        if (previous) {
            toSend.push(previous);
            sentFrom.push(index);
        }
    });

    return { toSend, sentFrom, heldBack };
}

/**
 * The contract's first message when it was written for an author (a look's
 * requirement, such as the split hero's image), otherwise a plain sentence.
 * An authored message is the one that is also an issue's own message; the
 * generic one sits above the issues and repeats none of them.
 */
function authorMessage(
    error: Extract<
        ReturnType<typeof parseSectionContent>,
        { success: false }
    >["error"],
): string {
    if (
        error.code === "INVALID_CONTENT" &&
        error.issues.some((issue) => issue.message === error.message)
    ) {
        return error.message;
    }
    return UNFINISHED_MESSAGE;
}
