/**
 * A save carries the business its tab believes is open (DEC-259): when
 * another tab switched, the action refuses before writing anything.
 */
import { describe, expect, it, vi } from "vitest";

const active = vi.hoisted((): { id: string | null } => ({ id: "org_a" }));
vi.mock("@/lib/api/http", () => ({
    getActiveOrgId: () => Promise.resolve(active.id),
}));

import { assertActiveOrg, ORG_MOVED, writeAsOrg } from "./assert-active-org";

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
