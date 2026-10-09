/**
 * When a page was last changed, for the Pages tab's Updated column (#908).
 *
 * Two rows move when a merchant changes a page, and neither alone is the
 * answer:
 *
 * - `Page.updatedAt` moves on a rename, a new address, hiding it or taking it
 *   out of the menu — but never on a section edit, which writes the version's
 *   sections, not the page.
 * - The latest DRAFT `PageVersion.updatedAt` moves on every section save,
 *   because the save bumps its `revision` in the same transaction (#285).
 *   Publishing writes a Publication, not the version, so a publish alone does
 *   not read as an edit.
 *
 * The later of the two is when the page was last worked on.
 */
export function pageUpdatedAt(page: {
    updatedAt: Date;
    versions?: readonly { updatedAt: Date }[];
}): Date {
    const draft = page.versions?.[0]?.updatedAt;
    return draft && draft.getTime() > page.updatedAt.getTime()
        ? draft
        : page.updatedAt;
}

/** The latest draft's timestamp — what {@link pageUpdatedAt} reads. */
export const pageUpdatedSelect = {
    updatedAt: true,
    versions: {
        where: { status: "DRAFT" as const },
        orderBy: { createdAt: "desc" as const },
        take: 1,
        select: { updatedAt: true },
    },
};
