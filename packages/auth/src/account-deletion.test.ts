import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deleting an account (DEC-167): the host is told just before, once the
 * deletion is allowed, so it can record what goes with it (the API raises
 * a billing notice for each business billed to one of the person's billing
 * profiles). Its failure never blocks the deletion; a sole owner is still
 * refused first, and the host is then never told.
 */
const memberships = vi.fn<() => Promise<unknown[]>>();
const owners = vi.fn<() => Promise<number>>();
vi.mock("@saroh/database", () => ({
    prisma: {
        membership: { findMany: () => memberships(), count: () => owners() },
    },
}));

import { authOptions } from "./server";

const user = { id: "user_1", email: "asha@example.com" } as never;

function beforeDelete(onUserDeleting?: (u: { id: string }) => unknown) {
    const hook = authOptions({
        onUserDeleting: onUserDeleting as never,
    }).user?.deleteUser?.beforeDelete;
    if (!hook) throw new Error("no beforeDelete hook");
    return hook(user);
}

beforeEach(() => {
    memberships.mockReset().mockResolvedValue([]);
    owners.mockReset().mockResolvedValue(1);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("beforeDelete", () => {
    it("tells the host who is being deleted, by id", async () => {
        const told = vi.fn();
        await beforeDelete(told);
        expect(told).toHaveBeenCalledWith({ id: "user_1" });
    });

    it("never blocks the deletion when the host fails", async () => {
        await expect(
            beforeDelete(() => Promise.reject(new Error("db down"))),
        ).resolves.toBeUndefined();
    });

    it("refuses a sole owner first, and the host is never told", async () => {
        memberships.mockResolvedValue([
            {
                organizationId: "org_1",
                organization: { name: "Asha's Kitchen" },
            },
        ]);
        owners.mockResolvedValue(0);
        const told = vi.fn();
        await expect(beforeDelete(told)).rejects.toThrow(/only owner/);
        expect(told).not.toHaveBeenCalled();
    });
});
