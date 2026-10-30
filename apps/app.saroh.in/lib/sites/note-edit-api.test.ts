import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteComment, updateCommentBody } from "./service";

const { apiFetch } = vi.hoisted(() => ({
    apiFetch: vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(),
}));
vi.mock("@/lib/api/http", () => ({
    apiFetch,
    getActiveOrgId: () => Promise.resolve("org_1"),
    getJson: vi.fn(),
}));

const refusal = (status: number, message: string, code?: string) =>
    new Response(
        JSON.stringify({
            error: { message, ...(code ? { details: { code } } : {}) },
        }),
        { status },
    );

describe("edit and delete your own note (DEC-200 U3)", () => {
    beforeEach(() => {
        apiFetch.mockReset();
    });

    it("sends the new words to the note's body route", async () => {
        apiFetch.mockResolvedValue(
            new Response(JSON.stringify({ id: "n1", body: "Fix the hours" })),
        );

        await expect(
            updateCommentBody("site_1", "n1", "Fix the hours"),
        ).resolves.toEqual({
            ok: true,
            data: { id: "n1", body: "Fix the hours" },
        });
        const [path, init] = apiFetch.mock.calls[0];
        expect(path).toMatch(/\/site_1\/comments\/n1\/body$/);
        expect(init).toMatchObject({
            method: "PATCH",
            body: JSON.stringify({ body: "Fix the hours" }),
        });
    });

    it("deletes through the note's own route", async () => {
        apiFetch.mockResolvedValue(new Response(JSON.stringify({ id: "n1" })));

        await expect(deleteComment("site_1", "n1")).resolves.toEqual({
            ok: true,
            data: { id: "n1" },
        });
        const [path, init] = apiFetch.mock.calls[0];
        expect(path).toMatch(/\/site_1\/comments\/n1$/);
        expect(init).toMatchObject({ method: "DELETE" });
    });

    it.each([
        [
            "a note from an approved review",
            409,
            "This was part of an approved review, so it's kept as it was.",
            undefined,
        ],
        [
            "someone else's note",
            403,
            "Only the person who wrote a note can change or delete it.",
            "ROLE_DENIED",
        ],
    ])(
        "hands back the api's words for %s",
        async (_l, status, message, code) => {
            apiFetch.mockResolvedValue(refusal(status, message, code));

            const edit = await updateCommentBody("site_1", "n1", "x");
            expect(edit).toMatchObject({ ok: false, error: message });

            apiFetch.mockResolvedValue(refusal(status, message, code));
            const del = await deleteComment("site_1", "n1");
            expect(del).toMatchObject({ ok: false, error: message });
        },
    );
});
