/**
 * New invoice's page (U14 #1126): a role without `invoice:write` is told so
 * before any form; one with it gets the form with the business's paper,
 * its next number and, where the catalogue has products, the picker.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Organization } from "@/lib/organizations/service";

const resolveActiveOrganization = vi.fn();
vi.mock("@/lib/organizations/service", () => ({
    resolveActiveOrganization: () => resolveActiveOrganization() as unknown,
}));
vi.mock("@/lib/session", () => ({ requireSession: () => Promise.resolve() }));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/lib/api/http", () => ({}));
vi.mock("next/headers", () => ({}));
vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
    redirect: (to: string) => {
        throw new Error(`NEXT_REDIRECT ${to}`);
    },
    forbidden: vi.fn(),
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    pausedOrNull: () => Promise.resolve(null),
    billingAccessOrNull: () => Promise.resolve(null),
}));
vi.mock("@/lib/invoices/contacts", () => ({
    contactPickerOptions: () =>
        Promise.resolve([
            { id: "c_1", name: "Asha Rao", email: "asha@example.com" },
        ]),
}));
vi.mock("@/lib/invoices/service", () => ({
    listInvoices: () => Promise.resolve({ rows: [], truncated: false }),
}));
vi.mock("@/lib/invoices/payments-on", () => ({
    payLinkPossible: () => Promise.resolve(true),
}));
const canPick = vi.fn(() => Promise.resolve(true));
vi.mock("@/lib/invoices/can-pick-products", () => ({
    canPickProducts: () => canPick(),
}));
vi.mock("@/lib/organizations/settings-service", () => ({
    readOrganizationSettings: () =>
        Promise.resolve({
            ok: true,
            data: {
                id: "org_1",
                name: "Rye & Co.",
                slug: "rye",
                profile: { taxId: "29AAGCR4375J1ZU", timezone: "Asia/Kolkata" },
                tradingSince: null,
                tax: {
                    registered: true,
                    state: "29",
                    stateName: "Karnataka",
                    invoicePrefix: "RC",
                    deliveryRate: "18",
                    deliverySac: null,
                    invoiceNumber: {
                        parts: ["PREFIX", "FY"],
                        separator: "/",
                        digits: 4,
                        restart: "FY",
                        custom: false,
                        counters: { FY: 144, MONTH: 0, NEVER: 0 },
                    },
                },
                invoicePaper: { style: "COMPACT", colour: "#6B3F1D" },
            },
        }),
}));
vi.mock("@/lib/invoices/product-actions", () => ({
    findInvoiceProducts: vi.fn(),
}));
vi.mock("@/lib/invoices/actions", () => ({}));
vi.mock("@/lib/invoices/link-actions", () => ({}));
vi.mock("@/lib/contacts/create", () => ({}));
vi.mock("@/components/organizations/use-business-details-step", () => ({
    useBusinessDetailsStep: () => ({
        run: vi.fn(),
        ensure: vi.fn(),
        step: null,
    }),
}));

const org = (actions: string[], role = "MEMBER") =>
    ({
        id: "org_1",
        name: "Rye & Co.",
        slug: "rye",
        role,
        roleKey: role,
        actions,
    }) as Organization;

const text = (node: unknown) =>
    renderToStaticMarkup(<>{node as React.ReactNode}</>)
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&");

beforeEach(() => {
    resolveActiveOrganization.mockReset();
    canPick.mockClear();
});

describe("New invoice's page", () => {
    it("a role without invoice:write is told why, and handed no form", async () => {
        resolveActiveOrganization.mockResolvedValue(
            org(["org:read", "invoice:read", "contact:read"]),
        );
        const { default: Page } =
            await import("@/app/(shell)/billing/invoices/new/page");
        const said = text(await Page({ searchParams: Promise.resolve({}) }));
        expect(said).toContain("You can't open New invoice");
        expect(said).toContain('href="/billing/invoices"');
        expect(said).not.toMatch(/<form|<input/);
        expect(said).not.toContain("How it will look");
        expect(canPick).not.toHaveBeenCalled();
    });

    it("a role with it gets the form, the paper in the business's style and the next number", async () => {
        resolveActiveOrganization.mockResolvedValue(
            org(["org:read", "invoice:read", "invoice:write"], "OWNER"),
        );
        const { default: Page } =
            await import("@/app/(shell)/billing/invoices/new/page");
        const said = text(await Page({ searchParams: Promise.resolve({}) }));
        expect(said).toContain("<form");
        expect(said).toContain("New invoice");
        expect(said).toContain("How it will look");
        expect(said).toContain('data-style="COMPACT"');
        expect(said).toMatch(/RC\/\d{2}-\d{2}\/0145/);
        expect(said).toContain("+ Pick from your products");
        expect(said).toContain(">Issue and share<");
    });
});
