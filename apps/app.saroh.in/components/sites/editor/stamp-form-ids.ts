import type { Section } from "@/lib/sites/service";

/** A Form the save's sync just made, and the enquiry section it was made for. */
export interface NewFormId {
    index: number;
    /** The section as it was when the save began. */
    before: Section;
    formId: string;
}

/**
 * The formIds a sync gave out that the sections did not have when the save
 * began. Moved out of `site-editor.tsx` unchanged (#260).
 */
export function newFormIds(before: Section[], synced: Section[]): NewFormId[] {
    return synced.flatMap((next, index) => {
        const was = before[index];
        return next.type === "enquiry" &&
            was.type === "enquiry" &&
            next.content.formId &&
            next.content.formId !== was.content.formId
            ? [{ index, before: was, formId: next.content.formId }]
            : [];
    });
}

/*
 * Stamp ONLY the new formIds onto what is on screen now (#281). This used to
 * replace the whole list with the copy taken before the sync, so anything
 * typed while the form request was in flight was lost.
 *
 * A section is matched by identity first, meaning it is unchanged since the
 * save began. Failing that, it is matched by position, for an enquiry section
 * still waiting for its first formId. That way a section edited mid-save still
 * gets its id, instead of creating a second Form on the next autosave.
 */
export function stampFormIds(
    current: Section[],
    found: NewFormId[],
    /** How many sections there were when the save began. */
    lengthAtSave: number,
): Section[] {
    return current.map((section, index) => {
        if (section.type !== "enquiry" || section.content.formId) {
            return section;
        }
        // By position only while the list is the same length as when the
        // save began: a block added in the middle since would shift every
        // position after it, and hand another block's Form to its neighbour
        // (review).
        const hit =
            found.find((n) => n.before === section) ??
            (current.length === lengthAtSave
                ? found.find((n) => n.index === index)
                : undefined);
        return hit
            ? {
                  ...section,
                  content: {
                      ...section.content,
                      formId: hit.formId,
                  },
              }
            : section;
    });
}
