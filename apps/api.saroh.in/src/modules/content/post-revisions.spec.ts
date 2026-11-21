import type { RevisionState } from "./post-revisions";
import {
    AUTOSAVE_REVISION_EVERY_MS,
    autosaveDue,
    EDIT_REASONS,
    revisionAfterSave,
} from "./post-revisions";

const state: RevisionState = {
    title: "Bridal trial",
    content: "<p>Hi</p>",
    excerpt: null,
    image: null,
    imageAlt: null,
    seoTitle: null,
    seoDescription: null,
    shareImageUrl: null,
    slug: "bridal-trial",
    categoryId: null,
    authorId: "user-1",
};

function fakeTx(lastAt: Date | null, lastBy = "user-1") {
    return {
        postRevision: {
            findFirst: jest
                .fn()
                .mockResolvedValue(
                    lastAt
                        ? { createdAt: lastAt, savedByUserId: lastBy }
                        : null,
                ),
            create: jest.fn().mockResolvedValue({}),
        },
    };
}

const save = (tx: ReturnType<typeof fakeTx>, event?: "ask_ai") =>
    revisionAfterSave(tx as never, {
        organizationId: "org-1",
        postId: "post-1",
        state,
        savedByUserId: "user-1",
        event,
        now: new Date("2026-11-20T10:00:00Z"),
    });

describe("revisions after a save (U17a)", () => {
    it("writes one when there is none, or the last is an hour old", async () => {
        expect(autosaveDue(null, new Date())).toBe(true);
        const now = new Date("2026-11-20T10:00:00Z");
        const hourAgo = new Date(now.getTime() - AUTOSAVE_REVISION_EVERY_MS);
        expect(autosaveDue(hourAgo, now)).toBe(true);
        expect(autosaveDue(new Date(hourAgo.getTime() + 1), now)).toBe(false);
    });

    it("skips an autosave within the hour", async () => {
        const tx = fakeTx(new Date("2026-11-20T09:30:00Z"));
        await save(tx);
        expect(tx.postRevision.create).not.toHaveBeenCalled();
    });

    it("keeps an autosave by someone else, so the last editor is known (O7)", async () => {
        const tx = fakeTx(new Date("2026-11-20T09:30:00Z"), "user-2");
        await save(tx);
        expect(tx.postRevision.create).toHaveBeenCalledWith({
            select: { id: true },
            data: expect.objectContaining({
                reason: "autosave",
                savedByUserId: "user-1",
            }),
        });
    });

    it("skips only after the saver's own edit revision, not a publish or a send (K1, R3)", async () => {
        const tx = fakeTx(new Date("2026-11-20T09:30:00Z"));
        await save(tx);
        expect(tx.postRevision.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { postId: "post-1", reason: { in: EDIT_REASONS } },
            }),
        );
        expect(EDIT_REASONS).not.toContain("published");
        expect(EDIT_REASONS).not.toContain("sent");
    });

    it("always keeps an Ask AI save, named", async () => {
        const tx = fakeTx(new Date("2026-11-20T09:59:00Z"));
        await save(tx, "ask_ai");
        expect(tx.postRevision.create).toHaveBeenCalledWith({
            select: { id: true },
            data: expect.objectContaining({
                reason: "ask_ai",
                organizationId: "org-1",
                postId: "post-1",
                title: "Bridal trial",
            }),
        });
    });
});
