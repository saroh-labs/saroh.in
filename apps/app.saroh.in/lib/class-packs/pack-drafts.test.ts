import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api/http", () => ({
    apiFetch: (path: string, init?: RequestInit) =>
        apiFetch(path, init) as unknown,
    orgBase: () => Promise.resolve("/organizations/org_1"),
}));

import {
    createPackDraft,
    deletePackDraft,
    discardPackChanges,
    loadPackDraft,
    publishPack,
    readPackEditor,
    readPackSold,
    savePackDraft,
} from "@/lib/class-packs/pack-drafts";

/*
 * The Pack Editor's calls to E14's routes (E18): the paths and bodies, the
 * server's price as the field shows it, a stale revision as the shell's
 * conflict, E13's kind lock as a refusal on the kind field, and the page's
 * first reads.
 */

function answer(status: number, body?: unknown): Response {
    return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
    });
}

const values = {
    name: "Ten classes",
    description: null,
    credits: 10,
    validityDays: 60,
    price: "5200.00",
    currency: "INR",
    serviceIds: ["svc_1"],
    kind: "CLASSES",
    firstPackOnly: false,
};

const record = {
    id: "pack_1",
    status: "ACTIVE",
    hasPendingChanges: true,
    revision: 5,
    values,
    published: { ...values, price: "4500.00" },
    canDelete: false,
    problems: [],
    pendingChangedAt: "2026-10-14T10:00:00.000Z",
};

beforeEach(() => apiFetch.mockReset());

describe("the Pack Editor's calls (E14)", () => {
    it("autosaves the fields with the revision held", async () => {
        apiFetch.mockResolvedValue(answer(200, record));
        const res = await savePackDraft("pack_1", { price: "5200" }, 4);
        expect(apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/class-packs/pack_1/draft",
            {
                method: "PATCH",
                body: JSON.stringify({ price: "5200", revision: 4 }),
            },
        );
        // The server's "5200.00" comes back as the field shows it.
        expect(res).toEqual({
            ok: true,
            data: {
                ...record,
                values: { ...values, price: "5200" },
                published: { ...values, price: "4500" },
            },
        });
    });

    it("creates a draft, publishes, discards and deletes by revision", async () => {
        apiFetch.mockImplementation(() =>
            Promise.resolve(answer(200, { ...record, published: null })),
        );
        await createPackDraft({ name: "Ten classes" });
        await publishPack("pack_1", 5);
        await discardPackChanges("pack_1", 6);
        expect(apiFetch.mock.calls.map((c: unknown[]) => [c[0], c[1]])).toEqual(
            [
                [
                    "/organizations/org_1/class-packs/drafts",
                    {
                        method: "POST",
                        body: JSON.stringify({ name: "Ten classes" }),
                    },
                ],
                [
                    "/organizations/org_1/class-packs/pack_1/publish",
                    { method: "POST", body: JSON.stringify({ revision: 5 }) },
                ],
                [
                    "/organizations/org_1/class-packs/pack_1/discard",
                    { method: "POST", body: JSON.stringify({ revision: 6 }) },
                ],
            ],
        );
        apiFetch.mockResolvedValue(answer(204));
        expect(await deletePackDraft("pack_1", 7)).toEqual({
            ok: true,
            data: null,
        });
        expect(apiFetch).toHaveBeenLastCalledWith(
            "/organizations/org_1/class-packs/pack_1?revision=7",
            { method: "DELETE" },
        );
    });

    it("reads a stale revision's 409 as the shell's conflict, by name", async () => {
        apiFetch.mockResolvedValue(
            answer(409, {
                error: {
                    message:
                        "Priya changed this pack while you were editing. Reload to see it.",
                    details: {
                        yours: 4,
                        current: 5,
                        changedBy: "Priya Raman",
                        changedAt: "2026-10-14T10:00:00.000Z",
                    },
                },
            }),
        );
        const res = await savePackDraft("pack_1", { credits: 12 }, 4);
        expect(res).toMatchObject({
            ok: false,
            conflict: {
                changedBy: "Priya Raman",
                changedAt: "2026-10-14T10:00:00.000Z",
                current: 5,
            },
        });
    });

    it("reads E13's kind lock at Publish as a refusal on the kind field, in words", async () => {
        apiFetch.mockResolvedValue(
            answer(409, {
                error: {
                    code: "CONFLICT",
                    message:
                        "This pack has been sold, so it stays the kind it was sold as.",
                    details: { field: "kind" },
                },
            }),
        );
        const res = await publishPack("pack_1", 5);
        expect(res).toEqual({
            ok: false,
            error: "This pack has been sold, so it stays the kind it was sold as.",
            field: "kind",
        });
        // Not a conflict: nobody else saved; the shell marks the field.
        expect(res).not.toHaveProperty("conflict");
    });

    it("says what failed when the API gives no words", async () => {
        apiFetch.mockResolvedValue(answer(500, {}));
        expect(await loadPackDraft("pack_1")).toEqual({
            ok: false,
            error: "Could not load that pack.",
        });
    });
});

describe("the editor page's first reads", () => {
    it("reads the pack, or says why not", async () => {
        apiFetch.mockResolvedValueOnce(answer(200, record));
        expect(await readPackEditor("pack_1")).toMatchObject({
            ok: true,
            record: { id: "pack_1", values: { price: "5200" } },
        });
        apiFetch.mockResolvedValueOnce(answer(404, {}));
        expect(await readPackEditor("x")).toEqual({
            ok: false,
            reason: "missing",
        });
        apiFetch.mockResolvedValueOnce(answer(403, {}));
        expect(await readPackEditor("x")).toEqual({
            ok: false,
            reason: "forbidden",
        });
        apiFetch.mockResolvedValueOnce(answer(502, {}));
        expect(await readPackEditor("x")).toEqual({
            ok: false,
            reason: "failed",
        });
        apiFetch.mockRejectedValueOnce(new Error("offline"));
        expect(await readPackEditor("x")).toEqual({
            ok: false,
            reason: "failed",
        });
    });

    it("counts a pack's sales, and never guesses none", async () => {
        apiFetch.mockResolvedValueOnce(answer(200, { id: "pack_1", sold: 3 }));
        expect(await readPackSold("pack_1")).toBe(3);
        expect(apiFetch).toHaveBeenLastCalledWith(
            "/organizations/org_1/class-packs/pack_1",
            undefined,
        );
        apiFetch.mockResolvedValueOnce(answer(500, {}));
        expect(await readPackSold("pack_1")).toBeNull();
        apiFetch.mockRejectedValueOnce(new Error("offline"));
        expect(await readPackSold("pack_1")).toBeNull();
    });
});
