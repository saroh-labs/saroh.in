/**
 * A save that changes who may do what, or what the business runs, forgets
 * the gate's kept answers (`forgetGate`): the next gate reads again. A
 * refused save keeps them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
    headers: () =>
        Promise.resolve(
            new Headers({
                cookie: "active_org=org_a; better-auth.session_token=ann",
            }),
        ),
    cookies: () => Promise.resolve({ get: () => ({ value: "org_a" }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
let saved: { ok: boolean };
vi.mock("@/lib/organizations/members", () => ({
    updateMemberRole: () => Promise.resolve(saved),
}));
vi.mock("@/lib/organizations/roles", () => ({
    updateRole: () => Promise.resolve(saved),
}));
vi.mock("@/lib/modules/service", () => ({
    setModuleStatus: () => Promise.resolve(saved),
}));

import { setModuleStatusAction } from "@/lib/modules/actions";
import { updateMemberRole } from "@/lib/organizations/member-actions";
import { updateRole } from "@/lib/organizations/role-actions";

import { clearGateMemo, remembered } from "./gate-memo";

let reads: number;
const gate = () =>
    remembered("org_a", "modules", () => Promise.resolve(++reads));

beforeEach(() => {
    clearGateMemo();
    reads = 0;
});

describe.each([
    [
        "a member's role",
        () => updateMemberRole("u1", { role: "STAFF" }, "org_a"),
    ],
    ["a role's permissions", () => updateRole("staff", {}, "org_a")],
    [
        "a module on or off",
        () => setModuleStatusAction("COMMERCE", "ENABLED", undefined, "org_a"),
    ],
])("%s", (_, save) => {
    it("saved: the gate reads again", async () => {
        await gate();
        saved = { ok: true };
        await save();
        await gate();
        expect(reads).toBe(2);
    });

    it("refused: the kept answer stands", async () => {
        await gate();
        saved = { ok: false };
        await save();
        await gate();
        expect(reads).toBe(1);
    });
});
