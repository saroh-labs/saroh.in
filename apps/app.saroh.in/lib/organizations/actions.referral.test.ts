import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Setup's create action and the referral code a browser carried from
 * saroh.in (DEC-156): the code goes to the API from the cookie alone, a
 * cookie that isn't a code is not sent, and the cookie is cleared on the
 * shared domain once the business exists, and kept when it wasn't made.
 */
const jar = vi.hoisted(() => {
    const held = new Map<string, string>();
    return {
        held,
        get: vi.fn((name: string) =>
            held.has(name) ? { name, value: held.get(name) } : undefined,
        ),
        has: vi.fn((name: string) => held.has(name)),
        set: vi.fn(),
        delete: vi.fn(),
    };
});
const requestHeaders = vi.hoisted(() => new Map<string, string>());
const api = vi.hoisted(() => ({
    createOrganization: vi.fn(),
    checkOrganizationAddress: vi.fn(),
    listOrganizations: vi.fn(),
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve(jar),
    headers: () =>
        Promise.resolve({
            get: (name: string) => requestHeaders.get(name) ?? null,
        }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/env", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("@/lib/api/http", () => ({ ACTIVE_ORG_COOKIE: "active_org" }));
vi.mock("@/lib/session", () => ({
    requireSession: () => Promise.resolve({ user: { id: "user_1" } }),
}));
vi.mock("./service", () => api);

import { createOrganization } from "./actions";

const made = { ok: true, data: { id: "org_new", slug: "pulse" } } as const;
const cleared = () =>
    jar.set.mock.calls.filter(([name]) => name === "saroh_ref");

beforeEach(() => {
    vi.clearAllMocks();
    jar.held.clear();
    requestHeaders.clear();
    requestHeaders.set("host", "app.saroh.in");
    api.createOrganization.mockResolvedValue(made);
});

describe("createOrganization and a carried referral code", () => {
    it("sends the cookie's code with the business, then clears it on the shared domain", async () => {
        jar.held.set("saroh_ref", "abcd2345");

        await createOrganization({ name: "Pulse Studio" });

        expect(api.createOrganization).toHaveBeenCalledWith({
            name: "Pulse Studio",
            referralCode: "abcd2345",
        });
        expect(cleared()).toEqual([
            ["saroh_ref", "", { path: "/", maxAge: 0, domain: "saroh.in" }],
        ]);
    });

    it("sends no code when the browser carried none, and clears nothing", async () => {
        await createOrganization({ name: "Pulse Studio" });

        expect(
            (
                api.createOrganization.mock.calls[0] as [
                    { referralCode?: string },
                ]
            )[0].referralCode,
        ).toBeUndefined();
        expect(cleared()).toEqual([]);
    });

    it("never sends a cookie that isn't shaped like a code, and still clears it", async () => {
        jar.held.set("saroh_ref", "<script>alert(1)</script>");

        const result = await createOrganization({ name: "Pulse Studio" });

        expect(result).toEqual(made);
        expect(
            (
                api.createOrganization.mock.calls[0] as [
                    { referralCode?: string },
                ]
            )[0].referralCode,
        ).toBeUndefined();
        expect(cleared()).toHaveLength(1);
    });

    it("takes the code from the cookie alone, never from what the form sent", async () => {
        await createOrganization({
            name: "Pulse Studio",
            referralCode: "wxyz6789",
        });

        expect(
            (
                api.createOrganization.mock.calls[0] as [
                    { referralCode?: string },
                ]
            )[0].referralCode,
        ).toBeUndefined();
    });

    it("keeps the cookie when the business wasn't made, for the next try", async () => {
        jar.held.set("saroh_ref", "abcd2345");
        api.createOrganization.mockResolvedValue({
            ok: false,
            error: "pulse.saroh.app is taken. Try another address.",
            field: "address",
        });

        await createOrganization({ name: "Pulse Studio" });

        expect(cleared()).toEqual([]);
    });

    it("reads the host a proxy passed on", async () => {
        jar.held.set("saroh_ref", "abcd2345");
        requestHeaders.set("host", "localhost:3000");
        requestHeaders.set("x-forwarded-host", "app.saroh.localhost");

        await createOrganization({ name: "Pulse Studio" });

        expect(cleared()[0]?.[2]).toMatchObject({ domain: "saroh.localhost" });
    });
});
