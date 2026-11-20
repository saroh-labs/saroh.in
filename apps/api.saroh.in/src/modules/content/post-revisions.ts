import type { Prisma } from "@saroh/database";

/**
 * A post's revisions (editor redesign U17a): what History lists and Compare
 * reads. One an hour while it is being written, plus one for each named
 * event. Appended, never updated.
 *
 * Approval (O7) is not built. When it is, it adds `sent` (the request's
 * words in `note`) and `approved` here; the verdict itself is a
 * `SiteChangeApproval` on unit `post:<postId>`, and "publish on a date" is
 * `Post.scheduledAt`, so it needs no table of its own.
 */
export const REVISION_REASONS = [
    "autosave",
    "published",
    "restored",
    "ask_ai",
    "not_published",
] as const;
export type RevisionReason = (typeof REVISION_REASONS)[number];

/** Autosaves closer together than this share one revision. */
export const AUTOSAVE_REVISION_EVERY_MS = 60 * 60 * 1000;

/** The post fields a revision keeps, so restoring one puts all of them back. */
export const REVISION_FIELDS = {
    title: true,
    content: true,
    excerpt: true,
    image: true,
    imageAlt: true,
    seoTitle: true,
    seoDescription: true,
    shareImageUrl: true,
    slug: true,
    categoryId: true,
    authorId: true,
} as const;

export type RevisionState = Prisma.PostGetPayload<{
    select: typeof REVISION_FIELDS;
}>;

type Tx = Pick<Prisma.TransactionClient, "postRevision">;

/** Only the fields a revision keeps, from a row that has more. */
export function revisionStateOf(row: RevisionState): RevisionState {
    return {
        title: row.title,
        content: row.content,
        excerpt: row.excerpt,
        image: row.image,
        imageAlt: row.imageAlt,
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        shareImageUrl: row.shareImageUrl,
        slug: row.slug,
        categoryId: row.categoryId,
        authorId: row.authorId,
    };
}

/** Whether an autosave writes a revision, given when the last one was. */
export function autosaveDue(last: Date | null | undefined, now: Date): boolean {
    return (
        !last || now.getTime() - last.getTime() >= AUTOSAVE_REVISION_EVERY_MS
    );
}

/** Append one revision of `state`. */
export async function writeRevision(
    tx: Tx,
    input: {
        organizationId: string;
        postId: string;
        state: RevisionState;
        reason: RevisionReason;
        savedByUserId: string | null;
        note?: string | null;
        /** Set when two are written on one transaction, to keep their order. */
        at?: Date;
    },
): Promise<void> {
    await tx.postRevision.create({
        data: {
            ...input.state,
            organizationId: input.organizationId,
            postId: input.postId,
            reason: input.reason,
            savedByUserId: input.savedByUserId,
            note: input.note ?? null,
            ...(input.at ? { createdAt: input.at } : {}),
        },
    });
}

/**
 * After a save: an `ask_ai` revision always, an autosave one only when the
 * last revision is an hour old (or there is none).
 */
export async function revisionAfterSave(
    tx: Tx,
    input: {
        organizationId: string;
        postId: string;
        state: RevisionState;
        savedByUserId: string;
        event?: "ask_ai";
        now?: Date;
    },
): Promise<void> {
    if (!input.event) {
        const last = await tx.postRevision.findFirst({
            where: { postId: input.postId },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
        });
        if (!autosaveDue(last?.createdAt, input.now ?? new Date())) return;
    }
    await writeRevision(tx, {
        organizationId: input.organizationId,
        postId: input.postId,
        state: input.state,
        reason: input.event ?? "autosave",
        savedByUserId: input.savedByUserId,
    });
}
