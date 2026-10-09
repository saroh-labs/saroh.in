import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/customers/<id>` (Customer Detail's old address) sends everyone to the
 * one person page, `/contacts/<id>` (UX-050, #869): a contact's id straight
 * across, a linked store customer's id to its contact, and the tab kept.
 */

const mocks = vi.hoisted(() => ({
    redirect: vi.fn((to: string) => {
        throw new Error(`NEXT_REDIRECT;${to}`);
    }),
    contactForCustomer: vi.fn<(id: string) => Promise<string | null>>(),
    requireSession: vi.fn(() => Promise.resolve({ user: { id: "u_1" } })),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/customer-workspace/detail", () => ({
    contactForCustomer: mocks.contactForCustomer,
}));
vi.mock("@/lib/session", () => ({ requireSession: mocks.requireSession }));

import CustomerRedirect from "@/app/(shell)/customers/[contactId]/page";

async function landsOn(id: string, tab?: string): Promise<string> {
    try {
        await CustomerRedirect({
            params: Promise.resolve({ contactId: id }),
            searchParams: Promise.resolve(tab ? { tab } : {}),
        });
    } catch (e) {
        const m = /^NEXT_REDIRECT;(.*)$/.exec((e as Error).message);
        if (m) return m[1];
        throw e;
    }
    throw new Error("did not redirect");
}

beforeEach(() => {
    mocks.redirect.mockClear();
    mocks.contactForCustomer.mockReset();
    mocks.requireSession.mockClear();
});

describe("/customers/<id> redirects to the person page", () => {
    it("takes a contact's id straight across", async () => {
        mocks.contactForCustomer.mockResolvedValue(null);
        expect(await landsOn("c_priya")).toBe("/contacts/c_priya");
    });

    it("keeps the tab a link named", async () => {
        mocks.contactForCustomer.mockResolvedValue(null);
        expect(await landsOn("c_priya", "msg")).toBe(
            "/contacts/c_priya?tab=msg",
        );
    });

    it("resolves a linked store customer's id to its contact", async () => {
        mocks.contactForCustomer.mockResolvedValue("c_priya");
        expect(await landsOn("cus_priya", "ord")).toBe(
            "/contacts/c_priya?tab=ord",
        );
        expect(mocks.contactForCustomer).toHaveBeenCalledWith("cus_priya");
    });

    it("asks for a session first", async () => {
        mocks.contactForCustomer.mockResolvedValue(null);
        await landsOn("c_priya");
        expect(mocks.requireSession).toHaveBeenCalledTimes(1);
    });
});
