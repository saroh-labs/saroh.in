import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffIdentity } from "./control-plane";

const getStaffIdentity = vi.fn<() => Promise<StaffIdentity | null>>();
const refusalReason = vi.fn<() => Promise<string | null>>();

vi.mock("./session", () => ({
    requireSession: () =>
        Promise.resolve({ user: { email: "caller@example.com" } }),
}));
vi.mock("./control-plane", () => ({
    getStaffIdentity: () => getStaffIdentity(),
    refusalReason: () => refusalReason(),
}));
vi.mock("@/components/not-authorized", () => ({
    NotAuthorized: () => null,
}));

const { requireStaff } = await import("./console");
const { NotAuthorized } = await import("@/components/not-authorized");

const support: StaffIdentity = {
    userId: "u1",
    email: "support@example.com",
    roles: ["SUPPORT"],
    permissions: ["organization:read"],
    viaBootstrap: false,
};

beforeEach(() => {
    getStaffIdentity.mockReset();
    refusalReason.mockReset();
    refusalReason.mockResolvedValue(null);
});

describe("requireStaff", () => {
    it("lets staff holding the permission through", async () => {
        getStaffIdentity.mockResolvedValue(support);
        const gate = await requireStaff("organization:read");
        expect(gate).toEqual({ ok: true, staff: support });
    });

    it("refuses staff without the permission inside the shell", async () => {
        getStaffIdentity.mockResolvedValue(support);
        const gate = await requireStaff("audit:read");
        expect(gate.ok).toBe(false);
        if (gate.ok) return;
        expect(gate.screen.type).toBe(NotAuthorized);
        expect(gate.screen.props).toEqual({
            email: "caller@example.com",
            staff: support,
        });
    });

    it("gives someone who is not staff the bare page, with no menu", async () => {
        getStaffIdentity.mockResolvedValue(null);
        const gate = await requireStaff("audit:read");
        expect(gate.ok).toBe(false);
        if (gate.ok) return;
        expect(gate.screen.type).toBe(NotAuthorized);
        expect(gate.screen.props).toEqual({ email: "caller@example.com" });
    });

    it("says it's the console, when the grant leaves out this edition", async () => {
        getStaffIdentity.mockResolvedValue(null);
        refusalReason.mockResolvedValue("edition_not_granted");
        const gate = await requireStaff("audit:read");
        expect(gate.ok).toBe(false);
        if (gate.ok) return;
        expect(gate.screen.props).toEqual({
            email: "caller@example.com",
            wrongConsole: true,
        });
    });

    it("asks to sign in again when the API says the session is too old", async () => {
        getStaffIdentity.mockResolvedValue(null);
        refusalReason.mockResolvedValue("reauth_required");
        const gate = await requireStaff();
        expect(gate.ok).toBe(false);
        if (gate.ok) return;
        expect(gate.screen.props).toEqual({
            email: "caller@example.com",
            signInAgain: true,
        });
    });
});
