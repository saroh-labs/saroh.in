/**
 * A save carries the business its tab believes is open (DEC-259): when
 * another tab switched, the action refuses before writing anything.
 */
import { describe, expect, it, vi } from "vitest";

const active = vi.hoisted(
    (): { id: string | null; cookie?: string; lists: number } => ({
        id: "org_a",
        lists: 0,
    }),
);
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    // Stands for the business list: counted.
    getActiveOrgId: () => {
        active.lists += 1;
        return Promise.resolve(active.id);
    },
}));
vi.mock("next/headers", () => ({
    cookies: () =>
        Promise.resolve({
            get: () => (active.cookie ? { value: active.cookie } : undefined),
        }),
}));

import { assertActiveOrg, ORG_MOVED, writeAsOrg } from "./assert-active-org";
import { scopedOrg } from "./read-scope";

/** An action as a migrated screen writes it. */
const write = vi.fn();
async function saveThing(name: string, orgId: string) {
    const moved = await assertActiveOrg(orgId);
    if (moved) return moved;
    write(name);
    return { ok: true as const };
}

describe("assertActiveOrg", () => {
    it("the open business: the save goes ahead", async () => {
        await expect(saveThing("a", "org_a")).resolves.toEqual({ ok: true });
        expect(write).toHaveBeenCalledTimes(1);
    });

    it("another business, or none open: refused, nothing written", async () => {
        write.mockReset();
        await expect(saveThing("a", "org_b")).resolves.toEqual({
            ok: false,
            error: ORG_MOVED,
        });
        active.id = null;
        await expect(saveThing("a", "org_a")).resolves.toEqual({
            ok: false,
            error: ORG_MOVED,
        });
        expect(write).not.toHaveBeenCalled();
    });
});

describe("writeAsOrg", () => {
    it("writes for the open business, refuses another without writing", async () => {
        active.id = "org_a";
        const save = vi.fn(() => Promise.resolve({ ok: true as const }));
        await expect(writeAsOrg("org_a", save)).resolves.toEqual({ ok: true });
        await expect(writeAsOrg("org_b", save)).resolves.toEqual({
            ok: false,
            error: ORG_MOVED,
        });
        expect(save).toHaveBeenCalledTimes(1);
    });
});

describe("writeAsOrg, the tab's business the cookie's", () => {
    it("writes with the business settled and no business list read", async () => {
        active.cookie = "org_a";
        active.lists = 0;
        const save = vi.fn(() => Promise.resolve(scopedOrg()));
        await expect(writeAsOrg("org_a", save)).resolves.toBe("org_a");
        expect(active.lists).toBe(0);
    });

    it("a cookie on another business: the list decides, as before", async () => {
        active.cookie = "org_b";
        active.id = "org_b";
        active.lists = 0;
        const save = vi.fn();
        await expect(writeAsOrg("org_a", save)).resolves.toEqual({
            ok: false,
            error: ORG_MOVED,
        });
        expect(save).not.toHaveBeenCalled();
        expect(active.lists).toBe(1);
    });
});
